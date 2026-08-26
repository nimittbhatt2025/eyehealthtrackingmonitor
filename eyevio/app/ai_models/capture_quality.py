"""
Capture-quality gate for eye photos (ISO/IEC 29794-5 inspired heuristics).

Version 2.5 (post Milestone 5 calibration):
  - Removed standalone max-ROI under_ratio (pupils/eyelashes caused webcam FPs)
  - Shadow checks gated by ROI brightness context
  - Even washout + targeted backlight checks (v2.3)
  - Full-frame vertical gradient for window-backlit webcam previews (v2.4)
  - Full-frame left/right clipped-glare for one-sided lamp bloom (v2.5)
  - lr_delta strong-uneven check kept at 55

Re-validate Version 2 on a fresh held-out set — do not re-score the M5 datasets
and report those numbers as independent validation.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.ai_models.eyewear_detection import detect_eyewear

LEFT_EYE = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
RIGHT_EYE = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]
FOREHEAD = [10, 151, 9, 8, 107]

ALGORITHM_VERSION = 2.7

# Version 1 constants (frozen in M4/M5 datasets — do not change retroactively).
V1_EXTREME_EYE_MEAN_LOW = 40
V1_EXTREME_EYE_MEAN_HIGH = 230
V1_EXTREME_LR_DELTA = 55
V1_EXTREME_UNDER_RATIO = 0.35
V1_EXTREME_OVER_RATIO = 0.15

# Version 2 thresholds — calibrate on fresh data after deployment.
EXTREME_EYE_MEAN_LOW = 40
EXTREME_EYE_MEAN_HIGH = 230
MODERATE_EYE_MEAN_HIGH = 170
MODERATE_EVEN_LR_DELTA = 18
EXTREME_LR_DELTA = 55
# v2.3 — targeted backlight checks (v2.2 removed generic glare; missed severe window-backlit frames).
BACKLIGHT_EVEN_EYE_MEAN_MIN = 112
BACKLIGHT_EVEN_LR_MAX = 18
BACKLIGHT_SILHOUETTE_LR_MIN = 40
BACKLIGHT_SILHOUETTE_RATIO_MIN = 1.6
BACKLIGHT_SILHOUETTE_BRIGHT_MIN = 98
BACKLIGHT_SILHOUETTE_DIM_MAX = 72
BACKLIGHT_WINDOW_FLARE_LR_MIN = 45
BACKLIGHT_WINDOW_FLARE_RATIO_MIN = 1.55
BACKLIGHT_WINDOW_FLARE_BRIGHT_MIN = 130
BACKLIGHT_HAZE_OVER_MIN = 0.05
BACKLIGHT_HAZE_EYE_MEAN_MAX = 140
# v2.4 — full-frame vertical gradient catches window-backlit webcam previews that ROI checks miss.
FRAME_BACKLIGHT_VERTICAL_DELTA_MIN = 60
FRAME_BACKLIGHT_UPPER_MEAN_MIN = 155
FRAME_BACKLIGHT_LOWER_MEAN_MAX = 125
FRAME_BACKLIGHT_UPPER_BRIGHT200_MIN = 0.28
FRAME_BACKLIGHT_LOWER_BRIGHT200_MAX = 0.15
FRAME_BACKLIGHT_LOWER_DARK_MAX = 100
# v2.5 — left/right clipped bloom catches one-sided lamp glare that eye ROIs miss.
FRAME_SIDE_GLARE_MAX_OVER245_MIN = 0.12
FRAME_SIDE_GLARE_OVER245_DELTA_MIN = 0.10
EYE_DARK_MEAN_MAX = 42
EYE_DARK_UNDER = 0.55
EXTREME_OVER_RATIO = 0.15


def frozen_threshold_snapshot(version: int = ALGORITHM_VERSION) -> Dict[str, Any]:
    if version == 1:
        return {
            'algorithm_version': 1,
            'extreme_eye_mean_low': V1_EXTREME_EYE_MEAN_LOW,
            'extreme_eye_mean_high': V1_EXTREME_EYE_MEAN_HIGH,
            'extreme_lr_delta': V1_EXTREME_LR_DELTA,
            'extreme_under_ratio': V1_EXTREME_UNDER_RATIO,
            'extreme_over_ratio': V1_EXTREME_OVER_RATIO,
            'frozen_at_collection': True,
        }
    return {
        'algorithm_version': ALGORITHM_VERSION,
        'extreme_eye_mean_low': EXTREME_EYE_MEAN_LOW,
        'extreme_eye_mean_high': EXTREME_EYE_MEAN_HIGH,
        'moderate_eye_mean_high': MODERATE_EYE_MEAN_HIGH,
        'moderate_even_lr_delta': MODERATE_EVEN_LR_DELTA,
        'extreme_lr_delta': EXTREME_LR_DELTA,
        'backlight_even_eye_mean_min': BACKLIGHT_EVEN_EYE_MEAN_MIN,
        'backlight_even_lr_max': BACKLIGHT_EVEN_LR_MAX,
        'backlight_silhouette_lr_min': BACKLIGHT_SILHOUETTE_LR_MIN,
        'backlight_silhouette_ratio_min': BACKLIGHT_SILHOUETTE_RATIO_MIN,
        'backlight_silhouette_bright_min': BACKLIGHT_SILHOUETTE_BRIGHT_MIN,
        'backlight_silhouette_dim_max': BACKLIGHT_SILHOUETTE_DIM_MAX,
        'backlight_window_flare_lr_min': BACKLIGHT_WINDOW_FLARE_LR_MIN,
        'backlight_window_flare_ratio_min': BACKLIGHT_WINDOW_FLARE_RATIO_MIN,
        'backlight_window_flare_bright_min': BACKLIGHT_WINDOW_FLARE_BRIGHT_MIN,
        'backlight_haze_over_min': BACKLIGHT_HAZE_OVER_MIN,
        'backlight_haze_eye_mean_max': BACKLIGHT_HAZE_EYE_MEAN_MAX,
        'frame_backlight_vertical_delta_min': FRAME_BACKLIGHT_VERTICAL_DELTA_MIN,
        'frame_backlight_upper_mean_min': FRAME_BACKLIGHT_UPPER_MEAN_MIN,
        'frame_backlight_lower_mean_max': FRAME_BACKLIGHT_LOWER_MEAN_MAX,
        'frame_backlight_upper_bright200_min': FRAME_BACKLIGHT_UPPER_BRIGHT200_MIN,
        'frame_backlight_lower_bright200_max': FRAME_BACKLIGHT_LOWER_BRIGHT200_MAX,
        'frame_backlight_lower_dark_max': FRAME_BACKLIGHT_LOWER_DARK_MAX,
        'frame_side_glare_max_over245_min': FRAME_SIDE_GLARE_MAX_OVER245_MIN,
        'frame_side_glare_over245_delta_min': FRAME_SIDE_GLARE_OVER245_DELTA_MIN,
        'eye_dark_mean_max': EYE_DARK_MEAN_MAX,
        'eye_dark_under': EYE_DARK_UNDER,
        'extreme_over_ratio': EXTREME_OVER_RATIO,
        'forehead_shadow_check': 'removed_v2.1',
        'frozen_at_collection': True,
    }


def _roi_stats(frame: np.ndarray, landmarks: Any, indices: List[int], pad: float = 0.15) -> Dict[str, float]:
    h, w = frame.shape[:2]
    xs = [landmarks[i].x * w for i in indices]
    ys = [landmarks[i].y * h for i in indices]
    w_span = max(xs) - min(xs)
    h_span = max(ys) - min(ys)
    x0 = int(max(0, min(xs) - w_span * pad))
    y0 = int(max(0, min(ys) - h_span * pad))
    x1 = int(min(w, max(xs) + w_span * pad))
    y1 = int(min(h, max(ys) + h_span * pad))
    roi = frame[y0:y1, x0:x1]
    if roi.size == 0:
        return {'mean': 0.0, 'under_ratio': 0.0, 'over_ratio': 0.0}
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    return {
        'mean': float(np.mean(gray)),
        'under_ratio': float(np.mean(gray < 40)),
        'over_ratio': float(np.mean(gray > 245)),
    }


def _face_framing_ok(landmarks: Any) -> bool:
    """Reject tilted/out-of-frame faces so eye ROIs do not sample bright backgrounds."""
    if landmarks is None:
        return False
    try:
        eye_idx = LEFT_EYE + RIGHT_EYE
        ys = [landmarks[i].y for i in eye_idx]
        xs = [landmarks[i].x for i in eye_idx]
        chin_y = float(landmarks[152].y)
        forehead_y = float(landmarks[10].y)
    except (IndexError, AttributeError, TypeError):
        return False
    if not ys or not xs:
        return False
    mean_y = float(sum(ys) / len(ys))
    x_min, x_max = float(min(xs)), float(max(xs))
    # Tight band — half-visible faces make washout fire on bright murals/walls.
    if mean_y < 0.15 or mean_y > 0.68:
        return False
    if x_min < 0.06 or x_max > 0.94:
        return False
    if (x_max - x_min) < 0.10:
        return False
    if chin_y > 0.98 or forehead_y < 0.02:
        return False
    if (chin_y - forehead_y) < 0.18:
        return False
    return True


def _frame_backlight_stats(frame: np.ndarray) -> Dict[str, float]:
    """Frame-level lighting probes — vertical backlight + horizontal side glare."""
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    upper = gray[int(h * 0.05): int(h * 0.42), int(w * 0.2): int(w * 0.8)]
    lower = gray[int(h * 0.48): int(h * 0.88), int(w * 0.25): int(w * 0.75)]
    face_y0, face_y1 = int(h * 0.2), int(h * 0.75)
    left = gray[face_y0:face_y1, int(w * 0.08): int(w * 0.42)]
    right = gray[face_y0:face_y1, int(w * 0.58): int(w * 0.92)]
    if upper.size == 0 or lower.size == 0 or left.size == 0 or right.size == 0:
        return {
            'upper_mean': 0.0,
            'lower_mean': 0.0,
            'vertical_delta': 0.0,
            'upper_bright200_ratio': 0.0,
            'lower_bright200_ratio': 0.0,
            'left_mean': 0.0,
            'right_mean': 0.0,
            'horizontal_delta': 0.0,
            'left_over245_ratio': 0.0,
            'right_over245_ratio': 0.0,
            'side_over245_max': 0.0,
            'side_over245_delta': 0.0,
        }
    upper_mean = float(np.mean(upper))
    lower_mean = float(np.mean(lower))
    left_mean = float(np.mean(left))
    right_mean = float(np.mean(right))
    left_over245 = float(np.mean(left > 245))
    right_over245 = float(np.mean(right > 245))
    return {
        'upper_mean': upper_mean,
        'lower_mean': lower_mean,
        'vertical_delta': upper_mean - lower_mean,
        'upper_bright200_ratio': float(np.mean(upper > 200)),
        'lower_bright200_ratio': float(np.mean(lower > 200)),
        'left_mean': left_mean,
        'right_mean': right_mean,
        'horizontal_delta': abs(left_mean - right_mean),
        'left_over245_ratio': left_over245,
        'right_over245_ratio': right_over245,
        'side_over245_max': max(left_over245, right_over245),
        'side_over245_delta': abs(left_over245 - right_over245),
    }


def _append_frame_backlight_issues(
    issues: List[str],
    recommendations: List[str],
    frame_stats: Optional[Dict[str, float]],
) -> None:
    if not frame_stats:
        return

    vertical_delta = frame_stats['vertical_delta']
    upper_mean = frame_stats['upper_mean']
    lower_mean = frame_stats['lower_mean']
    upper_bright200 = frame_stats['upper_bright200_ratio']
    lower_bright200 = frame_stats['lower_bright200_ratio']

    gradient_backlight = (
        vertical_delta > FRAME_BACKLIGHT_VERTICAL_DELTA_MIN
        and upper_mean > FRAME_BACKLIGHT_UPPER_MEAN_MIN
        and lower_mean < FRAME_BACKLIGHT_LOWER_MEAN_MAX
    )
    flare_backlight = (
        upper_bright200 > FRAME_BACKLIGHT_UPPER_BRIGHT200_MIN
        and lower_bright200 < FRAME_BACKLIGHT_LOWER_BRIGHT200_MAX
        and lower_mean < FRAME_BACKLIGHT_LOWER_DARK_MAX
    )

    if gradient_backlight or flare_backlight:
        issues.append('Bright window or light source is behind you — face is too dark')
        recommendations.append('Turn around to face the window, or close curtains and use front lighting')

    side_glare = (
        frame_stats.get('side_over245_max', 0.0) > FRAME_SIDE_GLARE_MAX_OVER245_MIN
        and frame_stats.get('side_over245_delta', 0.0) > FRAME_SIDE_GLARE_OVER245_DELTA_MIN
    )
    if side_glare:
        issues.append('Strong one-sided glare is washing out part of your face')
        recommendations.append('Move the lamp in front of you, or turn so light hits both eyes evenly')


def evaluate_lighting_v1(
    left: Dict[str, float],
    right: Dict[str, float],
    forehead: Dict[str, float],
) -> Tuple[List[str], List[str]]:
    """Original M5-frozen logic — for auditing legacy dataset rows."""
    eye_mean = (left['mean'] + right['mean']) / 2
    lr_delta = abs(left['mean'] - right['mean'])
    under_ratio = max(left['under_ratio'], right['under_ratio'], forehead['under_ratio'])
    over_ratio = max(left['over_ratio'], right['over_ratio'], forehead['over_ratio'])

    issues: List[str] = []
    recommendations: List[str] = []

    if eye_mean < V1_EXTREME_EYE_MEAN_LOW:
        issues.append('Lighting is too dark — move toward a light source')
        recommendations.append('Turn on soft front-facing room lights or face indirect daylight')
    if eye_mean > V1_EXTREME_EYE_MEAN_HIGH:
        issues.append('Lighting is too bright — reduce direct glare on your face')
        recommendations.append('Move away from windows or lamps shining directly at you')
    if lr_delta > V1_EXTREME_LR_DELTA:
        issues.append('Strong uneven lighting across your eyes')
        recommendations.append('Face the light source directly — avoid one-sided lamps')
    if under_ratio > V1_EXTREME_UNDER_RATIO:
        issues.append('Extreme shadows on your face')
        recommendations.append('Use even front-facing light instead of side-only lighting')
    if over_ratio > V1_EXTREME_OVER_RATIO:
        issues.append('Severe glare or overexposure on your face')
        recommendations.append('Avoid bright windows or lamps behind you')

    return issues, recommendations


def evaluate_lighting_v2(
    left: Dict[str, float],
    right: Dict[str, float],
    forehead: Dict[str, float],
    frame_stats: Optional[Dict[str, float]] = None,
) -> Tuple[List[str], List[str]]:
    eye_mean = (left['mean'] + right['mean']) / 2
    lr_delta = abs(left['mean'] - right['mean'])
    eye_under_max = max(left['under_ratio'], right['under_ratio'])
    over_ratio = max(left['over_ratio'], right['over_ratio'], forehead['over_ratio'])
    dim_eye = min(left['mean'], right['mean'])
    bright_eye = max(left['mean'], right['mean'])
    eye_ratio = bright_eye / max(dim_eye, 1.0)

    issues: List[str] = []
    recommendations: List[str] = []

    if eye_mean < EXTREME_EYE_MEAN_LOW:
        issues.append('Lighting is too dark — move toward a light source')
        recommendations.append('Turn on soft front-facing room lights or face indirect daylight')

    if eye_mean > EXTREME_EYE_MEAN_HIGH:
        issues.append('Lighting is too bright — reduce direct glare on your face')
        recommendations.append('Move away from windows or lamps shining directly at you')

    if (
        eye_mean > MODERATE_EYE_MEAN_HIGH
        and eye_mean <= EXTREME_EYE_MEAN_HIGH
        and lr_delta <= MODERATE_EVEN_LR_DELTA
    ):
        issues.append('Face is evenly over-bright — soften lighting for reliable analysis')
        recommendations.append('Move away from strong backlight or reduce direct front light')

    if lr_delta > EXTREME_LR_DELTA:
        issues.append('Strong uneven lighting across your eyes')
        recommendations.append('Face the light source directly — avoid one-sided lamps')

    if eye_mean < EYE_DARK_MEAN_MAX and eye_under_max > EYE_DARK_UNDER:
        issues.append('Eye regions too dark with heavy shadow')
        recommendations.append('Brighten evenly from the front')

    if over_ratio > EXTREME_OVER_RATIO:
        issues.append('Severe glare or overexposure on your face')
        recommendations.append('Avoid bright windows or lamps behind you')

    if (
        eye_mean >= BACKLIGHT_EVEN_EYE_MEAN_MIN
        and lr_delta <= BACKLIGHT_EVEN_LR_MAX
        and frame_stats is not None
        and (
            frame_stats.get('vertical_delta', 0.0) > FRAME_BACKLIGHT_VERTICAL_DELTA_MIN
            or (
                frame_stats.get('upper_bright200_ratio', 0.0) > FRAME_BACKLIGHT_UPPER_BRIGHT200_MIN
                and frame_stats.get('lower_mean', 999.0) < FRAME_BACKLIGHT_LOWER_MEAN_MAX
            )
        )
    ):
        issues.append('Strong backlight detected — turn away from the window')
        recommendations.append('Face a lamp or open wall instead of a bright window behind you')

    if (
        lr_delta >= BACKLIGHT_SILHOUETTE_LR_MIN
        and eye_ratio >= BACKLIGHT_SILHOUETTE_RATIO_MIN
        and bright_eye >= BACKLIGHT_SILHOUETTE_BRIGHT_MIN
        and dim_eye <= BACKLIGHT_SILHOUETTE_DIM_MAX
    ):
        issues.append('Backlight is creating harsh shadows on your face')
        recommendations.append('Close curtains or rotate so light hits your face from the front')

    if (
        lr_delta >= BACKLIGHT_WINDOW_FLARE_LR_MIN
        and eye_ratio >= BACKLIGHT_WINDOW_FLARE_RATIO_MIN
        and bright_eye >= BACKLIGHT_WINDOW_FLARE_BRIGHT_MIN
    ):
        issues.append('Strong glare from a bright source behind you')
        recommendations.append('Move so windows or lamps are in front of you, not behind')

    if over_ratio > BACKLIGHT_HAZE_OVER_MIN and eye_mean < BACKLIGHT_HAZE_EYE_MEAN_MAX:
        # Only with frame evidence of backlight / one-sided bloom — not bright murals/rooms.
        frame_supports_haze = False
        if frame_stats is not None:
            frame_supports_haze = (
                frame_stats.get('vertical_delta', 0.0) > FRAME_BACKLIGHT_VERTICAL_DELTA_MIN
                or (
                    frame_stats.get('side_over245_max', 0.0) > FRAME_SIDE_GLARE_MAX_OVER245_MIN
                    and frame_stats.get('side_over245_delta', 0.0) > FRAME_SIDE_GLARE_OVER245_DELTA_MIN
                )
            )
        if frame_supports_haze:
            issues.append('Haze or flare is washing out facial detail')
            recommendations.append('Reduce backlight and use softer front-facing light')

    _append_frame_backlight_issues(issues, recommendations, frame_stats)

    return issues, recommendations


def _build_metrics(
    left: Dict[str, float],
    right: Dict[str, float],
    forehead: Dict[str, float],
    frame_stats: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    lr_delta = abs(left['mean'] - right['mean'])
    eye_under_max = max(left['under_ratio'], right['under_ratio'])
    under_ratio = max(eye_under_max, forehead['under_ratio'])
    over_ratio = max(left['over_ratio'], right['over_ratio'], forehead['over_ratio'])
    dim_eye = min(left['mean'], right['mean'])
    bright_eye = max(left['mean'], right['mean'])

    metrics = {
        'left_eye_mean': round(left['mean'], 1),
        'right_eye_mean': round(right['mean'], 1),
        'forehead_mean': round(forehead['mean'], 1),
        'left_right_delta': round(lr_delta, 1),
        'under_ratio': round(under_ratio, 3),
        'over_ratio': round(over_ratio, 3),
        'eye_under_ratio_max': round(eye_under_max, 3),
        'forehead_under_ratio': round(forehead['under_ratio'], 3),
        'eye_brightness_ratio': round(bright_eye / max(dim_eye, 1.0), 2),
    }
    if frame_stats:
        metrics.update({
            'frame_upper_mean': round(frame_stats['upper_mean'], 1),
            'frame_lower_mean': round(frame_stats['lower_mean'], 1),
            'frame_vertical_delta': round(frame_stats['vertical_delta'], 1),
            'frame_upper_bright200_ratio': round(frame_stats['upper_bright200_ratio'], 3),
            'frame_lower_bright200_ratio': round(frame_stats['lower_bright200_ratio'], 3),
            'frame_side_over245_max': round(frame_stats.get('side_over245_max', 0.0), 3),
            'frame_side_over245_delta': round(frame_stats.get('side_over245_delta', 0.0), 3),
            'frame_horizontal_delta': round(frame_stats.get('horizontal_delta', 0.0), 1),
        })
    return metrics


def assess_anatomical_lighting(
    frame: np.ndarray,
    landmarks: Any = None,
    *,
    version: int = ALGORITHM_VERSION,
) -> Dict[str, Any]:
    if frame is None or frame.size == 0:
        return {
            'status': 'extreme_problem',
            'acceptable': False,
            'extreme': True,
            'algorithm_version': version,
            'issues': ['Could not read image'],
            'recommendations': ['Capture the photo again with your camera working.'],
            'message': 'Could not assess lighting — please retake the photo.',
            'metrics': {},
        }

    # Geometric fallbacks used to sample the whole mid-frame — bright murals then
    # looked like an "over-bright face" when the subject tilted out of view.
    if not _face_framing_ok(landmarks):
        return {
            'status': 'extreme_problem',
            'acceptable': False,
            'extreme': True,
            'algorithm_version': version,
            'issues': ['Face not fully in frame — center your face in the camera'],
            'recommendations': ['Keep both eyes visible and centered before capturing'],
            'message': 'Face not fully in frame — center your face in the camera.',
            'metrics': {},
        }

    left = _roi_stats(frame, landmarks, LEFT_EYE)
    right = _roi_stats(frame, landmarks, RIGHT_EYE)
    forehead = _roi_stats(frame, landmarks, FOREHEAD, pad=0.25)

    frame_stats = _frame_backlight_stats(frame)

    if version == 1:
        issues, recommendations = evaluate_lighting_v1(left, right, forehead)
    else:
        issues, recommendations = evaluate_lighting_v2(left, right, forehead, frame_stats)

    is_extreme = len(issues) > 0
    if not recommendations:
        recommendations = ['Keep even front-facing light on both eyes.']

    return {
        'status': 'extreme_problem' if is_extreme else 'normal',
        'acceptable': not is_extreme,
        'extreme': is_extreme,
        'algorithm_version': version,
        'issues': issues,
        'recommendations': recommendations,
        'metrics': _build_metrics(left, right, forehead, frame_stats),
        'message': issues[0] + '.' if issues else 'Lighting looks good.',
    }


def run_capture_quality_gate(frame: np.ndarray, landmarks: Any = None) -> Dict[str, Any]:
    failures: List[str] = []
    lighting = assess_anatomical_lighting(frame, landmarks)
    eyewear = detect_eyewear(frame, landmarks, strict=False)

    if lighting.get('status') == 'extreme_problem':
        failures.append(lighting.get('message', 'Extreme lighting — improve conditions before capture'))

    eyewear_warning = None
    if eyewear.get('detected') and eyewear.get('confidence', 0) >= 48:
        eyewear_warning = {
            'message': eyewear.get(
                'message',
                'Possible eyeglass frames detected. Results may be less reliable if glasses were worn.',
            ),
            'eyewear': eyewear,
        }

    return {
        'passed': len(failures) == 0,
        'lighting': lighting,
        'eyewear': eyewear,
        'eyewear_warning': eyewear_warning,
        'failures': failures,
    }
