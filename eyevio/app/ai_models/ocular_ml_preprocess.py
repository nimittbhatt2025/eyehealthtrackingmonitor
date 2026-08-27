"""
Ocular-region preprocessing for sclera redness ML inference.

Webcam selfies must be cropped to the eye/sclera before ResNet — never the full frame.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np

# MediaPipe eye indices (same as dry_eye_analysis heuristic crops).
LEFT_EYE_REGION = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
RIGHT_EYE_REGION = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]

ML_EYE_PAD_X = 0.10
ML_EYE_PAD_Y = 0.15
ML_MIN_PATCH_PX = 240

MIN_SCLERA_BRIGHTNESS = 80
MAX_SCLERA_SATURATION = 85

# Webcam selfie: landmark eye box is a small fraction of the full frame width/height.
WEBCAM_ML_EYE_FRAME_RATIO_MAX = 0.15
WEBCAM_ML_CALIB_FACTOR = 0.35

_haar_face_cascade = None
_haar_eye_cascade = None


def _get_haar_cascades() -> Tuple[cv2.CascadeClassifier, cv2.CascadeClassifier]:
    """Lazy-load OpenCV Haar cascades (fallback when MediaPipe misses a face)."""
    global _haar_face_cascade, _haar_eye_cascade
    if _haar_eye_cascade is None:
        _haar_face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml',
        )
        _haar_eye_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_eye.xml',
        )
    return _haar_face_cascade, _haar_eye_cascade


def _padded_rect(
    x: int,
    y: int,
    rw: int,
    rh: int,
    frame_w: int,
    frame_h: int,
    *,
    pad_ratio: float = 0.30,
) -> Tuple[int, int, int, int]:
    pad = int(rw * pad_ratio)
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(frame_w, x + rw + pad)
    y1 = min(frame_h, y + rh + pad)
    return x0, y0, x1, y1


def crop_eyes_haar(frame_bgr: np.ndarray) -> Optional[Dict[str, np.ndarray]]:
    """
    Detect eyes with OpenCV Haar cascades and return left/right BGR patches.

    Searches the upper ~65% of the frame (or within a detected face ROI when available).
    """
    if frame_bgr is None or frame_bgr.size == 0:
        return None

    h, w = frame_bgr.shape[:2]
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    face_cascade, eye_cascade = _get_haar_cascades()

    roi_y1 = h
    roi_x0, roi_y0 = 0, 0
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    if len(faces) > 0:
        fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
        roi_x0 = fx
        roi_y0 = fy
        roi_y1 = min(h, fy + int(fh * 0.72))
    else:
        roi_y1 = int(h * 0.65)

    roi_gray = gray[roi_y0:roi_y1, roi_x0:w]
    roi_bgr = frame_bgr[roi_y0:roi_y1, roi_x0:w]
    if roi_gray.size == 0:
        return None

    eyes = eye_cascade.detectMultiScale(
        roi_gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(30, 30),
    )
    if len(eyes) == 0:
        return None

    eyes = sorted(eyes, key=lambda e: e[0])
    crops: Dict[str, np.ndarray] = {}

    if len(eyes) >= 2:
        pairs = (('left', eyes[0]), ('right', eyes[-1]))
    else:
        ex, ey, ew, eh = eyes[0]
        x0, y0, x1, y1 = _padded_rect(ex, ey, ew, eh, roi_bgr.shape[1], roi_bgr.shape[0])
        single = roi_bgr[y0:y1, x0:x1].copy()
        if single.size == 0:
            return None
        return {'left': single, 'right': single.copy()}

    for side, (ex, ey, ew, eh) in pairs:
        x0, y0, x1, y1 = _padded_rect(ex, ey, ew, eh, roi_bgr.shape[1], roi_bgr.shape[0])
        patch = roi_bgr[y0:y1, x0:x1].copy()
        if patch.size == 0:
            return None
        crops[side] = patch

    return crops


def haar_eye_crop_meta(frame_bgr: np.ndarray) -> Optional[Dict[str, Any]]:
    """Build crop metadata from Haar eye detection."""
    crops = crop_eyes_haar(frame_bgr)
    if not crops:
        return None
    return {
        'crops': crops,
        'face_detected': False,
        'landmarks': None,
        'external_eye_only': False,
        'crop_method': 'haar_eye',
    }


def landmark_bbox(
    face_landmarks: Any,
    indices: list[int],
    width: int,
    height: int,
    pad_x: float,
    pad_y: float,
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


def _exclude_canthus_and_brow(mask: np.ndarray, side: Optional[str]) -> np.ndarray:
    if mask is None or mask.size == 0:
        return mask
    cleaned = mask.copy()
    h, w = cleaned.shape[:2]
    canthus_margin = max(2, int(w * 0.22))
    brow_margin = max(1, int(h * 0.18))
    if side == 'left':
        cleaned[:, w - canthus_margin :] = 0
    elif side == 'right':
        cleaned[:, :canthus_margin] = 0
    cleaned[:brow_margin, :] = 0
    return cleaned


def sclera_mask(bgr: np.ndarray, side: Optional[str] = None) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    _, s, v = cv2.split(hsv)
    candidate = (
        (v > MIN_SCLERA_BRIGHTNESS)
        & (s < MAX_SCLERA_SATURATION)
        & (v < 245)
    ).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    candidate = cv2.morphologyEx(candidate, cv2.MORPH_OPEN, kernel)
    candidate = cv2.morphologyEx(candidate, cv2.MORPH_CLOSE, kernel)
    return _exclude_canthus_and_brow(candidate, side)


def prepare_ocular_patch(eye_bgr: np.ndarray, side: Optional[str] = None) -> np.ndarray:
    """Tighten an eye landmark crop to the visible sclera before model inference."""
    if eye_bgr is None or eye_bgr.size == 0:
        return eye_bgr

    patch = eye_bgr
    mask = sclera_mask(patch, side=side)
    ys, xs = np.where(mask > 0)
    h, w = patch.shape[:2]
    if len(xs) >= 10:
        coverage = float(len(xs)) / mask.size
        if coverage >= 0.03:
            x0, x1 = int(xs.min()), int(xs.max())
            y0, y1 = int(ys.min()), int(ys.max())
            bw = max(1, x1 - x0 + 1)
            bh = max(1, y1 - y0 + 1)
            sx0 = max(0, x0 - int(bw * 0.22))
            sx1 = min(w, x1 + int(bw * 0.22))
            sy0 = max(0, y0 - int(bh * 0.18))
            sy1 = min(h, y1 + int(bh * 0.12))
            patch = patch[sy0:sy1, sx0:sx1]

    h, w = patch.shape[:2]
    if h >= 8 and w >= 8:
        patch = patch[int(h * 0.10): int(h * 0.90), int(w * 0.04): int(w * 0.96)]

    h, w = patch.shape[:2]
    if max(h, w) < ML_MIN_PATCH_PX:
        scale = ML_MIN_PATCH_PX / max(h, w)
        patch = cv2.resize(
            patch,
            (max(1, int(w * scale)), max(1, int(h * scale))),
            interpolation=cv2.INTER_CUBIC,
        )
    return patch


def fallback_upper_face_eye_band(frame_bgr: np.ndarray) -> np.ndarray:
    """Last-resort crop when a full-face selfie reaches the model without landmarks."""
    h, w = frame_bgr.shape[:2]
    return frame_bgr[int(h * 0.18): int(h * 0.52), int(w * 0.22): int(w * 0.78)].copy()


def looks_like_full_face_frame(bgr: np.ndarray) -> bool:
    if bgr is None or bgr.size == 0:
        return False
    h, w = bgr.shape[:2]
    return max(h, w) >= 480 and (max(h, w) / max(1, min(h, w))) < 2.5


def looks_like_eye_crop(bgr: np.ndarray) -> bool:
    """
    Heuristic for uploaded macro eye photos where MediaPipe cannot find a full face.

    Typical conjunctivitis / clinical close-ups: both eyes visible, no chin/jaw in frame.
    """
    if bgr is None or bgr.size == 0:
        return False
    h, w = bgr.shape[:2]
    if min(h, w) < 64:
        return False
    aspect = max(h, w) / max(1, min(h, w))
    if aspect > 3.5:
        return False
    # Full-face selfies usually have more vertical extent than macro eye shots.
    if looks_like_full_face_frame(bgr):
        return False
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    mean_luma = float(np.mean(gray))
    if mean_luma < 25:
        return False
    # Expect some bright sclera-like pixels in a genuine eye close-up.
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    _, s, v = cv2.split(hsv)
    sclera_like = float(np.mean((v > MIN_SCLERA_BRIGHTNESS) & (s < MAX_SCLERA_SATURATION)))
    return sclera_like >= 0.04


def split_binocular_eye_crop(frame_bgr: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Split a both-eyes macro upload into left/right patches."""
    h, w = frame_bgr.shape[:2]
    mid = w // 2
    overlap = max(4, int(w * 0.06))
    left = frame_bgr[:, : mid + overlap].copy()
    right = frame_bgr[:, max(0, mid - overlap):].copy()
    return left, right


def external_eye_crop_meta(frame_bgr: np.ndarray) -> Dict[str, Any]:
    """Build crop metadata when the upload is already an ocular close-up."""
    haar = haar_eye_crop_meta(frame_bgr)
    if haar is not None:
        haar['external_eye_only'] = True
        haar['crop_method'] = 'haar_eye_macro'
        return haar
    left, right = split_binocular_eye_crop(frame_bgr)
    return {
        'crops': {'left': left, 'right': right},
        'face_detected': False,
        'landmarks': None,
        'external_eye_only': True,
        'crop_method': 'binocular_split',
    }


def ensure_ocular_input(bgr: np.ndarray, side: Optional[str] = None) -> np.ndarray:
    """Guarantee model input is an ocular patch, not a full selfie frame."""
    if bgr is None or bgr.size == 0:
        return bgr
    if looks_like_full_face_frame(bgr):
        haar = crop_eyes_haar(bgr)
        if haar and side in haar:
            bgr = haar[side]
        elif haar and side is None:
            bgr = haar.get('left') or next(iter(haar.values()))
        else:
            bgr = fallback_upper_face_eye_band(bgr)
    return prepare_ocular_patch(bgr, side=side)


def ml_eye_patches_from_landmarks(
    frame: np.ndarray,
    landmarks: Any,
) -> Tuple[Dict[str, np.ndarray], Dict[str, Tuple[int, int, int]]]:
    h, w = frame.shape[:2]
    patches: Dict[str, np.ndarray] = {}
    raw_shapes: Dict[str, Tuple[int, int, int]] = {}
    for side, indices in (('left', LEFT_EYE_REGION), ('right', RIGHT_EYE_REGION)):
        x0, y0, x1, y1 = landmark_bbox(
            landmarks, indices, w, h, ML_EYE_PAD_X, ML_EYE_PAD_Y,
        )
        if x1 - x0 < 12 or y1 - y0 < 12:
            raise ValueError(f'Could not isolate {side} eye for ML inference')
        raw = frame[y0:y1, x0:x1].copy()
        raw_shapes[side] = raw.shape
        patches[side] = prepare_ocular_patch(raw, side=side)
    return patches, raw_shapes


def is_webcam_face_capture(
    frame: np.ndarray,
    raw_shapes: Dict[str, Tuple[int, int, int]],
    *,
    external_eye_only: bool = False,
) -> bool:
    """True when ML crops are tiny relative to the source frame (typical webcam selfie)."""
    if external_eye_only or frame is None or frame.size == 0:
        return False
    fh, fw = frame.shape[:2]
    frame_max = max(fh, fw)
    if frame_max <= 0:
        return False
    raw_max = max(max(s[0], s[1]) for s in raw_shapes.values() if s)
    return (raw_max / frame_max) < WEBCAM_ML_EYE_FRAME_RATIO_MAX


def calibrate_webcam_ml_score(
    ml_redness: Dict[str, Any],
    *,
    apply: bool,
    architecture: Optional[str] = None,
) -> Dict[str, Any]:
    if not ml_redness.get('available') or ml_redness.get('score') is None:
        return ml_redness

    ml_redness = {
        **ml_redness,
        'raw_score': ml_redness['score'],
        'webcam_calibrated': False,
        'ocular_crop': True,
    }
    # Bounded clamp model is calibrated for ocular crops; skip legacy scaling.
    if architecture == 'bounded_clamp':
        return ml_redness
    if not apply:
        return ml_redness

    calibrated = round(float(ml_redness['score']) * WEBCAM_ML_CALIB_FACTOR, 2)
    grade = max(0, min(4, int(calibrated)))
    labels = {0: 'None', 1: 'Mild', 2: 'Moderate', 3: 'Severe', 4: 'Unusable'}
    ml_redness['score'] = calibrated
    ml_redness['discretized_grade'] = grade
    ml_redness['grade_label'] = labels.get(grade, 'Unknown')
    ml_redness['webcam_calibrated'] = True
    if ml_redness.get('uncertainty_std') is not None:
        ml_redness['uncertainty_std'] = round(
            float(ml_redness['uncertainty_std']) * WEBCAM_ML_CALIB_FACTOR,
            4,
        )
    return ml_redness
