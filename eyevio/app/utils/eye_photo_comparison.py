"""
Month-over-month eye photo comparison and deterioration detection.

Pairwise comparability is separate from single-photo capture quality.
Change decisions use confirmation-aware logic — not raw threshold accumulation alone.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.ai_models.eye_crop_alignment import compare_aligned_crops
from app.models import EyePhoto

MONTHLY_CHECK_INTERVAL_DAYS = 30

BASELINE_WINDOWS = {
    'preferred': (20, 45),
    'extended': (46, 90),
    'historical': (91, 180),
}

MONITOR_THRESHOLD = 10.0
CONFIRM_THRESHOLD = 18.0
PERSISTENT_THRESHOLD = 28.0
LARGE_EYE_CHANGE = 12.0
CONFIRMATION_WINDOW_DAYS = 14

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
        'health_score': 0.8,
        'sclera_redness': 0.9,
        'tear_film_quality': 0.7,
        'surface_irregularity': 0.8,
        'visual_change': 0.9,
        'asymmetry': 0.7,
    },
    'cataract': {
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
        'tracks': ['Redness', 'Reflection consistency', 'Surface texture', 'Aligned eye appearance'],
        'disclaimer': 'Appearance tracking only — not a dry-eye diagnosis.',
    },
    'cornea_scar': {
        'tracks': ['Surface texture', 'Left/right asymmetry', 'Aligned eye appearance'],
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
        'tracks': ['Overall surface appearance', 'Redness', 'Reflection consistency', 'Aligned appearance'],
        'disclaimer': 'Appearance tracking only — not a medical diagnosis.',
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


def _capture_quality_from_photo(photo: EyePhoto) -> Dict[str, Any]:
    details = _details(photo)
    cq = details.get('capture_quality')
    if isinstance(cq, dict) and 'score' in cq:
        return cq
    lighting = details.get('lighting') or {}
    status = lighting.get('status')
    score = 100.0
    if status == 'framing_problem':
        score -= 60
    elif status == 'extreme_problem':
        score -= 50
    eyewear = details.get('eyewear') or {}
    if eyewear.get('detected') and eyewear.get('confidence', 0) >= 55:
        score -= 15
    score = max(0.0, score)
    return {
        'score': round(score),
        'grade': 'high' if score >= 85 else ('moderate' if score >= 65 else 'low'),
        'usable': score >= 50,
    }


def _eye_brightness_from_photo(photo: EyePhoto) -> float:
    if photo.health_score is not None:
        return float(photo.health_score)
    details = _details(photo)
    metrics = details.get('metrics') or {}
    left = float(metrics.get('left_appearance_score') or photo.left_eye_score or 0)
    right = float(metrics.get('right_appearance_score') or photo.right_eye_score or 0)
    return (left + right) / 2 if (left or right) else 50.0


def calculate_comparison_confidence(
    current: EyePhoto,
    baseline: EyePhoto,
    visual: Dict[str, Any],
    days_between: Optional[int],
) -> Dict[str, Any]:
    """Pairwise comparability — not the same as current-photo lighting alone."""
    score = 100.0
    reasons: List[str] = []

    current_cq = _capture_quality_from_photo(current)
    baseline_cq = _capture_quality_from_photo(baseline)

    for label, cq in (('current', current_cq), ('baseline', baseline_cq)):
        if cq.get('score', 100) < 65:
            penalty = min(25, 65 - cq['score'])
            score -= penalty
            reasons.append(f'{label}_capture_quality_low')
        if not cq.get('usable', True):
            score -= 15
            reasons.append(f'{label}_capture_not_usable')

    brightness_delta = abs(_eye_brightness_from_photo(current) - _eye_brightness_from_photo(baseline))
    if brightness_delta > 15:
        score -= min(brightness_delta * 0.8, 20)
        reasons.append('brightness_mismatch')

    if not visual.get('available'):
        score -= 15
        reasons.append('no_aligned_crops')

    if days_between is not None:
        if days_between > 90:
            score -= 10
            reasons.append('extended_interval')
        if days_between > 180:
            score -= 25
            reasons.append('historical_interval')

    score = max(0.0, min(100.0, score))
    level = 'high' if score >= 80 else ('moderate' if score >= 60 else 'low')

    return {
        'score': round(score),
        'level': level,
        'reasons': reasons,
        'current_capture_quality': current_cq,
        'baseline_capture_quality': baseline_cq,
    }


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


def _compute_change_burden(
    changes: Dict[str, Any],
    cur_asym: Dict[str, float],
    base_asym: Dict[str, float],
    visual: Dict[str, Any],
    condition: str,
    weights: Dict[str, float],
    cur_opacity: Dict[str, Any],
    base_opacity: Dict[str, Any],
) -> Tuple[float, List[str], Dict[str, Any]]:
    raw_score = 0.0
    reasons: List[str] = []
    flags: Dict[str, Any] = {
        'redness_change_significant': False,
        'asymmetry_change_significant': False,
        'visual_only_change': False,
    }

    health_drop = -changes['health_score']['delta']
    if health_drop >= 8:
        raw_score += health_drop * weights['health_score']
        reasons.append(f'Appearance score dropped {health_drop:.0f} points')

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
        flags['redness_change_significant'] = True
        reasons.append(f'Redness increased by {redness_rise:.0f} points')

    tear_drop = -changes['tear_film_quality']['delta']
    if condition != 'cataract' and tear_drop >= 8:
        raw_score += tear_drop * weights['tear_film_quality']
        reasons.append(f'Reflection consistency decreased by {tear_drop:.0f} points')

    irregular_rise = changes['surface_irregularity']['delta']
    if irregular_rise >= 8:
        raw_score += irregular_rise * weights['surface_irregularity']
        label = 'Opacity / media irregularity' if condition == 'cataract' else 'Surface texture'
        reasons.append(f'{label} increased by {irregular_rise:.0f} points')

    asym_rise = changes['irregularity_asymmetry']['delta']
    if condition == 'cornea_scar' and asym_rise >= 6:
        raw_score += asym_rise * weights['asymmetry']
        flags['asymmetry_change_significant'] = True
        reasons.append(f'Left/right surface asymmetry increased by {asym_rise:.0f} points')
    elif asym_rise >= 10:
        raw_score += asym_rise * weights['asymmetry'] * 0.7
        flags['asymmetry_change_significant'] = True
        reasons.append(f'Left/right eye difference increased by {asym_rise:.0f} points')

    visual_added = False
    if visual.get('available') and visual.get('significant_visual_change'):
        change = float(visual.get('change_score') or 0)
        metric_support = (
            flags['redness_change_significant']
            or flags['asymmetry_change_significant']
            or health_drop >= 8
        )
        if metric_support:
            raw_score += change * 0.35 * weights['visual_change']
            visual_added = True
            reasons.append(
                f'Photo similarity decreased (change {change:.0f}/100)'
            )
        else:
            flags['visual_only_change'] = True

    return raw_score, reasons, {**flags, 'visual_contributed': visual_added}


def _decide_comparison_action(
    change_burden: float,
    confidence_level: str,
    baseline_type: str,
    flags: Dict[str, Any],
) -> str:
    if confidence_level == 'low':
        return 'RETAKE_FOR_QUALITY'
    if baseline_type == 'historical' and change_burden >= CONFIRM_THRESHOLD:
        return 'RETAKE_TO_CONFIRM_CHANGE'
    if change_burden < MONITOR_THRESHOLD:
        return 'STABLE'
    if change_burden < CONFIRM_THRESHOLD:
        return 'MONITOR'
    if flags.get('visual_only_change') and not flags.get('visual_contributed'):
        return 'RETAKE_TO_CONFIRM_CHANGE'
    if (
        change_burden >= PERSISTENT_THRESHOLD
        and confidence_level == 'high'
        and baseline_type == 'preferred'
    ):
        return 'PERSISTENT_CHANGE'
    if change_burden >= CONFIRM_THRESHOLD:
        return 'RETAKE_TO_CONFIRM_CHANGE'
    return 'MONITOR'


def compare_photos(
    current: EyePhoto,
    baseline: EyePhoto,
    *,
    baseline_type: str = 'preferred',
) -> Dict[str, Any]:
    """Compare two eye photos with metrics + aligned visual similarity."""
    condition = current.condition_type or 'general'
    weights = CONDITION_WEIGHTS.get(condition, CONDITION_WEIGHTS['general'])
    scope = CONDITION_SCOPE.get(condition, CONDITION_SCOPE['general'])

    current_details = _details(current)
    baseline_details = _details(baseline)

    changes = {
        'health_score': _metric_delta(current.health_score, baseline.health_score, higher_is_worse=False),
        'sclera_redness': _metric_delta(current.sclera_redness, baseline.sclera_redness, higher_is_worse=True),
        'tear_film_quality': _metric_delta(current.tear_film_quality, baseline.tear_film_quality, higher_is_worse=False),
        'surface_irregularity': _metric_delta(
            current.surface_irregularity, baseline.surface_irregularity, higher_is_worse=True
        ),
    }

    left_change = _metric_delta(current.left_eye_score, baseline.left_eye_score, higher_is_worse=False)
    right_change = _metric_delta(current.right_eye_score, baseline.right_eye_score, higher_is_worse=False)
    max_eye_change = max(abs(left_change['delta']), abs(right_change['delta']))

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

    days_between = (
        (current.captured_at - baseline.captured_at).days
        if current.captured_at and baseline.captured_at
        else None
    )

    comp_confidence = calculate_comparison_confidence(current, baseline, visual, days_between)
    confidence_level = comp_confidence['level']

    change_burden, reasons, flags = _compute_change_burden(
        changes, cur_asym, base_asym, visual, condition, weights, cur_opacity, base_opacity
    )

    if max_eye_change >= LARGE_EYE_CHANGE:
        flags['asymmetry_change_significant'] = True

    action = _decide_comparison_action(change_burden, confidence_level, baseline_type, flags)
    deteriorated = action == 'PERSISTENT_CHANGE'

    severity = 'low'
    if deteriorated:
        if change_burden >= 30:
            severity = 'critical'
        elif change_burden >= 20:
            severity = 'high'
        else:
            severity = 'medium'

    if condition == 'glaucoma' and severity == 'critical':
        severity = 'high'

    health_drop = -changes['health_score']['delta']
    redness_rise = changes['sclera_redness']['delta']
    trend = 'stable'
    if deteriorated or action == 'RETAKE_TO_CONFIRM_CHANGE':
        trend = 'worsening'
    elif health_drop < -5 or (condition != 'cataract' and redness_rise < -5):
        trend = 'improving'

    recommend_visit = deteriorated and severity in ('high', 'critical') and condition != 'glaucoma'
    recommend_confirm_retake = action == 'RETAKE_TO_CONFIRM_CHANGE'

    message = _build_comparison_message(
        action, reasons, days_between, condition, confidence_level, baseline_type
    )

    return {
        'deteriorated': deteriorated,
        'action': action,
        'severity': severity,
        'change_burden': round(change_burden, 1),
        'deterioration_score': round(change_burden, 1),
        'raw_deterioration_score': round(change_burden, 1),
        'comparison_confidence': confidence_level,
        'comparison_confidence_detail': comp_confidence,
        'lighting_confidence': round(comp_confidence['score'] / 100.0, 2),
        'trend': trend,
        'reasons': reasons,
        'changes': changes,
        'eye_changes': {
            'left': left_change,
            'right': right_change,
            'max_eye_change': round(max_eye_change, 1),
            'asymmetry_flag': max_eye_change >= LARGE_EYE_CHANGE,
        },
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
            'visual_only_change': flags.get('visual_only_change', False),
        },
        'baseline_photo_id': baseline.id,
        'baseline_type': baseline_type,
        'baseline_captured_at': baseline.captured_at.isoformat() if baseline.captured_at else None,
        'current_photo_id': current.id,
        'days_between': days_between,
        'condition_type': condition,
        'condition_label': CONDITION_LABELS.get(condition, condition),
        'condition_scope': scope,
        'recommend_doctor_visit': recommend_visit,
        'recommend_confirm_retake': recommend_confirm_retake,
        'message': message,
        'baseline_left_crop': visual.get('baseline_left'),
        'baseline_right_crop': visual.get('baseline_right'),
        'current_left_crop': visual.get('current_left'),
        'current_right_crop': visual.get('current_right'),
    }


def _build_comparison_message(
    action: str,
    reasons: List[str],
    days_between: Optional[int],
    condition: str,
    confidence_level: str,
    baseline_type: str,
) -> str:
    label = CONDITION_LABELS.get(condition, 'eye appearance')
    window = f' over the last {days_between} days' if days_between else ''

    if action == 'RETAKE_FOR_QUALITY':
        return (
            f'Photo saved, but comparison reliability is low. '
            f'Retake in similar, even front-facing light for a trustworthy month-over-month comparison.'
        )
    if action == 'STABLE':
        return f'Your {label.lower()} photo looks similar to your reference photo{window}.'
    if action == 'MONITOR':
        note = f' Minor visible variation{window}.' if reasons else ''
        return f'Your {label.lower()} photo shows small changes worth watching{note} No action needed yet.'
    if action == 'RETAKE_TO_CONFIRM_CHANGE':
        detail = '; '.join(reasons[:2]) if reasons else 'visible variation detected'
        return (
            f'Larger-than-usual visible change{window}: {detail}. '
            f'Take another photo in similar lighting to confirm before treating this as a real trend.'
        )
    if action == 'PERSISTENT_CHANGE':
        detail = '; '.join(reasons[:3]) if reasons else 'sustained visible change'
        return (
            f'Your {label.lower()} photos show a sustained visible change{window}: {detail}. '
            f'Consider discussing this with your eye doctor before your next scheduled visit.'
        )
    return f'Your {label.lower()} photo was compared to your reference{window}.'


def comparison_snapshot_from_result(comparison: Dict[str, Any]) -> Dict[str, Any]:
    """Compact comparison record stored on each photo for confirmation retakes."""
    changes = comparison.get('changes') or {}
    health = changes.get('health_score') or {}
    return {
        'action': comparison.get('action'),
        'change_burden': comparison.get('change_burden'),
        'baseline_photo_id': comparison.get('baseline_photo_id'),
        'baseline_type': comparison.get('baseline_type'),
        'comparison_confidence': comparison.get('comparison_confidence'),
        'health_score_delta': health.get('delta'),
        'algorithm_logged_at': datetime.utcnow().isoformat(),
    }


def _find_prior_confirm_retake(
    user_id: int,
    current: EyePhoto,
    baseline_id: int,
) -> Optional[EyePhoto]:
    """Recent photo that asked for a confirmation retake against the same baseline."""
    if not current.captured_at or not baseline_id:
        return None
    window_start = current.captured_at - timedelta(days=CONFIRMATION_WINDOW_DAYS)
    candidates = (
        EyePhoto.query.filter(
            EyePhoto.user_id == user_id,
            EyePhoto.condition_type == current.condition_type,
            EyePhoto.id != current.id,
            EyePhoto.captured_at >= window_start,
            EyePhoto.captured_at < current.captured_at,
        )
        .order_by(EyePhoto.captured_at.desc())
        .all()
    )
    for photo in candidates:
        details = _details(photo)
        snap = details.get('comparison_snapshot')
        if not isinstance(snap, dict):
            continue
        if (
            snap.get('action') == 'RETAKE_TO_CONFIRM_CHANGE'
            and snap.get('baseline_photo_id') == baseline_id
        ):
            return photo
    return None


def _apply_confirmation_upgrade(
    comparison: Dict[str, Any],
    prior_photo: EyePhoto,
    condition: str,
    days_between: Optional[int],
) -> Dict[str, Any]:
    """
    Second photo within the confirmation window with similar change → persistent change.
    """
    if comparison.get('action') != 'RETAKE_TO_CONFIRM_CHANGE':
        return comparison
    if comparison.get('change_burden', 0) < CONFIRM_THRESHOLD * 0.75:
        return comparison

    prior_snap = _details(prior_photo).get('comparison_snapshot') or {}
    prior_delta = prior_snap.get('health_score_delta')
    current_delta = (comparison.get('changes') or {}).get('health_score', {}).get('delta')
    if prior_delta is not None and current_delta is not None:
        if prior_delta >= 0 or current_delta >= 0:
            return comparison

    upgraded = dict(comparison)
    upgraded['action'] = 'PERSISTENT_CHANGE'
    upgraded['deteriorated'] = True
    upgraded['recommend_confirm_retake'] = False
    upgraded['confirmed_by_photo_id'] = prior_photo.id
    upgraded['confirmation_note'] = (
        'A second photo in similar lighting showed a similar visible change — treating as sustained.'
    )

    change_burden = float(comparison.get('change_burden') or 0)
    if change_burden >= 30:
        upgraded['severity'] = 'critical'
    elif change_burden >= 20:
        upgraded['severity'] = 'high'
    else:
        upgraded['severity'] = 'medium'

    if condition == 'glaucoma' and upgraded['severity'] == 'critical':
        upgraded['severity'] = 'high'

    upgraded['recommend_doctor_visit'] = (
        upgraded['severity'] in ('high', 'critical') and condition != 'glaucoma'
    )
    upgraded['trend'] = 'worsening'
    upgraded['message'] = _build_comparison_message(
        'PERSISTENT_CHANGE',
        comparison.get('reasons') or [],
        days_between,
        condition,
        comparison.get('comparison_confidence', 'moderate'),
        comparison.get('baseline_type', 'preferred'),
    )
    return upgraded


def find_baseline_photo(
    user_id: int,
    condition_type: str,
    before_date: datetime,
) -> Tuple[Optional[EyePhoto], Optional[str], Optional[int]]:
    """Find baseline photo with tier metadata."""
    for tier, (min_days, max_days) in BASELINE_WINDOWS.items():
        min_date = before_date - timedelta(days=max_days)
        max_date = before_date - timedelta(days=min_days)
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
            days = (before_date - candidate.captured_at).days if candidate.captured_at else None
            return candidate, tier, days

    return None, None, None


def compare_to_historical(user_id: int, current: EyePhoto) -> Dict[str, Any]:
    """Compare current photo to the best available historical baseline."""
    before = current.captured_at or datetime.utcnow()
    baseline, baseline_type, days_between = find_baseline_photo(
        user_id, current.condition_type, before
    )
    scope = CONDITION_SCOPE.get(current.condition_type or 'general', CONDITION_SCOPE['general'])

    if not baseline or baseline.id == current.id:
        return {
            'has_baseline': False,
            'deteriorated': False,
            'action': 'STABLE',
            'condition_type': current.condition_type,
            'condition_label': CONDITION_LABELS.get(current.condition_type or 'general'),
            'condition_scope': scope,
            'message': 'First photo saved for this condition. Take another in about a month for careful comparison.',
        }

    comparison = compare_photos(current, baseline, baseline_type=baseline_type or 'preferred')

    prior_confirm = _find_prior_confirm_retake(user_id, current, baseline.id)
    if prior_confirm:
        comparison = _apply_confirmation_upgrade(
            comparison,
            prior_confirm,
            current.condition_type or 'general',
            comparison.get('days_between'),
        )

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
                'avg_asymmetry': 0,
                'avg_opacity_score': None,
                'avg_grade_level': None,
            }
        photo_dict = photo.to_dict(include_thumbnail=True)
        opacity = _opacity_from_photo(photo)
        details = _details(photo)
        photo_dict['opacity_score'] = opacity.get('opacity_score')
        photo_dict['opacity_grade'] = opacity.get('opacity_grade')
        photo_dict['grade_level'] = opacity.get('grade_level')
        photo_dict['capture_quality'] = details.get('capture_quality')
        asym = _asymmetry_from_photo(photo)
        photo_dict['health_score_asymmetry'] = asym.get('health_score_asymmetry')
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
        bucket['avg_asymmetry'] = round(
            sum(p.get('health_score_asymmetry') or 0 for p in photos_in_month) / n, 1
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
