# Milestone 5 — Lighting Quality Validation Analysis

**Project:** EyeVio capture-quality lighting gate  
**File under test:** `eyevio/app/ai_models/capture_quality.py` — `assess_anatomical_lighting()`  
**Status:** Bug hunt closed (no code defect found). Threshold calibration (v2) implemented; requires fresh held-out re-validation.

---

## 1. Summary

The lighting gate (`assess_anatomical_lighting`) disagrees substantially with human
judgment of "usable for eye analysis" on two independently labeled datasets. A full
code audit found **no logic bug** — the function is internally consistent across all
2,717 labeled samples checked. The disagreement is a **threshold calibration problem**,
not a code defect.

Human labels mean **image suitability for EyeVio analysis**, not clinical disease.

---

## 2. Datasets

| Split | Source | N | Fully labeled | Purpose |
|---|---|---|---|---|
| dev | SoF (Specs on Faces) public dataset | 2,662 | Yes | Workflow smoke test; large-N signal |
| validation | Live webcam capture, 5 conditions | 55 (target ~100) | Yes | Milestone 5 evaluation; frozen v1 thresholds |

Validation condition breakdown:

| Condition | N |
|---|---|
| normal_baseline | 20 |
| dim_room | 12 |
| side_lamp | 11 |
| bright_window_behind | 6 |
| overhead_only | 6 |

**Thresholds were not modified during collection.**

---

## 3. Results (v1 frozen, gate framing)

Positive class = **human not_usable** (algo should block).

### 3.1 Validation split (n=55, usable=37, not_usable=18)

| Metric | Value |
|---|---|
| Precision | 0.357 |
| Recall | 0.833 |
| Accuracy | 0.455 |
| F1 | 0.500 |

| | human usable | human not_usable |
|---|---|---|
| ALGO normal | 10 | 3 (FN) |
| ALGO extreme | 27 (FP) | 15 (TP) |

**Failure mode:** trigger-happy on webcam — 26/27 FPs were "Extreme shadows" (`under_ratio` check).

### 3.2 Dev split (n=2,662)

| Metric | Value |
|---|---|
| Precision | 0.772 |
| Recall | 0.575 |
| Accuracy | 0.634 |
| F1 | 0.659 |

**Failure mode:** misses ~42% of SoF ground-truth poor lighting (FN on dev).

---

## 4. Root cause, by check

### `under_ratio` — unreliable alone on webcam

Validation medians **inverted** vs check assumption:
- `not_usable` median under_ratio: **0.063**
- `usable` median under_ratio: **0.455**

Eye ROI dark pixels (pupils/eyelashes) inflate under_ratio on usable webcam selfies.
Not fixable by threshold sweep alone on this feature.

### `left_right_delta` — real signal

Validation `not_usable` rows: `lr_delta` 40–116 for uneven/glare cases.
Threshold 55 directionally correct; secondary glare check added in v2.

### Even overexposure — coverage gap

Example: `eye_L=128.4, eye_R=112.6`, human `too_bright`, no v1 check fired.
Missing **even washout** check (not miscalibrated threshold).

---

## 5. Bug-hunt conclusion

- Collector + `assess_anatomical_lighting()` audited — **no logic defect**.
- 5 dev rows on rounded threshold boundaries — display precision artifact only.
- `audit_lighting_consistency.py`: 0 inconsistencies on validation (55 rows).

---

## 6. Methodology (Version 1 → 2 → re-validate)

```
Version 1 frozen → independent validation (this doc) → measured performance
    → Version 2 calibration → fresh held-out re-validation
```

**Do not** report v2 performance on the same 55/2,662 rows used to design v2 as official validation.

---

## 7. Version 2 changes (implemented, exploratory only on v1 CSV)

- Removed standalone max-ROI `under_ratio` check
- Shadow checks gated by ROI brightness context
- Added even washout + asymmetric glare checks
- Kept `lr_delta > 55` strong-uneven check

Exploratory v2 re-score on validation metrics (gate framing, sanity-checked):

| | v1 frozen | v2 exploratory |
|---|---|---|
| TP (block bad) | 15 | 17 |
| FN (miss bad) | 3 | **1** |
| FP (block good) | 27 | **24** |
| TN (pass good) | 10 | 13 |
| TP+FN | 18 ✓ | 18 ✓ |
| FP+TN | 37 ✓ | 37 ✓ |

v2 reduces missed bad images but increases false blocks — requires fresh collection to validate trade-off.

---

## 9. Forehead shadow diagnosis (v2 → v2.1)

The v2 forehead-gated shadow check reproduced the **same inverted-signal problem** as
standalone `under_ratio` on webcam validation (n=55, exploratory):

| Metric | human usable (n=37) | human not_usable (n=18) |
|---|---|---|
| forehead_under median | **0.455** | **0.063** |
| forehead_mean median | **43.4** | **80.7** |

The check assumed low forehead brightness + high under-ratio = bad shadows. On usable
webcam selfies, forehead ROIs are often dim with high under-ratio (hairline, brows) —
the opposite of not_usable rows where truly dark scenes have *brighter* forehead medians.

**Conclusion:** not fixable by threshold tweak — check removed in v2.1.

Exploratory re-score on same 55 rows after removing forehead check:

| | v2 | v2.1 (exploratory) |
|---|---|---|
| FP (block usable) | 24 | **6** |
| FN (miss bad) | 1 | 2 |
| FPR | 0.649 | **0.162** |

Still exploratory — do not treat as official validation. Remaining 6 FPs: dim_room
usable flagged `too_dark` (eye_mean ~33–34) and side_lamp glare/lr edge cases.

---

## 10. Next steps

1. Forehead/shadow removed in v2.1 — exploratory FP 24→6 on n=55 (still not official)
2. Do not expand validation collection until v2.1+ passes a fresh webcam smoke test
3. Fresh held-out re-validation with new snapshots — not the M5 CSV
4. Glasses classifier (Milestone 6) — after lighting stable

**Constants v1** (frozen in M5 datasets):

```python
EXTREME_EYE_MEAN_LOW = 40
EXTREME_EYE_MEAN_HIGH = 230
EXTREME_LR_DELTA = 55
EXTREME_UNDER_RATIO = 0.35
EXTREME_OVER_RATIO = 0.15
```
