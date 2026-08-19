"""
Capture-quality gate for eye photos (ISO/IEC 29794-5 inspired heuristics).
Separates "is this image reliable enough to analyze?" from clinical inference.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from app.ai_models.eyewear_detection import detect_eyewear

LEFT_EYE = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
RIGHT_EYE = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]
FOREHEAD = [10, 151, 9, 8, 107]


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


def assess_anatomical_lighting(frame: np.ndarray, landmarks: Any = None) -> Dict[str, Any]:
    """Multi-ROI lighting quality with confidence 0–1."""
    issues: List[str] = []
    recommendations: List[str] = []

    if landmarks is not None:
        left = _roi_stats(frame, landmarks, LEFT_EYE)
        right = _roi_stats(frame, landmarks, RIGHT_EYE)
        forehead = _roi_stats(frame, landmarks, FOREHEAD, pad=0.25)
    else:
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        region = gray[int(h * 0.12): int(h * 0.88), int(w * 0.2): int(w * 0.8)]
        mean = float(np.mean(region)) if region.size else 0.0
        left = right = forehead = {
            'mean': mean,
            'under_ratio': float(np.mean(region < 40)) if region.size else 0.0,
            'over_ratio': float(np.mean(region > 245)) if region.size else 0.0,
        }

    score = 1.0

    eye_mean = (left['mean'] + right['mean']) / 2
    if eye_mean < 55:
        issues.append('Eye regions too dark')
        recommendations.append('Add soft front-facing light')
        score -= 0.45
    elif eye_mean < 75:
        issues.append('Eye regions dim')
        recommendations.append('Brighten evenly from the front')
        score -= 0.22
    if eye_mean > 210:
        issues.append('Eye regions overexposed')
        recommendations.append('Reduce direct light on your face')
        score -= 0.4
    elif eye_mean > 185:
        issues.append('Eye regions quite bright')
        score -= 0.15

    lr_delta = abs(left['mean'] - right['mean'])
    if lr_delta > 28:
        issues.append('Uneven light across eyes')
        recommendations.append('Face the light source directly')
        score -= 0.28
    elif lr_delta > 18:
        issues.append('Mild left/right imbalance')
        score -= 0.12

    for roi in (left, right, forehead):
        if roi['over_ratio'] > 0.08:
            issues.append('Glare on face')
            recommendations.append('Avoid windows or lamps behind you')
            score -= 0.2
            break
        if roi['under_ratio'] > 0.22:
            issues.append('Shadows on face')
            score -= 0.15

    score = float(np.clip(score, 0, 1))
    quality = 'good' if score >= 0.72 else ('fair' if score >= 0.45 else 'poor')
    acceptable = score >= 0.45

    if not recommendations:
        recommendations = ['Keep even front-facing light on both eyes.']

    return {
        'quality': quality,
        'acceptable': acceptable,
        'confidence': round(score, 3),
        'score': round(score * 100, 1),
        'issues': issues,
        'recommendations': recommendations,
        'metrics': {
            'left_eye_mean': round(left['mean'], 1),
            'right_eye_mean': round(right['mean'], 1),
            'forehead_mean': round(forehead['mean'], 1),
            'left_right_delta': round(lr_delta, 1),
        },
        'message': issues[0] + '.' if issues else 'Eye-region lighting looks suitable.',
    }


def run_capture_quality_gate(frame: np.ndarray, landmarks: Any = None) -> Dict[str, Any]:
    """
    Strict one-shot gate when user presses capture.
    Returns passed, lighting, eyewear, failures[].
    """
    failures: List[str] = []

    lighting = assess_anatomical_lighting(frame, landmarks)
    eyewear = detect_eyewear(frame, landmarks, strict=True)

    if lighting.get('confidence', 0) < 0.45:
        failures.append(lighting.get('message', 'Lighting not adequate'))

    if eyewear.get('detected'):
        failures.append(eyewear.get('message', 'Eyeglasses appear present'))

    return {
        'passed': len(failures) == 0,
        'lighting': lighting,
        'eyewear': eyewear,
        'failures': failures,
    }
