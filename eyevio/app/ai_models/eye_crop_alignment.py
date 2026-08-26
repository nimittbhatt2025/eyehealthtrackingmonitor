"""
Landmark-aligned eye crop normalization and structural similarity (SSIM).

Used for careful month-over-month visual comparison of eye-surface photos.
"""

from __future__ import annotations

import base64
from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np

# Canonical eye-patch size for registration / SSIM (width, height)
ALIGNED_SIZE = (160, 96)


def normalize_eye_crop(eye_bgr: np.ndarray, size: Tuple[int, int] = ALIGNED_SIZE) -> Optional[np.ndarray]:
    """Resize and lightly equalize an eye crop for stable comparison."""
    if eye_bgr is None or eye_bgr.size == 0:
        return None

    w, h = size
    resized = cv2.resize(eye_bgr, (w, h), interpolation=cv2.INTER_AREA)

    # Mild CLAHE on luminance to reduce lighting drift without inventing texture
    lab = cv2.cvtColor(resized, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
    l = clahe.apply(l)
    normalized = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
    return normalized


def encode_crop_data_url(eye_bgr: np.ndarray, quality: int = 80) -> Optional[str]:
    """Encode a BGR crop as a JPEG data URL."""
    if eye_bgr is None or eye_bgr.size == 0:
        return None
    ok, buffer = cv2.imencode('.jpg', eye_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        return None
    return f'data:image/jpeg;base64,{base64.b64encode(buffer).decode("ascii")}'


def decode_crop_data_url(data_url: Optional[str]) -> Optional[np.ndarray]:
    """Decode a JPEG data URL into a BGR image."""
    if not data_url or ',' not in data_url:
        return None
    try:
        raw = base64.b64decode(data_url.split(',', 1)[1])
        arr = np.frombuffer(raw, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


def _ssim_gray(a: np.ndarray, b: np.ndarray) -> float:
    """
    Structural Similarity Index between two grayscale images in [0, 1].
    Implemented without scikit-image to keep dependencies light.
    """
    if a.shape != b.shape:
        b = cv2.resize(b, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_AREA)

    a = a.astype(np.float64)
    b = b.astype(np.float64)

    c1 = (0.01 * 255) ** 2
    c2 = (0.03 * 255) ** 2

    mu_a = cv2.GaussianBlur(a, (11, 11), 1.5)
    mu_b = cv2.GaussianBlur(b, (11, 11), 1.5)

    mu_a_sq = mu_a * mu_a
    mu_b_sq = mu_b * mu_b
    mu_ab = mu_a * mu_b

    sigma_a_sq = cv2.GaussianBlur(a * a, (11, 11), 1.5) - mu_a_sq
    sigma_b_sq = cv2.GaussianBlur(b * b, (11, 11), 1.5) - mu_b_sq
    sigma_ab = cv2.GaussianBlur(a * b, (11, 11), 1.5) - mu_ab

    numerator = (2 * mu_ab + c1) * (2 * sigma_ab + c2)
    denominator = (mu_a_sq + mu_b_sq + c1) * (sigma_a_sq + sigma_b_sq + c2)
    ssim_map = numerator / (denominator + 1e-12)
    return float(np.clip(np.mean(ssim_map), 0.0, 1.0))


def compute_ssim(img_a: np.ndarray, img_b: np.ndarray) -> float:
    """SSIM on luminance channel of two BGR images."""
    if img_a is None or img_b is None or img_a.size == 0 or img_b.size == 0:
        return 0.0
    gray_a = cv2.cvtColor(img_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(img_b, cv2.COLOR_BGR2GRAY)
    return round(_ssim_gray(gray_a, gray_b), 4)


def build_aligned_crops(left_bgr: np.ndarray, right_bgr: np.ndarray) -> Dict[str, Any]:
    """Normalize and encode both eyes for storage / later SSIM."""
    left_n = normalize_eye_crop(left_bgr)
    right_n = normalize_eye_crop(right_bgr)

    return {
        'left': encode_crop_data_url(left_n) if left_n is not None else None,
        'right': encode_crop_data_url(right_n) if right_n is not None else None,
        'size': list(ALIGNED_SIZE),
        'version': 1,
    }


def eye_asymmetry_metrics(left: Dict[str, Any], right: Dict[str, Any]) -> Dict[str, float]:
    """Absolute left/right differences — useful for cornea / surface change tracking."""
    def _abs(key: str) -> float:
        return abs(float(left.get(key, 0) or 0) - float(right.get(key, 0) or 0))

    return {
        'health_score_asymmetry': round(_abs('health_score'), 1),
        'redness_asymmetry': round(_abs('sclera_redness'), 1),
        'irregularity_asymmetry': round(_abs('surface_irregularity'), 1),
        'tear_film_asymmetry': round(_abs('tear_film_quality'), 1),
    }


def compare_aligned_crops(
    current_crops: Optional[Dict[str, Any]],
    baseline_crops: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Compare stored aligned crops with SSIM.

    Returns similarity (1 = identical) and change_score (0–100, higher = more visual change).
    """
    if not current_crops or not baseline_crops:
        return {
            'available': False,
            'ssim_left': None,
            'ssim_right': None,
            'ssim_avg': None,
            'change_score': None,
            'significant_visual_change': False,
            'message': 'Aligned eye crops not available for visual comparison.',
        }

    left_cur = decode_crop_data_url(current_crops.get('left'))
    left_base = decode_crop_data_url(baseline_crops.get('left'))
    right_cur = decode_crop_data_url(current_crops.get('right'))
    right_base = decode_crop_data_url(baseline_crops.get('right'))

    scores = []
    ssim_left = None
    ssim_right = None

    if left_cur is not None and left_base is not None:
        ssim_left = compute_ssim(left_cur, left_base)
        scores.append(ssim_left)
    if right_cur is not None and right_base is not None:
        ssim_right = compute_ssim(right_cur, right_base)
        scores.append(ssim_right)

    if not scores:
        return {
            'available': False,
            'ssim_left': None,
            'ssim_right': None,
            'ssim_avg': None,
            'change_score': None,
            'significant_visual_change': False,
            'message': 'Could not decode aligned crops for comparison.',
        }

    ssim_avg = float(np.mean(scores))
    # Map similarity → change: SSIM 1.0 → 0 change, SSIM 0.7 → ~30 change
    change_score = round(float(np.clip((1.0 - ssim_avg) * 100, 0, 100)), 1)
    significant = change_score >= 18  # roughly SSIM < ~0.82

    return {
        'available': True,
        'ssim_left': ssim_left,
        'ssim_right': ssim_right,
        'ssim_avg': round(ssim_avg, 4),
        'change_score': change_score,
        'significant_visual_change': significant,
        'baseline_left': baseline_crops.get('left'),
        'baseline_right': baseline_crops.get('right'),
        'current_left': current_crops.get('left'),
        'current_right': current_crops.get('right'),
        'message': (
            f'Aligned eye appearance changed by {change_score:.0f}/100 (SSIM {ssim_avg:.3f}).'
            if significant
            else f'Aligned eye appearance is similar (SSIM {ssim_avg:.3f}).'
        ),
    }


def lighting_confidence(lighting: Optional[Dict[str, Any]]) -> float:
    """
    0–1 confidence multiplier from lighting quality for month-over-month alerts.
    """
    if not lighting:
        return 0.85
    status = lighting.get('status')
    if status == 'normal' or (status is None and lighting.get('acceptable', True)):
        return 1.0
    if status == 'extreme_problem' or not lighting.get('acceptable', True):
        return 0.35
    # Legacy good/fair/poor payloads
    quality = lighting.get('quality', 'fair')
    if quality == 'good' and lighting.get('acceptable', True):
        return 1.0
    if quality == 'fair':
        score = float(lighting.get('score', 70) or 70)
        return float(np.clip(0.55 + score / 250.0, 0.55, 0.85))
    score = float(lighting.get('score', 70) or 70)
    return float(np.clip(0.25 + score / 400.0, 0.25, 0.5))
