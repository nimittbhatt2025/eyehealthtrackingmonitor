#!/usr/bin/env python3
"""
Pathology classifier scaffold (custom training — deferred product wiring).

Taxonomy (wellness triage, not diagnosis):
  normal | conjunctivitis | cataract | glaucoma_suspect | other

This script trains a ResNet-18 multi-class head when folder data exists.
It does NOT wire into the EyeVio API yet — keep pathology separate from
wellness redness/opacity scores until clinical labeling + governance are ready.

Expected layout:
  data/pathology/{train,val,test}/<class_name>/*.jpg

Usage:
  ./eyevio/venv/bin/python train_pathology_classifier.py --data-root data/pathology
"""

from __future__ import annotations

import argparse
import json
import ssl
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms

ssl._create_default_https_context = ssl._create_unverified_context

REPO_ROOT = Path(__file__).resolve().parent
SUGGESTED_CLASSES = (
    'normal',
    'conjunctivitis',
    'cataract',
    'glaucoma_suspect',
    'other',
)


def _device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device('cuda')
    if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def main() -> None:
    parser = argparse.ArgumentParser(description='Train multi-class ocular pathology ResNet-18 (scaffold)')
    parser.add_argument('--data-root', type=Path, default=REPO_ROOT / 'data' / 'pathology')
    parser.add_argument('--epochs', type=int, default=15)
    parser.add_argument('--batch-size', type=int, default=16)
    parser.add_argument('--lr', type=float, default=1e-4)
    parser.add_argument('--out', type=Path, default=REPO_ROOT / 'pathology_resnet18.pth')
    args = parser.parse_args()

    data_root = args.data_root.expanduser().resolve()
    train_dir = data_root / 'train'
    val_dir = data_root / 'val'
    if not train_dir.is_dir() or not val_dir.is_dir():
        raise SystemExit(
            f'Missing {train_dir} or {val_dir}.\n'
            f'Suggested classes: {", ".join(SUGGESTED_CLASSES)}\n'
            'API wiring intentionally deferred until labeled clinical data exists.'
        )

    train_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(0.1, 0.1),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    train_ds = datasets.ImageFolder(train_dir, transform=train_tf)
    val_ds = datasets.ImageFolder(val_dir, transform=eval_tf)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False)

    device = _device()
    model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
    for p in model.parameters():
        p.requires_grad = False
    for p in model.layer4.parameters():
        p.requires_grad = True
    model.fc = nn.Linear(512, len(train_ds.classes))
    model = model.to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=args.lr)

    print(f'Classes: {train_ds.classes}')
    best = -1.0
    out = args.out.resolve()
    for epoch in range(1, args.epochs + 1):
        model.train()
        loss_sum, n = 0.0, 0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            loss = criterion(model(x), y)
            loss.backward()
            optimizer.step()
            loss_sum += loss.item() * x.size(0)
            n += y.size(0)

        model.eval()
        correct, total = 0, 0
        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(device), y.to(device)
                correct += (model(x).argmax(1) == y).sum().item()
                total += y.size(0)
        acc = correct / max(total, 1)
        saved = ''
        if acc > best:
            best = acc
            torch.save(model.state_dict(), out)
            out.with_name('pathology_class_names.json').write_text(
                json.dumps(train_ds.classes, indent=2), encoding='utf-8'
            )
            saved = ' [Saved]'
        print(f'Epoch {epoch:02d} | loss {loss_sum / max(n, 1):.4f} | val {acc:.1%}{saved}')

    print(f'\nCheckpoint → {out}')
    print('Not wired to EyeVio routes yet — review labels/governance before product use.')


if __name__ == '__main__':
    main()
