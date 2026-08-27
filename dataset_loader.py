import os
import pandas as pd
from PIL import Image
from pathlib import Path
import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms

class ScleraRednessDataset(Dataset):
    def __init__(self, csv_file, base_dir, transform=None):
        self.annotations = pd.read_csv(csv_file)
        self.base_dir = Path(base_dir)
        self.transform = transform
        
        # Pre-index all image files recursively for O(1) fast lookup
        self.image_map = {}
        for p in self.base_dir.rglob("*"):
            if p.suffix.lower() in [".jpg", ".jpeg", ".png"]:
                # Map stem (filename without extension) to full path
                self.image_map[p.stem] = p
                # Also map full filename
                self.image_map[p.name] = p

    def __len__(self):
        return len(self.annotations)

    def __getitem__(self, idx):
        raw_id = str(self.annotations.iloc[idx]["image_id"]).strip()
        
        # Strip extension if present in CSV to match stem key
        stem_id = Path(raw_id).stem
        
        if stem_id in self.image_map:
            img_path = self.image_map[stem_id]
        elif raw_id in self.image_map:
            img_path = self.image_map[raw_id]
        else:
            raise FileNotFoundError(f"Could not find image for ID '{raw_id}' in {self.base_dir}")

        image = Image.open(img_path).convert("RGB")
        label = int(self.annotations.iloc[idx]["sclera_redness_grade_0_to_4"])

        if self.transform:
            image = self.transform(image)

        return image, torch.tensor(label, dtype=torch.long)

train_transforms = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.RandomHorizontalFlip(),
    transforms.RandomRotation(15),
    transforms.ColorJitter(brightness=0.1, contrast=0.1),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

eval_transforms = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

BASE_DIR = "./data"

train_dataset = ScleraRednessDataset("train.csv", base_dir=BASE_DIR, transform=train_transforms)
val_dataset = ScleraRednessDataset("val.csv", base_dir=BASE_DIR, transform=eval_transforms)
test_dataset = ScleraRednessDataset("test.csv", base_dir=BASE_DIR, transform=eval_transforms)

train_loader = DataLoader(train_dataset, batch_size=2, shuffle=True)
val_loader = DataLoader(val_dataset, batch_size=2, shuffle=False)
test_loader = DataLoader(test_dataset, batch_size=2, shuffle=False)

if __name__ == "__main__":
    print(f"Train samples: {len(train_dataset)}")
    print(f"Validation samples: {len(val_dataset)}")
    print(f"Test samples: {len(test_dataset)}")
    
    images, labels = next(iter(train_loader))
    print(f"\nBatch Tensor Shape: {images.shape}")
    print(f"Batch Labels Shape: {labels.shape}")
    print(f"Labels: {labels.tolist()}")
