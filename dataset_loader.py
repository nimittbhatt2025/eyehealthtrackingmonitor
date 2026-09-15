"""
Sclera ordinal dataset + optional eager loaders for train scripts.

CSV columns: image_id, sclera_redness_grade_0_to_4
Images indexed recursively under BASE_DIR (default ./data).
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms

BASE_DIR = './data'


class ScleraRednessDataset(Dataset):
    def __init__(self, csv_file, base_dir, transform=None):
        self.annotations = pd.read_csv(csv_file)
        self.base_dir = Path(base_dir)
        self.transform = transform

        self.image_map = {}
        for p in self.base_dir.rglob('*'):
            if p.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp', '.bmp']:
                self.image_map[p.stem] = p
                self.image_map[p.name] = p

    def __len__(self):
        return len(self.annotations)

    def __getitem__(self, idx):
        raw_id = str(self.annotations.iloc[idx]['image_id']).strip()
        stem_id = Path(raw_id).stem

        if stem_id in self.image_map:
            img_path = self.image_map[stem_id]
        elif raw_id in self.image_map:
            img_path = self.image_map[raw_id]
        else:
            raise FileNotFoundError(f"Could not find image for ID '{raw_id}' in {self.base_dir}")

        image = Image.open(img_path).convert('RGB')
        label = int(self.annotations.iloc[idx]['sclera_redness_grade_0_to_4'])

        if self.transform:
            image = self.transform(image)

        return image, torch.tensor(label, dtype=torch.long)


train_transforms = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.RandomHorizontalFlip(),
    transforms.RandomRotation(15),
    transforms.ColorJitter(brightness=0.1, contrast=0.1),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

eval_transforms = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


def build_loaders(batch_size: int = 2, base_dir: str = BASE_DIR):
    """Create train/val/test loaders when CSVs exist (lazy — safe to import module without data)."""
    train_dataset = ScleraRednessDataset('train.csv', base_dir=base_dir, transform=train_transforms)
    val_dataset = ScleraRednessDataset('val.csv', base_dir=base_dir, transform=eval_transforms)
    test_dataset = ScleraRednessDataset('test.csv', base_dir=base_dir, transform=eval_transforms)
    return (
        DataLoader(train_dataset, batch_size=batch_size, shuffle=True),
        DataLoader(val_dataset, batch_size=batch_size, shuffle=False),
        DataLoader(test_dataset, batch_size=batch_size, shuffle=False),
        train_dataset,
        val_dataset,
        test_dataset,
    )


# Back-compat aliases populated only when CSVs are present (legacy train_ordinal_unfrozen.py)
train_loader = val_loader = test_loader = None
train_dataset = val_dataset = test_dataset = None

if Path('train.csv').is_file() and Path('val.csv').is_file() and Path('test.csv').is_file():
    train_loader, val_loader, test_loader, train_dataset, val_dataset, test_dataset = build_loaders()


if __name__ == '__main__':
    if train_dataset is None:
        print('Missing train.csv / val.csv / test.csv — run scripts/build_sclera_train_split.py first')
    else:
        print(f'Train samples: {len(train_dataset)}')
        print(f'Validation samples: {len(val_dataset)}')
        print(f'Test samples: {len(test_dataset)}')
        images, labels = next(iter(train_loader))
        print(f'\nBatch Tensor Shape: {images.shape}')
        print(f'Batch Labels Shape: {labels.shape}')
        print(f'Labels: {labels.tolist()}')
