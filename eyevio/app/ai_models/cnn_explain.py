"""
Shared ResNet helpers for calibrated screening models: multi-layer embeddings,
class-conditional Mahalanobis OOD scoring, Grad-CAM and overlay rendering.

Used by train_cataract_resnet.py (fitting) and cataract_resnet.py (inference),
so the OOD score is computed identically in both places.
"""

from __future__ import annotations

import base64
from typing import Dict, Tuple

import cv2
import numpy as np
import torch
import torch.nn.functional as F

OOD_LAYERS = ('layer1', 'layer2', 'layer3', 'layer4')


def forward_with_features(model, x: torch.Tensor) -> Tuple[Dict[str, torch.Tensor], torch.Tensor]:
    """ResNet forward pass returning global-average-pooled features per stage and logits."""
    m = model
    h = m.maxpool(m.relu(m.bn1(m.conv1(x))))
    feats = {}
    for name in OOD_LAYERS:
        h = getattr(m, name)(h)
        feats[name] = torch.flatten(F.adaptive_avg_pool2d(h, 1), 1)
    logits = m.fc(feats['layer4'])
    return feats, logits


def fit_ood(feats: Dict[str, np.ndarray], y: np.ndarray) -> Dict[str, np.ndarray]:
    """Per layer: class means + tied Ledoit-Wolf precision (Lee et al., 2018)."""
    from sklearn.covariance import LedoitWolf

    stats: Dict[str, np.ndarray] = {}
    classes = np.unique(y)
    for name in OOD_LAYERS:
        f = feats[name]
        means = np.stack([f[y == c].mean(0) for c in classes])
        centred = np.concatenate([f[y == c] - means[i] for i, c in enumerate(classes)])
        lw = LedoitWolf(assume_centered=True).fit(centred)
        stats[f'{name}_means'] = means.astype(np.float32)
        stats[f'{name}_prec'] = lw.precision_.astype(np.float32)
    return stats


def layer_distances(feats: Dict[str, np.ndarray], stats) -> Dict[str, np.ndarray]:
    """Min-over-classes Mahalanobis distance per layer."""
    out = {}
    for name in OOD_LAYERS:
        f = np.asarray(feats[name], dtype=np.float32)
        means, prec = stats[f'{name}_means'], stats[f'{name}_prec']
        per_class = []
        for mu in means:
            d = f - mu
            per_class.append(np.sqrt(np.maximum(np.einsum('ij,jk,ik->i', d, prec, d), 0)))
        out[name] = np.min(np.stack(per_class), axis=0)
    return out


def ood_score(dists: Dict[str, np.ndarray], scales: Dict[str, float]) -> np.ndarray:
    """Max over layers of distance / layer scale (scale = validation 99th percentile)."""
    return np.max(np.stack([dists[n] / max(scales[n], 1e-6) for n in OOD_LAYERS]), axis=0)


def gradcam(model, x: torch.Tensor, class_idx: int, layer: str = 'layer4') -> np.ndarray:
    """Grad-CAM for a single normalised 1×3×H×W tensor → H×W map in [0, 1]."""
    target = getattr(model, layer)
    acts, grads = {}, {}
    h1 = target.register_forward_hook(lambda m, i, o: acts.__setitem__('a', o))
    h2 = target.register_full_backward_hook(lambda m, gi, go: grads.__setitem__('g', go[0]))
    try:
        with torch.enable_grad():
            model.zero_grad()
            xin = x.clone().requires_grad_(True)
            out = model(xin)
            out[0, class_idx].backward()
        a, g = acts['a'][0], grads['g'][0]
        cam = F.relu((g.mean(dim=(1, 2), keepdim=True) * a).sum(0))
        cam = F.interpolate(cam[None, None], size=x.shape[-2:], mode='bilinear', align_corners=False)[0, 0]
        cam = cam - cam.min()
        cam = cam / (cam.max() + 1e-8)
        return cam.detach().cpu().numpy()
    finally:
        h1.remove()
        h2.remove()
        model.zero_grad()


def central_mass(cam: np.ndarray, radius_frac: float = 0.35) -> float:
    """Share of CAM energy inside a centred circle (proxy for 'attends to the eye')."""
    h, w = cam.shape
    yy, xx = np.mgrid[0:h, 0:w]
    r = radius_frac * min(h, w)
    mask = (xx - w / 2) ** 2 + (yy - h / 2) ** 2 <= r * r
    return float(cam[mask].sum() / (cam.sum() + 1e-8))


def overlay_data_url(rgb: np.ndarray, cam: np.ndarray, alpha: float = 0.42, size: int = 224) -> str:
    """JPEG data URL of the crop with a jet-coloured CAM overlay."""
    base = cv2.resize(rgb, (size, size), interpolation=cv2.INTER_AREA)
    heat = cv2.applyColorMap((cv2.resize(cam, (size, size)) * 255).astype(np.uint8), cv2.COLORMAP_JET)
    heat = cv2.cvtColor(heat, cv2.COLOR_BGR2RGB)
    blend = cv2.addWeighted(base, 1 - alpha, heat, alpha, 0)
    ok, buf = cv2.imencode('.jpg', cv2.cvtColor(blend, cv2.COLOR_RGB2BGR), [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    if not ok:
        return ''
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.tobytes()).decode('ascii')
