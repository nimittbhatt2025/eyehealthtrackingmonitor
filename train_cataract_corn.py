#!/usr/bin/env python3
"""
CORN ordinal cataract grading — ready to run once graded labels exist.

The shipped cataract model is binary (cataract vs normal) because the only
available dataset has binary labels. A probability from a binary classifier is
not a severity measurement, so the app shows no severity grade. This script
trains the ordinal model that would replace it.

Input: a CSV with columns
  path       image path (absolute, or relative to the CSV)
  grade      one of --levels (default: normal, immature, mature)
  split      optional: train / val / test
  patient_id optional: used for a patient-level split when `split` is absent

Recommended source images match the deployment domain: front-facing
smartphone/webcam eye photos graded by a clinician. Published smartphone
grading work stratifies normal / immature (pre-mature) / mature, which is why
those are the default levels; LOCS III needs slit-lamp imaging.

Pipeline: leakage control (patient-level split, dHash de-duplication across
splits) → ResNet-18 with a K-1 logit CORN head → selection on validation MAE →
test MAE, exact accuracy, quadratic-weighted kappa (2000-sample bootstrap
95% CIs), per-threshold ECE for P(grade > k) → OOD statistics (same method as
the binary model) → artifacts:

  cataract_corn_resnet18.pth, cataract_corn_meta.json, cataract_corn_ood_stats.npz
  docs/model_cards/assets/cataract_corn_eval.json

These files alone do not switch the grader on. The API loads it only when
eyevio/app/ai_models/corn_gate.py passes: CATARACT_CORN_ENABLED=1, an approved
entry in docs/model_cards/approvals.json matching this meta's version, levels,
dataset and weights hash, and test metrics within CORN_VALIDATION_THRESHOLDS.

Usage:
  ./eyevio/venv/bin/python train_cataract_corn.py --csv data/cataract_graded/labels.csv \\
      --dataset-name <name> --dataset-version <version>
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.optim as optim
from PIL import Image
from torch.utils.data import DataLoader, Dataset

REPO_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(REPO_ROOT / 'eyevio'))
sys.path.insert(0, str(REPO_ROOT))
from app.ai_models.cnn_explain import OOD_LAYERS, fit_ood, forward_with_features, layer_distances, ood_score  # noqa: E402
from app.ai_models.corn import corn_loss, cumulative_probs, level_probs, predict_level  # noqa: E402
from app.ai_models.corn_gate import sha256_file  # noqa: E402
from train_cataract_resnet import (  # noqa: E402
    DHASH_MAX_DIST, OOD_PERCENTILE, _device, _dhash, _ece, _hamming, _seed, _transforms,
)

N_BOOT = 2000


def _read_csv(path: Path, levels: list[str]):
    rows = []
    with path.open(newline='', encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            grade = (r.get('grade') or '').strip().lower()
            if grade not in levels:
                raise SystemExit(f'Unknown grade {grade!r} in {path}; expected one of {levels}')
            p = Path(r['path'])
            p = p if p.is_absolute() else (path.parent / p)
            if not p.is_file():
                raise SystemExit(f'Missing image: {p}')
            rows.append({
                'path': p.resolve(), 'y': levels.index(grade),
                'split': (r.get('split') or '').strip().lower() or None,
                'patient': (r.get('patient_id') or '').strip() or None,
            })
    return rows


def _split(rows, seed: int):
    if all(r['split'] in ('train', 'val', 'test') for r in rows):
        return {s: [r for r in rows if r['split'] == s] for s in ('train', 'val', 'test')}, 'from_csv'
    groups = defaultdict(list)
    for i, r in enumerate(rows):
        groups[r['patient'] or f'img{i}'].append(r)
    keys = sorted(groups)
    random.Random(seed).shuffle(keys)
    n = len(keys)
    cut1, cut2 = int(n * 0.7), int(n * 0.85)
    parts = {'train': keys[:cut1], 'val': keys[cut1:cut2], 'test': keys[cut2:]}
    unit = 'patient' if any(r['patient'] for r in rows) else 'image'
    return {s: [r for k in ks for r in groups[k]] for s, ks in parts.items()}, f'random_{unit}_70_15_15'


def _dedupe(splits):
    ref = [_dhash(r['path']) for r in splits['train']]
    report = {}
    for name in ('val', 'test'):
        kept, removed = [], 0
        for r in splits[name]:
            h = _dhash(r['path'])
            if any(_hamming(h, x) <= DHASH_MAX_DIST for x in ref):
                removed += 1
                continue
            kept.append(r)
            ref.append(h)
        report[name] = {'before': len(splits[name]), 'after': len(kept), 'removed_near_duplicates': removed}
        splits[name] = kept
    return report


class Rows(Dataset):
    def __init__(self, rows, tf):
        self.rows, self.tf = rows, tf

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        r = self.rows[i]
        return self.tf(Image.open(r['path']).convert('RGB')), r['y']


def _model(k_levels: int):
    from torchvision import models
    m = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
    for p in m.parameters():
        p.requires_grad = False
    for p in m.layer4.parameters():
        p.requires_grad = True
    m.fc = torch.nn.Linear(512, k_levels - 1)
    return m


@torch.no_grad()
def _collect(model, loader, device):
    model.eval()
    feats = {n: [] for n in OOD_LAYERS}
    logits, ys = [], []
    for x, y in loader:
        f, lg = forward_with_features(model, x.to(device))
        for n in OOD_LAYERS:
            feats[n].append(f[n].cpu())
        logits.append(lg.cpu()); ys.append(y)
    return {n: torch.cat(v).numpy() for n, v in feats.items()}, torch.cat(logits), torch.cat(ys).numpy()


def _ordinal_metrics(y, pred, k_levels):
    from sklearn.metrics import cohen_kappa_score
    labels = list(range(k_levels))
    qwk = float(cohen_kappa_score(y, pred, weights='quadratic', labels=labels)) if len(set(y)) > 1 else float('nan')
    return {'mae': float(np.mean(np.abs(y - pred))), 'exact_accuracy': float(np.mean(y == pred)), 'qwk': qwk}


def _bootstrap(y, pred, k_levels, seed):
    rng = np.random.default_rng(seed)
    draws = defaultdict(list)
    for _ in range(N_BOOT):
        i = rng.integers(0, len(y), len(y))
        for k, v in _ordinal_metrics(y[i], pred[i], k_levels).items():
            if not np.isnan(v):
                draws[k].append(v)
    return {k: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] for k, v in draws.items()}


def run(args):
    _seed(args.seed)
    levels = [s.strip().lower() for s in args.levels.split(',')]
    k_levels = len(levels)
    rows = _read_csv(args.csv.resolve(), levels)
    splits, split_rule = _split(rows, args.seed)
    dedup = _dedupe(splits)
    for s in ('train', 'val', 'test'):
        if not splits[s]:
            raise SystemExit(f'{s} split is empty')
    print('Split', split_rule, {s: dict(Counter(levels[r['y']] for r in splits[s])) for s in splits}, 'dedup', dedup)

    device = _device()
    train_tf, eval_tf = _transforms()
    g = torch.Generator().manual_seed(args.seed)
    train_loader = DataLoader(Rows(splits['train'], train_tf), batch_size=args.batch_size, shuffle=True, generator=g)
    L = lambda rs: DataLoader(Rows(rs, eval_tf), batch_size=64)
    val_loader = L(splits['val'])

    model = _model(k_levels).to(device)
    opt = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=args.lr)
    best_mae, history = float('inf'), []
    for epoch in range(1, args.epochs + 1):
        model.train()
        tot, n = 0.0, 0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            loss = corn_loss(model(x), y)
            loss.backward()
            opt.step()
            tot += loss.item() * len(y); n += len(y)
        _, vlog, vy = _collect(model, val_loader, device)
        vm = _ordinal_metrics(vy, predict_level(vlog).numpy(), k_levels)
        saved = ''
        if vm['mae'] < best_mae:
            best_mae = vm['mae']
            torch.save(model.state_dict(), args.out)
            saved = ' [best]'
        history.append({'epoch': epoch, 'train_corn_loss': tot / n, **{f'val_{k}': v for k, v in vm.items()}})
        print(f"epoch {epoch:02d} loss {tot / n:.4f} · val MAE {vm['mae']:.3f} QWK {vm['qwk']:.3f}{saved}")

    model.load_state_dict(torch.load(args.out, map_location=device))
    tr_f, _, tr_y = _collect(model, L(splits['train']), device)
    va_f, _, _ = _collect(model, val_loader, device)
    _, te_log, te_y = _collect(model, L(splits['test']), device)
    te_pred = predict_level(te_log).numpy()
    cum = cumulative_probs(te_log).numpy()
    test = {
        **_ordinal_metrics(te_y, te_pred, k_levels),
        'ci95': _bootstrap(te_y, te_pred, k_levels, args.seed),
        'confusion': [[int(((te_y == a) & (te_pred == b)).sum()) for b in range(k_levels)] for a in range(k_levels)],
        'threshold_ece': {f'P(grade > {levels[k]})': _ece((te_y > k).astype(int), cum[:, k]) for k in range(k_levels - 1)},
        'mean_level_probs': level_probs(te_log).mean(0).tolist(),
    }

    stats = fit_ood(tr_f, tr_y)
    va_d = layer_distances(va_f, stats)
    scales = {n: float(np.percentile(va_d[n], OOD_PERCENTILE)) for n in OOD_LAYERS}
    ood_thr = float(np.percentile(ood_score(va_d, scales), OOD_PERCENTILE))
    np.savez(args.out.with_name('cataract_corn_ood_stats.npz'), **stats,
             scales=np.array([scales[n] for n in OOD_LAYERS], dtype=np.float32))

    meta = {
        'model': 'cataract_resnet18_corn',
        'version': 'corn_v1',
        'trained_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'levels': levels,
        'dataset': {'name': args.dataset_name, 'version': args.dataset_version},
        'weights_sha256': sha256_file(args.out),
        'ood': {'threshold': ood_thr, 'layers': list(OOD_LAYERS)},
        'data': {'csv': str(args.csv), 'split_rule': split_rule, 'dedup': dedup,
                 'counts': {s: dict(Counter(levels[r['y']] for r in splits[s])) for s in splits}},
        'recipe': {'backbone': 'resnet18 (ImageNet)', 'head': f'CORN, {k_levels - 1} logits', 'epochs': args.epochs,
                   'lr': args.lr, 'seed': args.seed, 'selection': 'lowest validation MAE'},
        'test': {k: test[k] for k in ('mae', 'exact_accuracy', 'qwk', 'ci95', 'threshold_ece')},
        'release_gate': 'Not enabled by these files. See eyevio/app/ai_models/corn_gate.py and docs/model_cards/approvals.json.',
    }
    args.out.with_name('cataract_corn_meta.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    args.report_dir.mkdir(parents=True, exist_ok=True)
    (args.report_dir / 'cataract_corn_eval.json').write_text(
        json.dumps({**meta, 'history': history, 'test_full': test}, indent=2), encoding='utf-8')
    print('Test', json.dumps(meta['test']))


def main():
    ap = argparse.ArgumentParser(description='Train CORN ordinal cataract grader from a graded CSV')
    ap.add_argument('--csv', type=Path, required=True)
    ap.add_argument('--levels', default='normal,immature,mature')
    ap.add_argument('--dataset-name', required=True, help='Recorded in meta; must match the approval entry')
    ap.add_argument('--dataset-version', required=True, help='Recorded in meta; must match the approval entry')
    ap.add_argument('--epochs', type=int, default=15)
    ap.add_argument('--batch-size', type=int, default=16)
    ap.add_argument('--lr', type=float, default=1e-4)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--out', type=Path, default=REPO_ROOT / 'cataract_corn_resnet18.pth')
    ap.add_argument('--report-dir', type=Path, default=REPO_ROOT / 'docs' / 'model_cards' / 'assets')
    args = ap.parse_args()
    args.out = args.out.resolve()
    run(args)


if __name__ == '__main__':
    main()
