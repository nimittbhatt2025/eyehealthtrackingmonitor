"""Digital wellbeing / OS screen-time sync endpoints."""

from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.models import DigitalWellbeingConnection, ScreenTimeDay, db
from app.services.wellbeing_sync import (
    VALID_SOURCES,
    connection_status_summary,
    ingest_screen_time_days,
    upsert_connection,
)

wellbeing_bp = Blueprint('wellbeing', __name__)


@wellbeing_bp.route('/status', methods=['GET'])
@jwt_required()
def status():
    user_id = int(get_jwt_identity())
    return jsonify(connection_status_summary(user_id)), 200


@wellbeing_bp.route('/connect', methods=['POST'])
@jwt_required()
def connect():
    """Register or update a device connection (called by native shell after permission grant)."""
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}

    platform = (data.get('platform') or '').lower()
    source = data.get('source') or ''
    device_id = (data.get('device_id') or '').strip()

    if platform not in ('ios', 'android', 'web_import'):
        return jsonify({'error': 'platform must be ios, android, or web_import'}), 400
    if source not in VALID_SOURCES:
        return jsonify({'error': f'source must be one of {sorted(VALID_SOURCES)}'}), 400
    if not device_id:
        return jsonify({'error': 'device_id is required'}), 400

    conn = upsert_connection(
        user_id,
        platform=platform,
        source=source,
        device_id=device_id,
        device_name=data.get('device_name'),
        permission_granted=bool(data.get('permission_granted', False)),
        auto_sync_enabled=bool(data.get('auto_sync_enabled', True)),
        sync_lifestyle=bool(data.get('sync_lifestyle', True)),
        status=data.get('status'),
        meta=data.get('meta') if isinstance(data.get('meta'), dict) else None,
    )
    db.session.commit()
    return jsonify({'message': 'Connection saved', 'connection': conn.to_dict()}), 200


@wellbeing_bp.route('/connections/<int:connection_id>', methods=['PUT'])
@jwt_required()
def update_connection(connection_id):
    user_id = int(get_jwt_identity())
    conn = DigitalWellbeingConnection.query.filter_by(id=connection_id, user_id=user_id).first()
    if not conn:
        return jsonify({'error': 'Connection not found'}), 404

    data = request.get_json() or {}
    if 'auto_sync_enabled' in data:
        conn.auto_sync_enabled = bool(data['auto_sync_enabled'])
    if 'sync_lifestyle' in data:
        conn.sync_lifestyle = bool(data['sync_lifestyle'])
    if 'status' in data:
        conn.status = data['status']
    if 'permission_granted' in data:
        conn.permission_granted = bool(data['permission_granted'])
    if 'device_name' in data:
        conn.device_name = data['device_name']
    conn.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Updated', 'connection': conn.to_dict()}), 200


@wellbeing_bp.route('/connections/<int:connection_id>', methods=['DELETE'])
@jwt_required()
def disconnect(connection_id):
    user_id = int(get_jwt_identity())
    conn = DigitalWellbeingConnection.query.filter_by(id=connection_id, user_id=user_id).first()
    if not conn:
        return jsonify({'error': 'Connection not found'}), 404
    conn.status = 'revoked'
    conn.permission_granted = False
    conn.auto_sync_enabled = False
    conn.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Disconnected'}), 200


@wellbeing_bp.route('/sync', methods=['POST'])
@jwt_required()
def sync_days():
    """
    Push a batch of daily screen-time aggregates from the native bridge.

    Body:
      {
        "device_id": "...",          # optional if connection_id given
        "connection_id": 1,          # optional
        "apply_lifestyle": true,
        "days": [ { "day": "YYYY-MM-DD", "total_screen_hours": 5.2, ... } ]
      }
    """
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    days = data.get('days') or data.get('entries') or []
    if not isinstance(days, list) or not days:
        return jsonify({'error': 'days array is required'}), 400

    connection = None
    if data.get('connection_id'):
        connection = DigitalWellbeingConnection.query.filter_by(
            id=int(data['connection_id']), user_id=user_id
        ).first()
    elif data.get('device_id'):
        connection = DigitalWellbeingConnection.query.filter_by(
            user_id=user_id, device_id=str(data['device_id'])
        ).first()

    if connection and not connection.auto_sync_enabled and not data.get('force'):
        return jsonify({'error': 'Auto-sync is paused for this device', 'connection': connection.to_dict()}), 409

    result = ingest_screen_time_days(
        user_id,
        days,
        connection=connection,
        default_source=(connection.source if connection else data.get('source') or 'manual_bridge'),
        apply_lifestyle=bool(data.get('apply_lifestyle', True)),
    )
    return jsonify({'message': 'Sync complete', **result}), 200


@wellbeing_bp.route('/days', methods=['GET'])
@jwt_required()
def list_days():
    user_id = int(get_jwt_identity())
    days = request.args.get('days', type=int, default=30)
    from datetime import timedelta

    cutoff = datetime.utcnow().date() - timedelta(days=days)
    rows = (
        ScreenTimeDay.query.filter(
            ScreenTimeDay.user_id == user_id,
            ScreenTimeDay.day >= cutoff,
        )
        .order_by(ScreenTimeDay.day.desc())
        .all()
    )
    return jsonify({'days': [r.to_dict() for r in rows], 'count': len(rows)}), 200


@wellbeing_bp.route('/import', methods=['POST'])
@jwt_required()
def import_days():
    """
    Browser fallback: import a JSON array of daily totals when native APIs are unavailable.
    Accepts the same day objects as /sync.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    days = data.get('days') or []
    if not isinstance(days, list) or not days:
        return jsonify({'error': 'days array is required'}), 400

    # Tag as import
    for item in days:
        item.setdefault('source', data.get('source') or 'json_import')

    device_id = data.get('device_id') or f'import-{user_id}'
    conn = upsert_connection(
        user_id,
        platform='web_import',
        source=days[0].get('source', 'json_import'),
        device_id=device_id,
        device_name=data.get('device_name') or 'JSON import',
        permission_granted=True,
        status='connected',
        meta={'import': True},
    )
    db.session.flush()

    result = ingest_screen_time_days(
        user_id,
        days,
        connection=conn,
        default_source='json_import',
        apply_lifestyle=bool(data.get('apply_lifestyle', True)),
    )
    return jsonify({'message': 'Import complete', 'connection': conn.to_dict(), **result}), 200
