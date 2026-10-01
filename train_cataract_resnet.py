#!/usr/bin/env python3
"""
Train + evaluate the ResNet-18 cataract screening model (binary: cataract vs normal).

Pipeline:
  1. Leakage control — drop val/test images that are near-duplicates
     (dHash Hamming <= 6) of training images; test is also de-duplicated
     against val.
  2. Fine-tune ResNet-18 (layer4 + fc). Checkpoint chosen on validation NLL.
  3. Calibration — temperature fitted on validation images *plus* a
     webcam-simulated copy of them (downscale, blur, low light, sensor noise,
     JPEG). Temperature is constrained to T >= 1: on a separable split an
     unconstrained fit sharpens probabilities, which is never warranted for
     deployment on shifted data.
  4. Operating thresholds from the same calibration pool:
       rule_out = highest threshold with sensitivity >= 0.95
       rule_in  = lowest threshold with specificity >= 0.95
     If the pool is (near-)separable these collapse to ~1.0 and are
     meaningless, so conservative prior thresholds are used and recorded.
  5. Held-out test metrics on clean and webcam-simulated test images:
     AUC, Brier, ECE (15 bins), NLL, sens/spec/PPV/NPV at each operating
     point, all with 2000-sample bootstrap 95% CIs.
  6. Shortcut probes — AUC with the central eye region masked out, and with
     only the central eye region kept. High eye-masked AUC means the model
     separates classes from background/framing cues.
  7. OOD — class-conditional Mahalanobis on pooled layer1–4 embeddings;
     score = max over layers of distance / validation-p99. Threshold =
     99th percentile of the validation score. Reported for synthetic
     corruptions and real app webcam crops.
  8. Figures: reliability diagram + Grad-CAM grid.

Outputs:
  cataract_detection_resnet18.pth, cataract_class_names.json,
  cataract_model_meta.json, cataract_ood_stats.npz (repo root)
  docs/model_cards/assets/cataract_{reliability,gradcam}.png, cataract_eval.json

Usage (repo root; run outside sandboxes so MPS is visible):
  ./eyevio/venv/bin/python train_cataract_resnet.py --epochs 12
"""

from __future__ import annotations

import argparse
import io
import json
import os
import random
import ssl
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from PIL import Image, ImageDraw, ImageFilter
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

REPO_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(REPO_ROOT / 'eyevio'))
from app.ai_models.cnn_explain import (  # noqa: E402
    OOD_LAYERS, central_mass, fit_ood, forward_with_features, gradcam, layer_distances, ood_score,
)

ssl._create_default_https_context = ssl._create_unverified_context

MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]
DHASH_MAX_DIST = 6
ECE_BINS = 15
N_BOOT = 2000
TARGET_SENS = 0.95
TARGET_SPEC = 0.95
OOD_PERCENTILE = 99.0
PRIOR_THRESHOLDS = {'rule_out': 0.2, 'rule_in': 0.8}
EYE_RADIUS_FRAC = 0.35
IMG_EXT = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}


def _device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device('cuda')
    if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def _seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


# ─── data ────────────────────────────────────────────────────────────────────

def _dhash(path: Path, size: int = 8) -> int:
    img = Image.open(path).convert('L').resize((size + 1, size), Image.LANCZOS)
    px = np.asarray(img, dtype=np.int16)
    bits = (px[:, 1:] > px[:, :-1]).flatten()
    return int(''.join('1' if b else '0' for b in bits), 2)


def _hamming(a: int, b: int) -> int:
    return bin(a ^ b).count('1')


def _list_split(root: Path, classes: list[str]) -> list[tuple[Path, int]]:
    items = []
    for idx, name in enumerate(classes):
        for p in sorted((root / name).iterdir()):
            if p.suffix.lower() in IMG_EXT:
                items.append((p, idx))
    return items


def _dedupe(train, val, test):
    ref = [_dhash(p) for p, _ in train]
    report = {}

    def clean(items, name, ref_hashes):
        kept, kept_h, leak, internal = [], [], 0, 0
        for p, y in items:
            h = _dhash(p)
            if any(_hamming(h, r) <= DHASH_MAX_DIST for r in ref_hashes):
                leak += 1
                continue
            if any(_hamming(h, k) <= DHASH_MAX_DIST for k in kept_h):
                internal += 1
                continue
            kept.append((p, y))
            kept_h.append(h)
        report[name] = {
            'before': len(items), 'after': len(kept),
            'removed_near_duplicate_of_reference': leak,
            'removed_internal_duplicate': internal,
        }
        return kept, kept_h

    val_c, val_h = clean(val, 'val', ref)
    test_c, _ = clean(test, 'test', ref + val_h)
    return val_c, test_c, report


def webcam_sim(img: Image.Image, rng: random.Random) -> Image.Image:
    """Degrade a clinical photo toward webcam pupil-crop conditions."""
    img = img.convert('RGB').resize((224, 224), Image.BILINEAR)
    small = rng.randint(56, 112)
    img = img.resize((small, small), Image.BILINEAR).resize((224, 224), Image.BILINEAR)
    img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.4, 1.6)))
    arr = np.asarray(img, dtype=np.float32) * rng.uniform(0.55, 0.9)
    arr += np.random.default_rng(rng.randint(0, 1 << 30)).normal(0, rng.uniform(3, 10), arr.shape)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=rng.randint(30, 60))
    buf.seek(0)
    return Image.open(buf).convert('RGB')


def _eye_mask(img: Image.Image, keep: str) -> Image.Image:
    """keep='outside' fills the central eye disc with the mean colour; 'inside' fills the rest."""
    img = img.convert('RGB').resize((224, 224), Image.BILINEAR)
    fill = tuple(int(c) for c in np.asarray(img).reshape(-1, 3).mean(0))
    r = EYE_RADIUS_FRAC * 224
    disc = Image.new('L', (224, 224), 0)
    ImageDraw.Draw(disc).ellipse([112 - r, 112 - r, 112 + r, 112 + r], fill=255)
    flat = Image.new('RGB', (224, 224), fill)
    return Image.composite(img, flat, disc) if keep == 'inside' else Image.composite(flat, img, disc)


class Files(Dataset):
    def __init__(self, items, tf, pre=None, seed=0):
        self.items, self.tf, self.pre, self.seed = items, tf, pre, seed

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        p, y = self.items[i]
        img = Image.open(p).convert('RGB')
        if self.pre is not None:
            img = self.pre(img, random.Random(self.seed * 100003 + i))
        return self.tf(img), y


def _transforms():
    train_tf = transforms.Compose([
        transforms.RandomResizedCrop(224, scale=(0.55, 1.0), ratio=(0.8, 1.25)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(10),
        transforms.RandomApply([transforms.GaussianBlur(5, sigma=(0.1, 2.0))], p=0.3),
        transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2, hue=0.02),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])
    return train_tf, eval_tf


def _build_model(num_classes: int) -> nn.Module:
    model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
    for param in model.parameters():
        param.requires_grad = False
    for param in model.layer4.parameters():
        param.requires_grad = True
    model.fc = nn.Linear(512, num_classes)
    return model


@torch.no_grad()
def _collect(model, loader, device):
    model.eval()
    feats = {n: [] for n in OOD_LAYERS}
    logits, ys = [], []
    for x, y in loader:
        f, lg = forward_with_features(model, x.to(device))
        for n in OOD_LAYERS:
            feats[n].append(f[n].cpu())
        logits.append(lg.cpu())
        ys.append(y)
    return {n: torch.cat(v).numpy() for n, v in feats.items()}, torch.cat(logits), torch.cat(ys).numpy()


@torch.no_grad()
def _collect_images(model, images, tf, device):
    x = torch.stack([tf(im.convert('RGB')) for im in images]).to(device)
    f, lg = forward_with_features(model, x)
    return {n: v.cpu().numpy() for n, v in f.items()}, lg.cpu()


# ─── calibration + metrics ───────────────────────────────────────────────────

def _fit_temperature(logits: torch.Tensor, target: np.ndarray) -> float:
    log_t = torch.zeros(1, requires_grad=True)
    tgt = torch.as_tensor(target, dtype=torch.long)
    opt = optim.LBFGS([log_t], lr=0.1, max_iter=200)

    def closure():
        opt.zero_grad()
        loss = F.cross_entropy(logits / log_t.exp(), tgt)
        loss.backward()
        return loss

    opt.step(closure)
    return float(log_t.detach().exp().item())


def _p_pos(logits: torch.Tensor, pos_idx: int, t: float = 1.0) -> np.ndarray:
    return torch.softmax(logits / t, dim=1)[:, pos_idx].numpy()


def _auc(y, p):
    from sklearn.metrics import roc_auc_score
    if y.min() == y.max():
        return float('nan')
    return float(roc_auc_score(y, p))


def _ece(y, p, bins=ECE_BINS):
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, bins - 1)
    return float(sum((idx == b).mean() * abs(y[idx == b].mean() - p[idx == b].mean())
                     for b in range(bins) if (idx == b).any()))


def _op(y, p, thr):
    pred = p >= thr
    tp = int((pred & (y == 1)).sum()); fn = int((~pred & (y == 1)).sum())
    tn = int((~pred & (y == 0)).sum()); fp = int((pred & (y == 0)).sum())
    return {
        'threshold': thr,
        'sensitivity': tp / max(tp + fn, 1),
        'specificity': tn / max(tn + fp, 1),
        'ppv': tp / max(tp + fp, 1),
        'npv': tn / max(tn + fn, 1),
        'accuracy': (tp + tn) / max(len(y), 1),
        'confusion': {'tp': tp, 'fn': fn, 'tn': tn, 'fp': fp},
    }


def _summary(y, p, thresholds: dict) -> dict:
    eps = 1e-12
    out = {
        'n': int(len(y)), 'n_pos': int(y.sum()), 'n_neg': int((1 - y).sum()),
        'auc': _auc(y, p),
        'brier': float(np.mean((p - y) ** 2)),
        'ece': _ece(y, p),
        'nll': float(-np.mean(y * np.log(p + eps) + (1 - y) * np.log(1 - p + eps))),
    }
    for name, thr in thresholds.items():
        out[f'at_{name}'] = _op(y, p, thr)
    return out


def _bootstrap(y, p, thresholds: dict, seed: int) -> dict:
    rng = np.random.default_rng(seed)
    op_keys = ['sensitivity', 'specificity', 'ppv', 'npv']
    draws = {'auc': [], 'brier': [], 'ece': []}
    for name in thresholds:
        for k in op_keys:
            draws[f'at_{name}.{k}'] = []
    n = len(y)
    for _ in range(N_BOOT):
        i = rng.integers(0, n, n)
        yb, pb = y[i], p[i]
        if yb.min() == yb.max():
            continue
        draws['auc'].append(_auc(yb, pb))
        draws['brier'].append(float(np.mean((pb - yb) ** 2)))
        draws['ece'].append(_ece(yb, pb))
        for name, thr in thresholds.items():
            m = _op(yb, pb, thr)
            for k in op_keys:
                draws[f'at_{name}.{k}'].append(m[k])
    return {k: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] for k, v in draws.items() if v}


def _operating_thresholds(y, p):
    cand = np.unique(np.concatenate([[0.0, 1.0], p]))
    rule_out, rule_in = 0.0, 1.0
    for t in cand:
        if ((p >= t) & (y == 1)).sum() / max((y == 1).sum(), 1) >= TARGET_SENS:
            rule_out = float(t)
    for t in cand[::-1]:
        if ((p < t) & (y == 0)).sum() / max((y == 0).sum(), 1) >= TARGET_SPEC:
            rule_in = float(t)
    fitted = {'rule_out': rule_out, 'rule_in': max(rule_in, rule_out)}
    degenerate = fitted['rule_out'] > 0.9 or fitted['rule_in'] < 0.1 or fitted['rule_in'] - fitted['rule_out'] < 0.02
    chosen = dict(PRIOR_THRESHOLDS) if degenerate else fitted
    return {**chosen, 'balanced': 0.5}, {
        'fitted': fitted,
        'source': 'prior (calibration pool near-separable; fitted thresholds degenerate)' if degenerate else 'fitted on calibration pool',
    }


# ─── figures ─────────────────────────────────────────────────────────────────

def _plt():
    os.environ.setdefault('MPLCONFIGDIR', str(REPO_ROOT / '.mplcache'))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    return plt


def _reliability_png(panels, path: Path):
    plt = _plt()
    edges = np.linspace(0, 1, 11)
    fig, axes = plt.subplots(1, len(panels), figsize=(4.6 * len(panels), 4.4))
    for ax, (title, y, p) in zip(np.atleast_1d(axes), panels):
        idx = np.clip(np.digitize(p, edges[1:-1]), 0, 9)
        centers, acc, conf, counts = [], [], [], []
        for b in range(10):
            m = idx == b
            if m.any():
                centers.append((edges[b] + edges[b + 1]) / 2)
                acc.append(y[m].mean()); conf.append(p[m].mean()); counts.append(int(m.sum()))
        ax.plot([0, 1], [0, 1], '--', color='#999', lw=1, label='perfect calibration')
        ax.bar(centers, acc, width=0.09, alpha=0.35, color='#2563eb', edgecolor='#1e40af', label='observed frequency')
        ax.plot(conf, acc, 'o-', color='#1e40af', ms=4, label='mean predicted vs observed')
        for c, a, n in zip(centers, acc, counts):
            ax.text(c, min(a + 0.03, 0.97), str(n), ha='center', fontsize=7, color='#374151')
        ax.set_title(f'{title}\nECE {_ece(y, p):.3f} · Brier {np.mean((p - y) ** 2):.3f} · n={len(y)}', fontsize=9)
        ax.set_xlabel('Predicted P(cataract)'); ax.set_ylabel('Observed fraction cataract')
        ax.set_xlim(0, 1); ax.set_ylim(0, 1)
        ax.legend(loc='upper left', fontsize=6)
    fig.suptitle('Cataract ResNet-18 — reliability on held-out test split (numbers = images per bin)', fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def _gradcam_grid(model, rows, tf, device, pos_idx, t, path: Path, title: str):
    plt = _plt()
    cols = max(len(r[1]) for r in rows)
    fig, axes = plt.subplots(len(rows), cols, figsize=(cols * 2.0, len(rows) * 2.35))
    axes = np.atleast_2d(axes)
    for ax in axes.flat:
        ax.axis('off')
    masses = {}
    for r, (row_name, images) in enumerate(rows):
        masses[row_name] = []
        for c, img in enumerate(images):
            x = tf(img.convert('RGB')).unsqueeze(0).to(device)
            with torch.no_grad():
                prob = torch.softmax(model(x) / t, dim=1)[0, pos_idx].item()
            cam = gradcam(model, x, pos_idx)
            masses[row_name].append(central_mass(cam, EYE_RADIUS_FRAC))
            ax = axes[r, c]
            ax.imshow(img.convert('RGB').resize((224, 224)))
            ax.imshow(cam, cmap='jet', alpha=0.4)
            ax.set_title(f'{row_name}\nP={prob:.2f}', fontsize=7)
    fig.suptitle(title, fontsize=9)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)
    return masses


# ─── main ────────────────────────────────────────────────────────────────────

def run(args) -> None:
    _seed(args.seed)
    device = _device()
    data_root = args.data_root.resolve()
    classes = sorted(d.name for d in (data_root / 'train').iterdir() if d.is_dir())
    pos_idx = next(i for i, c in enumerate(classes) if 'cataract' in c.lower())
    to_bin = lambda arr: (np.asarray(arr) == pos_idx).astype(int)

    train_items = _list_split(data_root / 'train', classes)
    val_items, test_items, dedup = _dedupe(
        train_items, _list_split(data_root / 'val', classes), _list_split(data_root / 'test', classes))
    print(f'Device {device} · classes {classes}')
    print('Dedup:', json.dumps(dedup))

    train_tf, eval_tf = _transforms()
    g = torch.Generator().manual_seed(args.seed)
    L = lambda items, pre=None, seed=0: DataLoader(Files(items, eval_tf, pre, seed), batch_size=64)
    train_loader = DataLoader(Files(train_items, train_tf), batch_size=args.batch_size, shuffle=True, generator=g)

    model = _build_model(len(classes)).to(device)
    opt = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=args.lr)
    crit = nn.CrossEntropyLoss()
    best_nll, history = float('inf'), []
    val_loader = L(val_items)
    for epoch in range(1, args.epochs + 1):
        model.train()
        tot, n = 0.0, 0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            loss = crit(model(x), y)
            loss.backward()
            opt.step()
            tot += loss.item() * len(y); n += len(y)
        _, vlog, vy = _collect(model, val_loader, device)
        vnll = float(F.cross_entropy(vlog, torch.as_tensor(vy)).item())
        vacc = float((vlog.argmax(1).numpy() == vy).mean())
        saved = ''
        if vnll < best_nll:
            best_nll = vnll
            torch.save(model.state_dict(), args.out)
            saved = ' [best]'
        history.append({'epoch': epoch, 'train_ce': tot / n, 'val_nll': vnll, 'val_acc': vacc})
        print(f'epoch {epoch:02d} train CE {tot / n:.4f} · val NLL {vnll:.4f} · val acc {vacc:.1%}{saved}')

    model.load_state_dict(torch.load(args.out, map_location=device))
    model.eval()

    tr_f, _, tr_y = _collect(model, L(train_items), device)
    va_f, va_log, va_yc = _collect(model, val_loader, device)
    vs_f, vs_log, _ = _collect(model, L(val_items, webcam_sim, seed=1), device)
    _, te_log, te_yc = _collect(model, L(test_items), device)
    _, ts_log, _ = _collect(model, L(test_items, webcam_sim, seed=2), device)
    _, te_eyeless_log, _ = _collect(model, L(test_items, lambda im, r: _eye_mask(im, 'outside')), device)
    _, te_eyeonly_log, _ = _collect(model, L(test_items, lambda im, r: _eye_mask(im, 'inside')), device)
    va_y, te_y = to_bin(va_yc), to_bin(te_yc)

    pool_log = torch.cat([va_log, vs_log])
    pool_target = np.concatenate([va_yc, va_yc])
    t_fit = _fit_temperature(pool_log, pool_target)
    t = max(1.0, t_fit)
    pool_y = np.concatenate([va_y, va_y])
    pool_p = _p_pos(pool_log, pos_idx, t)
    thresholds, threshold_info = _operating_thresholds(pool_y, pool_p)

    te_p_raw, te_p = _p_pos(te_log, pos_idx, 1.0), _p_pos(te_log, pos_idx, t)
    ts_p_raw, ts_p = _p_pos(ts_log, pos_idx, 1.0), _p_pos(ts_log, pos_idx, t)
    results = {
        'calibration_pool': _summary(pool_y, pool_p, thresholds),
        'test_clean_uncalibrated': _summary(te_y, te_p_raw, thresholds),
        'test_clean': _summary(te_y, te_p, thresholds),
        'test_clean_ci95': _bootstrap(te_y, te_p, thresholds, args.seed),
        'test_webcam_sim_uncalibrated': _summary(te_y, ts_p_raw, thresholds),
        'test_webcam_sim': _summary(te_y, ts_p, thresholds),
        'test_webcam_sim_ci95': _bootstrap(te_y, ts_p, thresholds, args.seed + 1),
    }
    shortcut = {
        'eye_region': f'centred disc, radius {EYE_RADIUS_FRAC} × image side',
        'auc_eye_masked_out': _auc(te_y, _p_pos(te_eyeless_log, pos_idx, t)),
        'auc_eye_only': _auc(te_y, _p_pos(te_eyeonly_log, pos_idx, t)),
        'auc_full': results['test_clean']['auc'],
        'interpretation': 'eye-masked AUC far above 0.5 means class is predictable from background/framing (source confound)',
    }

    # OOD: fit on train, scale layers by val p99, threshold = val p99 of combined score
    ood_stats = fit_ood(tr_f, tr_y)
    va_d = layer_distances(va_f, ood_stats)
    scales = {n: float(np.percentile(va_d[n], OOD_PERCENTILE)) for n in OOD_LAYERS}
    va_score = ood_score(va_d, scales)
    ood_thr = float(np.percentile(va_score, OOD_PERCENTILE))
    vs_score = ood_score(layer_distances(vs_f, ood_stats), scales)
    ood = {
        'method': 'class-conditional Mahalanobis (tied Ledoit-Wolf covariance) on pooled layer1-4 features; score = max_layer(d / val_p99_layer)',
        'threshold': ood_thr,
        'layer_scales': scales,
        'val_flagged_fraction': float((va_score > ood_thr).mean()),
        'val_webcam_sim_flagged_fraction': float((vs_score > ood_thr).mean()),
        'probe_sets': {},
    }

    rng = random.Random(args.seed)
    picks = rng.sample(train_items, 40)
    probes = {
        'uniform_noise': [Image.fromarray(np.random.default_rng(i).integers(0, 255, (224, 224, 3), dtype=np.uint8)) for i in range(40)],
        'heavy_blur_sigma12': [Image.open(p).convert('RGB').resize((224, 224)).filter(ImageFilter.GaussianBlur(12)) for p, _ in picks],
        'underexposed_x0.12': [Image.fromarray((np.asarray(Image.open(p).convert('RGB').resize((224, 224)), dtype=np.float32) * 0.12).astype(np.uint8)) for p, _ in picks],
        'flat_mean_colour': [Image.new('RGB', (224, 224), tuple(int(c) for c in np.asarray(Image.open(p).convert('RGB')).reshape(-1, 3).mean(0))) for p, _ in picks],
    }
    app_crops, app_frames = [], []
    if args.app_captures and args.app_captures.is_dir():
        app_crops = sorted(p for p in args.app_captures.iterdir() if p.name.startswith('photo') and p.suffix.lower() in IMG_EXT)
        app_frames = sorted(p for p in args.app_captures.iterdir() if p.name.startswith('thumb') and p.suffix.lower() in IMG_EXT)
    for key, files in (('app_webcam_pupil_crops', app_crops), ('app_webcam_full_frames', app_frames)):
        if files:
            probes[key] = [Image.open(p).convert('RGB') for p in files]

    for name, imgs in probes.items():
        f, lg = _collect_images(model, imgs, eval_tf, device)
        s = ood_score(layer_distances(f, ood_stats), scales)
        entry = {'n': len(s), 'median_score': float(np.median(s)), 'flagged_fraction': float((s > ood_thr).mean())}
        if name.startswith('app_'):
            files = app_crops if 'crops' in name else app_frames
            probs = _p_pos(lg, pos_idx, t)
            entry['per_image'] = [{'file': p.name, 'score': float(si), 'calibrated_p': float(pi)} for p, si, pi in zip(files, s, probs)]
        ood['probe_sets'][name] = entry

    assets = args.report_dir
    assets.mkdir(parents=True, exist_ok=True)
    _reliability_png([
        ('Clean test, uncalibrated', te_y, te_p_raw),
        (f'Clean test, T={t:.2f}', te_y, te_p),
        (f'Webcam-simulated test, T={t:.2f}', te_y, ts_p),
    ], assets / 'cataract_reliability.png')

    pos_items = [p for p, y in test_items if y == pos_idx]
    neg_items = [p for p, y in test_items if y != pos_idx]
    pos_pick = rng.sample(pos_items, min(6, len(pos_items)))
    neg_pick = rng.sample(neg_items, min(6, len(neg_items)))
    rows = [
        ('cataract (test)', [Image.open(p) for p in pos_pick]),
        ('normal (test)', [Image.open(p) for p in neg_pick]),
        ('normal, eye masked', [_eye_mask(Image.open(p), 'outside') for p in neg_pick]),
    ]
    if app_crops:
        rows.append(('app webcam crop', [Image.open(p) for p in app_crops[:6]]))
    cam_mass = _gradcam_grid(
        model, rows, eval_tf, device, pos_idx, t, assets / 'cataract_gradcam.png',
        f'Grad-CAM (layer4, target = cataract). Row 3: same normals with the eye disc filled in — '
        f'test AUC with eye masked = {shortcut["auc_eye_masked_out"]:.3f} ⇒ background/framing cue',
    )

    np.savez(args.out.with_name('cataract_ood_stats.npz'), **ood_stats,
             scales=np.array([scales[n] for n in OOD_LAYERS], dtype=np.float32))
    args.out.with_name('cataract_class_names.json').write_text(json.dumps(classes, indent=2), encoding='utf-8')

    meta = {
        'model': 'cataract_resnet18_binary',
        'version': 'resnet_v2_calibrated',
        'trained_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'labels': classes,
        'positive_label': classes[pos_idx],
        'temperature': t,
        'temperature_fitted_unconstrained': t_fit,
        'thresholds': thresholds,
        'threshold_info': threshold_info,
        'ood': {'threshold': ood_thr, 'layers': list(OOD_LAYERS), 'method': ood['method']},
        'data': {
            'source': 'Zenodo 10.5281/zenodo.18250149 — external eye photographs, binary labels',
            'train': len(train_items), 'val': len(val_items), 'test': len(test_items),
            'dedup': dedup, 'dhash_max_distance': DHASH_MAX_DIST,
        },
        'recipe': {
            'backbone': 'resnet18 (ImageNet)', 'trainable': 'layer4 + fc', 'epochs': args.epochs,
            'lr': args.lr, 'batch_size': args.batch_size, 'seed': args.seed, 'selection': 'lowest validation NLL',
        },
        'headline': {
            'test_clean_auc': results['test_clean']['auc'],
            'test_webcam_sim_auc': results['test_webcam_sim']['auc'],
            'auc_eye_masked_out': shortcut['auc_eye_masked_out'],
        },
    }
    args.out.with_name('cataract_model_meta.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    report = {
        **meta, 'history': history, **results, 'shortcut_probe': shortcut, 'ood_eval': ood,
        'gradcam_central_mass': {'definition': f'share of CAM energy inside centred disc radius {EYE_RADIUS_FRAC}', 'values': cam_mass},
        'external_test_set': None,
        'external_test_note': 'No externally sourced labelled set is available; test is same-source after leakage removal, plus a webcam-simulated copy.',
    }
    (assets / 'cataract_eval.json').write_text(json.dumps(report, indent=2), encoding='utf-8')

    fmt = lambda s: 'AUC {auc:.3f} Brier {brier:.3f} ECE {ece:.3f}'.format(**s)
    print(f'\nT fitted {t_fit:.3f} → used {t:.3f} · thresholds {thresholds} ({threshold_info["source"]})')
    print('Clean test      ', fmt(results['test_clean']), '| sens/spec@0.5',
          round(results['test_clean']['at_balanced']['sensitivity'], 3), round(results['test_clean']['at_balanced']['specificity'], 3))
    print('Webcam-sim test ', fmt(results['test_webcam_sim']), '| sens/spec@0.5',
          round(results['test_webcam_sim']['at_balanced']['sensitivity'], 3), round(results['test_webcam_sim']['at_balanced']['specificity'], 3))
    print('Shortcut        ', json.dumps({k: v for k, v in shortcut.items() if k.startswith('auc')}))
    print('OOD thr', round(ood_thr, 3), 'val-sim flagged', round(ood['val_webcam_sim_flagged_fraction'], 3))
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != 'per_image'} for k, v in ood['probe_sets'].items()}))
    print('CAM central mass', {k: round(float(np.mean(v)), 3) for k, v in cam_mass.items()})


def main() -> None:
    ap = argparse.ArgumentParser(description='Train + evaluate cataract ResNet-18 screening model')
    ap.add_argument('--data-root', type=Path, default=REPO_ROOT / 'data' / 'cataract')
    ap.add_argument('--app-captures', type=Path, default=REPO_ROOT / 'data' / 'app_captures')
    ap.add_argument('--report-dir', type=Path, default=REPO_ROOT / 'docs' / 'model_cards' / 'assets')
    ap.add_argument('--epochs', type=int, default=12)
    ap.add_argument('--batch-size', type=int, default=16)
    ap.add_argument('--lr', type=float, default=1e-4)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--out', type=Path, default=REPO_ROOT / 'cataract_detection_resnet18.pth')
    args = ap.parse_args()
    args.out = args.out.resolve()
    run(args)


if __name__ == '__main__':
    main()
