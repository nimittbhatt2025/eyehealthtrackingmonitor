"""
Production sclera redness inference — bounded ordinal ResNet-18 + smart-crop ROI + TTA.

Drop-in module for upload routes and standalone scoring. Dual-eye clinical analysis
continues through dry_eye_analysis + ocular_ml_preprocess for webcam captures.
Wellness tracking only — not a diagnosis.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

import numpy as np
from PIL import Image

try:
    import mediapipe as mp

    HAS_MEDIAPIPE = True
except ImportError:
    HAS_MEDIAPIPE = False

from app.ai_models.ocular_ml_preprocess import looks_like_eye_crop
from app.ai_models.sclera_redness_model import (
    MODEL_VERSION,
    _load_model_bundle,
    _predict_pil,
    bytes_to_rgb_pil,
)


def get_sclera_model():
    """Return the loaded PyTorch model (singleton)."""
    bundle = _load_model_bundle()
    if not bundle.get('available'):
        raise RuntimeError(bundle.get('error', 'Model unavailable'))
    return bundle['model']


def smart_crop_eyes(img: Image.Image) -> Image.Image:
    """
    Isolate the eye region from wide/full-face photos.

    Uses MediaPipe face detection when available, otherwise a center-crop heuristic.
    Skips cropping when the image is already a clinical/macro eye close-up.
    """
    w, h = img.size
    if looks_like_eye_crop(_pil_to_bgr(img)) and min(w, h) >= 280:
        return img
    if abs(w - h) < min(w, h) * 0.2 and w < 600:
        return img

    if HAS_MEDIAPIPE:
        try:
            mp_face_detection = mp.solutions.face_detection
            with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5) as detector:
                results = detector.process(np.array(img))
                if results.detections:
                    bbox = results.detections[0].location_data.relative_bounding_box
                    xmin = int(bbox.xmin * w)
                    ymin = int(bbox.ymin * h)
                    bwidth = int(bbox.width * w)
                    bheight = int(bbox.height * h)

                    eye_ymin = max(0, ymin + int(bheight * 0.2))
                    eye_ymax = min(h, ymin + int(bheight * 0.6))
                    eye_xmin = max(0, xmin + int(bwidth * 0.1))
                    eye_xmax = min(w, xmin + int(bwidth * 0.9))
                    if eye_xmax - eye_xmin >= 32 and eye_ymax - eye_ymin >= 32:
                        return img.crop((eye_xmin, eye_ymin, eye_xmax, eye_ymax))
        except Exception:
            pass

    return img.crop((w // 4, h // 4, 3 * w // 4, 3 * h // 4))


def predict_sclera_redness_production(image_bytes: bytes) -> Dict[str, Any]:
    """
    Main production entry point for API upload ingestion.

    Accepts raw bytes (JPEG/PNG/WebP), smart-crops ROI, runs TTA, returns score + σ.
    """
    try:
        img = bytes_to_rgb_pil(image_bytes)
        processed = smart_crop_eyes(img)

        bundle = _load_model_bundle()
        if not bundle.get('available'):
            return {'status': 'error', 'message': bundle.get('error', 'Model unavailable')}

        mean_score, std_score, pass_scores = _predict_pil(
            bundle['model'],
            bundle['device'],
            processed,
            use_tta=True,
        )
        mean_score = float(np.clip(mean_score, 0.0, 4.0))
        discretized_grade = int(max(0, min(4, round(mean_score))))

        return {
            'status': 'success',
            'continuous_score': round(mean_score, 4),
            'uncertainty_sigma': round(std_score, 4),
            'grade': discretized_grade,
            'raw_pass_scores': pass_scores,
            'model_version': MODEL_VERSION,
            'smart_crop_applied': processed.size != img.size,
        }
    except Exception as exc:
        return {'status': 'error', 'message': str(exc)}


def apply_production_ml_redness(result: Dict[str, Any], production: Dict[str, Any]) -> None:
    """Replace ml_redness with production output; sync metrics and findings."""
    from app.ai_models.sclera_redness_model import ml_redness_finding

    ml = production_to_ml_redness(production)
    if ml is None:
        return
    prior = result.get('ml_redness') or {}
    if prior.get('score') is not None:
        ml['legacy_score'] = prior['score']
    result['ml_redness'] = ml
    result['production_sclera'] = production
    result['scoring_path'] = 'production_upload'
    metrics = dict(result.get('metrics') or {})
    metrics.update({
        'ml_sclera_score': ml.get('score'),
        'ml_sclera_grade': ml.get('discretized_grade'),
        'ml_sclera_grade_label': ml.get('grade_label'),
        'ml_sclera_uncertainty_std': ml.get('uncertainty_std'),
        'ml_sclera_available': True,
        'ml_model_version': ml.get('model_version'),
    })
    result['metrics'] = metrics
    finding = ml_redness_finding(ml)
    if finding:
        findings = [f for f in (result.get('findings') or []) if 'redness' not in f.lower()]
        findings.insert(0, finding)
        result['findings'] = findings or [finding]


def production_to_ml_redness(production: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Map production API payload into ml_redness shape for the EyeVio UI."""
    if production.get('status') != 'success':
        return None
    grade = production.get('grade', 0)
    labels = {0: 'None', 1: 'Mild', 2: 'Moderate', 3: 'Severe', 4: 'Unusable'}
    return {
        'available': True,
        'score': production['continuous_score'],
        'uncertainty_std': production.get('uncertainty_sigma'),
        'tta_pass_scores': production.get('raw_pass_scores'),
        'discretized_grade': grade,
        'grade_label': labels.get(grade, 'Unknown'),
        'model_version': production.get('model_version'),
        'production_pipeline': True,
        'smart_crop_applied': production.get('smart_crop_applied', False),
    }


def _pil_to_bgr(img: Image.Image) -> np.ndarray:
    import cv2

    rgb = np.array(img.convert('RGB'))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
