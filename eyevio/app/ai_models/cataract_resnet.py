"""
Optional ResNet-18 cataract detection (binary normal vs cataract).

Offline-safe by default. Enable with:
  CATARACT_MODEL_PATH=/path/to/cataract_detection_resnet18_quantized.pth
  CATARACT_CLASS_NAMES=/path/to/class_names.json   # optional; defaults to ["normal","cataract"]
  CATARACT_USE_HF=1   # download AventIQ-AI/resnet18-cataract-detection-system (needs network + huggingface_hub)

Maps P(cataract) → opacity_score 0–100 for cataract_opacity_analysis.
Screening only — not a clinical LOCS grade.
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

HF_REPO = 'AventIQ-AI/resnet18-cataract-detection-system'
HF_WEIGHTS = 'cataract_detection_resnet18_quantized.pth'
HF_LABELS = 'class_names.json'
DEFAULT_LABELS = ['normal', 'cataract']
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_WEIGHTS = REPO_ROOT / 'cataract_detection_resnet18.pth'
DEFAULT_CLASS_NAMES = REPO_ROOT / 'cataract_class_names.json'

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


def _resolve_artifact_paths() -> Optional[tuple[Path, Optional[Path]]]:
    """
    Resolve weights + optional class_names.json.

    Order: CATARACT_MODEL_PATH → repo cataract_detection_resnet18.pth → CATARACT_USE_HF=1
    """
    env_weights = os.environ.get('CATARACT_MODEL_PATH', '').strip()
    env_labels = os.environ.get('CATARACT_CLASS_NAMES', '').strip()
    if env_weights:
        weights = Path(env_weights).expanduser().resolve()
        labels = Path(env_labels).expanduser().resolve() if env_labels else None
        if weights.is_file():
            return weights, labels if labels and labels.is_file() else None
        return None

    if DEFAULT_WEIGHTS.is_file():
        labels = DEFAULT_CLASS_NAMES if DEFAULT_CLASS_NAMES.is_file() else None
        if env_labels:
            env_label_path = Path(env_labels).expanduser().resolve()
            if env_label_path.is_file():
                labels = env_label_path
        return DEFAULT_WEIGHTS, labels

    if os.environ.get('CATARACT_USE_HF', '').strip().lower() not in ('1', 'true', 'yes'):
        return None

    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        return None

    try:
        weights = Path(hf_hub_download(repo_id=HF_REPO, filename=HF_WEIGHTS))
        labels = Path(hf_hub_download(repo_id=HF_REPO, filename=HF_LABELS))
        return weights, labels
    except Exception:
        return None


def _load_labels(path: Optional[Path]) -> List[str]:
    if path and path.is_file():
        raw = json.loads(path.read_text(encoding='utf-8'))
        if isinstance(raw, list) and all(isinstance(x, str) for x in raw):
            return raw
        if isinstance(raw, dict):
            # {"0": "normal", "1": "cataract"} or reverse
            items = sorted(raw.items(), key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else str(kv[0]))
            return [str(v) for _, v in items]
    return list(DEFAULT_LABELS)


def _build_model(num_classes: int) -> nn.Module:
    model = models.resnet18(weights=None)
    model.fc = nn.Linear(in_features=512, out_features=num_classes)
    return model


def _get_bundle() -> Optional[Dict[str, Any]]:
    global _bundle, _load_attempted
    with _lock:
        if _bundle is not None:
            return _bundle
        if _load_attempted:
            return None
        _load_attempted = True

        resolved = _resolve_artifact_paths()
        if not resolved:
            return None
        weights_path, labels_path = resolved
        labels = _load_labels(labels_path)
        device = _device()
        model = _build_model(len(labels))
        try:
            state = torch.load(str(weights_path), map_location='cpu')
            if isinstance(state, dict) and 'state_dict' in state:
                state = state['state_dict']
            model.load_state_dict(state, strict=False)
        except Exception:
            return None
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
    if os.environ.get('CATARACT_MODEL_PATH', '').strip():
        via = 'CATARACT_MODEL_PATH'
    elif bundle and Path(bundle['weights_path']).resolve() == DEFAULT_WEIGHTS.resolve():
        via = 'default_weights'
    elif os.environ.get('CATARACT_USE_HF', '').strip():
        via = 'CATARACT_USE_HF'
    else:
        via = None
    return {
        'available': bundle is not None,
        'weights_path': bundle['weights_path'] if bundle else None,
        'labels': bundle['labels'] if bundle else None,
        'enabled_via': via if bundle else None,
    }


def predict_cataract_opacity(eye_bgr: np.ndarray) -> Optional[Dict[str, Any]]:
    """
    Run binary cataract ResNet on an eye/pupil crop.

    Returns None if model is not configured or inference fails.
    """
    if eye_bgr is None or eye_bgr.size == 0:
        return None
    bundle = _get_bundle()
    if not bundle:
        return None

    try:
        rgb = cv2.cvtColor(eye_bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb)
        tensor = _eval_transform(pil).unsqueeze(0).to(bundle['device'])
        with torch.no_grad():
            logits = bundle['model'](tensor)
            probs = torch.softmax(logits, dim=1)[0].detach().cpu().numpy()
    except Exception:
        return None

    labels: List[str] = bundle['labels']
    cataract_idx = None
    for i, name in enumerate(labels):
        if 'cataract' in name.lower():
            cataract_idx = i
            break
    if cataract_idx is None:
        cataract_idx = 1 if len(labels) > 1 else 0

    p_cataract = float(probs[cataract_idx])
    pred_idx = int(np.argmax(probs))
    opacity = float(np.clip(p_cataract * 100.0, 0.0, 100.0))

    return {
        'opacity_score': round(opacity, 1),
        'cataract_probability': round(p_cataract, 4),
        'predicted_label': labels[pred_idx],
        'class_probabilities': {
            labels[i]: round(float(probs[i]), 4) for i in range(len(labels))
        },
        'method': 'resnet_v1',
        'model': 'cataract_detection_resnet18',
    }
