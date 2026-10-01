"""
Each home check summarised in its own measurement unit, for reports.

0–100 scores are display indices (not clinically validated) and are never
used here; a test with no native measure is reported as completed only.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Optional

DASH = '—'


def _num(x: Any) -> Optional[float]:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _eyes(details: Dict[str, Any]) -> Dict[str, Any]:
    return details.get('eyes') or {}


def _eye_value(eyes: Dict[str, Any], eye: str, key: str) -> Optional[float]:
    return _num((eyes.get(eye) or {}).get(key))


def _acuity(d):
    od = _num((d.get('right_eye') or {}).get('logMAR'))
    os_ = _num((d.get('left_eye') or {}).get('logMAR'))
    vals = [v for v in (od, os_) if v is not None]
    return {
        'measure': f'{min(vals):.2f} logMAR (better eye)' if vals else DASH,
        'od': f'{od:.2f}' if od is not None else DASH,
        'os': f'{os_:.2f}' if os_ is not None else DASH,
    }


def _contrast(d):
    eyes = _eyes(d)
    both, od, os_ = (_eye_value(eyes, e, 'aulcsf') for e in ('both', 'right', 'left'))
    return {
        'measure': f'AULCSF {both:.2f}' if both is not None else 'AULCSF (per eye)',
        'od': f'{od:.2f}' if od is not None else DASH,
        'os': f'{os_:.2f}' if os_ is not None else DASH,
    }


def glare_multiplier(delta_logcs: Optional[float]) -> Optional[float]:
    """How many times more contrast was needed under glare."""
    return None if delta_logcs is None else 10 ** delta_logcs


def _glare(d):
    delta = _num(d.get('delta_logcs'))
    if delta is None:
        return {'measure': DASH, 'od': DASH, 'os': DASH}
    return {'measure': f'Δ {delta:+.2f} logCS (×{glare_multiplier(delta):.1f} contrast)', 'od': DASH, 'os': DASH}


def _colour_eye(r):
    parts = []
    for axis, letter in (('protan', 'P'), ('deutan', 'D'), ('tritan', 'T')):
        a = ((r or {}).get('axes') or {}).get(axis) or {}
        units = _num(a.get('threshold_units'))
        if a.get('beyond_screen_gamut'):
            parts.append(f'{letter}>gamut')
        elif units is not None:
            parts.append(f'{letter}{units:.0f}')
    return ' '.join(parts) or DASH


def _colour(d):
    eyes = _eyes(d)
    return {
        'measure': f'u′v′ ×1e-4 {_colour_eye(eyes["both"])}' if 'both' in eyes else 'u′v′ ×1e-4 thresholds',
        'od': _colour_eye(eyes.get('right')) if 'right' in eyes else DASH,
        'os': _colour_eye(eyes.get('left')) if 'left' in eyes else DASH,
    }


def _amsler_eye(d, eye):
    r = _eyes(d).get(eye)
    if not r:
        return DASH
    areas = [_num(r.get(k)) for k in ('standard_area_deg2', 'low_contrast_area_deg2')]
    areas = [a for a in areas if a is not None]
    text = f'{max(areas):.1f} deg²' if areas else DASH
    flags = ((d.get('vernier') or {}).get(eye) or {}).get('flags') or r.get('vernier_flags') or []
    bias = sum(1 for f in flags if isinstance(f, dict) and f.get('kind') == 'bias')
    return f'{text}, {bias} vernier' if bias else text


def _amsler(d):
    return {'measure': 'Marked area / vernier flags', 'od': _amsler_eye(d, 'right'), 'os': _amsler_eye(d, 'left')}


def _npc(d):
    npc = _num(d.get('npc_cm'))
    closest = _num(d.get('closest_no_break_cm'))
    if npc is not None:
        text = f'{npc:.1f} cm break'
        reported, camera = _num(d.get('reported_diplopia_cm')), _num(d.get('camera_break_cm'))
        sources = [f'reported {reported:.1f}' if reported is not None else None,
                   f'camera {camera:.1f}' if camera is not None else None]
        sources = [s for s in sources if s]
        if sources:
            text += f' ({", ".join(sources)})'
    elif closest is not None:
        text = f'No break to {closest:.1f} cm'
    else:
        text = DASH
    return {'measure': text, 'od': DASH, 'os': DASH}


def _near_blur(d):
    t = _num(d.get('blur_threshold_arcmin'))
    status = d.get('status')
    if t is None:
        text = 'Beyond test range' if status == 'beyond_range' else DASH
    else:
        text = f'{t:.2f} arcmin blur threshold'
        if status != 'ok':
            text += ' (not repeatable)' if status == 'not_repeatable' else ' (unreliable)'
    return {'measure': text, 'od': DASH, 'os': DASH}


def _dry_eye(d):
    osdi = _num(d.get('osdi_score'))
    blinks = _num((d.get('blink_interval') or {}).get('blinkRatePerMin'))
    blur = _num((d.get('blur_report_time') or d.get('tear_breakup_proxy') or {}).get('medianSeconds'))
    parts = []
    if osdi is not None:
        parts.append(f'OSDI {osdi:.0f}')
    if blinks is not None:
        parts.append(f'{blinks:.0f} blinks/min')
    if blur is not None:
        parts.append(f'blur reported at {blur:.1f} s')
    return {'measure': ' · '.join(parts) or DASH, 'od': DASH, 'os': DASH}


_GLOW_OUTCOMES = {
    'asymmetry_observed': 'Asymmetry observed in repeated captures',
    'no_repeated_asymmetry': 'No repeated asymmetry (not an all-clear)',
    'no_usable_reflex': 'No usable reflex',
    'capture_unsuccessful': 'Capture unsuccessful',
}


def _red_reflex(d):
    label = _GLOW_OUTCOMES.get(d.get('outcome'), DASH)
    usable = d.get('usable_captures')
    if usable is not None and label != DASH:
        label = f'{label} ({usable} usable captures)'
    return {'measure': label, 'od': DASH, 'os': DASH}


def _side_vision(d):
    eyes = _eyes(d)
    od, os_ = (_eye_value(eyes, e, 'max_asymmetry') for e in ('right', 'left'))
    return {
        'measure': 'Max quadrant asymmetry (log units)',
        'od': f'{od:.2f}' if od is not None else DASH,
        'os': f'{os_:.2f}' if os_ is not None else DASH,
    }


def _peripheral(d):
    e50 = _num((d.get('hit_rate_fit') or {}).get('e50Deg'))
    return {'measure': f'{e50:.1f}° (50% hit eccentricity)' if e50 is not None else DASH, 'od': DASH, 'os': DASH}


def _ergonomics(d):
    blink = d.get('blink_rate') or {}
    rate = _num(blink.get('mean_rate_per_min'))
    distance = _num(d.get('avg_viewing_distance_cm'))
    parts = []
    if rate is not None:
        parts.append(f'{rate:.0f} blinks/min')
    if distance:
        parts.append(f'{distance:.0f} cm viewing distance')
    return {'measure': ' · '.join(parts) or DASH, 'od': DASH, 'os': DASH}


_BY_TYPE = {
    'visual_acuity': (_acuity, 2),
    'contrast_sensitivity': (_contrast, 2),
    'cataract_glare': (_glare, 2),
    'color_vision': (_colour, 2),
    'amsler_grid': (_amsler, 2),
    'near_point_convergence': (_npc, None),
    'accommodative_lag': (_near_blur, 2),
    'dry_eye': (_dry_eye, None),
    'red_reflex': (_red_reflex, 3),
    'side_vision': (_side_vision, None),
    'peripheral_awareness': (_peripheral, None),
    'ocular_ergonomics': (_ergonomics, None),
}


def native_summary(test_type: str, details: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """{'measure', 'od', 'os'} as display strings; version-gated where older methods differ."""
    details = details or {}
    entry = _BY_TYPE.get(test_type)
    if entry is None:
        return {'measure': 'Completed (no native measure)', 'od': DASH, 'os': DASH}
    fn, version = entry
    if version is not None and details.get('method_version') != version:
        return {'measure': 'Earlier method version (not comparable)', 'od': DASH, 'os': DASH}
    return fn(details)
