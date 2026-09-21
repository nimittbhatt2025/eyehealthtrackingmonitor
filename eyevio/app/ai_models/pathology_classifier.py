"""
Optional multi-class ocular pathology ResNet-18 (research triage).

Classes (from train_pathology_classifier.py / pathology_class_names.json):
  cataract | conjunctivitis | normal | other

Offline-safe: loads repo-root pathology_resnet18.pth when present, or
PATHOLOGY_MODEL_PATH / PATHOLOGY_CLASS_NAMES.

NOT wired into EyeVio wellness scores or diagnostic claims by default.
Screening / research only — not a clinical diagnosis.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_WEIGHTS = REPO_ROOT / 'pathology_resnet18.pth'
DEFAULT_CLASS_NAMES = REPO_ROOT / 'pathology_class_names.json'
DEFAULT_LABELS = ['cataract', 'conjunctivitis', 'normal', 'other']

_eval_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

_lock = threading.Lock()
_bundle: Optional[Dict[str, Any]] = None
_load_attempted = False


def _device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device('cuda')
    if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def _resolve_paths() -> Optional[tuple[Path, Optional[Path]]]:
    env_w = os.environ.get('PATHOLOGY_MODEL_PATH', '').strip()
    env_l = os.environ.get('PATHOLOGY_CLASS_NAMES', '').strip()
    if env_w:
        weights = Path(env_w).expanduser().resolve()
        labels = Path(env_l).expanduser().resolve() if env_l else None
        if weights.is_file():
            return weights, labels if labels and labels.is_file() else None
        return None
    if DEFAULT_WEIGHTS.is_file():
        labels = DEFAULT_CLASS_NAMES if DEFAULT_CLASS_NAMES.is_file() else None
        return DEFAULT_WEIGHTS, labels
    return None


def _load_labels(path: Optional[Path]) -> List[str]:
    if path and path.is_file():
        raw = json.loads(path.read_text(encoding='utf-8'))
        if isinstance(raw, list):
            return [str(x) for x in raw]
    return list(DEFAULT_LABELS)


def _get_bundle() -> Optional[Dict[str, Any]]:
    global _bundle, _load_attempted
    with _lock:
        if _bundle is not None:
            return _bundle
        if _load_attempted:
            return None
        _load_attempted = True
        resolved = _resolve_paths()
        if not resolved:
            return None
        weights_path, labels_path = resolved
        labels = _load_labels(labels_path)
        model = models.resnet18(weights=None)
        model.fc = nn.Linear(512, len(labels))
        try:
            state = torch.load(str(weights_path), map_location='cpu')
            if isinstance(state, dict) and 'state_dict' in state:
                state = state['state_dict']
            model.load_state_dict(state, strict=False)
        except Exception:
            return None
        device = _device()
        model.to(device)
        model.eval()
        _bundle = {
            'model': model,
            'device': device,
            'labels': labels,
            'weights_path': str(weights_path),
        }
        return _bundle


def model_status() -> Dict[str, Any]:
    bundle = _get_bundle()
    via = None
    if bundle:
        if os.environ.get('PATHOLOGY_MODEL_PATH', '').strip():
            via = 'PATHOLOGY_MODEL_PATH'
        else:
            via = 'default_weights'
    return {
        'available': bundle is not None,
        'weights_path': bundle['weights_path'] if bundle else None,
        'labels': bundle['labels'] if bundle else None,
        'enabled_via': via,
        'wired_to_product': True,
        'product_role': 'research_triage_panel',
    }


def predict_pathology(image_bgr: np.ndarray) -> Optional[Dict[str, Any]]:
    """
    Multi-class softmax over ocular triage labels.

    Returns None if weights are missing or inference fails.
    """
    if image_bgr is None or image_bgr.size == 0:
        return None
    bundle = _get_bundle()
    if not bundle:
        return None
    try:
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        tensor = _eval_transform(Image.fromarray(rgb)).unsqueeze(0).to(bundle['device'])
        with torch.no_grad():
            probs = torch.softmax(bundle['model'](tensor), dim=1)[0].detach().cpu().numpy()
    except Exception:
        return None

    labels: List[str] = bundle['labels']
    pred_idx = int(np.argmax(probs))
    return {
        'predicted_label': labels[pred_idx],
        'confidence': round(float(probs[pred_idx]), 4),
        'class_probabilities': {
            labels[i]: round(float(probs[i]), 4) for i in range(len(labels))
        },
        'method': 'pathology_resnet18_v1',
        'disclaimer': (
            'Research triage only — not a diagnosis. Labels are coarse '
            '(cataract / conjunctivitis / normal / other) from public web images.'
        ),
    }


_LABEL_DISPLAY = {
    'normal': 'Closer to clear / normal examples',
    'conjunctivitis': 'Closer to conjunctivitis / redness examples',
    'cataract': 'Closer to cataract / opacity examples',
    'other': 'Other / non-specific pattern',
}


def _combine_eye_preds(
    left: Optional[Dict[str, Any]],
    right: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    eyes = [p for p in (left, right) if p]
    if not eyes:
        return None
    if len(eyes) == 1:
        chosen = eyes[0]
        agreement = True
    else:
        agreement = left['predicted_label'] == right['predicted_label']
        chosen = left if left['confidence'] >= right['confidence'] else right

    status = model_status()
    return {
        'available': True,
        'predicted_label': chosen['predicted_label'],
        'display_label': _LABEL_DISPLAY.get(
            chosen['predicted_label'], chosen['predicted_label']
        ),
        'confidence': chosen['confidence'],
        'agreement': agreement,
        'left': left,
        'right': right,
        'class_probabilities': chosen.get('class_probabilities'),
        'method': 'pathology_resnet18_v1',
        'model_status': {
            'weights_path': status.get('weights_path'),
            'enabled_via': status.get('enabled_via'),
            'labels': status.get('labels'),
        },
        'disclaimer': (
            'Research triage only — not a diagnosis and not part of your wellness score. '
            'Coarse labels (cataract / conjunctivitis / normal / other) from public web images; '
            'do not use for clinical decisions.'
        ),
    }


def attach_pathology_triage(
    analysis: Dict[str, Any],
    *,
    left_bgr: Optional[np.ndarray] = None,
    right_bgr: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    """
    Attach optional pathology research triage to an eye-photo analysis dict.

    Does not modify score / risk_level. Missing weights → available: false stub.
    """
    if not analysis or analysis.get('error'):
        return analysis

    if not model_status().get('available'):
        analysis['pathology_triage'] = {
            'available': False,
            'reason': 'weights_unavailable',
            'disclaimer': (
                'Pathology research model weights not loaded '
                '(pathology_resnet18.pth).'
            ),
        }
        return analysis

    left_pred = predict_pathology(left_bgr) if left_bgr is not None else None
    right_pred = predict_pathology(right_bgr) if right_bgr is not None else None
    combined = _combine_eye_preds(left_pred, right_pred)
    if combined is None:
        analysis['pathology_triage'] = {
            'available': False,
            'reason': 'inference_failed',
            'disclaimer': 'Pathology triage could not run on these eye crops.',
        }
        return analysis

    analysis['pathology_triage'] = combined
    return analysis
