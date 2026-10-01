# EyeVio home vision tests — validation study protocol

Version 1.0 (draft for ethics review). Analysis code: `eyevio/app/utils/agreement.py`, `eyevio/app/utils/validation_study.py`, `scripts/validation_export.py`, `scripts/validation_analyze.py`.

## 1. Aims

1. **Agreement:** how closely do the app's acuity, contrast and near point of convergence (NPC) results agree with standard clinical measurements of the same quantity? Reported as Bland–Altman bias and 95% limits of agreement (LoA), and ICC(A,1).
2. **Repeatability:** how much does each app result change between two sessions when nothing has changed? Reported as within-subject SD (s_w), coefficient of repeatability (CoR) and test–retest ICC(A,1). The measured s_w replaces the provisional priors used by reliable-change decline detection (`METRICS` in `eyevio/app/utils/change_detection.py`).

The study does not assess diagnostic accuracy for any disease.

## 2. Design

A prospective method-comparison study with a test–retest arm.

- **Visit 1 (clinic):** reference tests by an examiner, plus the app tests done by the participant on their own device. Half the participants are randomised to do the app first and half the reference first.
- **Session 2 (home):** the app tests are repeated 1–7 days later. Use the same device and glasses, and keep the time of day within ±2 h of visit 1.

The examiner doing the reference tests does not see the app results, and the participant is not shown the reference results until the end.

## 3. Participants

- **Inclusion:** age ≥ 18; can use a smartphone or computer with a camera; reads English instructions.
- **Exclusion:** any condition that prevents completing the tests, such as nystagmus or inability to hold fixation. Also excluded: dilated pupils or eye surgery within the last 4 weeks.
- **Range of results:** ICC depends on how much results vary between participants. A sample of only healthy young adults makes ICC look poor even when agreement is good. Recruit so that **at least one third** have reduced vision. Clinic patients are suitable, for example with cataract, AMD, glaucoma, amblyopia, or habitual correction that is out of date. Also include about 10 people with a known colour vision deficiency so the colour thresholds have a real spread.
- **Sample size:** 60 analysable participants, recruiting 70 to allow for drop-out and protocol exclusions.
  - **ICC:** with an expected ICC of 0.85 and k = 2, n = 55 gives a 95% CI about 0.15 wide (Bonett 2002).
  - **Limits of agreement:** n = 60 gives a 95% CI on each limit of about ±0.44 SD of the differences (Bland & Altman 1999).

## 4. Measurements

All monocular tests use one eye per participant for the primary analysis. That is the right eye, or the left eye if the right cannot be tested; the other eye is covered with an occluder. Both eyes are recorded, and the analysis can be repeated on both eyes as a sensitivity analysis.

| `measure` (CSV) | App test (method version) | Reference | `eye` values |
|---|---|---|---|
| `acuity_logmar` | Visual acuity, Sloan/ETDRS forced choice (v2) | ETDRS chart at 4 m, 80–320 cd/m² (ISO 8596), habitual correction, letter-by-letter scoring at 0.02 logMAR per letter, standard termination | `right`, `left` |
| `contrast_logcs_1cpd` | Contrast sensitivity, qCSF, logCS at 1 c/deg (v2) | Pelli–Robson chart at 1 m, 60–120 cd/m², letter-by-letter scoring at 0.05 logCS per letter (Elliott et al. 1991) | `right`, `left` |
| `npc_break_cm` | Near point of convergence, camera (v1) | RAF rule push-up with an accommodative target, about 1–2 cm/s. Break = reported doubling or seen loss of convergence. Mean of 3 trials, measured from the outer canthus | `both` |
| `contrast_aulcsf` | qCSF AULCSF (v2) | none (repeatability only) | `right`, `left` |
| `glare_delta_logcs` | Glare Δ logCS (v2) | none (repeatability only) | `both` |
| `colour_protan_log10`, `colour_deutan_log10`, `colour_tritan_log10` | Colour thresholds (v2) | none (repeatability only). An anomaloscope or HRR result is a categorical reference and needs a diagnostic-accuracy analysis, not Bland–Altman | `right`, `left` (`both` if the app was set to binocular; keep the same mode in both sessions) |

App sessions follow the in-app instructions exactly as a user at home would, including the distance and lighting checks. Staff help only with logging in.

**Excluded sessions.** A session is excluded from a measure if it sits at a test limit, because those values are bounds rather than measurements. These are:
- acuity at the chart floor;
- glare with the no-glare result at the ceiling;
- colour beyond the screen gamut;
- NPC with no break found.

Excluded sessions are counted and reported.

## 5. Pre-specified acceptance targets

| Measure | Bias | LoA half-width | ICC(A,1), lower 95% CI | Test–retest CoR |
|---|---|---|---|---|
| `acuity_logmar` | ≤ 0.05 logMAR | ≤ 0.15 logMAR | ≥ 0.75 | ≤ 0.15 logMAR |
| `contrast_logcs_1cpd` | reported only (a grating at 1 c/deg is expected to differ from letters) | ≤ 0.30 logCS | ≥ 0.75 | ≤ 0.30 logCS |
| `npc_break_cm` | reported only | ≤ 4 cm | ≥ 0.75 | ≤ 4 cm |

**Primary endpoint:** acuity agreement, meaning all three acuity agreement targets are met. Everything else is secondary. The targets sit at or inside the published test–retest variability of the reference tests themselves:
- ETDRS CoR about ±0.1–0.15 logMAR;
- Pelli–Robson CoR about ±0.15–0.2 logCS;
- RAF NPC repeatability about ±3–4 cm.

The targets live in `MEASURES` in `validation_study.py`. Change them only before unblinding, and record any change here.

## 6. Analysis

All of this is computed by `scripts/validation_analyze.py`.

**Agreement** (app session 1 vs reference):
- **Bland–Altman.** Difference = app − reference. Bias with a t-based 95% CI. LoA = bias ± 1.96·SD, with 95% CIs from Bland & Altman (1999).
- **Proportional bias.** Regress the difference on the mean.
- **Normality.** Shapiro–Wilk test on the differences.
- **ICC(A,1)** (two-way random, absolute agreement) with the McGraw & Wong (1996) CI. This is the primary ICC, because a constant offset between app and chart is a real disagreement. ICC(C,1) is reported alongside it. Interpret with Koo & Li (2016) bands, applied to the lower CI bound.

**Repeatability** (app session 1 vs session 2):
- mean change with a 95% CI (a learning effect shows up here);
- s_w = √(Σd²/2n);
- CoR = 1.96·√2·s_w;
- ICC(A,1);
- a Bland–Altman plot.

**If the differences are not normal or show proportional bias,** also report LoA on a log scale, or regression-based LoA (Bland & Altman 1999, section 3).

**Missing data:** complete-case analysis. Report how many participants are missing per measure, and why.

## 7. Running the analysis

1. Copy `docs/validation/templates/*.csv` to `data/validation/`, which is gitignored and never committed.
   - `participants.csv` maps each pseudonymous `participant_id` (P001…) to the participant's app account email. It is the re-identification key: store it apart from the study data, with restricted access.
   - `reference_measurements.csv` has one row per reference value, with the `measure` and `eye` names from section 4.
2. Export the app results (the output contains participant IDs only):
   ```bash
   cd eyevio
   ./venv/bin/python ../scripts/validation_export.py \
     --participants ../data/validation/participants.csv \
     --out ../data/validation/app_results.csv --since 2026-10-01
   ```
3. Analyse:
   ```bash
   MPLCONFIGDIR=/tmp/mpl ./venv/bin/python ../scripts/validation_analyze.py \
     --app ../data/validation/app_results.csv \
     --reference ../data/validation/reference_measurements.csv \
     --out ../docs/validation/results
   # sensitivity analysis on both eyes:
   ... --eye-policy all --out ../docs/validation/results_both_eyes
   ```
   This writes `report.md` (tables and plots), `results.json` (every statistic plus the paired values) and `plots/`.
4. Dry run without data: `--simulate 60 --out /tmp/validation_demo` writes the same outputs from synthetic participants, labelled SIMULATED.
5. Feed back. If a measured test–retest s_w is larger than the prior in `change_detection.METRICS`, update the prior and record the study as its source.

## 8. Ethics and data protection

The study needs ethics committee approval and written informed consent before recruitment. Data is pseudonymised: analysis files and the report carry participant IDs only. The key file and the raw reference sheets stay in `data/validation/` or an equivalent restricted store. Participants with an unexpected reference finding are referred under the clinic's usual pathway.

## References

- Bland JM, Altman DG. Statistical methods for assessing agreement between two methods of clinical measurement. Lancet 1986;1:307–310.
- Bland JM, Altman DG. Measuring agreement in method comparison studies. Stat Methods Med Res 1999;8:135–160.
- Bonett DG. Sample size requirements for estimating intraclass correlations with desired precision. Stat Med 2002;21:1331–1335.
- Elliott DB, Bullimore MA, Bailey IL. Improving the reliability of the Pelli-Robson contrast sensitivity test. Clin Vis Sci 1991;6:471–475.
- Koo TK, Li MY. A guideline of selecting and reporting intraclass correlation coefficients for reliability research. J Chiropr Med 2016;15:155–163.
- McGraw KO, Wong SP. Forming inferences about some intraclass correlation coefficients. Psychol Methods 1996;1:30–46.
- Shrout PE, Fleiss JL. Intraclass correlations: uses in assessing rater reliability. Psychol Bull 1979;86:420–428.
