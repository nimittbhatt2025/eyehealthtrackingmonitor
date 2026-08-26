"""
Dry eye screening from eye photos using lightweight computer vision.

Analyzes cropped eye regions (via MediaPipe Face Landmarker) for:
- Sclera redness (inflammation / irritation proxy)
- Tear film surface irregularity (specular breakup proxy)
- Surface texture variation (corneal / tear-film texture proxy)

This is a screening tool only — not a clinical diagnosis.
"""

from __future__ import annotations

import base64
import re
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.ai_models.eye_analysis import get_face_landmarker
from app.ai_models.eye_crop_alignment import build_aligned_crops, eye_asymmetry_metrics
from app.ai_models.eyewear_detection import detect_eyewear
from app.ai_models.capture_quality import assess_anatomical_lighting, build_capture_quality_summary

# Wider eye regions for sclera + lid context (MediaPipe indices)
LEFT_EYE_REGION = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
RIGHT_EYE_REGION = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]

MIN_SCLERA_BRIGHTNESS = 80
MAX_SCLERA_SATURATION = 85
MIN_SCLERA_MASK_COVERAGE = 0.02


def decode_base64_image(image_data: str) -> Optional[np.ndarray]:
    """Decode a base64 or data-URL image into a BGR numpy array."""
    if not image_data:
        return None
    payload = image_data
    if ',' in payload:
        payload = payload.split(',', 1)[1]
    payload = re.sub(r'\s', '', payload)
    try:
        raw = base64.b64decode(payload)
        arr = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return frame
    except Exception:
        return None


def _landmark_bbox(
    face_landmarks: Any,
    indices: List[int],
    width: int,
    height: int,
    pad_x: float = 0.35,
    pad_y: float = 0.45,
) -> Tuple[int, int, int, int]:
    xs = [face_landmarks[i].x * width for i in indices]
    ys = [face_landmarks[i].y * height for i in indices]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    w = max(1, x_max - x_min)
    h = max(1, y_max - y_min)
    x0 = int(max(0, x_min - w * pad_x))
    y0 = int(max(0, y_min - h * pad_y))
    x1 = int(min(width, x_max + w * pad_x))
    y1 = int(min(height, y_max + h * pad_y))
    return x0, y0, x1, y1


def _crop_eye_regions(frame: np.ndarray) -> Dict[str, Any]:
    """Crop left and right eye patches using Face Landmarker."""
    detector = get_face_landmarker()
    if detector is None:
        return {'error': 'Face detection model not available on server'}

    import mediapipe as mp

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    results = detector.detect(mp_image)

    if not results.face_landmarks:
        return {'error': 'No face detected. Center your face in good lighting and try again.'}

    landmarks = results.face_landmarks[0]
    h, w = frame.shape[:2]

    crops = {}
    for side, indices in (('left', LEFT_EYE_REGION), ('right', RIGHT_EYE_REGION)):
        x0, y0, x1, y1 = _landmark_bbox(landmarks, indices, w, h)
        if x1 - x0 < 20 or y1 - y0 < 20:
            return {'error': f'Could not isolate {side} eye — move closer to the camera.'}
        crops[side] = frame[y0:y1, x0:x1].copy()
        crops[f'{side}_bbox'] = [x0, y0, x1, y1]

    return {'crops': crops, 'face_detected': True, 'landmarks': landmarks}


def _sclera_mask(bgr: np.ndarray) -> np.ndarray:
    """Conservative sclera mask — bright, low-saturation pixels without extreme highlights."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    candidate = (
        (v > MIN_SCLERA_BRIGHTNESS)
        & (s < MAX_SCLERA_SATURATION)
        & (v < 245)
    ).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    candidate = cv2.morphologyEx(candidate, cv2.MORPH_OPEN, kernel)
    candidate = cv2.morphologyEx(candidate, cv2.MORPH_CLOSE, kernel)
    return candidate


def measure_sclera_redness(eye_bgr: np.ndarray) -> Dict[str, Any]:
    """
    Sclera redness level 0–100 (higher = more red).
    Returns reliability metadata — do not treat failed segmentation as normal.
    """
    empty = {
        'sclera_redness': None,
        'redness_rg': None,
        'red_pixel_fraction': None,
        'mask_coverage': 0.0,
        'redness_reliable': False,
    }
    if eye_bgr is None or eye_bgr.size == 0:
        return empty

    mask = _sclera_mask(eye_bgr)
    coverage = float(np.count_nonzero(mask)) / mask.size
    if coverage < MIN_SCLERA_MASK_COVERAGE:
        return {**empty, 'mask_coverage': round(coverage, 4)}

    b, g, r = cv2.split(eye_bgr)
    sclera = mask > 0
    r_vals = r[sclera].astype(np.float32)
    g_vals = g[sclera].astype(np.float32)
    red_dom = r_vals - g_vals
    rgb_sum = r_vals + g_vals + b[sclera].astype(np.float32)
    redness_rg = float(np.mean(red_dom))
    redness_normalized = float(np.mean(red_dom / np.maximum(rgb_sum, 1.0)))
    red_pixel_fraction = float(np.mean((r_vals > g_vals + 15).astype(np.float32)))
    redness = float(np.clip(np.mean(red_dom) / 80.0 * 100, 0, 100))

    return {
        'sclera_redness': round(redness, 1),
        'redness_rg': round(redness_rg, 2),
        'red_pixel_fraction': round(red_pixel_fraction, 3),
        'mask_coverage': round(coverage, 4),
        'redness_reliable': True,
    }


def analyze_tear_film_surface(eye_bgr: np.ndarray) -> Dict[str, float]:
    """
    Experimental reflection/texture proxies from corneal zone heuristics.
    Not validated clinical tear-film measurement.
    """
    if eye_bgr is None or eye_bgr.size == 0:
        return {
            'experimental_tear_proxy': 50.0,
            'experimental_texture_proxy': 50.0,
            'tear_film_quality': 50.0,
            'surface_irregularity': 50.0,
        }

    h, w = eye_bgr.shape[:2]
    y0, y1 = int(h * 0.25), int(h * 0.75)
    x0, x1 = int(w * 0.2), int(w * 0.8)
    cornea = eye_bgr[y0:y1, x0:x1]
    if cornea.size == 0:
        return {
            'experimental_tear_proxy': 50.0,
            'experimental_texture_proxy': 50.0,
            'tear_film_quality': 50.0,
            'surface_irregularity': 50.0,
        }

    gray = cv2.cvtColor(cornea, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    _, bright = cv2.threshold(gray, 185, 255, cv2.THRESH_BINARY)
    bright_ratio = float(np.count_nonzero(bright)) / bright.size
    local_std = float(np.std(cv2.Laplacian(gray, cv2.CV_64F)))
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    irregularity = float(np.clip(
        bright_ratio * 120 + local_std * 0.8 + lap_var * 0.015,
        0, 100
    ))
    tear_proxy = float(np.clip(100 - irregularity * 0.85, 0, 100))

    return {
        'experimental_tear_proxy': round(tear_proxy, 1),
        'experimental_texture_proxy': round(irregularity, 1),
        'tear_film_quality': round(tear_proxy, 1),
        'surface_irregularity': round(irregularity, 1),
    }


def _eye_appearance_score(
    redness: Optional[float],
    experimental_tear_proxy: float,
    experimental_texture_proxy: float,
) -> float:
    """Wellness appearance score — not a clinical dry-eye severity score."""
    if redness is None:
        redness = 50.0
    redness_component = 100 - redness
    experimental_component = (
        experimental_tear_proxy * 0.6
        + (100 - experimental_texture_proxy) * 0.4
    )
    score = redness_component * 0.65 + experimental_component * 0.35
    return round(float(np.clip(score, 0, 100)), 1)


def _risk_from_score(score: float) -> str:
    if score >= 75:
        return 'similar'
    if score >= 55:
        return 'some_variation'
    return 'larger_change'


def _risk_message(risk: str) -> str:
    messages = {
        'similar': 'This photo looks similar to typical reference photos in good lighting.',
        'some_variation': 'Some visible variation appears in this photo — lighting and camera quality affect results.',
        'larger_change': 'This photo shows larger-than-usual visible variation. Retake in similar lighting if tracking month-over-month.',
    }
    return messages.get(risk, messages['some_variation'])


def assess_photo_lighting(frame: np.ndarray, face_landmarks: Any = None) -> Dict[str, Any]:
    """
    Check whether lighting is suitable for reliable eye-surface photo analysis.

    Returns quality (good | fair | poor), acceptable flag, issues, and recommendations.
    """
    if frame is None or frame.size == 0:
        return {
            'quality': 'poor',
            'acceptable': False,
            'score': 0,
            'issues': ['Could not read image'],
            'recommendations': ['Capture the photo again with your camera working and permissions enabled.'],
            'message': 'Could not assess lighting — please retake the photo.',
        }

    h, w = frame.shape[:2]

    if face_landmarks:
        xs = [lm.x * w for lm in face_landmarks]
        ys = [lm.y * h for lm in face_landmarks]
        pad_x = (max(xs) - min(xs)) * 0.12
        pad_y = (max(ys) - min(ys)) * 0.18
        x0 = int(max(0, min(xs) - pad_x))
        y0 = int(max(0, min(ys) - pad_y))
        x1 = int(min(w, max(xs) + pad_x))
        y1 = int(min(h, max(ys) + pad_y))
    else:
        x0, y0 = int(w * 0.2), int(h * 0.12)
        x1, y1 = int(w * 0.8), int(h * 0.88)

    region = frame[y0:y1, x0:x1]
    if region.size == 0:
        region = frame

    gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    mean_luma = float(np.mean(gray))
    std_luma = float(np.std(gray))
    underexposed_ratio = float(np.mean(gray < 40))
    overexposed_ratio = float(np.mean(gray > 245))

    mid = max(1, gray.shape[1] // 2)
    left_mean = float(np.mean(gray[:, :mid]))
    right_mean = float(np.mean(gray[:, mid:]))
    lr_delta = abs(left_mean - right_mean)

    issues: List[str] = []
    recommendations: List[str] = []
    quality = 'good'
    acceptable = True
    score = 100.0

    if mean_luma < 55:
        issues.append('Photo is too dark')
        recommendations.append('Turn on soft room lights or use indirect daylight facing you')
        quality = 'poor'
        acceptable = False
        score -= 45
    elif mean_luma < 78:
        issues.append('Lighting is dim')
        recommendations.append('Add more even front-facing light before capturing')
        quality = 'fair'
        score -= 22

    if mean_luma > 215:
        issues.append('Photo is overexposed or has harsh glare')
        recommendations.append('Reduce direct light on your face and avoid bright windows behind you')
        quality = 'poor'
        acceptable = False
        score -= 40
    elif mean_luma > 188:
        issues.append('Lighting may be too bright on your face')
        recommendations.append('Use softer, indirect lighting instead of a lamp pointed at your eyes')
        if quality == 'good':
            quality = 'fair'
        score -= 18

    if overexposed_ratio > 0.07:
        issues.append('Bright glare spots detected')
        recommendations.append('Tilt slightly away from overhead lights or windows causing shine on your skin')
        quality = 'poor'
        acceptable = False
        score -= 28

    if underexposed_ratio > 0.22:
        issues.append('Large shadow areas on your face')
        recommendations.append('Use even lighting from the front, not from one side only')
        if acceptable and quality == 'good':
            quality = 'fair'
        score -= 20

    if lr_delta > 32:
        issues.append('Uneven lighting across your face')
        recommendations.append('Face the light source — avoid strong side lighting')
        if quality == 'good':
            quality = 'fair'
        score -= 16

    if std_luma < 16 and mean_luma < 95:
        issues.append('Very low contrast — details may not be visible')
        quality = 'poor'
        acceptable = False
        score -= 22

    score = float(np.clip(score, 0, 100))

    if not issues:
        recommendations = [
            'Lighting looks suitable. Keep your face evenly lit and avoid backlighting.',
        ]
        message = 'Lighting looks good for an eye photo.'
    elif not acceptable:
        message = issues[0] + '. Fix lighting and retake for reliable results.'
    else:
        message = issues[0] + '. You can retake for better accuracy, or continue with caution.'

    return {
        'quality': quality,
        'acceptable': acceptable,
        'score': round(score, 1),
        'mean_brightness': round(mean_luma, 1),
        'contrast': round(std_luma, 1),
        'overexposed_ratio': round(overexposed_ratio * 100, 1),
        'underexposed_ratio': round(underexposed_ratio * 100, 1),
        'left_right_imbalance': round(lr_delta, 1),
        'issues': issues,
        'recommendations': recommendations,
        'message': message,
    }


def analyze_eye_patch(eye_bgr: np.ndarray) -> Dict[str, Any]:
    redness_data = measure_sclera_redness(eye_bgr)
    surface = analyze_tear_film_surface(eye_bgr)
    redness = redness_data.get('sclera_redness')
    appearance = _eye_appearance_score(
        redness,
        surface['experimental_tear_proxy'],
        surface['experimental_texture_proxy'],
    )
    return {
        'appearance_score': appearance,
        'health_score': appearance,
        'sclera_redness': redness,
        'redness_reliable': redness_data.get('redness_reliable', False),
        'redness_details': redness_data,
        'experimental_tear_proxy': surface['experimental_tear_proxy'],
        'experimental_texture_proxy': surface['experimental_texture_proxy'],
        'tear_film_quality': surface['tear_film_quality'],
        'surface_irregularity': surface['surface_irregularity'],
        'risk_level': _risk_from_score(appearance),
    }


def analyze_dry_eye_frame(frame: np.ndarray) -> Dict[str, Any]:
    """Full dry-eye screening analysis on a single BGR frame."""
    if frame is None or frame.size == 0:
        return {'error': 'Invalid image'}

    crop_result = _crop_eye_regions(frame)
    if crop_result.get('error'):
        return crop_result

    lighting = assess_anatomical_lighting(frame, crop_result.get('landmarks'))
    eyewear = detect_eyewear(frame, crop_result.get('landmarks'))
    capture_quality = build_capture_quality_summary(lighting, eyewear)

    crops = crop_result['crops']
    left = analyze_eye_patch(crops['left'])
    right = analyze_eye_patch(crops['right'])
    aligned_crops = build_aligned_crops(crops['left'], crops['right'])
    asymmetry = eye_asymmetry_metrics(left, right)

    left_score = left['appearance_score']
    right_score = right['appearance_score']
    overall = round((left_score + right_score) / 2, 1)
    max_eye_change_proxy = abs(left_score - right_score)
    risk = _risk_from_score(overall)

    findings: List[str] = []
    reliable_redness = []
    if left.get('redness_reliable') and left.get('sclera_redness') is not None:
        reliable_redness.append(left['sclera_redness'])
    if right.get('redness_reliable') and right.get('sclera_redness') is not None:
        reliable_redness.append(right['sclera_redness'])
    avg_redness = sum(reliable_redness) / len(reliable_redness) if reliable_redness else None
    avg_irreg = (left['experimental_texture_proxy'] + right['experimental_texture_proxy']) / 2
    avg_tear = (left['experimental_tear_proxy'] + right['experimental_tear_proxy']) / 2

    if avg_redness is not None and avg_redness > 35:
        findings.append('Visible redness in the white of the eye')
    if avg_irreg > 45:
        findings.append('Uneven reflection patterns on the eye surface')
    if avg_tear < 55:
        findings.append('Reflection consistency appears lower than typical')
    if asymmetry['health_score_asymmetry'] > 20:
        findings.append('Noticeable difference between left and right eye appearance')
    if asymmetry['irregularity_asymmetry'] > 15:
        findings.append('Surface texture differs between left and right eye')

    if not findings:
        findings.append('No large visible differences detected in this photo')

    return {
        'score': overall,
        'appearance_score': overall,
        'risk_level': risk,
        'risk_message': _risk_message(risk),
        'findings': findings,
        'left_eye': left,
        'right_eye': right,
        'lighting': lighting,
        'eyewear': eyewear,
        'capture_quality': capture_quality,
        'aligned_crops': aligned_crops,
        'eye_asymmetry': asymmetry,
        'metrics': {
            'avg_sclera_redness': round(avg_redness, 1) if avg_redness is not None else None,
            'avg_tear_film_quality': round(avg_tear, 1),
            'avg_surface_irregularity': round(avg_irreg, 1),
            'avg_experimental_tear_proxy': round(avg_tear, 1),
            'avg_experimental_texture_proxy': round(avg_irreg, 1),
            'health_score_asymmetry': asymmetry['health_score_asymmetry'],
            'irregularity_asymmetry': asymmetry['irregularity_asymmetry'],
            'left_appearance_score': left_score,
            'right_appearance_score': right_score,
            'max_eye_score_delta': round(max_eye_change_proxy, 1),
        },
        'disclaimer': (
            'Appearance tracking only — not a medical diagnosis. Lighting, makeup, and camera quality affect results.'
        ),
    }


def analyze_dry_eye_from_base64(image_data: str) -> Dict[str, Any]:
    frame = decode_base64_image(image_data)
    if frame is None:
        return {'error': 'Could not decode image. Please capture again.'}
    return analyze_dry_eye_frame(frame)


def check_photo_lighting_from_base64(image_data: str) -> Dict[str, Any]:
    """Lighting-only check for live preview or pre-submit validation."""
    frame = decode_base64_image(image_data)
    if frame is None:
        return {'error': 'Could not decode image. Please capture again.'}

    crop_result = _crop_eye_regions(frame)
    if crop_result.get('error'):
        lighting = assess_anatomical_lighting(frame)
        return {
            'lighting': lighting,
            'face_detected': False,
            'warning': crop_result.get('error'),
        }

    lighting = assess_anatomical_lighting(frame, crop_result.get('landmarks'))
    return {
        'lighting': lighting,
        'face_detected': True,
    }


# Re-export for eye_analysis module
def analyze_tear_film(eye_region: np.ndarray) -> float:
    """Compatibility wrapper — returns tear film quality 0–100."""
    return analyze_tear_film_surface(eye_region)['tear_film_quality']


def measure_redness(eye_region: np.ndarray) -> float:
    """Compatibility wrapper — returns sclera redness 0–100."""
    result = measure_sclera_redness(eye_region)
    return float(result.get('sclera_redness') or 0.0)
