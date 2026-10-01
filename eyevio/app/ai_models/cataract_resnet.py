"""
Calibrated ResNet-18 cataract screening (binary cataract vs normal) with an
out-of-distribution abstain path and Grad-CAM.

Artifacts (repo root, produced by train_cataract_resnet.py):
  cataract_detection_resnet18.pth   weights
  cataract_class_names.json         label order
  cataract_model_meta.json          temperature, operating thresholds, OOD threshold, metrics
  cataract_ood_stats.npz            per-layer class means + precision matrices

Override with CATARACT_MODEL_PATH (weights); the other artifacts are looked up
next to it. Without the meta + OOD files the model is treated as uncalibrated
and every image returns "cannot_assess" — an uncalibrated softmax is not shown.

Output is a calibrated likelihood that the crop resembles the "cataract" class
of the training set, plus a three-way band. It is not a severity grade: a
binary classifier's probability says nothing about how dense an opacity is.
Model card: docs/model_cards/cataract_resnet18.md
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

from app.ai_models.cnn_explain import (
    OOD_LAYERS,
    central_mass,
    forward_with_features,
    gradcam,
    layer_distances,
    ood_score,
    overlay_data_url,
)

METHOD = 'resnet_v2_calibrated'
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_WEIGHTS = REPO_ROOT / 'cataract_detection_resnet18.pth'
MODEL_CARD = 'docs/model_cards/cataract_resnet18.md'
DEFAULT_LABELS = ['cataract', 'normal']
OOD_REASON_TEXT = (
    'This eye crop does not look like the photos the model was trained on '
    '(lighting, focus, framing or camera). No result is given rather than a guess.'
)

_eval_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

_lock = threading.Lock()
_cam_lock = threading.Lock()  # Grad-CAM hooks mutate the shared model
_bundle: Optional[Dict[str, Any]] = None
_load_attempted = False
_load_error: Optional[str] = None


def _device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device('cuda')
    if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def _weights_path() -> Optional[Path]:
    env = os.environ.get('CATARACT_MODEL_PATH', '').strip()
    path = Path(env).expanduser().resolve() if env else DEFAULT_WEIGHTS
    return path if path.is_file() else None


def _load_labels(path: Path) -> List[str]:
    if path.is_file():
        raw = json.loads(path.read_text(encoding='utf-8'))
        if isinstance(raw, list) and all(isinstance(x, str) for x in raw):
            return raw
    return list(DEFAULT_LABELS)


def _get_bundle() -> Optional[Dict[str, Any]]:
    global _bundle, _load_attempted, _load_error
    with _lock:
        if _bundle is not None or _load_attempted:
            return _bundle
        _load_attempted = True

        weights = _weights_path()
        if weights is None:
            _load_error = 'weights_missing'
            return None
        labels = _load_labels(weights.with_name('cataract_class_names.json'))
        meta_path = weights.with_name('cataract_model_meta.json')
        ood_path = weights.with_name('cataract_ood_stats.npz')

        model = models.resnet18(weights=None)
        model.fc = nn.Linear(512, len(labels))
        try:
            state = torch.load(str(weights), map_location='cpu')
            if isinstance(state, dict) and 'state_dict' in state:
                state = state['state_dict']
            model.load_state_dict(state)
        except Exception as exc:  # noqa: BLE001
            _load_error = f'weights_load_failed: {exc.__class__.__name__}'
            return None

        meta = json.loads(meta_path.read_text(encoding='utf-8')) if meta_path.is_file() else None
        ood = None
        if ood_path.is_file():
            raw = np.load(ood_path)
            ood = {k: raw[k] for k in raw.files}
            ood['scales_by_layer'] = {n: float(s) for n, s in zip(OOD_LAYERS, ood['scales'])}

        device = _device()
        model.to(device).eval()
        pos_idx = next((i for i, n in enumerate(labels) if 'cataract' in n.lower()), 0)
        _bundle = {
            'model': model,
            'device': device,
            'labels': labels,
            'pos_idx': pos_idx,
            'weights_path': str(weights),
            'meta': meta,
            'ood': ood,
            'calibrated': bool(meta and ood and meta.get('version') == METHOD),
        }
        return _bundle


_corn_bundle: Optional[Dict[str, Any]] = None
_corn_attempted = False


def _get_corn_bundle() -> Optional[Dict[str, Any]]:
    """Ordinal CORN grader (train_cataract_corn.py). Absent until graded labels have been trained on."""
    global _corn_bundle, _corn_attempted
    with _lock:
        if _corn_bundle is not None or _corn_attempted:
            return _corn_bundle
        _corn_attempted = True
        env = os.environ.get('CATARACT_CORN_MODEL_PATH', '').strip()
        weights = Path(env).expanduser().resolve() if env else REPO_ROOT / 'cataract_corn_resnet18.pth'
        meta_path = weights.with_name('cataract_corn_meta.json')
        ood_path = weights.with_name('cataract_corn_ood_stats.npz')
        if not (weights.is_file() and meta_path.is_file() and ood_path.is_file()):
            return None
        try:
            meta = json.loads(meta_path.read_text(encoding='utf-8'))
            model = models.resnet18(weights=None)
            model.fc = nn.Linear(512, len(meta['levels']) - 1)
            model.load_state_dict(torch.load(str(weights), map_location='cpu'))
            raw = np.load(ood_path)
            ood = {k: raw[k] for k in raw.files}
            ood['scales_by_layer'] = {n: float(s) for n, s in zip(OOD_LAYERS, ood['scales'])}
        except Exception:  # noqa: BLE001
            return None
        device = _device()
        model.to(device).eval()
        _corn_bundle = {'model': model, 'device': device, 'meta': meta, 'ood': ood}
        return _corn_bundle


def _ordinal_grade(x: torch.Tensor) -> Optional[Dict[str, Any]]:
    bundle = _get_corn_bundle()
    if not bundle:
        return None
    from app.ai_models.corn import level_probs, predict_level

    meta = bundle['meta']
    with torch.no_grad():
        feats, logits = forward_with_features(bundle['model'], x.to(bundle['device']))
    score = float(ood_score(layer_distances({n: v.cpu().numpy() for n, v in feats.items()}, bundle['ood']),
                            bundle['ood']['scales_by_layer'])[0])
    if score > float(meta['ood']['threshold']):
        return {'status': 'cannot_assess', 'reason': 'out_of_distribution', 'method': meta.get('version')}
    logits = logits.cpu()
    level = int(predict_level(logits)[0])
    probs = level_probs(logits)[0].tolist()
    return {
        'status': 'assessed',
        'method': meta.get('version'),
        'level': level,
        'label': meta['levels'][level],
        'probabilities': {name: round(p, 4) for name, p in zip(meta['levels'], probs)},
    }


def model_status() -> Dict[str, Any]:
    bundle = _get_bundle()
    if not bundle:
        return {'available': False, 'calibrated': False, 'reason': _load_error, 'method': None}
    meta = bundle['meta'] or {}
    return {
        'available': True,
        'calibrated': bundle['calibrated'],
        'method': METHOD if bundle['calibrated'] else None,
        'weights_path': bundle['weights_path'],
        'labels': bundle['labels'],
        'trained_at': meta.get('trained_at'),
        'temperature': meta.get('temperature'),
        'thresholds': meta.get('thresholds'),
        'ood_threshold': (meta.get('ood') or {}).get('threshold'),
        'headline_metrics': meta.get('headline'),
        'model_card': MODEL_CARD,
        'ordinal_grader': bool(_get_corn_bundle()),
    }


def _band(p: float, thresholds: Dict[str, float]) -> str:
    if p < thresholds['rule_out']:
        return 'low'
    if p >= thresholds['rule_in']:
        return 'elevated'
    return 'indeterminate'


def screen_cataract(eye_bgr: np.ndarray, *, with_cam: bool = True) -> Dict[str, Any]:
    """
    Screen one eye crop.

    Returns status 'assessed' (with calibrated likelihood + band), or
    'cannot_assess' / 'model_unavailable' with a reason and no likelihood.
    """
    base = {'method': METHOD, 'model_card': MODEL_CARD}
    if eye_bgr is None or eye_bgr.size == 0:
        return {**base, 'status': 'cannot_assess', 'reason': 'empty_crop'}
    bundle = _get_bundle()
    if not bundle:
        return {**base, 'status': 'model_unavailable', 'reason': _load_error or 'not_loaded'}
    if not bundle['calibrated']:
        return {**base, 'status': 'model_unavailable', 'reason': 'uncalibrated_weights'}

    meta, ood = bundle['meta'], bundle['ood']
    model, device, pos_idx = bundle['model'], bundle['device'], bundle['pos_idx']
    rgb = cv2.cvtColor(eye_bgr, cv2.COLOR_BGR2RGB)
    x = _eval_transform(Image.fromarray(rgb)).unsqueeze(0).to(device)

    with torch.no_grad():
        feats, logits = forward_with_features(model, x)
    feats_np = {n: v.cpu().numpy() for n, v in feats.items()}
    score = float(ood_score(layer_distances(feats_np, ood), ood['scales_by_layer'])[0])
    ood_thr = float(meta['ood']['threshold'])
    out = {**base, 'ood_score': round(score, 3), 'ood_threshold': round(ood_thr, 3)}

    if score > ood_thr:
        return {
            **out,
            'status': 'cannot_assess',
            'reason': 'out_of_distribution',
            'reason_text': OOD_REASON_TEXT,
        }

    t = float(meta['temperature'])
    p = float(torch.softmax(logits / t, dim=1)[0, pos_idx].item())
    thresholds = meta['thresholds']
    out.update({
        'status': 'assessed',
        'likelihood': round(p, 4),
        'band': _band(p, thresholds),
        'thresholds': {k: thresholds[k] for k in ('rule_out', 'rule_in')},
        'temperature': round(t, 3),
    })
    ordinal = _ordinal_grade(x)
    if ordinal:
        out['ordinal'] = ordinal

    if with_cam:
        try:
            with _cam_lock:
                cam = gradcam(model, x, pos_idx)
            out['gradcam'] = overlay_data_url(rgb, cam)
            out['gradcam_central_mass'] = round(central_mass(cam), 3)
        except Exception:  # noqa: BLE001
            out['gradcam'] = None
    return out
