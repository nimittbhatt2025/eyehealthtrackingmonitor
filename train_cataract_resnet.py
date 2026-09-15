#!/usr/bin/env python3
"""
Fine-tune ResNet-18 for binary cataract vs normal (custom training tier).

Expects ImageFolder layout:
  data/cataract/{train,val,test}/{normal,cataract}/*.jpg

Kaggle "Cataract Image Dataset" maps cleanly after a quick reorganize.

Usage (repo root):
  ./eyevio/venv/bin/python train_cataract_resnet.py \\
    --data-root data/cataract --epochs 10 --out cataract_detection_resnet18.pth

Then point the API at the checkpoint:
  export CATARACT_MODEL_PATH=/abs/path/cataract_detection_resnet18.pth
  export CATARACT_CLASS_NAMES=/abs/path/cataract_class_names.json  # written next to --out
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
CLASS_ORDER = ['normal', 'cataract']


def _device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device('cuda')
    if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def _transforms() -> tuple[transforms.Compose, transforms.Compose]:
    train_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(10),
        transforms.ColorJitter(brightness=0.1, contrast=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    return train_tf, eval_tf


def _loaders(data_root: Path, batch_size: int) -> tuple[DataLoader, DataLoader, DataLoader, list[str]]:
    train_tf, eval_tf = _transforms()
    train_ds = datasets.ImageFolder(data_root / 'train', transform=train_tf)
    val_ds = datasets.ImageFolder(data_root / 'val', transform=eval_tf)
    test_path = data_root / 'test'
    test_ds = datasets.ImageFolder(test_path, transform=eval_tf) if test_path.is_dir() else val_ds

    # Prefer clinical class order when both folders exist
    class_to_idx = train_ds.class_to_idx
    labels = [None] * len(class_to_idx)
    for name, idx in class_to_idx.items():
        labels[idx] = name

    return (
        DataLoader(train_ds, batch_size=batch_size, shuffle=True),
        DataLoader(val_ds, batch_size=batch_size, shuffle=False),
        DataLoader(test_ds, batch_size=batch_size, shuffle=False),
        [str(x) for x in labels],
    )


def _build_model(num_classes: int) -> nn.Module:
    model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
    for param in model.parameters():
        param.requires_grad = False
    for param in model.layer4.parameters():
        param.requires_grad = True
    model.fc = nn.Linear(512, num_classes)
    for param in model.fc.parameters():
        param.requires_grad = True
    return model


def _accuracy(model: nn.Module, loader: DataLoader, device: torch.device) -> float:
    model.eval()
    correct, total = 0, 0
    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            preds = model(images).argmax(dim=1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)
    return correct / max(total, 1)


def train(data_root: Path, epochs: int, batch_size: int, lr: float, out: Path) -> None:
    device = _device()
    train_loader, val_loader, test_loader, labels = _loaders(data_root, batch_size)
    model = _build_model(len(labels)).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=lr)

    print(f'Device: {device}')
    print(f'Classes: {labels}')
    print(f'Train/val/test: {len(train_loader.dataset)}/{len(val_loader.dataset)}/{len(test_loader.dataset)}')

    best_val = -1.0
    for epoch in range(1, epochs + 1):
        model.train()
        running, n = 0.0, 0
        for images, y in train_loader:
            images, y = images.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(images)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            running += loss.item() * images.size(0)
            n += y.size(0)
        train_loss = running / max(n, 1)
        val_acc = _accuracy(model, val_loader, device)
        labels_path = out.with_name('cataract_class_names.json')
        saved = ''
        if val_acc > best_val:
            best_val = val_acc
            torch.save(model.state_dict(), out)
            labels_path.write_text(json.dumps(labels, indent=2), encoding='utf-8')
            saved = ' [Saved Best]'
        print(
            f'Epoch {epoch:02d}/{epochs:02d} | Train CE: {train_loss:.4f} | '
            f'Val Acc: {val_acc:.1%}{saved}'
        )

    model.load_state_dict(torch.load(out, map_location=device))
    test_acc = _accuracy(model, test_loader, device)
    labels_path = out.with_name('cataract_class_names.json')
    print(f'\nBest checkpoint → {out}')
    print(f'Test accuracy: {test_acc:.1%}')
    print('\nEnable in API:')
    print(f'  export CATARACT_MODEL_PATH={out.resolve()}')
    print(f'  export CATARACT_CLASS_NAMES={labels_path.resolve()}')


def main() -> None:
    parser = argparse.ArgumentParser(description='Fine-tune ResNet-18 cataract detector')
    parser.add_argument('--data-root', type=Path, default=REPO_ROOT / 'data' / 'cataract')
    parser.add_argument('--epochs', type=int, default=10)
    parser.add_argument('--batch-size', type=int, default=16)
    parser.add_argument('--lr', type=float, default=1e-4)
    parser.add_argument('--out', type=Path, default=REPO_ROOT / 'cataract_detection_resnet18.pth')
    args = parser.parse_args()
    data_root = args.data_root.expanduser().resolve()
    if not (data_root / 'train').is_dir() or not (data_root / 'val').is_dir():
        raise SystemExit(
            f'Expected {data_root}/train and {data_root}/val with class folders '
            f'{CLASS_ORDER}'
        )
    train(data_root, args.epochs, args.batch_size, args.lr, args.out.resolve())


if __name__ == '__main__':
    main()
