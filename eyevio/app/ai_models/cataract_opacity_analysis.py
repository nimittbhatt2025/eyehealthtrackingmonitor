"""
Cataract opacity screening from anterior eye photos (Phase 1).

Estimates lens opacity grade from pupil-centered eye crops using MediaPipe
landmarks + computer-vision heuristics. Optional ResNet hook is scaffolded
for a future deep-learning grader (LOCS-style) when weights are available.

Screening only — not a clinical LOCS III diagnosis or mm size measurement.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from app.ai_models.dry_eye_analysis import (
    LEFT_EYE_REGION,
    RIGHT_EYE_REGION,
    _landmark_bbox,
    assess_photo_lighting,
    decode_base64_image,
)
from app.ai_models.eye_analysis import get_face_landmarker
from app.ai_models.eye_crop_alignment import build_aligned_crops, eye_asymmetry_metrics

# Grade thresholds on opacity_score 0–100 (higher = more opaque)
GRADE_THRESHOLDS = (
    (20, 'clear', 0),
    (40, 'mild', 1),
    (65, 'moderate', 2),
    (100, 'dense', 3),
)

GRADE_LABELS = {
    'clear': 'Clear / minimal opacity',
    'mild': 'Mild opacity signs',
    'moderate': 'Moderate opacity signs',
    'dense': 'Dense opacity signs',
}


def _score_to_grade(opacity_score: float) -> Dict[str, Any]:
    for upper, name, level in GRADE_THRESHOLDS:
        if opacity_score <= upper:
            return {
                'opacity_grade': name,
                'grade_level': level,
                'grade_label': GRADE_LABELS[name],
            }
    return {
        'opacity_grade': 'dense',
        'grade_level': 3,
        'grade_label': GRADE_LABELS['dense'],
    }


def _pupil_roi(eye_bgr: np.ndarray) -> Optional[np.ndarray]:
    """Central region of the eye crop approximating pupil / lens view."""
    if eye_bgr is None or eye_bgr.size == 0:
        return None
    h, w = eye_bgr.shape[:2]
    y0, y1 = int(h * 0.28), int(h * 0.78)
    x0, x1 = int(w * 0.28), int(w * 0.72)
    roi = eye_bgr[y0:y1, x0:x1]
    return roi if roi.size else None


def estimate_pupil_opacity(eye_bgr: np.ndarray) -> Dict[str, float]:
    """
    Heuristic opacity score 0–100 from an eye patch.

    Uses:
    - Brightness of central pupil zone (whiteness / milkiness)
    - Texture uniformity (dense cataracts look flatter)
    - Blue-yellow cast and loss of dark pupil contrast
    """
    roi = _pupil_roi(eye_bgr)
    if roi is None or roi.size == 0:
        return {
            'opacity_score': 50.0,
            'mean_brightness': 0.0,
            'texture_energy': 0.0,
            'dark_pupil_ratio': 0.0,
        }

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    gray_f = gray.astype(np.float32)
    mean_brightness = float(np.mean(gray_f))
    std = float(np.std(gray_f))
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    # Dark pupil ratio — healthy undilated pupils are relatively dark
    dark_pupil_ratio = float(np.mean(gray_f < 70))

    # Whiteness / opacity proxy
    brightness_term = float(np.clip((mean_brightness - 45) / 120.0 * 100, 0, 100))
    # Low texture + brighter center suggests denser media opacity
    texture_energy = float(np.clip(lap_var / 80.0, 0, 1))
    flatness_term = float(np.clip((1.0 - texture_energy) * 55 + max(0, 25 - std) * 1.2, 0, 70))
    # Missing dark pupil pushes score up; strong dark pupil pulls it down
    missing_dark = float(np.clip((0.35 - dark_pupil_ratio) / 0.35 * 40, 0, 40))
    dark_credit = float(np.clip(dark_pupil_ratio * 28, 0, 28))

    # Mild yellowing (nuclear cataract proxy) via BGR: higher R vs B
    b, g, r = cv2.split(roi)
    yellow_cast = float(np.clip(np.mean(r.astype(np.float32) - b.astype(np.float32)) / 40.0 * 20, 0, 25))

    opacity = (
        0.40 * brightness_term
        + 0.30 * flatness_term
        + 0.20 * missing_dark
        + 0.10 * yellow_cast
        - dark_credit
    )
    opacity = float(np.clip(opacity, 0, 100))

    return {
        'opacity_score': round(opacity, 1),
        'mean_brightness': round(mean_brightness, 1),
        'texture_energy': round(texture_energy, 3),
        'dark_pupil_ratio': round(dark_pupil_ratio, 3),
        'yellow_cast': round(yellow_cast, 1),
    }


def try_resnet_cataract_score(eye_bgr: np.ndarray) -> Optional[Dict[str, Any]]:
    """
    Phase-1 scaffold for optional ResNet cataract classifier.

    Returns None unless a model is configured and torch is installed.
    Future: load Hugging Face ResNet-18 weights and map logits → opacity grade.
    """
    # Intentionally inactive in Phase 1 — keeps install light and offline-safe.
    # Hook point for: AventIQ-AI/resnet18-cataract-detection-system or fine-tuned LOCS model.
    return None


def _analyze_eye(eye_bgr: np.ndarray) -> Dict[str, Any]:
    cv_metrics = estimate_pupil_opacity(eye_bgr)
    dl = try_resnet_cataract_score(eye_bgr)

    if dl and dl.get('opacity_score') is not None:
        opacity = float(dl['opacity_score'])
        method = 'resnet_v1'
    else:
        opacity = float(cv_metrics['opacity_score'])
        method = 'cv_heuristic_v1'

    grade = _score_to_grade(opacity)
    # health_score: higher = clearer lens (compatible with EyePhoto health_score)
    health = round(float(np.clip(100.0 - opacity, 0, 100)), 1)

    return {
        'health_score': health,
        'opacity_score': round(opacity, 1),
        'opacity_grade': grade['opacity_grade'],
        'grade_level': grade['grade_level'],
        'grade_label': grade['grade_label'],
        'method': method,
        'cv_metrics': cv_metrics,
        'dl_metrics': dl,
    }


def _crop_eyes(frame: np.ndarray) -> Dict[str, Any]:
    detector = get_face_landmarker()
    if detector is None:
        return {'error': 'Face detection model not available on server'}

    import mediapipe as mp

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    results = detector.detect(mp_image)

    if not results.face_landmarks:
        return {
            'error': 'No face detected. Move closer, center one eye in the frame, and use even front lighting.',
        }

    landmarks = results.face_landmarks[0]
    h, w = frame.shape[:2]
    crops: Dict[str, Any] = {}

    for side, indices in (('left', LEFT_EYE_REGION), ('right', RIGHT_EYE_REGION)):
        x0, y0, x1, y1 = _landmark_bbox(landmarks, indices, w, h, pad_x=0.45, pad_y=0.55)
        if x1 - x0 < 24 or y1 - y0 < 18:
            return {'error': f'Could not isolate {side} eye. Move closer and keep the eye fully visible.'}
        crops[side] = frame[y0:y1, x0:x1].copy()
        crops[f'{side}_bbox'] = [x0, y0, x1, y1]

    return {'crops': crops, 'landmarks': landmarks, 'face_detected': True}


def analyze_cataract_frame(frame: np.ndarray) -> Dict[str, Any]:
    """Full Phase-1 cataract opacity analysis on a BGR frame."""
    if frame is None or frame.size == 0:
        return {'error': 'Invalid image'}

    crop_result = _crop_eyes(frame)
    if crop_result.get('error'):
        return crop_result

    lighting = assess_photo_lighting(frame, crop_result.get('landmarks'))
    crops = crop_result['crops']
    left = _analyze_eye(crops['left'])
    right = _analyze_eye(crops['right'])
    aligned = build_aligned_crops(crops['left'], crops['right'])
    asymmetry = eye_asymmetry_metrics(
        {
            'health_score': left['health_score'],
            'sclera_redness': left['opacity_score'] * 0.35,
            'surface_irregularity': left['opacity_score'] * 0.55,
            'tear_film_quality': left['health_score'],
        },
        {
            'health_score': right['health_score'],
            'sclera_redness': right['opacity_score'] * 0.35,
            'surface_irregularity': right['opacity_score'] * 0.55,
            'tear_film_quality': right['health_score'],
        },
    )

    avg_opacity = round((left['opacity_score'] + right['opacity_score']) / 2, 1)
    avg_health = round((left['health_score'] + right['health_score']) / 2, 1)
    grade = _score_to_grade(avg_opacity)

    findings: List[str] = []
    if avg_opacity <= 20:
        findings.append('Pupil region looks relatively clear in this photo')
    elif avg_opacity <= 40:
        findings.append('Mild cloudiness / reduced dark-pupil contrast may be present')
    elif avg_opacity <= 65:
        findings.append('Moderate opacity signs in the pupil region')
    else:
        findings.append('Dense opacity signs — please schedule a clinical eye exam')

    if abs(left['opacity_score'] - right['opacity_score']) >= 15:
        findings.append('Noticeable left/right opacity difference')

    findings.append(
        'Phase 1 uses computer-vision opacity grading from an anterior eye photo — not LOCS III and not a millimeter size measurement.'
    )

    return {
        'score': avg_health,  # EyePhoto.health_score (higher = clearer)
        'opacity_score': avg_opacity,
        'opacity_grade': grade['opacity_grade'],
        'grade_level': grade['grade_level'],
        'grade_label': grade['grade_label'],
        'risk_level': 'low' if grade['grade_level'] <= 1 else ('moderate' if grade['grade_level'] == 2 else 'elevated'),
        'risk_message': (
            'Lens region looks relatively clear in this screening photo.'
            if grade['grade_level'] <= 1
            else 'Opacity signs look stronger than last ideal. Share results with your eye doctor.'
            if grade['grade_level'] == 2
            else 'Dense opacity signs detected in this photo. Please book a dilated eye exam soon.'
        ),
        'findings': findings,
        'left_eye': left,
        'right_eye': right,
        'eye_asymmetry': asymmetry,
        'lighting': lighting,
        'aligned_crops': aligned,
        'metrics': {
            'avg_opacity_score': avg_opacity,
            'avg_clarity_score': avg_health,
            'grade_level': grade['grade_level'],
            # Map into EyePhoto columns for trend compatibility
            'avg_sclera_redness': round(avg_opacity * 0.35, 1),
            'avg_tear_film_quality': avg_health,
            'avg_surface_irregularity': round(avg_opacity * 0.55, 1),
        },
        'analysis_type': 'cataract_opacity',
        'method': left.get('method') if left.get('method') == right.get('method') else 'cv_heuristic_v1',
        'model_status': 'heuristic_active_resnet_scaffold',
        'disclaimer': (
            'Screening only — not a medical diagnosis. Cataract size cannot be measured in millimeters '
            'from a phone selfie. This tool estimates an opacity grade for month-over-month trends. '
            'A dilated slit-lamp exam remains the clinical standard (LOCS III).'
        ),
    }


def analyze_cataract_from_base64(image_data: str) -> Dict[str, Any]:
    frame = decode_base64_image(image_data)
    if frame is None:
        return {'error': 'Could not decode image. Please capture again.'}
    return analyze_cataract_frame(frame)
