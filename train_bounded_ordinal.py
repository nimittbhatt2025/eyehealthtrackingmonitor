#!/usr/bin/env python3
"""
Train BoundedOrdinalScleraModel (production head: clamp 0–4).

Matches eyevio/app/ai_models/sclera_redness_model.py so the checkpoint drops in as
sclera_redness_ordinal.pth without architecture mismatch.

Requires train.csv / val.csv / test.csv + images under ./data
(see scripts/build_sclera_train_split.py).

Usage (from repo root, with eyevio venv):
  ./eyevio/venv/bin/python train_bounded_ordinal.py
  ./eyevio/venv/bin/python train_bounded_ordinal.py --epochs 30 --batch-size 8
"""

from __future__ import annotations

import argparse
import ssl
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import models

from dataset_loader import BASE_DIR, build_loaders

ssl._create_default_https_context = ssl._create_unverified_context

REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_OUT = REPO_ROOT / 'sclera_redness_ordinal.pth'


class BoundedOrdinalScleraModel(nn.Module):
    """ResNet-18 + linear head with hard clamp to [0, 4] — mirrors production."""

    def __init__(self, backbone: nn.Module, in_features: int) -> None:
        super().__init__()
        self.backbone = backbone
        self.backbone.fc = nn.Linear(in_features, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        raw = self.backbone(x)
        return torch.clamp(raw, 0.0, 4.0).squeeze(-1)


def _device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device('cuda')
    if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def _build_model() -> nn.Module:
    base = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
    for param in base.parameters():
        param.requires_grad = False
    for param in base.layer4.parameters():
        param.requires_grad = True
    return BoundedOrdinalScleraModel(base, base.fc.in_features)


def train(epochs: int, batch_size: int, lr: float, out_path: Path) -> None:
    device = _device()
    model = _build_model().to(device)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=lr,
        weight_decay=1e-3,
    )
    train_loader, val_loader, test_loader, *_ = build_loaders(batch_size=batch_size, base_dir=BASE_DIR)

    print(f'Device: {device}')
    print(f'Train/val/test: {len(train_loader.dataset)}/{len(val_loader.dataset)}/{len(test_loader.dataset)}')
    print('Starting bounded ordinal training (layer4 + FC)...')

    best_val_mae = float('inf')
    for epoch in range(1, epochs + 1):
        model.train()
        running_loss, n = 0.0, 0
        for images, labels in train_loader:
            images = images.to(device)
            targets = labels.to(device).float()
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * images.size(0)
            n += targets.size(0)
        train_mse = running_loss / max(n, 1)

        model.eval()
        val_mae, vn = 0.0, 0
        with torch.no_grad():
            for images, labels in val_loader:
                images = images.to(device)
                targets = labels.to(device).float()
                preds = model(images)
                val_mae += torch.abs(preds - targets).sum().item()
                vn += targets.size(0)
        epoch_mae = val_mae / max(vn, 1)

        saved = ''
        if epoch_mae < best_val_mae:
            best_val_mae = epoch_mae
            torch.save(model.state_dict(), out_path)
            saved = ' [Saved Best]'
        print(
            f'Epoch {epoch:02d}/{epochs:02d} | Train MSE: {train_mse:.4f} | '
            f'Val MAE: {epoch_mae:.2f} grades{saved}'
        )

    print(f'\nBest checkpoint → {out_path}')
    model.load_state_dict(torch.load(out_path, map_location=device))
    model.eval()

    true_labels, scores, rounded = [], [], []
    with torch.no_grad():
        for images, labels in test_loader:
            preds = model(images.to(device))
            true_labels.extend(labels.numpy().tolist())
            scores.extend(preds.cpu().numpy().tolist())
            rounded.extend(torch.round(preds).cpu().numpy().astype(int).tolist())

    print('\n=== Test Results (Bounded Ordinal) ===')
    for gt, score, disc in zip(true_labels, scores, rounded):
        print(f'Ground Truth: Grade {gt} | Score: {score:.2f} | Rounded: {disc}')
    if true_labels:
        mae = float(np.mean(np.abs(np.array(true_labels) - np.array(scores))))
        acc = float(np.mean(np.array(true_labels) == np.array(rounded)))
        print(f'Test MAE: {mae:.2f} | Rounded accuracy: {acc:.1%}')


def main() -> None:
    parser = argparse.ArgumentParser(description='Train production-matching bounded sclera ordinal model')
    parser.add_argument('--epochs', type=int, default=25)
    parser.add_argument('--batch-size', type=int, default=4)
    parser.add_argument('--lr', type=float, default=1e-4)
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    train(args.epochs, args.batch_size, args.lr, args.out.resolve())


if __name__ == '__main__':
    main()
