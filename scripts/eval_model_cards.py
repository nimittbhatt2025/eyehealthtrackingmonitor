#!/usr/bin/env python3
"""
Held-out evaluation for the sclera redness and pathology models (model cards).

For each model: leakage check (dHash near-duplicates between test and train),
test metrics with 2000-sample bootstrap 95% CIs, calibration where applicable,
the same eye-masked shortcut probe used for the cataract model, and a
Grad-CAM grid.

Outputs: docs/model_cards/assets/{redness,pathology}_eval.json and *_gradcam.png

Usage (repo root):
  ./eyevio/venv/bin/python scripts/eval_model_cards.py
"""

from __future__ import annotations

import csv
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'eyevio'))
sys.path.insert(0, str(REPO))
from app.ai_models.cnn_explain import central_mass, gradcam  # noqa: E402
from train_cataract_resnet import (  # noqa: E402
    DHASH_MAX_DIST, EYE_RADIUS_FRAC, IMG_EXT, _dhash, _ece, _eye_mask, _hamming, _plt,
)
from torchvision import transforms  # noqa: E402

ASSETS = REPO / 'docs' / 'model_cards' / 'assets'
N_BOOT = 2000
TF = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


def _ci(values_fn, n, seed=0):
    rng = np.random.default_rng(seed)
    draws = defaultdict(list)
    for _ in range(N_BOOT):
        idx = rng.integers(0, n, n)
        for k, v in values_fn(idx).items():
            if v is not None and not np.isnan(v):
                draws[k].append(v)
    return {k: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] for k, v in draws.items()}


def _leakage(test_paths, train_paths):
    train_h = [_dhash(p) for p in train_paths]
    hits = sum(1 for p in test_paths if any(_hamming(_dhash(p), h) <= DHASH_MAX_DIST for h in train_h))
    return {'test_images': len(test_paths), 'near_duplicate_of_train': hits, 'dhash_max_distance': DHASH_MAX_DIST}


def _cam_grid(net, rows, target_fn, path, title, device):
    plt = _plt()
    cols = max(len(r[1]) for r in rows)
    fig, axes = plt.subplots(len(rows), cols, figsize=(cols * 2.0, len(rows) * 2.35))
    axes = np.atleast_2d(axes)
    for ax in axes.flat:
        ax.axis('off')
    masses = {}
    for r, (name, items) in enumerate(rows):
        masses[name] = []
        for c, (img, caption) in enumerate(items):
            x = TF(img.convert('RGB')).unsqueeze(0).to(device)
            cam = gradcam(net, x, target_fn(x))
            masses[name].append(central_mass(cam, EYE_RADIUS_FRAC))
            axes[r, c].imshow(img.convert('RGB').resize((224, 224)))
            axes[r, c].imshow(cam, cmap='jet', alpha=0.4)
            axes[r, c].set_title(f'{name}\n{caption}', fontsize=7)
    fig.suptitle(title, fontsize=9)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)
    return {k: float(np.mean(v)) for k, v in masses.items()}


# ─── sclera redness ──────────────────────────────────────────────────────────

def _index_images(root: Path):
    return {p.name: p for p in root.rglob('*') if p.suffix.lower() in IMG_EXT}


def eval_redness():
    from scipy.stats import spearmanr
    from sklearn.metrics import roc_auc_score
    from app.ai_models.sclera_redness_model import _load_model_bundle, _predict_pil

    bundle = _load_model_bundle()
    if not bundle.get('available'):
        return {'available': False}
    model, device = bundle['model'], bundle['device']
    index = _index_images(REPO / 'data' / 'external_redness')

    def rows(name):
        with (REPO / name).open(newline='') as fh:
            return [(index[r['image_id']], int(r['sclera_redness_grade_0_to_4'])) for r in csv.DictReader(fh) if r['image_id'] in index]

    train, test = rows('train.csv'), rows('test.csv')
    y = np.array([g for _, g in test])
    pred = np.array([_predict_pil(model, device, Image.open(p).convert('RGB'), use_tta=True)[0] for p, _ in test])
    pred_masked = np.array([_predict_pil(model, device, _eye_mask(Image.open(p), 'outside'), use_tta=True)[0] for p, _ in test])
    pred = np.clip(pred, 0, 4)
    weak = {0: 'normal', 1: 'other', 3: 'conjunctivitis'}
    nearest = np.array([min(weak, key=lambda g: abs(g - v)) for v in pred])
    cn = np.isin(y, [0, 3])

    def metrics(idx, p=pred):
        yy, pp = y[idx], p[idx]
        m = cn[idx]
        auc = roc_auc_score((yy[m] == 3).astype(int), pp[m]) if m.sum() and len(set(yy[m])) == 2 else None
        return {
            'mae': float(np.mean(np.abs(pp - yy))),
            'spearman': float(spearmanr(yy, pp).correlation) if len(set(yy)) > 1 else None,
            'auc_conjunctivitis_vs_normal': auc,
            'weak_class_accuracy': float(np.mean(nearest[idx] == yy)),
        }

    all_idx = np.arange(len(y))
    out = {
        'available': True,
        'version': bundle.get('version'),
        'labels': 'weak: folder label mapped to grade (normal→0, other→1, conjunctivitis→3); no graded redness data',
        'n_test': int(len(y)),
        'test': metrics(all_idx),
        'test_ci95': _ci(metrics, len(y)),
        'per_weak_class_prediction': {
            weak[g]: {'n': int((y == g).sum()), 'mean': float(pred[y == g].mean()), 'sd': float(pred[y == g].std())}
            for g in sorted(weak)
        },
        'shortcut_probe': {
            'auc_conjunctivitis_vs_normal_eye_masked': metrics(all_idx, pred_masked)['auc_conjunctivitis_vs_normal'],
            'eye_region': f'centred disc, radius {EYE_RADIUS_FRAC} × image side',
        },
        'leakage': _leakage([p for p, _ in test], [p for p, _ in train]),
        'inference': 'production path: 5-pass TTA mean, clamp 0–4 (smart ocular crop skipped: dataset images are already eye crops)',
    }

    net = getattr(model, 'backbone', model)
    rng = random.Random(0)
    grid = []
    for g in (0, 1, 3):
        picks = rng.sample([p for p, gg in test if gg == g], 5)
        grid.append((weak[g], [(Image.open(p), f'pred {pred[[i for i, (pp, _) in enumerate(test) if pp == p][0]]:.2f}') for p in picks]))
    out['gradcam_central_mass'] = _cam_grid(
        net, grid, lambda x: 0, ASSETS / 'redness_gradcam.png',
        'Sclera redness model — Grad-CAM (layer4, target = regression output). Rows by weak label.', device,
    )
    return out


# ─── pathology ───────────────────────────────────────────────────────────────

def eval_pathology():
    from sklearn.metrics import f1_score
    from app.ai_models.pathology_classifier import _get_bundle

    bundle = _get_bundle()
    if not bundle:
        return {'available': False}
    model, device, labels = bundle['model'], bundle['device'], bundle['labels']
    root = REPO / 'data' / 'pathology'

    def items(split):
        return [(p, labels.index(d.name)) for d in sorted((root / split).iterdir()) if d.is_dir() and d.name in labels
                for p in sorted(d.iterdir()) if p.suffix.lower() in IMG_EXT]

    train, test = items('train'), items('test')

    @torch.no_grad()
    def probs_of(imgs):
        out = []
        for i in range(0, len(imgs), 64):
            x = torch.stack([TF(im.convert('RGB')) for im in imgs[i:i + 64]]).to(device)
            out.append(torch.softmax(model(x), 1).cpu().numpy())
        return np.concatenate(out)

    y = np.array([c for _, c in test])
    probs = probs_of([Image.open(p) for p, _ in test])
    probs_masked = probs_of([_eye_mask(Image.open(p), 'outside') for p, _ in test])
    pred = probs.argmax(1)
    conf = probs.max(1)

    def metrics(idx, pr=probs):
        pd_ = pr[idx].argmax(1)
        return {
            'accuracy': float(np.mean(pd_ == y[idx])),
            'macro_f1': float(f1_score(y[idx], pd_, average='macro', labels=list(range(len(labels))), zero_division=0)),
        }

    onehot = np.eye(len(labels))[y]
    out = {
        'available': True,
        'labels': labels,
        'n_test': int(len(y)),
        'test': {
            **metrics(np.arange(len(y))),
            'top_label_ece': _ece((pred == y).astype(int), conf),
            'brier_multiclass': float(np.mean(np.sum((probs - onehot) ** 2, axis=1))),
        },
        'test_ci95': _ci(metrics, len(y)),
        'per_class_recall': {labels[c]: float(np.mean(pred[y == c] == c)) for c in range(len(labels))},
        'confusion': [[int(((y == a) & (pred == b)).sum()) for b in range(len(labels))] for a in range(len(labels))],
        'shortcut_probe': {'accuracy_eye_masked': metrics(np.arange(len(y)), probs_masked)['accuracy'],
                           'macro_f1_eye_masked': metrics(np.arange(len(y)), probs_masked)['macro_f1'],
                           'chance_macro_f1': 1.0 / len(labels)},
        'leakage': _leakage([p for p, _ in test], [p for p, _ in train]),
        'calibration_note': 'uncalibrated softmax (no temperature scaling applied in production)',
    }

    rng = random.Random(0)
    grid = []
    for c, name in enumerate(labels):
        idx = rng.sample([i for i in range(len(test)) if y[i] == c], 5)
        grid.append((name, [(Image.open(test[i][0]), f'pred {labels[pred[i]]} {conf[i]:.2f}') for i in idx]))
    out['gradcam_central_mass'] = _cam_grid(
        model, grid, lambda x: int(model(x).argmax(1).item()), ASSETS / 'pathology_gradcam.png',
        'Pathology model — Grad-CAM (layer4, target = predicted class). Rows by true label.', device,
    )
    return out


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    for name, fn in (('redness', eval_redness), ('pathology', eval_pathology)):
        result = fn()
        (ASSETS / f'{name}_eval.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(name, json.dumps({k: v for k, v in result.items() if k not in ('confusion',)}, indent=1)[:2500])


if __name__ == '__main__':
    main()
