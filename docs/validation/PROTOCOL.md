# EyeVio home vision tests — validation study protocol

Version 2.0 (draft for ethics review and preregistration). Analysis code: `eyevio/app/utils/agreement.py`, `eyevio/app/utils/validation_study.py`, `scripts/validation_export.py`, `scripts/validation_analyze.py`.

EyeVio is a research and educational prototype. It has not been clinically validated, reviewed, cleared, or approved as a medical device. This study measures how its test results relate to clinical measurements; it does not assess diagnostic accuracy for any disease, and no participant's care depends on an app result.

## 1. Aims

1. **Agreement (same quantity).** How closely do the app's visual acuity and near point of convergence (NPC) results agree with the standard clinical measurement of the same quantity? Reported as Bland–Altman bias and 95% limits of agreement (LoA), and ICC(A,1).
2. **Convergent validity (different quantities).** How strongly is the app's qCSF contrast sensitivity at 1 c/deg associated with the Pelli–Robson letter chart? Reported as correlation only. See section 5.
3. **Repeatability.** How much does each app result change between two sessions when nothing has changed? Reported as within-subject SD (s_w), coefficient of repeatability (CoR) and test–retest ICC(A,1). **For qCSF this is the primary evaluation.** The measured s_w replaces the provisional priors in `METRICS` in `eyevio/app/utils/change_detection.py`.
4. **Testability.** What share of attempted app tests produce a usable result? Calibration failures, unreliable runs and abandoned attempts are recorded and reported, not silently excluded.

Adults and children are separate study arms, analysed and reported separately and never pooled (section 3).

## 2. Design

A prospective method-comparison study with a test–retest arm.

- **Visit 1 (clinic):** reference tests by an examiner, and the app tests done by the participant on their own device.
- **Visit 2 (home):** the app tests are repeated 1–7 days later, with the same device and the same correction, and the time of day within ±2 h of visit 1 (recorded; not an exclusion).

**Randomisation.** Before enrolment, a computer-generated sequence (block size 4, stratified by arm) allocates each participant:
- **method order** at visit 1: app first or reference first;
- **app test order**: a random permutation of the app tests, used at both visits.

The allocation is recorded in `participants.csv` (`test_order`) before the participant is seen. The person running the visit does not generate the sequence.

**Masking.** The examiner doing the reference tests does not see the app results. The participant is not shown the reference results until the end of visit 2.

## 3. Participants

### Adult arm (primary)

- **Inclusion:** age ≥ 18; can use a smartphone, tablet or computer with a camera; reads the instructions in the study language.
- **Exclusion:** any condition that prevents completing the tests, such as nystagmus or inability to hold fixation; dilated pupils or eye surgery within the last 4 weeks; photosensitive epilepsy (the glare test uses a bright screen).
- **Range of results:** ICC depends on how much results vary between participants. A sample of only healthy young adults makes ICC look poor even when agreement is good. Recruit so that **at least one third** have reduced vision. Clinic patients are suitable, for example with cataract, AMD, glaucoma, amblyopia, or habitual correction that is out of date. Also include about 10 people with a known colour vision deficiency so the colour thresholds have a real spread.
- **Sample size:** 60 analysable participants, recruiting 75 to allow for drop-out, failed tests and protocol exclusions.
  - **ICC:** with an expected ICC of 0.85 and k = 2, n = 55 gives a 95% CI about 0.15 wide (Bonett 2002).
  - **Limits of agreement:** n = 60 gives a 95% CI on each limit of about ±0.44 SD of the differences (Bland & Altman 1999).
  - **Correlation:** with n = 60 the lower 95% CI bound of Pearson r exceeds 0.50 when the observed r is about 0.67 or higher.

### Paediatric arm (separate)

- Starts only after the requirements in section 12 are met. No data from minors is collected before then.
- **Inclusion:** age 8–17 (the app's forced-choice tasks assume a child can follow on-screen instructions; the lower bound is reviewed in the paediatric addendum), plus the adult criteria above.
- **Sample size and targets** are set in a paediatric addendum before paediatric enrolment. Results from fewer than 30 analysable children are reported descriptively, without pass/fail judgements.
- Children are **never pooled** with adults. The analysis code splits the populations using `age_group` and reports the paediatric arm in its own section.

## 4. Correction, devices and environment

### Correction (glasses / contacts)

- Each participant uses their **habitual correction** throughout: unaided, glasses or contacts.
- **Same-correction rule:** the reference test, app visit 1 and app visit 2 must all use the same correction. The correction worn is recorded for every reference measurement (`reference_measurements.csv`, `correction`) and every app session (`sessions.csv`, `correction`).
- A pair with mismatched correction is excluded from the primary analysis and counted (section 7).

### Device and environment

Recorded for every app session in `sessions.csv`:

| Field | Example |
|---|---|
| `device_class` | phone, tablet, computer |
| `device_model` | iPhone 14 |
| `screen_diagonal_in`, `pixel_density_ppi` | 6.1, 460 |
| `browser`, `os` | Safari 19, iOS 20.1 |
| `camera` | front, built-in, external |
| `ambient_lux` | lux meter reading at the participant's eye position |

**Device-class analysis.** Agreement, correlation and repeatability are reported by device class when a class has at least 10 analysable pairs. These subgroup results are descriptive: the study is not powered to test differences between device classes.

## 5. Measurements

All monocular tests are done on each eye with the other eye covered by an occluder. Section 8 explains which eyes enter the analysis.

| `measure` (CSV) | App test (method version) | Reference | Comparison | `eye` values |
|---|---|---|---|---|
| `acuity_logmar` | Visual acuity, Sloan/ETDRS forced choice (v2) | ETDRS chart at 4 m, 80–320 cd/m² (ISO 8596), letter-by-letter scoring at 0.02 logMAR per letter, standard termination | Agreement | `right`, `left` |
| `npc_break_cm` | Near point of convergence, camera (v1) | RAF rule push-up with an accommodative target, about 1–2 cm/s. Break = reported doubling or seen loss of convergence. Mean of 3 trials, measured from the outer canthus | Agreement | `both` |
| `contrast_logcs_1cpd` | Contrast sensitivity, qCSF, logCS at 1 c/deg (v2) | Pelli–Robson chart at 1 m, 60–120 cd/m², letter-by-letter scoring at 0.05 logCS per letter (Elliott et al. 1991) | **Convergent** | `right`, `left` |
| `contrast_aulcsf` | qCSF AULCSF (v2) | none | Repeatability only | `right`, `left` |
| `glare_delta_logcs` | Glare Δ logCS (v2) | none | Repeatability only | `both` |
| `colour_protan_log10`, `colour_deutan_log10`, `colour_tritan_log10` | Colour thresholds (v2) | none. An anomaloscope or HRR result is a categorical reference and needs a diagnostic-accuracy analysis, not Bland–Altman | Repeatability only | `right`, `left` (`both` if the app was set to binocular; keep the same mode at both visits) |

### Why contrast is convergent validity, not agreement

The app's qCSF value at 1 c/deg is a threshold for a sine-wave grating of one spatial frequency. Pelli–Robson is a threshold for letters of one fixed size, which contain a band of spatial frequencies and also depend on letter recognition. The two measure related but different quantities. Bland–Altman bias and LoA, and ICC(A,1), would mix the real difference between the quantities with measurement error, so **no Bland–Altman analysis or ICC is computed between them**. The study reports their association (Pearson r and Spearman ρ with 95% CIs) as convergent validity, and evaluates qCSF primarily by its own test–retest repeatability.

Two routes would allow a true agreement study of contrast in a later version:
- an EyeVio Pelli–Robson-style **letter** contrast task, compared with the Pelli–Robson chart (same quantity); or
- the qCSF compared with a **validated CSF measurement system** at matched spatial frequencies.

### App sessions

App sessions follow the in-app instructions exactly as a user at home would, including the distance and lighting checks. Staff help only with logging in, and record each attempt in `sessions.csv`.

## 6. Timing

| Rule | Value | Enforced in analysis |
|---|---|---|
| Reference vs app visit 1 | Same visit; at most **24 h** apart (`MAX_REFERENCE_GAP_HOURS`) | Yes: pairs further apart are excluded and counted |
| App visit 1 vs visit 2 | **1–7 days** (`RETEST_MIN_DAYS`, `RETEST_MAX_DAYS`) | Yes: retest pairs outside the window are excluded and counted |
| Time of day, visit 2 | Within ±2 h of visit 1 | Recorded only |

When only a date is recorded, the gap is compared in calendar days.

## 7. Pre-defined exclusions and failures

Exclusions are fixed in this protocol and the analysis code before unblinding. Every exclusion is counted in the report.

**Participant level:**
- withdrawal (section 11): the participant is removed from every analysis;
- found after enrolment to meet an exclusion criterion.

**Pair level (a measure for one participant):**
- **at a test limit**, because those values are bounds rather than measurements: acuity at the chart floor; glare with the no-glare result at the ceiling; colour beyond the screen gamut; NPC with no break found;
- reference and app more than 24 h apart;
- correction mismatch between reference and app;
- retest outside the 1–7 day window.

**Not exclusions: failures.** Calibration failures, unreliable runs (for example failed catch trials or an app data-quality flag) and abandoned attempts are **testability outcomes**. Each is recorded in `sessions.csv` with `status` (`completed`, `calibration_failed`, `unreliable`, `abandoned`, `technical_failure`, `not_attempted`) and a `failure_reason`. They count against the completion rate (section 9) and are never dropped silently. If a participant has no usable app result for a measure, that is reported as missing with its reason.

Pairs with an unknown time gap or unknown correction are kept and counted, so missing paperwork is visible.

## 8. Eyes and within-person correlation

- **Primary analysis: one eye per participant**, so observations are independent. This is the right eye, or the left eye if the right eye has no usable result.
- **Binocular tests** (NPC, glare) contribute one value per participant.
- **Sensitivity analysis: both eyes.** The two eyes of one person are correlated, so ordinary CIs computed on all eyes are too narrow. With `--eye-policy all` the analysis adds **participant-cluster bootstrap CIs** (2000 resamples of participants, not eyes) for the bias, both limits of agreement and Pearson r.

## 9. Endpoints and pre-specified targets

| Measure | Comparison | Target |
|---|---|---|
| `acuity_logmar` | Agreement | Bias ≤ 0.05 logMAR; LoA half-width ≤ 0.15 logMAR; ICC(A,1) lower 95% CI ≥ 0.75; test–retest CoR ≤ 0.15 logMAR |
| `npc_break_cm` | Agreement | LoA half-width ≤ 4 cm; ICC(A,1) lower 95% CI ≥ 0.75; CoR ≤ 4 cm; bias reported only |
| `contrast_logcs_1cpd` | Convergent | Pearson r lower 95% CI ≥ 0.50; **CoR ≤ 0.30 logCS (primary for qCSF)** |
| `contrast_aulcsf` | Repeatability | CoR ≤ 0.20 (provisional) |
| Glare, colour | Repeatability | Reported without a target |
| Every app test | Testability | Completion rate with 95% Wilson CI; reported without a target in v2.0 |

- **Primary endpoint:** acuity agreement in adults, meaning all three acuity agreement targets are met.
- **Key secondary endpoint:** qCSF test–retest CoR at 1 c/deg in adults.
- Everything else is secondary.

The agreement targets sit at or inside the published test–retest variability of the reference tests themselves: ETDRS CoR about ±0.1–0.15 logMAR; Pelli–Robson CoR about ±0.15–0.2 logCS; RAF NPC repeatability about ±3–4 cm. The convergent target asks for at least a moderate association between two different contrast measures.

The targets and rules live in `MEASURES` and the constants at the top of `validation_study.py`. Change them only before unblinding, and record every change in section 14.

## 10. Analysis

All of this is computed by `scripts/validation_analyze.py`.

**Agreement** (acuity, NPC; app visit 1 vs reference):
- **Bland–Altman.** Difference = app − reference. Bias with a t-based 95% CI. LoA = bias ± 1.96·SD, with 95% CIs from Bland & Altman (1999).
- **Proportional bias.** Regress the difference on the mean.
- **Normality.** Shapiro–Wilk test on the differences.
- **ICC(A,1)** (two-way random, absolute agreement) with the McGraw & Wong (1996) CI. This is the primary ICC, because a constant offset between app and chart is a real disagreement. ICC(C,1) is reported alongside it. Interpret with Koo & Li (2016) bands, applied to the lower CI bound.

**Convergent validity** (contrast at 1 c/deg vs Pelli–Robson):
- Pearson r with a Fisher-z 95% CI; Spearman ρ with the Bonett & Wright (2000) CI;
- a scatter plot with a fitted line and **no identity line**, since the units are not interchangeable;
- no Bland–Altman, LoA or ICC.

**Repeatability** (app visit 1 vs visit 2):
- mean change with a 95% CI (a learning effect shows up here);
- s_w = √(Σd²/2n);
- CoR = 1.96·√2·s_w;
- ICC(A,1);
- a Bland–Altman plot of retest − test (same method, same quantity, so this is appropriate).

**Testability:** completed / attempted per app test, with a Wilson 95% CI, and counts by failure status and reason; also by device class.

**Subgroups:** device class (section 4). Adult and paediatric arms are reported in separate sections.

**If the differences are not normal or show proportional bias,** also report LoA on a log scale, or regression-based LoA (Bland & Altman 1999, section 3).

**Missing data:** complete-case analysis. Report how many participants are missing per measure, and why.

## 11. Ethics, consent and safety

The study needs approval from a human-participant review body (an ethics committee or IRB, or for a school project the review committee the school or fair requires) **before recruitment**.

**Consent and assent.**
- Adults give written informed consent.
- For each minor: written permission from a parent or legal guardian **and** the child's own assent, in age-appropriate language. A child's refusal is respected even if a parent has agreed.
- The consent version and date are recorded (`consent_type`, `consent_version`, `consent_date`, `assent_obtained`).

**Withdrawal.** Participants (or, for a minor, the child or the parent) can withdraw at any time without giving a reason and without any effect on their care. On withdrawal:
- no further data is collected;
- the participant is excluded from all analyses (`withdrawn_at` set; the export script skips them and the analysis counts them);
- data already collected is deleted unless the consent form explicitly allowed keeping it, and the participant agreed.

**Data protection and retention.**
- Data is pseudonymised: analysis files and the report carry participant IDs only.
- `participants.csv` maps IDs to app account emails. It is the re-identification key: store it apart from the study data, with restricted access, in `data/validation/` (gitignored) or an equivalent restricted store.
- Each participant has a `retain_until` date set by the approved retention period. After it, the key file and raw reference sheets are destroyed; only the pseudonymised dataset needed to reproduce the published analysis is kept, if the consent allows it.
- The participant's EyeVio account is theirs. Study staff do not access it beyond the export.

**Adverse events.** Expected risks are minor: eye strain, headache, discomfort from the bright glare stimulus, and frustration with difficult tasks.
- Before testing, screen for photosensitive epilepsy (an exclusion criterion).
- Stop a test if the participant reports discomfort; record it as `abandoned` with the reason.
- Record every adverse event (date, description, severity, action, outcome) and report serious or unexpected events to the review body within its required timeframe.

**Incidental findings.** If a reference test shows an unexpected result, the examiner refers the participant under the clinic's usual pathway. App results are never used to make or reassure about a referral.

## 12. Minors: requirements before any data is collected

A school project or science fair with child participants usually has its own human-participant rules, which may be stricter than this protocol. **Before collecting any data from minors**, confirm with the school and fair and document:

- [ ] which body must review the study (for example a school or fair IRB or scientific review committee) and that **written approval was obtained before** any recruitment or testing;
- [ ] the required forms for human-participant research and risk assessment, completed and signed;
- [ ] the parental permission and child assent forms, approved by that body;
- [ ] whether a qualified scientist, designated supervisor or eye care professional must supervise the testing, and who that is;
- [ ] any limits on recruiting classmates or other students, on incentives, and on collecting health information;
- [ ] the data-handling and retention rules the fair requires.

Keep the approvals and signed forms with the study file. If any item cannot be confirmed, the paediatric arm does not start.

## 13. Preregistration and running the analysis

### Preregistration

Before the first participant is enrolled, register the study publicly (for example on OSF Registries, or on a clinical trial registry if the review body requires it). The registration includes:
- this protocol version;
- the targets and exclusion rules in sections 6–9;
- the commit hash of the analysis code (`validation_study.py`, `agreement.py`, `validation_analyze.py`).

The final report lists every deviation from the registration with its reason.

### Running the analysis

1. Copy `docs/validation/templates/*.csv` to `data/validation/`, which is gitignored and never committed.
   - `participants.csv`: one row per participant. `participant_id` (P001…), app account email, age and `age_group` (`adult` / `paediatric`), consent and assent fields, the randomised `test_order`, `habitual_correction`, withdrawal and `retain_until`.
   - `reference_measurements.csv`: one row per reference value, with the `measure` and `eye` names from section 5, `measured_at`, `examiner` and the `correction` worn.
   - `sessions.csv`: one row per attempted app test per visit, with `visit` (1 or 2), `status`, `failure_reason`, `correction` and the device and environment fields from section 4.
2. Export the app results (the output contains participant IDs only; withdrawn participants are skipped). `--sessions-out` writes a draft `sessions.csv` from the stored attempts, including ones flagged unreliable; staff add the visit, correction, device details, and attempts that never reached the server:
   ```bash
   cd eyevio
   ./venv/bin/python ../scripts/validation_export.py \
     --participants ../data/validation/participants.csv \
     --out ../data/validation/app_results.csv --since 2026-10-01 \
     --sessions-out ../data/validation/sessions_draft.csv
   ```
3. Analyse:
   ```bash
   MPLCONFIGDIR=/tmp/mpl ./venv/bin/python ../scripts/validation_analyze.py \
     --app ../data/validation/app_results.csv \
     --reference ../data/validation/reference_measurements.csv \
     --participants ../data/validation/participants.csv \
     --sessions ../data/validation/sessions.csv \
     --out ../docs/validation/results
   # sensitivity analysis on both eyes, with participant-cluster bootstrap CIs:
   ... --eye-policy all --out ../docs/validation/results_both_eyes
   ```
   This writes `report.md` (population, testability, agreement, convergent validity, repeatability, exclusions, device classes, and the paediatric arm), `results.json` (every statistic plus the paired values) and `plots/`.
4. Dry run without data: `--simulate 60 --out /tmp/validation_demo` writes the same outputs from synthetic participants, sessions and failures, labelled SIMULATED.
5. Feed back. If a measured test–retest s_w is larger than the prior in `change_detection.METRICS`, update the prior and record the study as its source.

## 14. Changes from version 1.0

- Contrast at 1 c/deg vs Pelli–Robson changed from agreement (Bland–Altman, ICC) to convergent validity (correlation only). qCSF repeatability is now the key secondary endpoint.
- Added: randomised app test order; correction recording and the same-correction rule; device and environment recording with device-class analysis; time-gap and retest-window rules; a full list of pre-defined exclusions; failures recorded as testability outcomes; participant-cluster bootstrap for the both-eyes analysis; a separate paediatric arm; preregistration; consent, assent, withdrawal, retention and adverse-event procedures; the minors checklist.
- Recruitment target raised from 70 to 75 to allow for failed tests.

## References

- Bland JM, Altman DG. Statistical methods for assessing agreement between two methods of clinical measurement. Lancet 1986;1:307–310.
- Bland JM, Altman DG. Measuring agreement in method comparison studies. Stat Methods Med Res 1999;8:135–160.
- Bonett DG. Sample size requirements for estimating intraclass correlations with desired precision. Stat Med 2002;21:1331–1335.
- Bonett DG, Wright TA. Sample size requirements for estimating Pearson, Kendall and Spearman correlations. Psychometrika 2000;65:23–28.
- Elliott DB, Bullimore MA, Bailey IL. Improving the reliability of the Pelli-Robson contrast sensitivity test. Clin Vis Sci 1991;6:471–475.
- Koo TK, Li MY. A guideline of selecting and reporting intraclass correlation coefficients for reliability research. J Chiropr Med 2016;15:155–163.
- McGraw KO, Wong SP. Forming inferences about some intraclass correlation coefficients. Psychol Methods 1996;1:30–46.
- Newcombe RG. Two-sided confidence intervals for the single proportion: comparison of seven methods. Stat Med 1998;17:857–872.
- Shrout PE, Fleiss JL. Intraclass correlations: uses in assessing rater reliability. Psychol Bull 1979;86:420–428.
