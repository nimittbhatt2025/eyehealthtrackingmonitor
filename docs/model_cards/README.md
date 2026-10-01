# EyeVio model cards

One card per learned model: training data, intended use, held-out metrics with bootstrap CIs, calibration, Grad-CAM, out-of-distribution behaviour and failure modes. The format follows Mitchell et al., "Model cards for model reporting" (FAT* 2019).

| Model | Card | Role in the app | Headline caveat |
|---|---|---|---|
| Cataract ResNet-18 (calibrated, with abstain) | [cataract_resnet18.md](cataract_resnet18.md) | Cataract screening band or "cannot assess" | Eye-masked AUC 0.998: source shortcut |
| Sclera redness ResNet-18 | [sclera_redness_resnet18.md](sclera_redness_resnet18.md) | Redness trend in dry-eye photos | Weak labels only; eye-masked AUC 0.993 |
| Pathology triage ResNet-18 | [pathology_resnet18.md](pathology_resnet18.md) | Research panel only | 15% test/train near-duplicates |
| Cataract CORN ordinal (not trained) | [cataract_resnet18.md](cataract_resnet18.md#failure-modes) | Activates when graded data exists | Needs normal / immature / mature labels |

Regenerate the evaluations:

```bash
./eyevio/venv/bin/python train_cataract_resnet.py --epochs 12
./eyevio/venv/bin/python scripts/eval_model_cards.py
```

All three models share one training source, Zenodo 10.5281/zenodo.18250149. The most important improvement for every model is the same: same-device photos, clinically graded, for both healthy and affected eyes.
