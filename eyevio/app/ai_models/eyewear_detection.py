"""
Heuristic eyeglasses detection for eye-surface photo capture.

Uses periocular edge/line patterns from a face photo (MediaPipe landmarks when
available). Screening only — may miss rimless lenses or false-positive on heavy
brows; blocks obvious frame + bridge patterns before analysis.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

# MediaPipe landmark indices (periocular + brow)
LEFT_EYE_OUTER = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
RIGHT_EYE_OUTER = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]
LEFT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
RIGHT_BROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]


def _landmark_bbox(
    face_landmarks: Any,
    indices: List[int],
    width: int,
    height: int,
    pad_x: float = 0.0,
    pad_y_top: float = 0.0,
    pad_y_bottom: float = 0.0,
) -> Tuple[int, int, int, int]:
    xs = [face_landmarks[i].x * width for i in indices]
    ys = [face_landmarks[i].y * height for i in indices]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    w = max(1.0, x_max - x_min)
    h = max(1.0, y_max - y_min)
    x0 = int(max(0, x_min - w * pad_x))
    y0 = int(max(0, y_min - h * pad_y_top))
    x1 = int(min(width, x_max + w * pad_x))
    y1 = int(min(height, y_max + h * pad_y_bottom))
    return x0, y0, x1, y1


def _merge_bboxes(a: Tuple[int, int, int, int], b: Tuple[int, int, int, int]) -> Tuple[int, int, int, int]:
    return min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])


def _periocular_roi(
    frame: np.ndarray,
    face_landmarks: Any,
) -> Tuple[np.ndarray, Tuple[int, int, int, int]]:
    h, w = frame.shape[:2]
    left = _landmark_bbox(face_landmarks, LEFT_EYE_OUTER + LEFT_BROW, w, h, pad_x=0.35, pad_y_top=0.65, pad_y_bottom=0.35)
    right = _landmark_bbox(face_landmarks, RIGHT_EYE_OUTER + RIGHT_BROW, w, h, pad_x=0.35, pad_y_top=0.65, pad_y_bottom=0.35)
    x0, y0, x1, y1 = _merge_bboxes(left, right)
    roi = frame[y0:y1, x0:x1]
    return roi, (x0, y0, x1, y1)


def _bridge_roi(
    frame: np.ndarray,
    face_landmarks: Any,
) -> Optional[np.ndarray]:
    h, w = frame.shape[:2]
    # Inner eye corners: 133 (left), 362 (right)
    try:
        lx = face_landmarks[133].x * w
        ly = face_landmarks[133].y * h
        rx = face_landmarks[362].x * w
        ry = face_landmarks[362].y * h
    except (IndexError, AttributeError):
        return None

    cx = (lx + rx) / 2
    cy = (ly + ry) / 2
    span = max(24.0, abs(rx - lx) * 0.55)
    half_h = max(18.0, abs(ly - ry) * 0.9 + 14)
    x0 = int(max(0, cx - span))
    x1 = int(min(w, cx + span))
    y0 = int(max(0, cy - half_h))
    y1 = int(min(h, cy + half_h * 0.45))
    if x1 - x0 < 12 or y1 - y0 < 10:
        return None
    return frame[y0:y1, x0:x1]


def _horizontal_line_score(roi: np.ndarray) -> float:
    """Score 0–100 for frame-like horizontal edges in a ROI."""
    if roi is None or roi.size == 0:
        return 0.0

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 45, 130)

    rh, rw = edges.shape[:2]
    min_len = max(12, int(rw * 0.22))
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=28,
        minLineLength=min_len,
        maxLineGap=8,
    )
    if lines is None:
        return 0.0

    horizontal = 0
    upper_zone = int(rh * 0.55)
    for line in lines:
        x1, y1, x2, y2 = line[0]
        dx = abs(x2 - x1)
        dy = abs(y2 - y1)
        if dx < min_len * 0.85:
            continue
        angle = np.degrees(np.arctan2(dy, dx))
        if abs(angle) <= 18 and y1 <= upper_zone and y2 <= upper_zone:
            horizontal += 1

    # Row-wise horizontal gradient energy (frame top/bottom rims)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    row_energy = np.mean(np.abs(gx[:, : int(rw * 0.9)]), axis=1)
    upper_rows = row_energy[: max(1, int(rh * 0.6))]
    if upper_rows.size == 0:
        peak_score = 0.0
    else:
        threshold = float(np.mean(upper_rows) + np.std(upper_rows) * 0.85)
        peaks = int(np.sum(upper_rows > threshold))
        peak_score = float(np.clip(peaks / max(4, rh * 0.12) * 35, 0, 35))

    line_score = float(np.clip(horizontal * 14, 0, 56))
    return float(np.clip(line_score + peak_score, 0, 100))


def _frame_band_score(roi: np.ndarray) -> float:
    """Edge density in bands where eyeglass rims usually sit (incl. clear frames)."""
    if roi is None or roi.size == 0:
        return 0.0

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(gray, 35, 110)
    rh, rw = edges.shape[:2]
    if rh < 20 or rw < 20:
        return 0.0

    def band_density(y0: int, y1: int, x0: int, x1: int) -> float:
        patch = edges[y0:y1, x0:x1]
        return float(np.count_nonzero(patch)) / patch.size if patch.size else 0.0

    score = 0.0
    upper = band_density(int(rh * 0.12), int(rh * 0.38), 0, rw)
    lower = band_density(int(rh * 0.58), int(rh * 0.82), 0, rw)
    left = band_density(int(rh * 0.2), int(rh * 0.75), 0, int(rw * 0.18))
    right = band_density(int(rh * 0.2), int(rh * 0.75), int(rw * 0.82), rw)
    bridge = band_density(int(rh * 0.35), int(rh * 0.55), int(rw * 0.32), int(rw * 0.68))

    if upper > 0.075 and lower > 0.065:
        score += 36
    elif upper > 0.06 and bridge > 0.065:
        score += 28
    elif bridge > 0.07 and left > 0.055 and right > 0.055:
        score += 30
    elif upper > 0.06:
        score += 10  # brow line alone — weak

    return float(np.clip(score, 0, 100))


def _lens_glare_score(roi: np.ndarray) -> float:
    """Bright specular patches that often sit on eyeglass lenses."""
    if roi is None or roi.size == 0:
        return 0.0
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    _, bright = cv2.threshold(gray, 210, 255, cv2.THRESH_BINARY)
    ratio = float(np.count_nonzero(bright)) / bright.size
    # Require some structure — not full-face overexposure
    if ratio < 0.012 or ratio > 0.22:
        return 0.0
    lap = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if lap < 35:
        return 0.0
    return float(np.clip(ratio * 280 + min(lap, 120) * 0.08, 0, 35))


def _center_face_roi(frame: np.ndarray) -> np.ndarray:
    h, w = frame.shape[:2]
    x0, y0 = int(w * 0.18), int(h * 0.12)
    x1, y1 = int(w * 0.82), int(h * 0.72)
    return frame[y0:y1, x0:x1]


def detect_eyewear(
    frame: np.ndarray,
    face_landmarks: Any = None,
    *,
    strict: bool = True,
) -> Dict[str, Any]:
    """
    Detect likely eyeglasses in a BGR selfie frame.

    Returns:
        detected, confidence (0–100), acceptable, message, recommendations
    """
    if frame is None or frame.size == 0:
        return {
            'detected': False,
            'confidence': 0.0,
            'acceptable': True,
            'message': 'Could not assess eyewear.',
            'recommendations': [],
        }

    if face_landmarks is not None:
        periocular, _ = _periocular_roi(frame, face_landmarks)
        bridge = _bridge_roi(frame, face_landmarks)
    else:
        periocular = _center_face_roi(frame)
        bridge = None

    periocular_score = _horizontal_line_score(periocular)
    band_score = _frame_band_score(periocular)
    bridge_score = _horizontal_line_score(bridge) if bridge is not None else 0.0
    glare_score = _lens_glare_score(periocular)

    confidence = float(np.clip(
        0.25 * periocular_score + 0.55 * band_score + 0.12 * bridge_score + 0.08 * glare_score,
        0,
        100,
    ))

    # Require frame signature — paired rims, or bridge + both temples
    has_signature = (
        band_score >= 36
        or (band_score >= 28 and bridge_score >= 12)
        or (bridge_score >= 14 and band_score >= 20)
    )
    if not has_signature:
        confidence = min(confidence, 28.0)

    threshold = 48.0 if strict else 55.0
    detected = confidence >= threshold

    recommendations = [
        'Remove eyeglasses before capturing — frames and lens glare skew surface metrics.',
        'Contact lenses cannot be verified by camera — confirm you removed them before capturing.',
    ]

    if detected:
        message = (
            'Eyeglass frames appear to be present. Remove glasses for accurate eye-surface tracking.'
        )
    elif confidence >= 30:
        message = (
            'Eyewear check inconclusive — uneven lighting or clear frames may hide detection. '
            'Remove glasses and contact lenses, then retake in even light.'
        )
    else:
        message = (
            'No obvious eyeglass frames detected. Contact lenses cannot be verified by camera.'
        )

    return {
        'detected': detected,
        'confidence': round(confidence, 1),
        'acceptable': not detected,
        'inconclusive': not detected and confidence >= 30,
        'periocular_score': round(periocular_score, 1),
        'band_score': round(band_score, 1),
        'bridge_score': round(bridge_score, 1),
        'glare_score': round(glare_score, 1),
        'message': message,
        'recommendations': recommendations if detected else [],
    }
