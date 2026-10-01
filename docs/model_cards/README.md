# EyeVio model cards

One card per learned model: training data, intended use, held-out metrics with bootstrap CIs, calibration, Grad-CAM, out-of-distribution behaviour and failure modes. The format follows Mitchell et al., "Model cards for model reporting" (FAT* 2019).

**Status: research lab only.** High test accuracy did not demonstrate clinical validity. Occlusion testing revealed that the model learned dataset-specific shortcuts rather than ocular features. None of these models returns a likelihood, band, grade or class to users. Where one runs, the app shows only "Experimental analysis completed", "Result is not clinically interpretable" and "This model is currently being evaluated for dataset shortcuts" (`withhold_model_outputs()` in `eyevio/app/ai_models/experimental_models.py`). Their behaviour is presented as an experiment on the in-app AI Research Lab page (`/research-lab`), which reads copies of the `assets/*_eval.json` files kept identical by `eyevio-frontend/tests/researchLabAssets.test.mjs`.

| Model | Card | Role in the app | Headline caveat |
|---|---|---|---|
| Cataract ResNet-18 (calibrated, with abstain) | [cataract_resnet18.md](cataract_resnet18.md) | Research lab only; output withheld from users | Eye-masked AUC 0.998: source shortcut |
| Sclera redness ResNet-18 | [sclera_redness_resnet18.md](sclera_redness_resnet18.md) | Research lab only; output withheld from users | Weak labels only; eye-masked AUC 0.993 |
| Pathology ResNet-18 | [pathology_resnet18.md](pathology_resnet18.md) | Research lab only; output withheld from users | Eye-masked macro-F1 0.68 (chance 0.25); 15% test/train near-duplicates |
| Cataract CORN ordinal (not trained) | [cataract_resnet18.md](cataract_resnet18.md#failure-modes) | Not deployed; release-gated (`corn_gate.py`, [`approvals.json`](approvals.json)) | Needs normal / immature / mature labels, approval, matching dataset metadata and validation thresholds |

Before any of these could return a user-facing result: an external test set from a different source, from the same kind of camera EyeVio uses, labelled by clinicians; and a masking test showing that performance depends on the eye.

Regenerate the evaluations:

```bash
./eyevio/venv/bin/python train_cataract_resnet.py --epochs 12
./eyevio/venv/bin/python scripts/eval_model_cards.py
```

All three models share one training source, Zenodo 10.5281/zenodo.18250149. The most important improvement for every model is the same: same-device photos, clinically graded, for both healthy and affected eyes.
