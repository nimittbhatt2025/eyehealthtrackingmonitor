"""
Cataract screening from front-facing eye photos.

Each eye crop goes through the calibrated ResNet-18 screener
(cataract_resnet.screen_cataract), which returns either a calibrated
likelihood with a low / indeterminate / elevated band, or "cannot assess"
when the crop is out of the training distribution.

No 0–100 opacity score or opacity grade is produced: a binary classifier's
probability is not a severity measurement, and graded training labels are not
available yet (see train_cataract_corn.py). Pupil-region image measurements
are kept as descriptive metadata only.

Screening only — not LOCS III grading and not a millimetre size measurement.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from app.ai_models.capture_quality import assess_anatomical_lighting
from app.ai_models.dry_eye_analysis import (
    LEFT_EYE_REGION,
    RIGHT_EYE_REGION,
    _landmark_bbox,
    decode_base64_image,
)
from app.ai_models.eye_analysis import get_face_landmarker
from app.ai_models.eye_crop_alignment import build_aligned_crops, encode_crop_data_url
from app.ai_models.eyewear_detection import detect_eyewear

BAND_ORDER = {'low': 0, 'indeterminate': 1, 'elevated': 2}

KNOWN_LIMITATION = (
    'Known limitation: in the training data, cataract and normal photos came from different sources, '
    'and the model can partly tell them apart from background and framing alone. '
    'Treat any result as a prompt for an eye exam, never as reassurance.'
)


def _pupil_roi(eye_bgr: np.ndarray) -> Optional[np.ndarray]:
    """Central region of the eye crop approximating pupil / lens view."""
    if eye_bgr is None or eye_bgr.size == 0:
        return None
    h, w = eye_bgr.shape[:2]
    y0, y1 = int(h * 0.28), int(h * 0.78)
    x0, x1 = int(w * 0.28), int(w * 0.72)
    roi = eye_bgr[y0:y1, x0:x1]
    return roi if roi.size else None


def _encode_pupil_zoom(eye_bgr: np.ndarray, out_size: int = 320) -> Optional[str]:
    """
    Encode a display close-up from the eye patch.

    Prefer a wider central window (not the tiny grading ROI) and only upscale
    mildly — heavy INTER_CUBIC upsampling is what made timeline crops look grainy.
    """
    if eye_bgr is None or eye_bgr.size == 0:
        return None
    h, w = eye_bgr.shape[:2]
    # ~70% of the eye patch centered on the pupil / lens
    y0, y1 = int(h * 0.12), int(h * 0.88)
    x0, x1 = int(w * 0.12), int(w * 0.88)
    roi = eye_bgr[y0:y1, x0:x1]
    if roi is None or roi.size == 0:
        roi = eye_bgr

    rh, rw = roi.shape[:2]
    side = min(rh, rw)
    cy, cx = rh // 2, rw // 2
    half = side // 2
    square = roi[max(0, cy - half) : cy + half, max(0, cx - half) : cx + half]
    if square.size == 0:
        return None

    sh, sw = square.shape[:2]
    src = min(sh, sw)
    if src >= out_size:
        zoomed = cv2.resize(square, (out_size, out_size), interpolation=cv2.INTER_AREA)
    elif src * 1.5 >= out_size:
        zoomed = cv2.resize(square, (out_size, out_size), interpolation=cv2.INTER_CUBIC)
    else:
        # Keep near-native size instead of blowing up a tiny patch
        native = max(src, min(out_size, int(src * 1.25)))
        zoomed = cv2.resize(square, (native, native), interpolation=cv2.INTER_CUBIC)

    return encode_crop_data_url(zoomed, quality=92)


def build_pupil_crops(left_bgr: np.ndarray, right_bgr: np.ndarray) -> Dict[str, Any]:
    """Left/right pupil close-ups for UI timelines (not the SSIM-aligned patches)."""
    return {
        'left': _encode_pupil_zoom(left_bgr),
        'right': _encode_pupil_zoom(right_bgr),
        'size': [320, 320],
        'version': 2,
    }


def pupil_image_metrics(eye_bgr: np.ndarray) -> Dict[str, Optional[float]]:
    """
    Descriptive pupil-region measurements (not a score).

    Useful for checking capture consistency between visits; none of these is
    validated as a cataract measure on webcam images.
    """
    roi = _pupil_roi(eye_bgr)
    if roi is None or roi.size == 0:
        return {'mean_brightness': None, 'texture_energy': None, 'dark_pupil_ratio': None, 'red_minus_blue': None}
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    gray_f = gray.astype(np.float32)
    b, _, r = cv2.split(roi)
    return {
        'mean_brightness': round(float(np.mean(gray_f)), 1),
        'texture_energy': round(float(np.clip(cv2.Laplacian(gray, cv2.CV_64F).var() / 80.0, 0, 1)), 3),
        'dark_pupil_ratio': round(float(np.mean(gray_f < 70)), 3),
        'red_minus_blue': round(float(np.mean(r.astype(np.float32) - b.astype(np.float32))), 1),
    }


def _screen(eye_bgr: np.ndarray) -> Dict[str, Any]:
    try:
        from app.ai_models.cataract_resnet import screen_cataract
    except Exception as exc:  # noqa: BLE001
        return {'status': 'model_unavailable', 'reason': f'import_failed: {exc.__class__.__name__}'}
    try:
        return screen_cataract(eye_bgr)
    except Exception as exc:  # noqa: BLE001
        return {'status': 'cannot_assess', 'reason': f'inference_error: {exc.__class__.__name__}'}


def _resnet_model_status() -> Dict[str, Any]:
    try:
        from app.ai_models.cataract_resnet import model_status
        return model_status()
    except Exception:  # noqa: BLE001
        return {'available': False, 'calibrated': False, 'reason': 'import_failed', 'method': None}


def _analyze_eye(eye_bgr: np.ndarray) -> Dict[str, Any]:
    return {
        'screening': _screen(eye_bgr),
        'image_metrics': pupil_image_metrics(eye_bgr),
    }


def combine_eyes(left: Dict[str, Any], right: Dict[str, Any]) -> Dict[str, Any]:
    """Person-level screening = the eye with the higher calibrated likelihood."""
    per_eye = {'left': left.get('screening') or {}, 'right': right.get('screening') or {}}
    assessed = {k: v for k, v in per_eye.items() if v.get('status') == 'assessed'}
    if assessed:
        side, s = max(assessed.items(), key=lambda kv: kv[1]['likelihood'])
        return {
            'status': 'assessed',
            'coverage': 'both_eyes' if len(assessed) == 2 else 'one_eye',
            'driving_eye': side,
            'likelihood': s['likelihood'],
            'band': s['band'],
            'band_level': BAND_ORDER[s['band']],
            'thresholds': s.get('thresholds'),
            'method': s.get('method'),
        }
    statuses = {v.get('status') for v in per_eye.values()}
    status = 'model_unavailable' if 'model_unavailable' in statuses else 'cannot_assess'
    reasons = sorted({v.get('reason') for v in per_eye.values() if v.get('reason')})
    return {'status': status, 'coverage': 'none', 'reasons': reasons, 'likelihood': None, 'band': None, 'band_level': None}


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


RISK_BY_BAND = {
    'elevated': (
        'elevated',
        'The model found features similar to the cataract photos it was trained on. '
        'This is a screening flag, not a diagnosis — please book an eye exam.',
    ),
    'indeterminate': (
        'uncertain',
        'Inconclusive. Retake in even front lighting; if it stays inconclusive, mention it at your next eye exam.',
    ),
    'low': (
        'low',
        'No cataract-like pattern was detected in this photo. This does not rule out cataract — '
        'early cataracts are often not visible on a webcam.',
    ),
}


def analyze_cataract_frame(frame: np.ndarray) -> Dict[str, Any]:
    """Cataract screening on a BGR frame: calibrated likelihood per eye or cannot-assess."""
    if frame is None or frame.size == 0:
        return {'error': 'Invalid image'}

    crop_result = _crop_eyes(frame)
    if crop_result.get('error'):
        return crop_result

    crops = crop_result['crops']
    result = assemble_cataract_result(
        _analyze_eye(crops['left']),
        _analyze_eye(crops['right']),
        lighting=assess_anatomical_lighting(frame, crop_result.get('landmarks')),
        eyewear=detect_eyewear(frame, crop_result.get('landmarks')),
        aligned_crops=build_aligned_crops(crops['left'], crops['right']),
        pupil_crops=build_pupil_crops(crops['left'], crops['right']),
        model_status=_resnet_model_status(),
    )
    try:
        from app.ai_models.pathology_classifier import attach_pathology_triage
        attach_pathology_triage(
            result,
            left_bgr=crops.get('left'),
            right_bgr=crops.get('right'),
        )
    except Exception:
        result['pathology_triage'] = {'available': False, 'reason': 'attach_error'}
    return result


def assemble_cataract_result(
    left: Dict[str, Any],
    right: Dict[str, Any],
    *,
    lighting: Dict[str, Any],
    eyewear: Dict[str, Any],
    aligned_crops: Optional[Dict[str, Any]],
    pupil_crops: Optional[Dict[str, Any]],
    model_status: Dict[str, Any],
    photo_saved: bool = True,
) -> Dict[str, Any]:
    """Person-level screening, findings and risk text — shared by server and on-device analysis."""
    screening = combine_eyes(left, right)
    aligned = aligned_crops
    photo_note = (
        'The photo is still saved for side-by-side comparison.'
        if photo_saved
        else 'Your photo stayed on this device; only the screening result was saved.'
    )

    ls, rs = left['screening'], right['screening']
    asymmetry = None
    if ls.get('status') == 'assessed' and rs.get('status') == 'assessed':
        asymmetry = {'likelihood_difference': round(abs(ls['likelihood'] - rs['likelihood']), 4)}

    findings: List[str] = []
    if screening['status'] == 'assessed':
        risk_level, risk_message = RISK_BY_BAND[screening['band']]
        findings.append(
            f"Calibrated likelihood {screening['likelihood']:.0%} ({screening['band']}) — "
            f"{screening['driving_eye']} eye"
            + (' (other eye could not be assessed)' if screening['coverage'] == 'one_eye' else '')
        )
        if asymmetry and asymmetry['likelihood_difference'] >= 0.3:
            findings.append('Left and right eyes gave noticeably different results')
    elif screening['status'] == 'cannot_assess':
        risk_level = 'unknown'
        risk_message = (
            'Cannot assess: this photo does not look like the images the model was trained on '
            '(lighting, focus, framing or camera). No result is shown rather than a guess. '
            + photo_note
        )
        findings.append('Model abstained on both eyes (out of distribution)')
    else:
        risk_level = 'unknown'
        risk_message = 'Cataract screening model is unavailable. ' + photo_note
        findings.append('Screening model unavailable')
    findings.append(KNOWN_LIMITATION)

    result = {
        'score': None,
        'screening': screening,
        'risk_level': risk_level,
        'risk_message': risk_message,
        'findings': findings,
        'left_eye': left,
        'right_eye': right,
        'eye_asymmetry': asymmetry,
        'lighting': lighting,
        'eyewear': eyewear,
        'aligned_crops': aligned,
        'pupil_crops': pupil_crops,
        'metrics': {
            'screening_status': screening['status'],
            'cataract_likelihood': screening['likelihood'],
            'screening_band': screening['band'],
        },
        'analysis_type': 'cataract_screening',
        'method': screening.get('method') or model_status.get('method'),
        'model_status': model_status,
        'disclaimer': (
            'Screening only — not a medical diagnosis and not a severity grade. The likelihood says how much '
            'this photo resembles the cataract photos in the training set; it does not measure how dense a '
            'cataract is. Cataract size cannot be measured from a selfie. A dilated slit-lamp exam remains '
            'the clinical standard (LOCS III).'
        ),
    }
    return result


def analyze_cataract_from_base64(image_data: str) -> Dict[str, Any]:
    frame = decode_base64_image(image_data)
    if frame is None:
        return {'error': 'Could not decode image. Please capture again.'}
    return analyze_cataract_frame(frame)
