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

# Wider eye regions for sclera + lid context (MediaPipe indices)
LEFT_EYE_REGION = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
RIGHT_EYE_REGION = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]


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

    return {'crops': crops, 'face_detected': True}


def _sclera_mask(bgr: np.ndarray) -> np.ndarray:
    """Mask likely sclera pixels (bright, low saturation)."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    # Bright areas with low-to-moderate saturation
    mask = ((v > 80) & (s < 90)).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    return mask


def measure_sclera_redness(eye_bgr: np.ndarray) -> float:
    """
    Sclera redness level 0–100 (higher = more red).
    """
    if eye_bgr is None or eye_bgr.size == 0:
        return 0.0

    mask = _sclera_mask(eye_bgr)
    if np.count_nonzero(mask) < 50:
        # Fallback: use lighter pixels in the crop
        gray = cv2.cvtColor(eye_bgr, cv2.COLOR_BGR2GRAY)
        mask = (gray > 100).astype(np.uint8) * 255

    b, g, r = cv2.split(eye_bgr)
    sclera = mask > 0
    if not np.any(sclera):
        return 0.0

    red_dom = (r[sclera].astype(np.float32) - g[sclera].astype(np.float32))
    redness = float(np.clip(np.mean(red_dom) / 80.0 * 100, 0, 100))
    return round(redness, 1)


def analyze_tear_film_surface(eye_bgr: np.ndarray) -> Dict[str, float]:
    """
    Estimate tear film quality from corneal reflection / texture.

    Returns:
        tear_film_quality: 0–100 (higher = smoother, healthier-looking surface)
        surface_irregularity: 0–100 (higher = more irregular — dry-eye proxy)
    """
    if eye_bgr is None or eye_bgr.size == 0:
        return {'tear_film_quality': 50.0, 'surface_irregularity': 50.0}

    h, w = eye_bgr.shape[:2]
    # Central corneal zone (avoid lids)
    y0, y1 = int(h * 0.25), int(h * 0.75)
    x0, x1 = int(w * 0.2), int(w * 0.8)
    cornea = eye_bgr[y0:y1, x0:x1]
    if cornea.size == 0:
        return {'tear_film_quality': 50.0, 'surface_irregularity': 50.0}

    gray = cv2.cvtColor(cornea, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    # Specular highlights — broken / scattered reflections suggest tear film instability
    _, bright = cv2.threshold(gray, 185, 255, cv2.THRESH_BINARY)
    bright_ratio = float(np.count_nonzero(bright)) / bright.size

    # Local brightness variation (tear film breakup increases patchiness)
    local_std = float(np.std(cv2.Laplacian(gray, cv2.CV_64F)))
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    # Normalize heuristics (tuned conservatively for webcam photos)
    irregularity = float(np.clip(
        bright_ratio * 120 + local_std * 0.8 + lap_var * 0.015,
        0, 100
    ))
    tear_film_quality = float(np.clip(100 - irregularity * 0.85, 0, 100))

    return {
        'tear_film_quality': round(tear_film_quality, 1),
        'surface_irregularity': round(irregularity, 1),
    }


def _eye_health_score(redness: float, tear_film_quality: float, irregularity: float) -> float:
    """Per-eye health score 0–100 (higher = healthier / lower dry-eye signs)."""
    redness_penalty = min(redness * 0.45, 40)
    irregularity_penalty = min(irregularity * 0.35, 35)
    score = tear_film_quality * 0.55 + (100 - redness) * 0.25 + (100 - irregularity) * 0.20
    score -= redness_penalty * 0.15
    return round(float(np.clip(score, 0, 100)), 1)


def _risk_from_score(score: float) -> str:
    if score >= 75:
        return 'low'
    if score >= 55:
        return 'moderate'
    return 'elevated'


def _risk_message(risk: str) -> str:
    messages = {
        'low': 'Your eye surface looks relatively healthy in this photo. Keep taking screen breaks and staying hydrated.',
        'moderate': 'We see mild signs that could be linked to dry eyes — dryness, redness, or an uneven tear film. Try regular breaks and lubricating drops if you have symptoms.',
        'elevated': 'This photo shows stronger signs that can be linked to dry eyes. If your eyes often feel dry, gritty, or tired, please book a full eye exam.',
    }
    return messages.get(risk, messages['moderate'])


def analyze_eye_patch(eye_bgr: np.ndarray) -> Dict[str, Any]:
    redness = measure_sclera_redness(eye_bgr)
    surface = analyze_tear_film_surface(eye_bgr)
    health = _eye_health_score(redness, surface['tear_film_quality'], surface['surface_irregularity'])
    return {
        'health_score': health,
        'sclera_redness': redness,
        'tear_film_quality': surface['tear_film_quality'],
        'surface_irregularity': surface['surface_irregularity'],
        'risk_level': _risk_from_score(health),
    }


def analyze_dry_eye_frame(frame: np.ndarray) -> Dict[str, Any]:
    """Full dry-eye screening analysis on a single BGR frame."""
    if frame is None or frame.size == 0:
        return {'error': 'Invalid image'}

    crop_result = _crop_eye_regions(frame)
    if crop_result.get('error'):
        return crop_result

    crops = crop_result['crops']
    left = analyze_eye_patch(crops['left'])
    right = analyze_eye_patch(crops['right'])

    overall = round((left['health_score'] + right['health_score']) / 2, 1)
    risk = _risk_from_score(overall)

    findings: List[str] = []
    avg_redness = (left['sclera_redness'] + right['sclera_redness']) / 2
    avg_irreg = (left['surface_irregularity'] + right['surface_irregularity']) / 2
    avg_tear = (left['tear_film_quality'] + right['tear_film_quality']) / 2

    if avg_redness > 35:
        findings.append('Visible redness in the white of the eye')
    if avg_irreg > 45:
        findings.append('Uneven tear film reflections on the eye surface')
    if avg_tear < 55:
        findings.append('Tear film may appear less smooth than typical')
    if abs(left['health_score'] - right['health_score']) > 20:
        findings.append('Noticeable difference between left and right eye')

    if not findings:
        findings.append('No strong dry-eye signs detected in this photo')

    return {
        'score': overall,
        'risk_level': risk,
        'risk_message': _risk_message(risk),
        'findings': findings,
        'left_eye': left,
        'right_eye': right,
        'metrics': {
            'avg_sclera_redness': round(avg_redness, 1),
            'avg_tear_film_quality': round(avg_tear, 1),
            'avg_surface_irregularity': round(avg_irreg, 1),
        },
        'disclaimer': (
            'Screening only — not a medical diagnosis. Lighting, makeup, and camera quality affect results.'
        ),
    }


def analyze_dry_eye_from_base64(image_data: str) -> Dict[str, Any]:
    frame = decode_base64_image(image_data)
    if frame is None:
        return {'error': 'Could not decode image. Please capture again.'}
    return analyze_dry_eye_frame(frame)


# Re-export for eye_analysis module
def analyze_tear_film(eye_region: np.ndarray) -> float:
    """Compatibility wrapper — returns tear film quality 0–100."""
    return analyze_tear_film_surface(eye_region)['tear_film_quality']


def measure_redness(eye_region: np.ndarray) -> float:
    """Compatibility wrapper — returns sclera redness 0–100."""
    return measure_sclera_redness(eye_region)
