"""
PyTorch sclera redness model for web capture inference.

Supports BoundedOrdinalScleraModel (clamp 0–4, TTA) and legacy OrdinalScleraModel
(sigmoid head). Ocular crops are prepared upstream in ocular_ml_preprocess.py.
Wellness tracking only — not a diagnosis.
"""

from __future__ import annotations

import io
import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import torch
import torch.nn as nn
from PIL import Image, ImageEnhance
from torchvision import models, transforms

from app.ai_models.ocular_ml_preprocess import ensure_ocular_input

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_WEIGHTS = REPO_ROOT / 'sclera_redness_ordinal.pth'
LEGACY_WEIGHTS = REPO_ROOT / 'best_unfrozen_ordinal.pth'
MODEL_VERSION = 'bounded_ordinal_resnet18_tta_v1'

_eval_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

_model_lock = threading.Lock()
_model_bundle: Optional[Dict[str, Any]] = None


class BoundedOrdinalScleraModel(nn.Module):
    """ResNet-18 + linear head with hard clamp to [0, 4]."""

    def __init__(self, backbone: nn.Module, in_features: int) -> None:
        super().__init__()
        self.backbone = backbone
        self.backbone.fc = nn.Linear(in_features, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        raw = self.backbone(x)
        return torch.clamp(raw, 0.0, 4.0).squeeze(-1)


class OrdinalScleraModel(nn.Module):
    """Legacy sigmoid-scaled head (best_unfrozen_ordinal.pth)."""

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
    if DEFAULT_WEIGHTS.is_file():
        return DEFAULT_WEIGHTS
    return LEGACY_WEIGHTS


def _select_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device('cuda')
    if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def _architecture_from_state(state: Dict[str, Any]) -> str:
    if any(k.startswith('backbone.fc.0.') for k in state):
        return 'legacy_sigmoid'
    return 'bounded_clamp'


def _build_model(architecture: str) -> nn.Module:
    base = models.resnet18(weights=None)
    if architecture == 'legacy_sigmoid':
        return OrdinalScleraModel(base, base.fc.in_features)
    return BoundedOrdinalScleraModel(base, base.fc.in_features)


def bytes_to_rgb_pil(image_bytes: bytes) -> Image.Image:
    """Ingest raw upload bytes; normalize RGBA/grayscale to RGB."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode != 'RGB':
        img = img.convert('RGB')
    return img


def bgr_to_rgb_pil(bgr: np.ndarray) -> Image.Image:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)


def _tta_variants(pil: Image.Image) -> List[Image.Image]:
    return [
        pil,
        pil.transpose(Image.FLIP_LEFT_RIGHT),
        ImageEnhance.Brightness(pil).enhance(1.1),
        ImageEnhance.Brightness(pil).enhance(0.9),
        ImageEnhance.Contrast(pil).enhance(1.1),
    ]


def _predict_pil(
    model: nn.Module,
    device: torch.device,
    pil: Image.Image,
    *,
    use_tta: bool = True,
) -> Tuple[float, float, List[float]]:
    variants = _tta_variants(pil) if use_tta else [pil]
    scores: List[float] = []
    with torch.no_grad():
        for variant in variants:
            tensor = _eval_transform(variant).unsqueeze(0).to(device)
            scores.append(float(model(tensor).cpu().item()))
    mean_score = float(np.mean(scores))
    std_score = float(np.std(scores)) if len(scores) > 1 else 0.0
    return mean_score, std_score, [round(s, 3) for s in scores]


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
        state = torch.load(weights_path, map_location=device)
        architecture = _architecture_from_state(state)
        model = _build_model(architecture)
        model.load_state_dict(state)
        model.to(device)
        model.eval()

        _model_bundle = {
            'available': True,
            'model': model,
            'device': device,
            'weights_path': str(weights_path),
            'architecture': architecture,
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
        'architecture': bundle.get('architecture'),
        'weights_path': bundle['weights_path'],
        'device': str(bundle['device']),
    }


def predict_eye_patch(
    eye_bgr: np.ndarray,
    side: Optional[str] = None,
    *,
    prepared: bool = False,
    use_tta: bool = True,
) -> Dict[str, Any]:
    """Score one BGR ocular crop with optional TTA."""
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
        pil = bgr_to_rgb_pil(eye_bgr)
        score, uncertainty, pass_scores = _predict_pil(
            bundle['model'],
            bundle['device'],
            pil,
            use_tta=use_tta,
        )

        score = float(np.clip(score, 0.0, 4.0))
        grade = max(0, min(4, int(round(score))))

        return {
            'available': True,
            'score': round(score, 2),
            'uncertainty_std': round(uncertainty, 4),
            'tta_pass_scores': pass_scores,
            'discretized_grade': grade,
            'grade_label': _grade_label(grade),
            'model_version': bundle['version'],
            'model_architecture': bundle.get('architecture'),
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
    use_tta: bool = True,
) -> Dict[str, Any]:
    """Run TTA model on left/right ocular crops and aggregate."""
    left = predict_eye_patch(left_bgr, side=left_side, prepared=prepared, use_tta=use_tta)
    right = predict_eye_patch(right_bgr, side=right_side, prepared=prepared, use_tta=use_tta)

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

    stds = [
        r['uncertainty_std']
        for r in (left, right)
        if r.get('available') and r.get('uncertainty_std') is not None
    ]
    avg_score = round(sum(scores) / len(scores), 2)
    avg_std = round(sum(stds) / len(stds), 4) if stds else None
    avg_grade = max(0, min(4, int(round(avg_score))))

    return {
        'available': True,
        'score': avg_score,
        'uncertainty_std': avg_std,
        'discretized_grade': avg_grade,
        'grade_label': _grade_label(avg_grade),
        'left': left,
        'right': right,
        'model_version': MODEL_VERSION,
    }


def predict_sclera_redness(image_bytes: bytes, *, use_tta: bool = True) -> Dict[str, Any]:
    """
    Score raw image bytes via the production smart-crop + TTA pipeline.
    """
    from app.ai_models.sclera_inference import predict_sclera_redness_production, production_to_ml_redness

    production = predict_sclera_redness_production(image_bytes)
    mapped = production_to_ml_redness(production)
    if mapped is not None:
        return mapped
    return {
        'available': False,
        'status': production.get('status', 'error'),
        'error': production.get('message', 'Inference failed'),
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
