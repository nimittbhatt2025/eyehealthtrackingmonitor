# Science fair project: does a web-browser acuity test agree with a clinical eye chart?

_The experiment is one test: EyeVio's Clear Vision Test (visual acuity) compared with a clinical ETDRS chart. The rest of EyeVio is the platform the test runs in. It is mentioned once, as context, and no claims are made about it._

---

## 1. Question

**When adults measure their own visual acuity with a calibrated browser test on their own device, how closely does the result agree with a clinical ETDRS chart, and how repeatable is it?**

**Why it matters:** home acuity tests are increasingly used for remote follow-up. Published home ETDRS methods show that standardized home testing can agree reasonably with clinical ETDRS, but the result depends on the specific protocol and population. So every new test has to be measured, not assumed.

## 2. Hypotheses (fixed before data collection)

Taken from the study protocol, section 9 (`docs/validation/PROTOCOL.md`):

| | Hypothesis | Pre-specified target |
|---|---|---|
| H1 | The app agrees with ETDRS | Bias ≤ 0.05 logMAR **and** 95% limits-of-agreement half-width ≤ 0.15 logMAR **and** ICC(A,1) lower 95% CI ≥ 0.75 |
| H2 | The app is repeatable | Test–retest coefficient of repeatability (CoR) ≤ 0.15 logMAR |
| — | Testability (reported, no target) | Share of attempted tests that give a usable result, with 95% CI |

The targets sit inside the published test–retest variability of the ETDRS chart itself (about ±0.10–0.15 logMAR).
- **A miss is still a result.** Missing a target is reported as plainly as meeting it.
- **The targets don't move** after data is seen.

## 3. Variables and controls

| | |
|---|---|
| Independent variable | Measurement method: app vs ETDRS chart (agreement); app visit 1 vs app visit 2 (repeatability) |
| Dependent variable | Visual acuity in logMAR, one eye per participant (right eye unless it has no usable result) |
| Controls | Same correction (glasses, contacts or none) for every measurement; reference and app within 24 h; retest 1–7 days later on the same device; chart luminance 80–320 cd/m²; one eye covered with an occluder |
| Bias protection | Randomised order of app and chart (stratified by phone vs computer); the examiner doesn't see app results; the participant doesn't see chart results until the end; the app never shows right or wrong answers; a new random chart every session |

## 4. What I built for this experiment

These are the parts of EyeVio the experiment depends on (details: `docs/APPLICATION_CAPABILITIES.md` Section 4.2).
- **Calibrated letter size:**
  - The user matches an on-screen card to a bank card, so each letter is drawn at 5 arcmin × 10^logMAR in real millimetres.
  - The smallest row the screen can draw (at least 5 pixels per letter) is the chart floor.
  - Results at the floor are reported as "this or better" and excluded from agreement.
- **Viewing distance (1 m):**
  - The camera estimates distance from typical eye spacing, so it is an estimate, not the user's own measurement.
  - Alternatively, the user measures 1 m by hand. The method used is saved with every result.
- **ETDRS-style procedure:**
  - Sloan letters, five per row in a crowding frame, in 0.1 logMAR rows.
  - Forced choice, with a base row (at least 4 of 5 correct) and a stopping rule (1 or fewer correct).
  - Letter-by-letter scoring at 0.02 logMAR per letter.
- **Non-repeating charts:** a seeded random generator (the seed is saved, so the chart can be reproduced), with no repeated rows within a session or across recent sessions.
- **Tests of the test:**
  - Simulated observers check the scoring and stopping rule.
  - Chart tests check the randomisation and no-repeat rules (`tests/acuityChart.test.mjs`).
  - Pixel-level golden-image tests cover the Tumbling E. The Sloan letters don't have them yet; add them before data collection.
  - An analysis pipeline computes every statistic in section 6 and was dry-run on synthetic data before any real data exists.

## 5. Method

Full protocol: `docs/validation/PROTOCOL.md` (version 2.0), run as **stage 1: acuity only**.

- **Approval first:** written approval from the review body the school or fair requires (IRB or scientific review committee) **before** any recruitment. Adults only, unless the minors checklist in protocol section 12 is fully met.
- **Participants:**
  - Target 60 analysable adults (recruit 75).
  - At least one third with reduced vision, so the results have a real spread.
  - At least 25 phone users and 25 computer users.
- **Visit 1, about 20 minutes:**
  - informed consent;
  - ETDRS chart at 4 m by an examiner;
  - the app at 1 m on the participant's own device;
  - order randomised.
- **Visit 2 (home), about 5 minutes, 1–7 days later:** the app again, same device, same correction.
- **Records:** correction, device, browser, screen size and room light for every session. Every failed, unreliable or abandoned attempt is recorded as a testability outcome, never dropped.
- **Pre-defined exclusions** (counted in the report):
  - result at the chart floor;
  - more than 24 h between chart and app;
  - mismatched correction;
  - retest outside 1–7 days;
  - withdrawal.

## 6. Analysis

Run with `scripts/validation_analyze.py --measures acuity_logmar` (protocol section 13).

- **Agreement:**
  - Bland–Altman bias and 95% limits of agreement, with CIs;
  - a proportional-bias check;
  - ICC(A,1) for absolute agreement, since a constant offset is a real disagreement.

  Correlation alone is not used: two methods can correlate strongly and still disagree.
- **Repeatability:**
  - within-subject SD (s_w);
  - CoR = 1.96·√2·s_w;
  - mean change between visits, which would show a learning effect.
- **Eyes:** one eye per person in the main analysis, because a person's two eyes are correlated. A both-eyes sensitivity analysis uses participant-cluster bootstrap CIs.
- **Subgroups:** phone vs computer, descriptive only.
- **Interim rule:** with fewer than 60 analysable adults at the judging deadline, the result is presented as an **interim** analysis with all CIs, and the targets are applied exactly as written.

## 7. Results

**Not collected yet.** This section is filled in from `docs/validation/results/report.md` after the study. Simulated output from the dry run is **never** shown as a result.

| | Value [95% CI] | Target | Met? |
|---|---|---|---|
| n analysable (agreement / retest) | | ≥ 60 | |
| Bias (app − chart), logMAR | | ≤ 0.05 | |
| Limits of agreement, logMAR | | half-width ≤ 0.15 | |
| ICC(A,1) | | lower CI ≥ 0.75 | |
| CoR, logMAR | | ≤ 0.15 | |
| Completion rate | | reported | |

Figures to include: the Bland–Altman plot (app − chart), the test–retest Bland–Altman plot, and testability by device class.

## 8. Limitations (stated up front)

- Device-dependent: pixel density, screen size and card calibration all affect the smallest drawable row. Very good eyes can hit the chart floor.
- The 1 m distance is estimated from typical eye spacing or measured by hand; it is not measured precisely during every trial.
- The app is at 1 m and the chart at 4 m, so accommodation differs; the comparison measures agreement of the two procedures as used.
- Adults only; results don't transfer to children.
- Agreement with a chart is not diagnostic accuracy. EyeVio is an unvalidated research and educational prototype and is not used to diagnose, exclude, monitor or treat any eye condition.

## 9. Before judging: checklist and timeline

| Weeks | Step | Done |
|---|---|---|
| 1–2 | Review-body approval; consent form; find a qualified supervisor or eye care professional to run the chart | ☐ |
| 2 | Preregister on OSF (protocol v2.0, stage 1, interim rule, commit hash of the analysis code) | ☐ |
| 2 | Equipment: ETDRS chart (4 m), light meter, occluder, tape measure; randomisation list generated by someone other than the examiner | ☐ |
| 3–6 | Recruit and run visit 1 and visit 2; log sessions in `sessions.csv` | ☐ |
| 7 | Export, analyse, write results; list every deviation from the preregistration | ☐ |
| 8 | Board and practice | ☐ |

**Minimum before judging:** the acuity reference comparison (H1) and the retest (H2) completed and analysed, even if interim. No result means no accuracy claim on the board.

## 10. Board outline

1. **Question and why it matters** (one sentence each).
2. **Hypotheses with the numbers**, fixed in advance.
3. **How the test works:** card calibration, letter size from visual angle, forced choice, scoring. One picture of the chart.
4. **Method:** flow diagram of visit 1 and visit 2, randomisation, masking, exclusions.
5. **Results:** Bland–Altman plot, retest plot, the table from section 7 with ✓/✗.
6. **Limitations and what's next:** NPC and contrast in stage 2, a letter-contrast task, screen photometry.
7. **Context:** one small panel, "The test runs inside EyeVio, a research prototype with other experimental tests that are not part of this experiment."

## 11. Questions judges are likely to ask

- **Why acuity?** It's the most standardised vision measurement, with a clear reference (ETDRS) and published variability to compare against.
- **Why not just correlation?** Correlation measures association, not agreement; Bland–Altman shows how far apart the two numbers can be for one person.
- **What if the targets are missed?** Then that is the finding, with the CIs showing by how much, and the limitations explain likely causes, for example screen resolution or distance error.
- **Does the app diagnose anything?** No. It's an unvalidated research and educational prototype; the study measures agreement only.
- **What about the AI photo models?** They're not part of this experiment. They learned dataset shortcuts, so their outputs are withheld from users and shown only in a research lab page.
- **What did you build vs use?** Built: the acuity procedure, calibration, chart randomisation, scoring, tests and the analysis pipeline. Used: React, MediaPipe face landmarks for the distance estimate, and standard statistics methods (Bland & Altman 1986, 1999; McGraw & Wong 1996).
