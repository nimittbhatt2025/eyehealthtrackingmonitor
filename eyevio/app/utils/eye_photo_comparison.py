"""
Month-over-month eye photo comparison and deterioration detection.

Compares surface-health metrics (redness, tear film, irregularity) between
the current photo and a prior baseline (~30 days ago) to flag worsening
trends before a scheduled doctor visit.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.models import EyePhoto

# How far back to look for a monthly baseline photo
BASELINE_WINDOW_DAYS = (20, 45)
MONTHLY_CHECK_INTERVAL_DAYS = 30

# Condition-specific metric weights for deterioration scoring
CONDITION_WEIGHTS = {
    'dry_eye': {
        'health_score': 1.0,
        'sclera_redness': 1.2,
        'tear_film_quality': 1.3,
        'surface_irregularity': 0.8,
    },
    'cornea_scar': {
        'health_score': 1.0,
        'sclera_redness': 0.6,
        'tear_film_quality': 0.5,
        'surface_irregularity': 1.5,
    },
    'glaucoma': {
        'health_score': 1.0,
        'sclera_redness': 0.7,
        'tear_film_quality': 0.6,
        'surface_irregularity': 1.0,
    },
    'general': {
        'health_score': 1.0,
        'sclera_redness': 1.0,
        'tear_film_quality': 1.0,
        'surface_irregularity': 1.0,
    },
}

CONDITION_LABELS = {
    'dry_eye': 'Dry eye',
    'cornea_scar': 'Cornea / surface changes',
    'glaucoma': 'Glaucoma monitoring',
    'general': 'General eye health',
}


def _metric_delta(current: float, baseline: float, higher_is_worse: bool = False) -> Dict[str, Any]:
    if current is None or baseline is None:
        return {'current': current, 'baseline': baseline, 'delta': 0, 'percent_change': 0, 'worsened': False}

    delta = current - baseline
    percent = (delta / baseline * 100) if baseline else 0

    if higher_is_worse:
        worsened = delta >= 5
    else:
        worsened = delta <= -5

    return {
        'current': round(float(current), 1),
        'baseline': round(float(baseline), 1),
        'delta': round(float(delta), 1),
        'percent_change': round(float(percent), 1),
        'worsened': worsened,
    }


def compare_photos(current: EyePhoto, baseline: EyePhoto) -> Dict[str, Any]:
    """Compare two eye photos and return structured change analysis."""
    condition = current.condition_type or 'general'
    weights = CONDITION_WEIGHTS.get(condition, CONDITION_WEIGHTS['general'])

    changes = {
        'health_score': _metric_delta(current.health_score, baseline.health_score, higher_is_worse=False),
        'sclera_redness': _metric_delta(current.sclera_redness, baseline.sclera_redness, higher_is_worse=True),
        'tear_film_quality': _metric_delta(current.tear_film_quality, baseline.tear_film_quality, higher_is_worse=False),
        'surface_irregularity': _metric_delta(
            current.surface_irregularity, baseline.surface_irregularity, higher_is_worse=True
        ),
    }

    deterioration_score = 0.0
    reasons: List[str] = []

    health_drop = -changes['health_score']['delta']
    if health_drop >= 8:
        deterioration_score += health_drop * weights['health_score']
        reasons.append(f'Overall eye surface health score dropped {health_drop:.0f} points')

    redness_rise = changes['sclera_redness']['delta']
    if redness_rise >= 6:
        deterioration_score += redness_rise * weights['sclera_redness']
        reasons.append(f'Redness increased by {redness_rise:.0f} points')

    tear_drop = -changes['tear_film_quality']['delta']
    if tear_drop >= 8:
        deterioration_score += tear_drop * weights['tear_film_quality']
        reasons.append(f'Tear film smoothness decreased by {tear_drop:.0f} points')

    irregular_rise = changes['surface_irregularity']['delta']
    if irregular_rise >= 8:
        deterioration_score += irregular_rise * weights['surface_irregularity']
        reasons.append(f'Surface irregularity increased by {irregular_rise:.0f} points')

    deteriorated = deterioration_score >= 12
    severity = 'low'
    if deterioration_score >= 30:
        severity = 'critical'
    elif deterioration_score >= 20:
        severity = 'high'
    elif deterioration_score >= 12:
        severity = 'medium'

    days_between = (current.captured_at - baseline.captured_at).days if current.captured_at and baseline.captured_at else None

    trend = 'stable'
    if deteriorated:
        trend = 'worsening'
    elif health_drop < -5 or redness_rise < -5:
        trend = 'improving'

    return {
        'deteriorated': deteriorated,
        'severity': severity,
        'deterioration_score': round(deterioration_score, 1),
        'trend': trend,
        'reasons': reasons,
        'changes': changes,
        'baseline_photo_id': baseline.id,
        'baseline_captured_at': baseline.captured_at.isoformat() if baseline.captured_at else None,
        'current_photo_id': current.id,
        'days_between': days_between,
        'condition_type': condition,
        'condition_label': CONDITION_LABELS.get(condition, condition),
        'recommend_doctor_visit': deteriorated and severity in ('high', 'critical'),
        'message': _build_comparison_message(trend, reasons, days_between, condition),
    }


def _build_comparison_message(trend: str, reasons: List[str], days_between: Optional[int], condition: str) -> str:
    label = CONDITION_LABELS.get(condition, 'eye health')
    if trend == 'worsening' and reasons:
        window = f' over the last {days_between} days' if days_between else ' since your last photo'
        return (
            f'Your {label.lower()} metrics show worsening signs{window}: '
            + '; '.join(reasons[:3])
            + '. Consider contacting your eye doctor before your next scheduled visit.'
        )
    if trend == 'improving':
        return f'Your {label.lower()} metrics look stable or improved compared to your previous photo.'
    return f'Your {label.lower()} metrics are stable compared to your previous photo.'


def find_baseline_photo(user_id: int, condition_type: str, before_date: datetime) -> Optional[EyePhoto]:
    """Find the best baseline photo from ~30 days before the current capture."""
    min_date = before_date - timedelta(days=BASELINE_WINDOW_DAYS[1])
    max_date = before_date - timedelta(days=BASELINE_WINDOW_DAYS[0])

    candidate = (
        EyePhoto.query.filter(
            EyePhoto.user_id == user_id,
            EyePhoto.condition_type == condition_type,
            EyePhoto.captured_at >= min_date,
            EyePhoto.captured_at <= max_date,
        )
        .order_by(EyePhoto.captured_at.desc())
        .first()
    )

    if candidate:
        return candidate

    # Fallback: most recent photo before the current window
    return (
        EyePhoto.query.filter(
            EyePhoto.user_id == user_id,
            EyePhoto.condition_type == condition_type,
            EyePhoto.captured_at < min_date,
        )
        .order_by(EyePhoto.captured_at.desc())
        .first()
    )


def compare_to_historical(user_id: int, current: EyePhoto) -> Dict[str, Any]:
    """Compare current photo to the best available historical baseline."""
    baseline = find_baseline_photo(user_id, current.condition_type, current.captured_at or datetime.utcnow())

    if not baseline or baseline.id == current.id:
        return {
            'has_baseline': False,
            'deteriorated': False,
            'message': 'First photo saved. Take another in about a month to enable comparison.',
        }

    comparison = compare_photos(current, baseline)
    comparison['has_baseline'] = True
    comparison['baseline_thumbnail'] = baseline.image_thumbnail
    return comparison


def build_monthly_timeline(photos: List[EyePhoto]) -> List[Dict[str, Any]]:
    """Group photos by calendar month for charting."""
    buckets: Dict[str, Dict[str, Any]] = {}

    for photo in photos:
        if not photo.captured_at:
            continue
        key = photo.captured_at.strftime('%Y-%m')
        if key not in buckets:
            buckets[key] = {
                'month': key,
                'label': photo.captured_at.strftime('%b %Y'),
                'photos': [],
                'avg_health_score': 0,
                'avg_redness': 0,
                'avg_tear_film': 0,
                'avg_irregularity': 0,
            }
        buckets[key]['photos'].append(photo.to_dict(include_thumbnail=True))

    timeline = []
    for key in sorted(buckets.keys()):
        bucket = buckets[key]
        photos_in_month = bucket['photos']
        n = len(photos_in_month)
        bucket['photo_count'] = n
        bucket['avg_health_score'] = round(
            sum(p['health_score'] for p in photos_in_month) / n, 1
        )
        bucket['avg_redness'] = round(
            sum(p['sclera_redness'] or 0 for p in photos_in_month) / n, 1
        )
        bucket['avg_tear_film'] = round(
            sum(p['tear_film_quality'] or 0 for p in photos_in_month) / n, 1
        )
        bucket['avg_irregularity'] = round(
            sum(p['surface_irregularity'] or 0 for p in photos_in_month) / n, 1
        )
        bucket['latest_photo'] = photos_in_month[-1]
        timeline.append(bucket)

    return timeline


def monitoring_status(last_photo: Optional[EyePhoto], doctor_visit_months: int = 6) -> Dict[str, Any]:
    """Return whether a monthly check is due and doctor visit context."""
    now = datetime.utcnow()

    if not last_photo or not last_photo.captured_at:
        return {
            'has_photos': False,
            'check_due': True,
            'days_since_last': None,
            'days_until_due': 0,
            'monthly_interval_days': MONTHLY_CHECK_INTERVAL_DAYS,
            'doctor_visit_interval_months': doctor_visit_months,
            'message': 'No eye photos yet. Take your first monthly photo to start tracking.',
        }

    days_since = (now - last_photo.captured_at).days
    days_until_due = max(0, MONTHLY_CHECK_INTERVAL_DAYS - days_since)

    return {
        'has_photos': True,
        'check_due': days_since >= MONTHLY_CHECK_INTERVAL_DAYS,
        'days_since_last': days_since,
        'days_until_due': days_until_due,
        'last_photo_id': last_photo.id,
        'last_captured_at': last_photo.captured_at.isoformat(),
        'last_health_score': last_photo.health_score,
        'monthly_interval_days': MONTHLY_CHECK_INTERVAL_DAYS,
        'doctor_visit_interval_months': doctor_visit_months,
        'message': (
            'Monthly eye photo is due.'
            if days_since >= MONTHLY_CHECK_INTERVAL_DAYS
            else f'Next monthly photo recommended in {days_until_due} days.'
        ),
    }
