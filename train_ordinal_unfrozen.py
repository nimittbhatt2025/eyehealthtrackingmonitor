import ssl
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import models
from dataset_loader import train_loader, val_loader, test_loader
import numpy as np

ssl._create_default_https_context = ssl._create_unverified_context
device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

base_model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)

# Freeze early layers, unfreeze layer4 and fc
for param in base_model.parameters():
    param.requires_grad = False

for param in base_model.layer4.parameters():
    param.requires_grad = True

num_ftrs = base_model.fc.in_features

class OrdinalScleraModel(nn.Module):
    def __init__(self, backbone, in_features):
        super().__init__()
        self.backbone = backbone
        self.backbone.fc = nn.Sequential(
            nn.Linear(in_features, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 1)
        )
        
    def forward(self, x):
        out = torch.sigmoid(self.backbone(x)) * 4.0
        return out.squeeze(-1)

model = OrdinalScleraModel(base_model, num_ftrs).to(device)

criterion = nn.MSELoss()
optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=1e-4, weight_decay=1e-3)

EPOCHS = 25
best_val_mae = float("inf")

print("\nStarting Training (Unfrozen layer4 + Custom FC)...")
for epoch in range(1, EPOCHS + 1):
    model.train()
    running_loss, total_samples = 0.0, 0

    for images, labels in train_loader:
        images, targets = images.to(device), labels.to(device).float()
        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, targets)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * images.size(0)
        total_samples += targets.size(0)

    train_loss = running_loss / total_samples

    model.eval()
    val_mae, val_samples = 0.0, 0

    with torch.no_grad():
        for images, labels in val_loader:
            images, targets = images.to(device), labels.to(device).float()
            outputs = model(images)
            val_mae += torch.abs(outputs - targets).sum().item()
            val_samples += targets.size(0)

    epoch_val_mae = val_mae / val_samples

    if epoch_val_mae < best_val_mae:
        best_val_mae = epoch_val_mae
        torch.save(model.state_dict(), "best_unfrozen_ordinal.pth")
        saved_flag = " [Saved Best]"
    else:
        saved_flag = ""

    print(f"Epoch {epoch:02d}/{EPOCHS:02d} | Train MSE: {train_loss:.4f} | Val MAE: {epoch_val_mae:.2f} grades{saved_flag}")

print("\n=== Test Results (Unfrozen Model) ===")
model.load_state_dict(torch.load("best_unfrozen_ordinal.pth"))
model.eval()

true_labels, predicted_scores, rounded_grades = [], [], []

with torch.no_grad():
    for images, labels in test_loader:
        images = images.to(device)
        preds = model(images)
        true_labels.extend(labels.numpy())
        predicted_scores.extend(preds.cpu().numpy())
        rounded_grades.extend(torch.round(preds).cpu().numpy().astype(int))

for gt, score, rounded in zip(true_labels, predicted_scores, rounded_grades):
    print(f"Ground Truth: Grade {gt} | Continuous Score: {score:.2f} | Discretized Grade: {rounded}")

final_mae = np.mean(np.abs(np.array(true_labels) - np.array(predicted_scores)))
print(f"\nTest MAE: {final_mae:.4f} grades")
