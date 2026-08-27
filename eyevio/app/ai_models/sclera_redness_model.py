"""
PyTorch sclera redness model (OrdinalScleraModel) for web capture inference.

Loads best_unfrozen_ordinal.pth and scores eye crops on a 0–4 clinical-style scale.
Wellness tracking only — not a diagnosis.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any, Dict, Optional

import cv2
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms

from app.ai_models.ocular_ml_preprocess import ensure_ocular_input

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_WEIGHTS = REPO_ROOT / 'best_unfrozen_ordinal.pth'
MODEL_VERSION = 'ordinal_resnet18_unfrozen_v3_ocular_crop'

_eval_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

_model_lock = threading.Lock()
_model_bundle: Optional[Dict[str, Any]] = None


class OrdinalScleraModel(nn.Module):
    def __init__(self, backbone: nn.Module, in_features: int) -> None:
        super().__init__()
        self.backbone = backbone
        self.backbone.fc = nn.Sequential(
            nn.Linear(in_features, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = torch.sigmoid(self.backbone(x)) * 4.0
        return out.squeeze(-1)


def _resolve_weights_path() -> Path:
    env_path = os.environ.get('SCLERA_MODEL_PATH', '').strip()
    if env_path:
        return Path(env_path).expanduser().resolve()
    return DEFAULT_WEIGHTS


def _select_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device('cuda')
    if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def _load_model_bundle() -> Dict[str, Any]:
    global _model_bundle
    with _model_lock:
        if _model_bundle is not None:
            return _model_bundle

        weights_path = _resolve_weights_path()
        if not weights_path.is_file():
            _model_bundle = {
                'available': False,
                'error': f'Model weights not found at {weights_path}',
            }
            return _model_bundle

        device = _select_device()
        base = models.resnet18(weights=None)
        model = OrdinalScleraModel(base, base.fc.in_features)
        state = torch.load(weights_path, map_location=device)
        model.load_state_dict(state)
        model.to(device)
        model.eval()

        _model_bundle = {
            'available': True,
            'model': model,
            'device': device,
            'weights_path': str(weights_path),
            'version': MODEL_VERSION,
        }
        return _model_bundle


def model_status() -> Dict[str, Any]:
    bundle = _load_model_bundle()
    if not bundle.get('available'):
        return {'available': False, 'error': bundle.get('error'), 'version': MODEL_VERSION}
    return {
        'available': True,
        'version': bundle['version'],
        'weights_path': bundle['weights_path'],
        'device': str(bundle['device']),
    }


def predict_eye_patch(
    eye_bgr: np.ndarray,
    side: Optional[str] = None,
    *,
    prepared: bool = False,
) -> Dict[str, Any]:
    """Score one BGR ocular crop. Full-face frames are auto-cropped before inference."""
    empty = {
        'available': False,
        'score': None,
        'discretized_grade': None,
        'grade_label': None,
    }
    if eye_bgr is None or eye_bgr.size == 0:
        return {**empty, 'error': 'Empty eye crop'}

    bundle = _load_model_bundle()
    if not bundle.get('available'):
        return {**empty, 'error': bundle.get('error', 'Model unavailable')}

    try:
        if not prepared:
            eye_bgr = ensure_ocular_input(eye_bgr, side=side)
        rgb = cv2.cvtColor(eye_bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb)
        tensor = _eval_transform(pil).unsqueeze(0).to(bundle['device'])

        with torch.no_grad():
            score = float(bundle['model'](tensor).cpu().item())

        score = float(np.clip(score, 0.0, 4.0))
        grade = int(round(score))
        grade = max(0, min(4, grade))

        return {
            'available': True,
            'score': round(score, 2),
            'discretized_grade': grade,
            'grade_label': _grade_label(grade),
            'model_version': bundle['version'],
        }
    except Exception as exc:
        return {**empty, 'error': str(exc)}


def predict_both_eyes(
    left_bgr: np.ndarray,
    right_bgr: np.ndarray,
    *,
    left_side: Optional[str] = 'left',
    right_side: Optional[str] = 'right',
    prepared: bool = False,
) -> Dict[str, Any]:
    """Run model on left/right ocular crops and aggregate."""
    left = predict_eye_patch(left_bgr, side=left_side, prepared=prepared)
    right = predict_eye_patch(right_bgr, side=right_side, prepared=prepared)

    scores = [r['score'] for r in (left, right) if r.get('available') and r.get('score') is not None]
    if not scores:
        err = left.get('error') or right.get('error') or 'Inference unavailable'
        return {
            'available': False,
            'error': err,
            'left': left,
            'right': right,
            'model_version': MODEL_VERSION,
        }

    avg_score = round(sum(scores) / len(scores), 2)
    avg_grade = int(round(avg_score))
    avg_grade = max(0, min(4, avg_grade))

    return {
        'available': True,
        'score': avg_score,
        'discretized_grade': avg_grade,
        'grade_label': _grade_label(avg_grade),
        'left': left,
        'right': right,
        'model_version': MODEL_VERSION,
    }


def _grade_label(grade: int) -> str:
    labels = {
        0: 'None',
        1: 'Mild',
        2: 'Moderate',
        3: 'Severe',
        4: 'Unusable',
    }
    return labels.get(grade, 'Unknown')


def ml_redness_finding(ml: Dict[str, Any]) -> Optional[str]:
    """Conservative text finding from ML grade."""
    if not ml.get('available'):
        return None
    grade = ml.get('discretized_grade')
    if grade is None:
        return None
    if grade >= 3:
        return 'Model detects pronounced visible redness in this photo'
    if grade >= 2:
        return 'Model detects moderate visible redness in this photo'
    if grade >= 1:
        return 'Model detects mild visible redness in this photo'
    return None
