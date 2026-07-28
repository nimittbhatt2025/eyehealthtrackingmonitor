"""
Month-over-month eye photo comparison and deterioration detection.

Phase 1 careful comparison:
- Metric deltas (redness, tear film, irregularity, asymmetry)
- Landmark-aligned crop SSIM visual change
- Lighting confidence weighting
- Condition-specific emphasis (dry eye / cornea / general)
- Glaucoma selfie mode is surface-proxy only (not optic-nerve screening)
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.ai_models.eye_crop_alignment import (
    compare_aligned_crops,
    lighting_confidence,
)
from app.models import EyePhoto

BASELINE_WINDOW_DAYS = (20, 45)
MONTHLY_CHECK_INTERVAL_DAYS = 30

CONDITION_WEIGHTS = {
    'dry_eye': {
        'health_score': 1.0,
        'sclera_redness': 1.3,
        'tear_film_quality': 1.4,
        'surface_irregularity': 0.9,
        'visual_change': 1.1,
        'asymmetry': 0.6,
    },
    'cornea_scar': {
        'health_score': 1.0,
        'sclera_redness': 0.5,
        'tear_film_quality': 0.5,
        'surface_irregularity': 1.6,
        'visual_change': 1.4,
        'asymmetry': 1.5,
    },
    'glaucoma': {
        # Selfie photos cannot assess optic nerve — treat as surface comfort proxy only
        'health_score': 0.8,
        'sclera_redness': 0.9,
        'tear_film_quality': 0.7,
        'surface_irregularity': 0.8,
        'visual_change': 0.9,
        'asymmetry': 0.7,
    },
    'cataract': {
        # Opacity grade / clarity are primary; surface redness is secondary
        'health_score': 1.4,
        'sclera_redness': 0.4,
        'tear_film_quality': 0.3,
        'surface_irregularity': 1.2,
        'visual_change': 1.3,
        'asymmetry': 1.0,
        'opacity_grade': 2.0,
    },
    'general': {
        'health_score': 1.0,
        'sclera_redness': 1.0,
        'tear_film_quality': 1.0,
        'surface_irregularity': 1.0,
        'visual_change': 1.0,
        'asymmetry': 0.8,
    },
}

CONDITION_LABELS = {
    'dry_eye': 'Dry eye',
    'cornea_scar': 'Cornea / surface changes',
    'glaucoma': 'Between-visit surface monitoring',
    'cataract': 'Cataract opacity',
    'general': 'General eye health',
}

CONDITION_SCOPE = {
    'dry_eye': {
        'tracks': ['Redness', 'Tear film smoothness', 'Surface irregularity', 'Aligned eye appearance'],
        'disclaimer': 'Screening trend only — not a dry-eye diagnosis.',
    },
    'cornea_scar': {
        'tracks': ['Surface irregularity', 'Left/right asymmetry', 'Aligned eye appearance'],
        'disclaimer': 'Tracks visible surface texture proxies from a selfie — not slit-lamp cornea diagnosis.',
    },
    'glaucoma': {
        'tracks': ['Surface redness / comfort proxies between visits'],
        'disclaimer': (
            'A front-facing photo cannot assess the optic nerve or eye pressure. '
            'This mode only tracks surface appearance between visits. '
            'Fundus imaging is required for glaucoma progression monitoring.'
        ),
        'surface_proxy_only': True,
    },
    'cataract': {
        'tracks': ['Opacity grade', 'Clarity score', 'Aligned pupil-region appearance'],
        'disclaimer': (
            'Screening only — not LOCS III grading and not a millimeter size measurement. '
            'A dilated slit-lamp exam remains the clinical standard for cataract diagnosis.'
        ),
        'opacity_monitor': True,
    },
    'general': {
        'tracks': ['Overall surface health', 'Redness', 'Tear film', 'Aligned appearance'],
        'disclaimer': 'Screening only — not a medical diagnosis.',
    },
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


def _details(photo: EyePhoto) -> Dict[str, Any]:
    return photo.analysis_details if isinstance(photo.analysis_details, dict) else {}


def _asymmetry_from_photo(photo: EyePhoto) -> Dict[str, float]:
    details = _details(photo)
    asym = details.get('eye_asymmetry') or {}
    if asym:
        return {
            'health_score_asymmetry': float(asym.get('health_score_asymmetry', 0) or 0),
            'redness_asymmetry': float(asym.get('redness_asymmetry', 0) or 0),
            'irregularity_asymmetry': float(asym.get('irregularity_asymmetry', 0) or 0),
            'tear_film_asymmetry': float(asym.get('tear_film_asymmetry', 0) or 0),
        }
    return {
        'health_score_asymmetry': abs(float(photo.left_eye_score or 0) - float(photo.right_eye_score or 0)),
        'redness_asymmetry': 0.0,
        'irregularity_asymmetry': 0.0,
        'tear_film_asymmetry': 0.0,
    }


def _opacity_from_photo(photo: EyePhoto) -> Dict[str, Any]:
    details = _details(photo)
    opacity = details.get('opacity_score')
    if opacity is None and photo.health_score is not None:
        opacity = max(0.0, 100.0 - float(photo.health_score))
    grade_level = details.get('grade_level')
    if grade_level is None and opacity is not None:
        if opacity <= 20:
            grade_level = 0
        elif opacity <= 40:
            grade_level = 1
        elif opacity <= 65:
            grade_level = 2
        else:
            grade_level = 3
    return {
        'opacity_score': float(opacity) if opacity is not None else None,
        'grade_level': int(grade_level) if grade_level is not None else None,
        'opacity_grade': details.get('opacity_grade'),
    }


def compare_photos(current: EyePhoto, baseline: EyePhoto) -> Dict[str, Any]:
    """Compare two eye photos with metrics + aligned visual SSIM."""
    condition = current.condition_type or 'general'
    weights = CONDITION_WEIGHTS.get(condition, CONDITION_WEIGHTS['general'])
    scope = CONDITION_SCOPE.get(condition, CONDITION_SCOPE['general'])

    current_details = _details(current)
    baseline_details = _details(baseline)
    lighting = current_details.get('lighting') or {}
    confidence = lighting_confidence(lighting)

    changes = {
        'health_score': _metric_delta(current.health_score, baseline.health_score, higher_is_worse=False),
        'sclera_redness': _metric_delta(current.sclera_redness, baseline.sclera_redness, higher_is_worse=True),
        'tear_film_quality': _metric_delta(current.tear_film_quality, baseline.tear_film_quality, higher_is_worse=False),
        'surface_irregularity': _metric_delta(
            current.surface_irregularity, baseline.surface_irregularity, higher_is_worse=True
        ),
    }

    cur_opacity = _opacity_from_photo(current)
    base_opacity = _opacity_from_photo(baseline)
    if cur_opacity['opacity_score'] is not None and base_opacity['opacity_score'] is not None:
        changes['opacity_score'] = _metric_delta(
            cur_opacity['opacity_score'],
            base_opacity['opacity_score'],
            higher_is_worse=True,
        )
    if cur_opacity['grade_level'] is not None and base_opacity['grade_level'] is not None:
        changes['grade_level'] = _metric_delta(
            float(cur_opacity['grade_level']),
            float(base_opacity['grade_level']),
            higher_is_worse=True,
        )

    cur_asym = _asymmetry_from_photo(current)
    base_asym = _asymmetry_from_photo(baseline)
    changes['irregularity_asymmetry'] = _metric_delta(
        cur_asym['irregularity_asymmetry'],
        base_asym['irregularity_asymmetry'],
        higher_is_worse=True,
    )
    changes['health_score_asymmetry'] = _metric_delta(
        cur_asym['health_score_asymmetry'],
        base_asym['health_score_asymmetry'],
        higher_is_worse=True,
    )

    visual = compare_aligned_crops(
        current_details.get('aligned_crops'),
        baseline_details.get('aligned_crops'),
    )

    raw_score = 0.0
    reasons: List[str] = []

    health_drop = -changes['health_score']['delta']
    if health_drop >= 8:
        raw_score += health_drop * weights['health_score']
        if condition == 'cataract':
            reasons.append(f'Lens clarity score dropped {health_drop:.0f} points')
        else:
            reasons.append(f'Overall eye surface health score dropped {health_drop:.0f} points')

    if condition == 'cataract' and changes.get('opacity_score'):
        opacity_rise = changes['opacity_score']['delta']
        if opacity_rise >= 8:
            raw_score += opacity_rise * weights.get('opacity_grade', 1.5)
            reasons.append(f'Opacity score increased by {opacity_rise:.0f} points')

    if condition == 'cataract' and changes.get('grade_level'):
        grade_rise = changes['grade_level']['delta']
        if grade_rise >= 1:
            raw_score += grade_rise * 18 * weights.get('opacity_grade', 1.5)
            cur_g = cur_opacity.get('opacity_grade') or f"level {int(cur_opacity['grade_level'])}"
            base_g = base_opacity.get('opacity_grade') or f"level {int(base_opacity['grade_level'])}"
            reasons.append(f'Opacity grade moved from {base_g} to {cur_g}')

    redness_rise = changes['sclera_redness']['delta']
    if condition != 'cataract' and redness_rise >= 6:
        raw_score += redness_rise * weights['sclera_redness']
        reasons.append(f'Redness increased by {redness_rise:.0f} points')

    tear_drop = -changes['tear_film_quality']['delta']
    if condition != 'cataract' and tear_drop >= 8:
        raw_score += tear_drop * weights['tear_film_quality']
        reasons.append(f'Tear film smoothness decreased by {tear_drop:.0f} points')

    irregular_rise = changes['surface_irregularity']['delta']
    if irregular_rise >= 8:
        raw_score += irregular_rise * weights['surface_irregularity']
        label = 'Opacity / media irregularity' if condition == 'cataract' else 'Surface irregularity'
        reasons.append(f'{label} increased by {irregular_rise:.0f} points')

    asym_rise = changes['irregularity_asymmetry']['delta']
    if condition == 'cornea_scar' and asym_rise >= 6:
        raw_score += asym_rise * weights['asymmetry']
        reasons.append(f'Left/right surface asymmetry increased by {asym_rise:.0f} points')
    elif asym_rise >= 10:
        raw_score += asym_rise * weights['asymmetry'] * 0.7
        reasons.append(f'Left/right eye difference increased by {asym_rise:.0f} points')

    if visual.get('available') and visual.get('significant_visual_change'):
        change = float(visual.get('change_score') or 0)
        raw_score += change * 0.35 * weights['visual_change']
        reasons.append(
            f'Aligned eye appearance changed (SSIM {visual.get("ssim_avg")}, change {change:.0f}/100)'
        )

    # Lighting confidence: fair/poor lighting reduces alert strength
    deterioration_score = raw_score * confidence

    # Stricter threshold when lighting is imperfect
    threshold = 12.0
    if confidence < 0.7:
        threshold = 16.0
    if confidence < 0.5:
        threshold = 22.0

    # Glaucoma selfie mode: never escalate to "critical glaucoma" — surface proxy only
    if condition == 'glaucoma':
        threshold = max(threshold, 18.0)

    deteriorated = deterioration_score >= threshold
    severity = 'low'
    if deterioration_score >= 30:
        severity = 'critical'
    elif deterioration_score >= 20:
        severity = 'high'
    elif deterioration_score >= threshold:
        severity = 'medium'

    if condition == 'glaucoma' and severity == 'critical':
        severity = 'high'

    days_between = (
        (current.captured_at - baseline.captured_at).days
        if current.captured_at and baseline.captured_at
        else None
    )

    trend = 'stable'
    if deteriorated:
        trend = 'worsening'
    elif health_drop < -5 or (condition != 'cataract' and redness_rise < -5):
        trend = 'improving'
    elif condition == 'cataract' and changes.get('opacity_score') and changes['opacity_score']['delta'] <= -5:
        trend = 'improving'

    comparison_confidence = 'high' if confidence >= 0.9 else ('medium' if confidence >= 0.65 else 'low')
    if not visual.get('available'):
        comparison_confidence = 'medium' if comparison_confidence == 'high' else comparison_confidence

    recommend_visit = deteriorated and severity in ('high', 'critical') and condition != 'glaucoma'
    if condition == 'glaucoma' and deteriorated and severity in ('high', 'critical'):
        # Soft nudge only — do not imply optic-nerve progression from a selfie
        recommend_visit = False

    message = _build_comparison_message(trend, reasons, days_between, condition, confidence)

    return {
        'deteriorated': deteriorated,
        'severity': severity,
        'deterioration_score': round(deterioration_score, 1),
        'raw_deterioration_score': round(raw_score, 1),
        'lighting_confidence': round(confidence, 2),
        'comparison_confidence': comparison_confidence,
        'trend': trend,
        'reasons': reasons,
        'changes': changes,
        'opacity': {
            'current': cur_opacity,
            'baseline': base_opacity,
        },
        'visual_comparison': {
            'available': visual.get('available'),
            'ssim_left': visual.get('ssim_left'),
            'ssim_right': visual.get('ssim_right'),
            'ssim_avg': visual.get('ssim_avg'),
            'change_score': visual.get('change_score'),
            'significant_visual_change': visual.get('significant_visual_change'),
            'message': visual.get('message'),
        },
        'baseline_photo_id': baseline.id,
        'baseline_captured_at': baseline.captured_at.isoformat() if baseline.captured_at else None,
        'current_photo_id': current.id,
        'days_between': days_between,
        'condition_type': condition,
        'condition_label': CONDITION_LABELS.get(condition, condition),
        'condition_scope': scope,
        'recommend_doctor_visit': recommend_visit,
        'message': message,
        'baseline_left_crop': visual.get('baseline_left'),
        'baseline_right_crop': visual.get('baseline_right'),
        'current_left_crop': visual.get('current_left'),
        'current_right_crop': visual.get('current_right'),
    }


def _build_comparison_message(
    trend: str,
    reasons: List[str],
    days_between: Optional[int],
    condition: str,
    confidence: float,
) -> str:
    label = CONDITION_LABELS.get(condition, 'eye health')
    lighting_note = ''
    if confidence < 0.7:
        lighting_note = ' Lighting was not ideal, so treat this comparison with caution.'

    if condition == 'glaucoma':
        base = (
            'Between-visit surface appearance was compared (not optic-nerve / pressure screening).'
        )
        if trend == 'worsening' and reasons:
            return (
                f'{base} Possible surface change{(" over " + str(days_between) + " days") if days_between else ""}: '
                + '; '.join(reasons[:2])
                + '.'
                + lighting_note
                + ' Follow your glaucoma care plan and contact your doctor if symptoms worsen.'
            )
        return base + ' Surface metrics look stable.' + lighting_note

    if condition == 'cataract':
        if trend == 'worsening' and reasons:
            window = f' over the last {days_between} days' if days_between else ' since your last photo'
            return (
                f'Your cataract opacity screening shows worsening signs{window}: '
                + '; '.join(reasons[:3])
                + '.'
                + lighting_note
                + ' Consider a dilated eye exam — this is not LOCS III diagnosis.'
            )
        if trend == 'improving':
            return 'Your cataract opacity grade looks stable or clearer vs your previous screening photo.' + lighting_note
        return 'Your cataract opacity grade is stable compared to your previous screening photo.' + lighting_note

    if trend == 'worsening' and reasons:
        window = f' over the last {days_between} days' if days_between else ' since your last photo'
        return (
            f'Your {label.lower()} metrics show worsening signs{window}: '
            + '; '.join(reasons[:3])
            + '.'
            + lighting_note
            + ' Consider contacting your eye doctor before your next scheduled visit.'
        )
    if trend == 'improving':
        return f'Your {label.lower()} metrics look stable or improved compared to your previous photo.' + lighting_note
    return f'Your {label.lower()} metrics are stable compared to your previous photo.' + lighting_note


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
    scope = CONDITION_SCOPE.get(current.condition_type or 'general', CONDITION_SCOPE['general'])

    if not baseline or baseline.id == current.id:
        return {
            'has_baseline': False,
            'deteriorated': False,
            'condition_type': current.condition_type,
            'condition_label': CONDITION_LABELS.get(current.condition_type or 'general'),
            'condition_scope': scope,
            'message': 'First photo saved for this condition. Take another in about a month for careful comparison.',
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
                'photo_models': [],
                'avg_health_score': 0,
                'avg_redness': 0,
                'avg_tear_film': 0,
                'avg_irregularity': 0,
                'avg_opacity_score': None,
                'avg_grade_level': None,
            }
        photo_dict = photo.to_dict(include_thumbnail=True)
        opacity = _opacity_from_photo(photo)
        photo_dict['opacity_score'] = opacity.get('opacity_score')
        photo_dict['opacity_grade'] = opacity.get('opacity_grade')
        photo_dict['grade_level'] = opacity.get('grade_level')
        buckets[key]['photos'].append(photo_dict)
        buckets[key]['photo_models'].append(photo)

    timeline = []
    for key in sorted(buckets.keys()):
        bucket = buckets[key]
        photos_in_month = bucket['photos']
        models = bucket.pop('photo_models')
        n = len(photos_in_month)
        bucket['photo_count'] = n
        bucket['avg_health_score'] = round(sum(p['health_score'] for p in photos_in_month) / n, 1)
        bucket['avg_redness'] = round(sum(p['sclera_redness'] or 0 for p in photos_in_month) / n, 1)
        bucket['avg_tear_film'] = round(sum(p['tear_film_quality'] or 0 for p in photos_in_month) / n, 1)
        bucket['avg_irregularity'] = round(
            sum(p['surface_irregularity'] or 0 for p in photos_in_month) / n, 1
        )

        opacity_vals = [o for o in (_opacity_from_photo(m)['opacity_score'] for m in models) if o is not None]
        grade_vals = [g for g in (_opacity_from_photo(m)['grade_level'] for m in models) if g is not None]
        bucket['avg_opacity_score'] = round(sum(opacity_vals) / len(opacity_vals), 1) if opacity_vals else None
        bucket['avg_grade_level'] = round(sum(grade_vals) / len(grade_vals), 1) if grade_vals else None
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
