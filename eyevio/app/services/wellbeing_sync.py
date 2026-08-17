"""Ingest OS screen-time data and mirror into lifestyle logs."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from app.models import DigitalWellbeingConnection, LifestyleLog, ScreenTimeDay, User, db

VALID_SOURCES = {
    'android_usage_stats',
    'ios_device_activity',
    'csv_import',
    'json_import',
    'manual_bridge',
}


def _parse_day(value) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    return datetime.fromisoformat(str(value).replace('Z', '')).date()


def upsert_connection(
    user_id: int,
    *,
    platform: str,
    source: str,
    device_id: str,
    device_name: Optional[str] = None,
    permission_granted: bool = False,
    auto_sync_enabled: bool = True,
    sync_lifestyle: bool = True,
    status: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> DigitalWellbeingConnection:
    conn = DigitalWellbeingConnection.query.filter_by(user_id=user_id, device_id=device_id).first()
    if not conn:
        conn = DigitalWellbeingConnection(
            user_id=user_id,
            platform=platform,
            source=source,
            device_id=device_id,
        )
        db.session.add(conn)

    conn.platform = platform
    conn.source = source
    conn.device_name = device_name or conn.device_name
    conn.permission_granted = bool(permission_granted)
    conn.auto_sync_enabled = bool(auto_sync_enabled)
    conn.sync_lifestyle = bool(sync_lifestyle)
    conn.status = status or ('connected' if permission_granted else 'pending')
    if meta:
        conn.meta = {**(conn.meta or {}), **meta}
    conn.updated_at = datetime.utcnow()
    conn.last_error = None
    return conn


def apply_day_to_lifestyle(
    user_id: int,
    day: date,
    total_hours: float,
    breakdown: Optional[Dict[str, Any]],
    source: str,
) -> LifestyleLog:
    """Upsert lifestyle screen_time from device sync (does not wipe other lifestyle fields)."""
    log = LifestyleLog.query.filter_by(user_id=user_id, log_date=day).first()
    if not log:
        log = LifestyleLog(user_id=user_id, log_date=day)
        db.session.add(log)

    # Prefer device data over manual for screen time when syncing
    log.screen_time_hours = round(float(total_hours), 2)
    log.screen_time_source = source
    existing_breakdown = log.screen_time_breakdown if isinstance(log.screen_time_breakdown, dict) else {}
    merged = {**existing_breakdown, **(breakdown or {}), '_synced_from': source}
    log.screen_time_breakdown = merged
    return log


def ingest_screen_time_days(
    user_id: int,
    days_payload: List[Dict[str, Any]],
    *,
    connection: Optional[DigitalWellbeingConnection] = None,
    default_source: str = 'manual_bridge',
    apply_lifestyle: bool = True,
) -> Dict[str, Any]:
    """
    Upsert a batch of daily screen-time rows from a native bridge or import.

    Each day item:
      {
        "day": "2026-08-15",
        "total_screen_hours": 5.4,
        "pickup_count": 42,
        "category_breakdown": {"social": 1.2, ...},
        "top_apps": [{"name": "TikTok", "hours": 0.9}],
        "source": "android_usage_stats"  # optional override
      }
    """
    upserted = 0
    lifestyle_updated = 0
    errors: List[str] = []

    for item in days_payload:
        try:
            day = _parse_day(item.get('day') or item.get('date'))
            total = item.get('total_screen_hours')
            if total is None:
                # Accept milliseconds or minutes from native plugins
                if item.get('total_screen_ms') is not None:
                    total = float(item['total_screen_ms']) / 3_600_000.0
                elif item.get('total_screen_minutes') is not None:
                    total = float(item['total_screen_minutes']) / 60.0
                else:
                    raise ValueError('total_screen_hours is required')

            total = max(0.0, min(24.0, float(total)))
            source = item.get('source') or (connection.source if connection else default_source)
            if source not in VALID_SOURCES:
                source = default_source

            query = ScreenTimeDay.query.filter_by(
                user_id=user_id,
                day=day,
                source=source,
            )
            if connection:
                query = query.filter_by(connection_id=connection.id)
            else:
                query = query.filter(ScreenTimeDay.connection_id.is_(None))

            row = query.first()
            if not row:
                row = ScreenTimeDay(
                    user_id=user_id,
                    connection_id=connection.id if connection else None,
                    day=day,
                    source=source,
                    total_screen_hours=total,
                )
                db.session.add(row)

            row.total_screen_hours = total
            row.pickup_count = item.get('pickup_count')
            row.notification_count = item.get('notification_count')
            row.category_breakdown = item.get('category_breakdown') or item.get('categories')
            row.top_apps = item.get('top_apps')
            row.raw_payload = item.get('raw') or item
            row.updated_at = datetime.utcnow()
            upserted += 1

            should_apply = apply_lifestyle
            if connection is not None:
                should_apply = bool(connection.sync_lifestyle) and apply_lifestyle

            if should_apply:
                apply_day_to_lifestyle(
                    user_id,
                    day,
                    total,
                    row.category_breakdown,
                    source,
                )
                row.applied_to_lifestyle = True
                lifestyle_updated += 1
        except Exception as exc:
            errors.append(str(exc))

    if connection:
        connection.last_sync_at = datetime.utcnow()
        connection.status = 'connected' if not errors else 'error'
        connection.last_error = '; '.join(errors[:3]) if errors else None
        connection.updated_at = datetime.utcnow()

    # Refresh profile average from recent synced days
    _refresh_user_avg_screen_time(user_id)

    db.session.commit()
    return {
        'days_upserted': upserted,
        'lifestyle_updated': lifestyle_updated,
        'errors': errors,
    }


def _refresh_user_avg_screen_time(user_id: int, days: int = 14) -> None:
    from datetime import timedelta

    cutoff = datetime.utcnow().date() - timedelta(days=days)
    logs = (
        LifestyleLog.query.filter(
            LifestyleLog.user_id == user_id,
            LifestyleLog.log_date >= cutoff,
            LifestyleLog.screen_time_hours.isnot(None),
        ).all()
    )
    if not logs:
        return
    avg = sum(l.screen_time_hours for l in logs) / len(logs)
    user = User.query.get(user_id)
    if user:
        user.avg_screen_time_hours = round(avg, 2)


def connection_status_summary(user_id: int) -> Dict[str, Any]:
    connections = (
        DigitalWellbeingConnection.query.filter_by(user_id=user_id)
        .order_by(DigitalWellbeingConnection.updated_at.desc())
        .all()
    )
    recent = (
        ScreenTimeDay.query.filter_by(user_id=user_id)
        .order_by(ScreenTimeDay.day.desc())
        .limit(14)
        .all()
    )
    connected = [c for c in connections if c.status == 'connected' and c.permission_granted]
    return {
        'has_connection': len(connected) > 0,
        'connections': [c.to_dict() for c in connections],
        'recent_days': [d.to_dict() for d in recent],
        'capabilities': {
            'android_usage_stats': True,
            'ios_device_activity': True,
            'browser_direct_os_access': False,
            'note': (
                'iOS Screen Time and Android Digital Wellbeing are not readable from a website. '
                'Auto-pull requires the EyeVio native shell (Capacitor) using UsageStatsManager '
                'on Android and DeviceActivity/FamilyControls on iOS.'
            ),
        },
    }
