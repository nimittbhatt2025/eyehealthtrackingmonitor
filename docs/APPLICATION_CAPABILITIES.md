# EyeVio — Product Document

_Last updated October 1, 2026. Describes the product as built, compiled from the source code in `eyevio-frontend/` (web app) and `eyevio/` (API). Change history is in Appendix A._

---

## 1. Overview

EyeVio is a browser-based app for **tracking eye health and doing home screening checks**. People take interactive vision tests, photograph their eyes, log daily habits and follow their results over time. The app detects reliable changes, sends alerts, and produces a one-page summary to show an eye doctor.

**Tagline:** Track. Predict. Protect your vision.

**Who it is for**
- Adults who want to monitor their eyes between exams: screen workers, glasses and contact-lens wearers, and older adults.
- Parents tracking a child's myopia and screen and outdoor habits.
- Caregivers looking after a family member's eye-health routine.

**Positioning.** EyeVio is **wellness and educational software, not a medical device**. The framing is written with the FDA's software-as-a-medical-device (SaMD) guidance in mind; see `utils/samd.js` and the `SamdDisclaimer` component. Every test and photo result says "screening only — not a diagnosis" and points to a professional eye exam rather than making a clinical claim.

**Product principles**
1. **Each test reports in its own units.** For example, acuity is in logMAR, contrast in AULCSF or logCS, glare in Δ logCS, colour as thresholds and NPC in centimetres. There is no combined 0–100 "vision score", because averaging tests measured in different units means nothing.
2. **A change must beat the test's own noise.** Change alerts use a Reliable Change Index and need two confirming sessions. Trends are drawn with confidence and prediction intervals.
3. **Honest output.** Results that sit at a test's limit say so. Image models say "cannot assess" when a photo is unlike their training data. Nothing is reported as more certain than it is.
4. **Private by default.** Eye photos are analysed on the device, and only numbers are sent to the server.
5. **Physically correct stimuli.** Stimuli are drawn at their true size after calibrating the screen against a bank card. Viewing distance is monitored by the camera. Every rendered stimulus has a pixel-level regression test.

---

## 2. Product map

| Area | Screen | Route |
|---|---|---|
| Public | Landing page, log in, register | `/`, `/login`, `/register` |
| Setup | Onboarding questionnaire, distance calibration, blink calibration | `/onboarding`, `/calibration`, `/calibrate-blink` |
| Home | Dashboard | `/dashboard` |
| Testing | Vision tests hub and 12 tests (Section 4), result detail pages | `/vision-tests`, `/vision-tests/<test>`, `/test-details/<id>` |
| Camera and photos | Eye Tracking Analysis, Eye Health Photo Monitor, Lens Photo Timeline | `/eye-tracking-analysis`, `/eye-health-monitor`, `/cataract-opacity-monitor` |
| Tracking | Trends, Lifestyle log, Alerts, Reports | `/trends`, `/lifestyle`, `/alerts`, `/reports` |
| Family | Myopia Progression, Family & caregivers, Digital Wellbeing | `/myopia`, `/family`, `/digital-wellbeing` |
| Learn and engage | Eye Conditions Library, chatbot (on every page), Help, Achievements, Community | `/eye-conditions`, `/help`, `/achievements`, `/community` |
| Account | Profile, Settings | `/profile`, `/settings` |

Old routes redirect: `/webcam` → `/eye-tracking-analysis`, `/blink-calibration` → `/calibrate-blink`, `/vision-tests/glaucoma_neural` → `/vision-tests/side_vision`.

**Keyboard shortcuts:**
- `?` shows the list.
- `n` starts a new test.
- `/` focuses search.
- Navigation uses `g` followed by a letter: `g d` dashboard, `g t` tests, `g r` trends, `g e` eye tracking, `g l` lifestyle, `g a` achievements, `g c` community, `g s` settings, `g h` help, `g p` profile.

---

## 3. User journey

1. **Sign up and log in** with email and password. The session uses JWT access and refresh tokens.
2. **Onboarding questionnaire:** eye-health history, glasses or contacts, daily habits (screen, sleep, outdoor time), goals, test frequency, notification preferences and units. The answers fill in the profile.
3. **Calibration:**
   - **Screen scale:** the user matches an on-screen card to a bank card (85.6 mm), so stimuli are drawn at their true physical size.
   - **Viewing distance:** estimated from the distance between the pupils. The acuity and contrast tests monitor it continuously; the Amsler test checks it once at the start.
   - **Blink thresholds:** optional personal calibration.
4. **Dashboard:**
   - change checks per test: confirmed change, "retest to confirm", or stable;
   - number of tests tracked, active alerts and a monthly summary;
   - quick actions (take a test, eye tracking, photo monitors), shareable reports and the clinician one-pager.
5. **Ongoing use:** take tests, capture photos, log habits, review trends, receive alerts and earn achievements.

---

## 4. Vision tests

### 4.1 Summary

All 12 tests share a side-by-side layout, with the stimulus on the left and the answers on the right, and no page scrolling. Each one saves its result to the server, explains it in plain language and shows the screening disclaimer. Each result stores a `method` and `method_version` in `test_details`, and change detection only compares results with the same version.

| Test (in-app name) | Route | Measures | Native unit |
|---|---|---|---|
| Clear Vision Test | `/vision-tests/visual_acuity` | Distance visual acuity, each eye | logMAR |
| Color Vision Test | `/vision-tests/color_vision` | Colour discrimination on protan, deutan and tritan axes | u′v′ threshold (× 10⁻⁴) |
| Straight-Line Test | `/vision-tests/amsler_grid` | Central distortion (Amsler grid) and line-alignment hyperacuity | area in square degrees; arcseconds |
| Faint Shapes Test | `/vision-tests/contrast_sensitivity` | Full contrast sensitivity curve | AULCSF; logCS at 1/3/6/12 c/deg |
| Side Vision Test | `/vision-tests/side_vision` | Relative sensitivity of the four corners of side vision | inter-quadrant asymmetry (log units) |
| Glare Test | `/vision-tests/cataract_glare` | Contrast lost under glare | Δ logCS |
| Dry Eye Check | `/vision-tests/dry_eye` | Symptoms, tear-stability proxy, redness | OSDI 0–100; seconds; grade 0–4 |
| Eye Glow Test | `/vision-tests/red_reflex` | Left/right symmetry of the red reflex (phone only) | symmetry 0–100 |
| Near Blur Tolerance | `/vision-tests/accommodative_lag` | How long near text stays clear before blur | index 0–100 |
| Convergence Near Point | `/vision-tests/near_point_convergence` | Closest distance both eyes keep a target single | cm |
| Side Vision Game | `/vision-tests/peripheral_awareness` | Side awareness and reaction time against distance from centre | % per degree; ms per degree |
| Posture & Lighting Check | `/vision-tests/ocular_ergonomics` | Screen distance, glare, blink rate, breaks | alerts; blinks/min |

**Shared infrastructure**
- **Distance:** a card-calibrated screen scale (`eyevio_screen_px_per_mm`) and a camera distance check based on pupil distance.
  - The acuity and contrast tests monitor distance continuously, switching to face width when one eye is covered, and pause when it drifts by more than 10%.
  - The Amsler test checks distance once at the start.
- **One-eye tests:** an eye-cover check (MediaPipe Face Mesh plus Hands) confirms the correct eye is covered, and a glasses/contacts check runs alongside.
- **Voice answers** through the Web Speech API in the acuity and glare tests, where the browser supports it.
- **Shared psychophysics code:**
  - `utils/psychophysics.js`: QUEST staircase, Weibull psychometric function, gamma-linearised and dithered canvas drawing;
  - `utils/qcsf.js`, `utils/vernier.js` (Psi method) and `utils/colorThreshold.js`.
- **History and statistics:** test history, per-test detail pages (line-by-line performance, response-time patterns, progress over time) and `GET /api/vision-test/stats`.

### 4.2 Clear Vision Test — visual acuity

Methods: `etdrs_sloan_letter_by_letter`, `etdrs_hotv_letter_by_letter` and `etdrs_tumbling_e`, all version 2.

**Chart**
- **Charts on offer:** Sloan letters (C D H K N O R S V Z) for adults; HOTV (H, O, T, V) for children of about 3–7 who can name or point; and Tumbling E (up, down, left, right).
- **Drawing:** symbols are SVG on a 5×5 grid, with stroke width one-fifth of the height.
- **Rows:** five symbols per row with letter-width spacing inside a crowding-bar frame. Rows go in 0.1 logMAR steps at 1 m.
- **Size:** each symbol is 5 arcminutes × 10^logMAR, converted to pixels with the card-calibrated scale. Without calibration a 96-dpi default is used and the result is marked as unmeasured.
- **Chart floor:** the smallest row with at least 5 device pixels per letter. Results at the floor are reported as "this or better".

**Procedure**
- Forced choice: the user names each symbol in turn and guesses when unsure. Right and wrong are never shown.
- The test starts at 0.6 logMAR, moves up until a row has at least 4 correct, then moves down until the stop rule is met.

**Scoring**
- logMAR = (base row + 0.1) − 0.02 × every symbol correct on the base row and smaller rows.
- **Four-choice charts (HOTV and E):** each row's count is guess-corrected, (c − 1.25) / 0.75 floored at 0, before the per-symbol credit. The eye stops at 2 or fewer of 5 correct, instead of 1 or fewer for Sloan. In simulation, a child who only guesses scores near the top of the chart (about 1.0 logMAR).

**Children's mode**
- Answer buttons act as a matching card, so a helper can tap what the child names or points to.
- Tumbling E also accepts arrow keys and voice.
- An age band (3–5, 6–8, 9–12, 13+) scales the distance monitor's pupil-distance baseline to that age's median eye spacing (50, 53, 56 or 63 mm). Without this, a 5-year-old would sit at about 80 cm instead of 1 m and read about one line too good.

**Result page:** says that home results typically read 0.05–0.1 logMAR worse than a clinic chart.

### 4.3 Color Vision Test — confusion-axis thresholds

Method: `confusion_axis_threshold_4afc`, version 2.

**Display check (before the test)**
- **Blocks** the test when the browser reports forced colours, inverted colours or a monochrome display.
- **Warns** about increased-contrast mode, wide-gamut (P3) or HDR screens, and evening use.
- **Requires a 3-item checklist,** with instructions per platform: Night Shift / Night Light off, True Tone / adaptive colour off, brightness at about 75%.

**Stimulus**
- A Landolt C made of Poisson-disk dots on dark grey.
- Each dot gets one of 6 random luminances, so the ring can only be found by colour, not brightness.
- Per-dot stochastic rounding gives colour steps finer than 8 bits.
- **Colour space:** CIE 1976 u′v′ with a D65 white point. The ring moves from white along each confusion axis, towards its copunctal point: protan (0.678, 0.501), deutan (−1.217, 0.782), tritan (0.257, 0). For each axis the screen's maximum displacement inside the sRGB gamut is found.

**Procedure**
- The user reports the gap direction from 4 choices.
- There are 2 practice trials, and the first trial on each axis is shown at maximum.
- "I can't see it" (or Space) records a random direction flagged `unseen`, which keeps the 25% guess rate the staircase assumes.
- **Staircase:** QUEST on −log10(u′v′ distance), with prior 2.2 ± 0.7, slope 3.5, guess rate 0.25 and lapse rate 0.03. It runs 12 trials per axis when both eyes are tested together, or 10 per axis per eye.

**Output**
- A threshold per axis, compared with typical upper limits of 100 (protan), 100 (deutan) and 150 (tritan) × 10⁻⁴.
- A threshold at the screen's gamut limit is flagged "beyond what this screen can show".
- A pattern label: `none`, `red_green` (with the leading axis), `tritan`, `generalised` or `unreliable`.
- **Score:** the worst axis, falling in log units from the typical limit to the gamut limit.
- No severity labels are given.

### 4.4 Straight-Line Test — Amsler grid and line alignment

Method: `amsler_multicontrast_vernier`, version 2.

**Grid**
- 20°×20° (20 cells of 1°) at 35.5 cm, sized from the card calibration.
- Shown first at full contrast, then at 5% contrast after a 5-second fixation countdown. Defects appear about 4× larger at low contrast.
- The user answers "Grid looks normal" or "I see distortions" and marks the affected areas. Marked areas are converted to square degrees on a 40×40 lattice.
- One eye at a time.

**Line alignment (vernier hyperacuity)** — `components/VernierTask.jsx`, `utils/vernier.js`
- **Stimulus:** two vertical segments, 30′ long with a 4′ gap, flashed for 300 ms. Lines have a Gaussian profile and are gamma-linearised, so offsets far below one pixel can be drawn.
- **Answers:** "Lower line is left", "Looks aligned" or "Lower line is right" (keys ←, ↓ or space, →).
  - "Looks aligned" counts as half a left and half a right answer. It favours a bias near that offset without pushing the estimate either way.
  - After each answer the chosen button stays highlighted and "✓ Answer recorded" shows for 0.6 s before the next pair. Later pairs look identical, so without this feedback answers seemed to be ignored.
  - A progress bar and a step-specific prompt show where the user is.
- **Layout:** five locations, the centre (12 trials) and 2° up, down, left and right (8 trials each). There are 3 practice trials with feedback, at +8′, −8′ and +6′.
- "Skip this part" is available throughout.
- **Estimation:** the Psi method (Kontsevich & Tyler) per location, estimating a bias (perceived misalignment, in arcseconds) and a threshold.
- **Flags:**
  - Bias: |bias| > max(60″, 1.5 × threshold) and more than 2 × its uncertainty.
  - Threshold: a spot more than 3× the median of the other parafoveal spots.
  - In simulation there were no false flags, and a 90″ distortion was caught 79% of the time.

**Score per eye**
- Distortion marked at full contrast: max(20, 50 − area/4).
- Distortion marked only at low contrast: max(50, 80 − area/4).
- Any vernier flag caps the score at 85.
- The test reports the worse eye.

### 4.5 Faint Shapes Test — contrast sensitivity (qCSF)

Method: `qcsf_4afc_grating`, version 2.

- **Stimulus:** a 5°-wide soft-edged sine grating at 1 m, card-calibrated and distance-monitored. The user picks the stripe direction from 4 choices, after 2 practice trials.
- **Method:** quick CSF (Lesmes et al., 2010).
  - The curve is a truncated log-parabola with four parameters: peak sensitivity, peak frequency, bandwidth and low-frequency truncation.
  - A posterior over a parameter grid is updated after every trial, and the next frequency × contrast is drawn from the top 10% by expected information gain.
  - 25 trials per eye.
- **Frequencies:** 0.5–24 c/deg, limited to what the screen can draw at 1 m.
- **Rendering:** gamma-linearised sRGB with random dithering, so contrasts below one 8-bit step average out correctly.
- **Output:**
  - the full curve with uncertainty, AULCSF, the peak and the cut-off frequency;
  - logCS at 1, 3, 6 and 12 c/deg;
  - plain text on whether a loss is at fine detail only or also at coarse detail.
- **Score:** AULCSF as a percentage of an approximate healthy young-adult curve (peak logCS 2.1 at 3 c/deg), capped at 100 and averaged across eyes.

### 4.6 Side Vision Test — four-corner comparison

Method: `dual_task_quadrant_quest`, version 1. No camera is used.

**Each trial**
- A central digit (2, 3, 5 or 7) and a faint Gaussian blob in one corner flash together for 200 ms.
- The user answers two fixed questions in order:
  - **Step 1:** which number appeared. A wrong digit counts as a fixation loss.
  - **Step 2:** which corner had a spot, or "No spot".
- The screen explains that often there is no spot, or it is too faint to see.

**Session**
- Two unscored practice rounds with feedback come first: one clear spot and one with no spot.
- Right eye, then left. Each eye gets 32 trials: a QUEST staircase of 6 trials per quadrant, plus 4 false-positive catch trials (no blob) and 4 false-negative catch trials (about 80% contrast).
- **Reliability:** a session is unreliable if fixation losses exceed 20%, or false positives or false negatives exceed 1 in 4. Unreliable sessions are shown but not saved.

**Output:** relative asymmetry between quadrants only, never a sensitivity or dB value. It is not a visual-field exam or a glaucoma screen.

### 4.7 Glare Test — contrast loss under glare

Method: `quest_4afc_delta_logcs`, version 2.

**Glare source**
- An on-screen bright ring (simulated veiling luminance), or
- a phone torch about 30° off-axis, which must be placed in the same spot each time.

**Procedure**
- Two QUEST staircases, without and with glare, each of 10 trials, picking grating orientation from 4 choices. They start after 2 practice trials.
- Screen mode interleaves the two conditions; torch mode runs the no-glare block first.
- Both staircases start from the same prior (1.5 ± 0.6 logCS). A lower prior for the glare condition would build a loss into the result before any answer.
- The direction never repeats from one trial to the next. Voice answers are supported.

**Result: Δ logCS = logCS(no glare) − logCS(glare)**
- **Glare score** (0–100, higher is better) is the headline: Δ 0 → 100, Δ ≥ 0.5 → 0.
- A plain sentence follows, for example "With glare on you needed 1.6× the contrast" (10^Δ), then Δ itself and both thresholds.
- **Bands:** little loss (Δ < 0.15), moderate (< 0.3), large (≥ 0.3), and "low contrast sensitivity even without glare" when the no-glare result is below 1.2 logCS.
- **Test limit:** a threshold at or above 2.05 logCS means the staircase ran out of room (its grid tops out at 2.2).
  - If both conditions hit it, the result is "No measurable contrast loss under glare", and the user is told their sensitivity may be even better.
  - If only the no-glare result hits it, the page notes that the true loss may be slightly larger.
  - Both cases are saved as `ceiling_no_glare` and `ceiling_glare`.
- **Low confidence** is flagged when either staircase's SD exceeds 0.3.

### 4.8 Dry Eye Check

Method: `osdi12_tear_proxy_wb_photo`, version 2.

- **Questionnaire:** the full 12-item OSDI, with N/A allowed on the function and environment items. It is scored only when the core symptom items are complete, and the three subscales are kept.
- **Tear stability:** 30 s of natural reading gives blink rate and inter-blink interval. Three "hold your eyes open until blurry" trials give a median break-up proxy: under 5 s is short, under 10 s borderline.
- **Photo:**
  - The browser is asked to lock white balance and exposure after 1.5 s, where supported.
  - Frame colour is normalised to a reference face chroma before sclera redness is measured.
  - Redness is binned into an approximate Efron-style 0–4 grade.
  - The photo is analysed on the device by default (Section 5.2).
- **Combined score:** questionnaire 40%, photo 40% and tear stability 20%, or 50/50 when the tear step is skipped.

### 4.9 Eye Glow Test — red reflex symmetry

Method: `phone_rear_torch_bruckner_symmetry`, version 2. Phone only: it needs the rear camera, a dark room and a helper about 1 m away. It refuses to run on a laptop or front camera, because without a light next to the lens a normal result means nothing.

**Capture**
- The torch is switched on through `MediaStreamTrack` where supported. Where it isn't (for example iPhone Safari), the user confirms that a second light is held beside the lens.
- The helper frames the face at 70–130 cm, estimated from pupil distance.
- Exposure is locked, the torch goes off for 3 s so the pupils widen, then 10 frames are captured within about 0.8 s.

**Analysis**
- Iris landmarks are found on each full-resolution crop, and a circle at 40% of the iris radius is sampled.
- The brightest 10% of pixels (the corneal glint) are dropped.
- Per-eye median luminance, red chroma and white-pixel fraction are computed across frames.

**Output**
- A symmetry score from 0 to 100, with flag thresholds of brightness 25%, red chroma 0.08 and white fraction 0.25.
- A one-sided white reflex caps the score at 30. The user is advised to retake, then to see an eye doctor promptly if it repeats, especially for a child.
- With no reflex in either eye, the session is "not scored" and nothing is saved.

### 4.10 Near Blur Tolerance

Route and `test_type`: `accommodative_lag`.

- A near target blurs gradually. The test scores when the user loses clarity, and suggests breaks.
- It measures blur tolerance and focusing fatigue, not accommodative lag, which is why it was renamed. The page links to the Convergence Near Point test.

### 4.11 Convergence Near Point (NPC)

Method: `camera_npc_face_approach`, version 1.

- **Distance:** a 1.2 s baseline from pupil distance. During the approach, distance = baseline × (baseline eye-corner span ÷ current span).
- **Vergence:** tracked as pupil separation ÷ outer eye-corner span. A break is a rebound of at least 0.02 above the running minimum.
- **Reported NPC:** the larger of the user's "doubled" key press and the camera-detected break.
- **Fatigue:** two approaches are run. A break that recedes by 2 cm or more on the second approach is flagged.
- **Score:** 6 cm or closer → 100, 20 cm or farther → 0.

### 4.12 Side Vision Game — peripheral awareness

Method: `eccentricity_psychometric`, version 2.

- **Gameplay:** a "whack-a-mole" tap game with a centre-fixation check. Targets spawn at random radii between a safe zone and the edge, with ±15° direction jitter.
- **Hit-rate curve:** P(hit) = 0.97 / (1 + exp((ecc − e50) / spread)), fitted by maximum likelihood. It reports the mean slope in % per degree, and e50, the eccentricity where catch rate falls to 50%.
- **Reaction time:** a Theil–Sen line of reaction time against eccentricity (ms per degree), plus the median reaction time.
- Taps made while looking away from the centre count as misses but are left out of both fits.
- **Eccentricity** uses the card-calibrated scale and an assumed 50.8 cm viewing distance.
- The wording is "side awareness", not a vision measurement.

### 4.13 Posture & Lighting Check — ocular ergonomics

- **Continuous camera monitor** for room and screen glare and for viewing distance.
- **Blink biofeedback** (`hooks/useBlinkCounter.js`, `utils/blinkCoach.js`):
  - MediaPipe eye-aspect-ratio blink detection, giving a rolling blinks-per-minute over the last 60 s, shown after 30 s of data.
  - **Bands:** below 8/min low, 8–12 a bit low, 12 or more healthy.
  - The window restarts when the face leaves the view, the tab is hidden or a break is running.
  - When the band is low, an in-page nudge suggests slow, complete blinks, at most every 2 minutes.
- **20-20-20 breaks:**
  - Every 20 min (or 30 min, or 1 min to try it out), an overlay offers a 20-second "look 6 metres away" break or "Snooze 5 min". "Break now" is always available.
  - With permission, a browser notification fires when the tab is in the background.
  - Distance and lighting alerts pause during a break.
- **Score:** reflects lighting and distance alerts only. Blink nudges and breaks never lower it.
- **Saved data:** `blink_rate` and `breaks_20_20_20` in `test_details`.

---

## 5. Camera and photo monitoring

### 5.1 Eye Tracking Analysis — `/eye-tracking-analysis`
- A **quick check** (about 90 s) and an **extended session** (about 5 min, with coaching).
- Measures blink rate (eye aspect ratio), squinting and redness, and computes a **fatigue score**.
- Session history and fatigue trend (`/api/webcam/metrics`, `/api/webcam/fatigue-trend`). A high fatigue score raises an alert.
- **Blink calibration** (`/calibrate-blink`): a two-step capture of a baseline and of blinks, which personalises the blink thresholds to the user's eye shape.

### 5.2 Eye Health Photo Monitor — `/eye-health-monitor`
- Guided eye-photo capture, stored as a timeline. The `condition_type` is one of dry eye, cornea scar, glaucoma, general or cataract.
- **Analysed on the device by default.** The photo is analysed in the browser and only the per-eye numbers go to the API. The same applies in the Dry Eye Check and the Lens timeline.
  - The **"Save photos to my account"** switch sends the photo to the server instead.
  - The server is also used automatically when the browser can't run the models.
  - Each result says where it was analysed and why.
- **Capture-quality gate** (v2.11): checks framing (both eyes visible and large enough), extreme lighting, shadows, backlight and one-sided glare. Framing problems block capture; extreme lighting can be acknowledged and overridden.
- **Glasses detection:** a warning only, never a block.
- **Month-over-month comparison:**
  - landmark-aligned eye crops, structural similarity (SSIM), per-metric changes and a comparison-confidence score;
  - "retake to confirm" logic before any deterioration is declared;
  - a confirmed worsening raises an alert.
  - With photos kept on the device, comparison uses the numbers only.

### 5.3 Lens Photo Timeline — `/cataract-opacity-monitor`
- Captures zoomed, high-resolution **pupil close-ups** of both eyes as a timeline.
- **Cataract screening** (`resnet_v2_calibrated`) gives one of three outcomes per eye:
  - **Assessed:** a temperature-scaled likelihood and a band: *low* (< 0.20), *indeterminate* (0.20–0.80) or *elevated* (≥ 0.80). It comes with a Grad-CAM overlay and the share of attention on the central eye region.
  - **Cannot assess:** the crop is out of distribution, meaning its multi-layer Mahalanobis score is above the validation 99th percentile. No likelihood is shown.
  - **Model unavailable:** weights or calibration files are missing. There is no heuristic fallback.
- The worse eye drives the person-level result, and the page says whether it is based on one eye or both.
- **No opacity score and no severity grade.** Severity grading (a CORN ordinal head) is built and switches on when a graded dataset trains `cataract_corn_resnet18.pth` (Section 12).
- Not LOCS III grading, and not a size in millimetres.

### 5.4 Research triage panel
An optional four-class ResNet-18 (cataract, conjunctivitis, normal, other) attaches a `pathology_triage` result to the Dry Eye, Photo Monitor and Lens timeline screens. It is labelled research only and never used in scores.

---

## 6. Tracking and analytics

### 6.1 Change detection — Reliable Change Index
Code: `eyevio/app/utils/change_detection.py`.

- **Series:** each test is tracked in its own unit, with one series per eye or colour axis.
- **Reliable worsening:** a session is a reliable worsening when two things are both true (Jacobson & Truax, 1991):
  - its change from the baseline mean exceeds 1.96 × the standard error of the difference;
  - the change is at least the test's minimal clinically important difference (MCID).
  - The baseline is 3–5 earlier sessions.
- **Test–retest SD:** the larger of a conservative per-test prior (acuity 0.07 logMAR, contrast 0.10 AULCSF, glare 0.10 Δ logCS, colour 0.10 log units) and the user's own SD, once 4 or more baseline sessions exist. When a test reports a posterior SD (QUEST or qCSF), it is added.
- **Alerts:** the two most recent sessions must both be reliably worse before a `vision_decline` alert fires. A single reliably worse session shows "possible change — retest to confirm".
- **What is compared:** only results with the same `method_version`, and never rows with a data-quality flag.
- The priors will be replaced by measured repeatability from the validation study (Section 13).

### 6.2 Trends — `/trends`
- **Cards:** one per test type, eye and method version, in the test's own units.
- **Fit:** a Theil–Sen robust slope with its rank-based 95% CI (Sen, 1968). A trend needs at least 6 sessions spanning at least 28 days; otherwise the card says so instead of fitting.
- **Verdict:** worsening or improving only when the slope CI excludes 0 **and** the projected change reaches the MCID.
- **Forecast:**
  - always drawn as a shaded 95% prediction interval (robust MAD scale, Student-t quantile), never a bare line;
  - capped at half the observed span, and never more than 90 days.
  - Polynomial and exponential curves, and prescription predictions, are not used.
- **Also shown:** tests completed, fatigue status and lifestyle next to the selected test.
- **Speed:** responses come from a per-user precomputed snapshot (Section 14.6).

### 6.3 Lifestyle — `/lifestyle`
- A daily log of screen time, sleep, physical activity, outdoor time, diet and hydration, symptoms and notes.
- Period averages, and correlations between habits, test results and fatigue (`/api/lifestyle/correlations`).

### 6.4 Lens tracking
- Lens type and purchase date, an effectiveness score from recent results, a decline rate and replacement reminders.
- Effectiveness below 80%, or reaching the replacement date, raises an alert.

---

## 7. Alerts and notifications

| Alert | Trigger |
|---|---|
| `vision_decline` | The two most recent sessions of a test are both reliably worse than baseline (RCI > 1.96 and change ≥ MCID) |
| `high_fatigue` | Eye-tracking fatigue score above threshold (medium, or high at 85 and above) |
| `eye_health_deterioration` | Confirmed worsening in the photo comparison |
| `lens_replacement` | Lens effectiveness below 80%, or replacement due |
| `myopia_progression` | Fast myopia progression in a tracked child |
| `family_child_alert` | Copy of a child's alert sent to their caregivers |
| `system_test` | Test notification sent from Settings |

**Delivery and management**
- An in-app alerts page: mark read, dismiss, record the action taken, mark all read, resend.
- Email over SMTP, and Web Push with VAPID keys (subscribed per device).
- Per-user notification preferences.

---

## 8. Reports and data export

- **Health report** (`/reports`; `GET /api/report?days=30&format=pdf|json`): vision summary, eye fatigue, lifestyle patterns, lens information and recommendations for a chosen period.
- **Clinician one-pager** (`GET /api/report/clinician`): a single-page PDF to read quickly during an appointment. It contains:
  - the latest home result per test, with eye (OD/OS) and date;
  - a sparkline of better-eye logMAR from the current acuity method;
  - up to five flagged concerns ranked by severity;
  - at-a-glance cards.

  Rows with a data-quality flag are left out.
- **Data export** (Profile): CSV and JSON of vision tests, lifestyle data, or everything.

---

## 9. Family, children and screen time

### 9.1 Myopia Progression — `/myopia`
- Profiles for children and teens, with refraction and prescriptions logged over time.
- A spherical-equivalent chart and a progression rate in dioptres per year.
- **Observed vs age-typical progression:**
  - The rate is a Theil–Sen slope with a 95% CI when there are 3 or more prescriptions, otherwise first-to-last. It needs at least 6 months of span.
  - It is compared with approximate untreated ranges by age, in D/yr: 6–8 y 0.70–1.10, 9–11 y 0.45–0.85, 12–14 y 0.25–0.60, 15–17 y 0.05–0.35, 18+ y 0–0.15 (Donovan 2012; Hyman 2005; COMET 2013).
  - It is called faster or slower only when the CI clears the range.
- **Risk-factor profile, not a score:**
  - The factors are current age, onset age, parental myopia, outdoor time, near work and current myopia-control treatment.
  - Each is shown as present, absent or unknown, with a one-line evidence summary, sources and whether it can be changed.
  - A references block and next steps follow.

  Code: `eyevio/app/services/myopia_progression.py`.

### 9.2 Family & caregivers — `/family`
- Create a family, share invite codes (valid 14 days), or join with a code.
- Add a younger child as a **managed account** run by the parent.
- **Parent-set goals:** outdoor hours target, screen hours limit, breaks target and test interval. The dashboard shows whether each goal is on track and whether a test is overdue.
- Caregivers see the child's 30-day outdoor-vs-screen chart, recent tests and alerts.
- Children who can't read letters can take the acuity test with the HOTV or Tumbling E chart, with a parent tapping the answers.

### 9.3 Digital Wellbeing — `/digital-wellbeing`
- Syncs daily screen time from the operating system and fills in lifestyle logs.
- **Android:** a native plugin using `UsageStatsManager`. It needs a native wrapper such as Capacitor, plus the Usage Access permission.
- **iOS:** a scaffold only, because Apple's FamilyControls / DeviceActivity entitlement is required. JSON or CSV import is the route for now.
- **Web:** manual import (`POST /api/wellbeing/import`).

---

## 10. Education and engagement

- **Eye Conditions Library** (`/eye-conditions`): a searchable library of 71 conditions, for example digital eye strain, dry eye disease and asthenopia.
- **Chatbot** (on every page): rule-based and deterministic, with no language model.
  - Red-flag rules run first.
  - Condition answers come from a BM25F retrieval index over every library field: name, symptoms, warning signs, description, risk factors and prevention (`utils/conditionRetrieval.js`).
  - Each answer names the library entries it used, quotes the exact items that matched, and shows match strength as strong, moderate or partial.
  - It **abstains** when a message isn't about eyes or matches too weakly.
- **Help & Resources** (`/help`): FAQ, eye-health tips, a vision glossary and a support contact.
- **Achievements** (`/achievements`): 15 badges for test milestones, streaks (3-day, week, month), high scores, lifestyle logging and Early Adopter.
- **Community** (`/community`): welcome page only. Features are marked "coming soon".

---

## 11. Privacy and security

- **Eye photos stay on the device by default.** The API receives only per-eye numbers. It re-derives every grade, band and finding from them, and rejects any result from a model file whose SHA-256 isn't in the manifest, so a client can't submit its own findings. Photos are uploaded only with "Save photos to my account" on, or when the browser can't run the models (the result then says why).
- **Account security:** bcrypt password hashing, JWT access and refresh tokens, a CORS allow-list and a configurable maximum upload size.
- **Timestamps:** stored in UTC. Photo timelines can group by the user's local date.
- **Validation study data:** files linking participants to accounts live in `data/validation/`, which is gitignored. Analysis outputs carry pseudonymous participant IDs only (Section 13).
- **Licences:** the OSDI questionnaire is © Allergan. Non-commercial and academic use is generally allowed; commercial distribution needs permission.

---

## 12. AI and machine learning

| Component | Runs in | Purpose | Status |
|---|---|---|---|
| MediaPipe Face Mesh and Hands (`@mediapipe/face_mesh` 0.4.1633559619, `@mediapipe/hands` 0.4.1675469240) | Browser | Distance monitor, eye-cover check, pupil regions, live eye tracking, blink counting, convergence break, red-reflex sampling | Active |
| MediaPipe Face Landmarker (`face_landmarker.task`) | Server | Landmarks for crops, framing, lighting regions and alignment | Active |
| Bayesian psychophysics (`qcsf.js`, `psychophysics.js`, `vernier.js`, `colorThreshold.js`) | Browser | qCSF; QUEST for colour, glare and side vision; Psi for vernier; logistic fit for the side game | Active |
| Sclera redness ResNet-18, bounded ordinal (`sclera_redness_ordinal.pth`) | Browser (int8 ONNX, 11 MB) or server | Redness score and 0–4 grade. Single pass; 5-pass test-time augmentation is opt-in (`SCLERA_TTA=1`) because it cost 5× the time for no measurable gain | Active (`bounded_ordinal_resnet18_v1`) |
| Cataract ResNet-18 (`cataract_detection_resnet18.pth`, `cataract_model_meta.json`, `cataract_ood_stats.npz`) | Browser (fp32 ONNX, 46 MB, including OOD score and CAM) or server | Calibrated likelihood and band, "cannot assess", Grad-CAM | Active (`resnet_v2_calibrated`) |
| Cataract CORN ordinal head (`train_cataract_corn.py`) | Server | Severity grade (normal / immature / mature) | Built and tested; waiting for a graded dataset |
| Pathology ResNet-18 (`pathology_resnet18.pth`) | Server | Four-class research triage | Optional, research only |
| White-balance normalisation and Efron-style binning (`dry_eye_analysis.py`) | Browser and server | Removes colour casts before redness (gains 0.7–1.4); approximate 0–4 grade | Active; bins not clinically validated |
| Heuristic analysers and Haar cascades | Server | Tear-film irregularity, texture, eyewear, capture quality; eye-crop fallback | Active |
| Trend estimation (`trend_forecast.py`) and change detection (`change_detection.py`) | Server | Theil–Sen trends with intervals; Reliable Change Index | Active |
| Chatbot retrieval (`conditionRetrieval.js`) | Browser | BM25F over the condition library, with abstention | Active |

**Model evidence.** Each image model has a card in `docs/model_cards/` covering intended use, data, metrics with bootstrap 95% CIs, calibration, a shortcut probe, out-of-distribution behaviour, failure modes and references. `train_cataract_resnet.py` and `scripts/eval_model_cards.py` regenerate the numbers.

**Cataract model**
- **Data and selection:** near-duplicates (dHash ≤ 6) were removed from validation and test, leaving 160 and 166 images. Checkpoints were selected on validation NLL.
- **Calibration:** temperature scaling with T = 1.62, constrained to T ≥ 1.
- **Webcam-simulated test set:** AUC 0.991 (0.981–0.998), ECE 0.048, Brier 0.039.
  - Rule-out (0.20): sensitivity 1.00, specificity 0.857.
  - Rule-in (0.80): sensitivity 0.868, specificity 0.980.
- **Out of distribution:** 1.25% of clean validation images abstain, against 75.6% of webcam-simulated and 100% of degraded images.
- **There is no externally sourced test set**, so these figures overstate real-world performance.

**Known shortcut.** All three image models share a public data source, and masking the eye out barely changes their output: cataract AUC 0.998, redness AUC 0.993, pathology macro-F1 0.68 (chance is 0.25). Near-duplicate leakage was found for redness (8 of 187) and pathology (51 of 348), and redness labels are weak, derived from folders. This is why every image result is labelled a screening prompt.

**Model serving**
- The server loads and runs each model once in a background thread at startup (`WARM_MODELS`). `GET /health` reports which models are warm and how long each took.
- Model paths can be overridden with environment variables (Section 16).

---

## 13. Scientific validity and the validation study

**What is checked today**
- **Stimuli:** every rendered stimulus has orientation, contrast and golden-image tests (Section 17).
- **Scoring:** scoring and adaptive procedures are tested in simulation, for example guessing children, vernier false flags, a perfect glare run and side-vision catch trials.
- **Image models:** have model cards with confidence intervals and calibration.

**What is not yet validated:** agreement of any home test with its clinical reference, and the real test–retest repeatability of each test on users' own devices.

**Validation study (ready to run).** The protocol is in `docs/validation/PROTOCOL.md`.
- **Design:** a clinic visit with masked reference tests and the app, plus an app retest at home 1–7 days later.
- **Participants:** 60 analysable (70 recruited), at least a third with reduced vision so the range is wide enough for ICC to mean something.
- **Comparisons:**
  - acuity against an ETDRS chart at 4 m;
  - contrast logCS at 1 c/deg against Pelli–Robson;
  - NPC against an RAF rule;
  - AULCSF, glare Δ logCS and colour thresholds get repeatability only.
- **Statistics** (`eyevio/app/utils/agreement.py`):
  - Bland–Altman bias and 95% limits of agreement, each with a CI, plus checks for proportional bias and normality;
  - ICC(A,1) for absolute agreement and ICC(C,1) for consistency, with McGraw & Wong CIs. Checked against the Shrout & Fleiss (1979) worked example;
  - within-subject SD and coefficient of repeatability.
- **Pre-specified targets** (primary endpoint is acuity): |bias| ≤ 0.05 logMAR, LoA half-width ≤ 0.15 logMAR, ICC(A,1) lower CI ≥ 0.75.
- **Tools:**
  - `scripts/validation_export.py` pulls participants' results from the database. The output has participant IDs only.
  - `scripts/validation_analyze.py` writes `report.md`, `results.json` and Bland–Altman plots. `--simulate N` runs a labelled dry run.
  - Templates are in `docs/validation/templates/`.
- **Feedback into the product:** the measured test–retest SDs will replace the provisional priors in change detection.

---

## 14. Architecture

### 14.1 Stack

| Layer | Technology |
|---|---|
| Web app | React 18, Vite, Tailwind CSS, Zustand, React Router, Framer Motion, Recharts, react-hook-form + Zod |
| In-browser vision | MediaPipe Face Mesh and Hands (through `utils/mediapipeSolutions.js`), react-webcam, Web Speech API |
| In-browser ML | ONNX Runtime Web in a Web Worker (WebGPU when available, otherwise WebAssembly SIMD) |
| API | Flask 3, SQLAlchemy, Flask-JWT-Extended, Flask-CORS, Flask-Migrate / Alembic |
| Server vision and ML | OpenCV, MediaPipe Face Landmarker, PyTorch + torchvision, NumPy, pandas, scikit-learn, SciPy, statsmodels |
| Database | PostgreSQL (JSONB test details) |
| Notifications | Email (SMTP), Web Push (VAPID / pywebpush) |
| Reports | ReportLab (PDF), Matplotlib (validation plots) |
| Delivery | Progressive Web App (manifest, service worker); optional native bridge for screen time (`mobile-bridge/`) |
| Quality | pytest, `node --test`, ESLint, GitHub Actions |

Local development: web app on `:3000`, API on `:5002`.

### 14.2 On-device inference
- **Worker:** `src/ml/eyeInference.worker.js` runs ONNX Runtime Web.
  - It uses WebGPU for the fp32 cataract model when offered, and WebAssembly SIMD otherwise.
  - WebAssembly is single-threaded, because threads need cross-origin isolation headers (`COOP`/`COEP`). It switches to up to 4 threads if they are added.
- **Model files:** downloaded once, checked against the SHA-256 in `public/models/manifest.json`, and kept in the Cache API.
- **Ported pipeline** (`src/ml/ocularAnalysis.js`, `src/ml/imageOps.js`): landmark cropping, white balance, ocular patch preparation, an antialiased 224 px resize, the heuristic redness and tear-film measures, and the cataract OOD score and class-activation map. The last two are part of the exported graph, so they come from the same inference call.
- **Parity with PyTorch** (`scripts/export_onnx.py`):
  - **Cataract (fp32):** probability within 5 × 10⁻⁷, with 100% agreement on band and "cannot assess".
  - **Redness (int8):** 100% grade agreement, MAE 0.138 against 0.134.
  - Cataract stays fp32 because int8 changed the "cannot assess" decision on 3% of webcam-like crops.
- **Parity with the server:** `npm run test:parity` runs the browser pipeline under Node and compares every intermediate number with the server's: 204 checks on 6 committed fixtures.
- **Server fallback:** used when the user opts to save photos, when the browser lacks WebAssembly SIMD, Web Workers or WebCrypto, or when a model fails to download, fails its hash check or takes longer than 90 s.

### 14.3 MediaPipe loading
All Face Mesh and Hands instances are created through `src/utils/mediapipeSolutions.js`. MediaPipe's runtime breaks if two instances load at once (they abort) or if an instance is closed while still loading (the next one hangs, printing "still waiting on run dependencies"). React StrictMode in development and quick page changes triggered both.

The loader therefore:
- initialises one instance at a time, page-wide;
- makes each frame wait for its instance to finish loading;
- delays closing an instance until loading has finished;
- loads assets from jsDelivr at the exact installed package versions, which are pinned in `package.json`.

### 14.4 Server path and transport
- **Warm start:** models warm at startup. The first analysis after a restart took 469 ms, against 7.5 s with lazy loading.
- **Background jobs:** with `Prefer: respond-async`, photo and dry-eye analysis return `202` and a job id. The client then polls `GET /api/jobs/<id>` while a thread pool (`ANALYSIS_WORKERS`, default 2) does the work.
- **Server inference:** stays on PyTorch, about 11 ms per model call. ONNX int8 was no faster and changed cataract decisions.
- **Uploads:**
  - Images go as multipart files; base64 is still accepted.
  - The browser crops to the face (landmark box plus 30%) and caps the long side at 1024 px. The crop is sent only if the server's framing check gives the same answer on it as on the full frame.
  - Blink-calibration frames are capped at 640 px.
  - In the default on-device mode, no image is sent.

### 14.5 Web app delivery
- **Code splitting:** every page is loaded with `React.lazy`, so MediaPipe and ONNX Runtime download only with the tests that use them. The entry chunk is 316 KB (103 KB gzipped).
- **Camera loops:** the live eye tracker runs Face Mesh at about 10 fps, with smoothing scaled by elapsed time. The blink counter keeps the full camera rate, because a blink lasts 100–150 ms.
- **Service worker** (`public/service-worker.js`):
  - network-first for pages, cache-first for same-origin static assets;
  - it never intercepts API calls, the Vite dev server or other origins, such as the MediaPipe files on jsDelivr;
  - in development it is unregistered unless `VITE_ENABLE_PUSH` is set.

### 14.6 Database and trend snapshots
- **Indexes and JSONB:** `(user_id, created_at)` indexes on `vision_tests` and `webcam_metrics`, and `(user_id, captured_at)` on `eye_photos`. `vision_tests.test_details` is JSONB with a GIN index (`jsonb_path_ops`).
- **Trend snapshots:** `/trend/prediction` and `/trend/summary` read a per-user snapshot from `trend_snapshots`. At 2,100 sessions this took 5.9 ms, against 324 ms to recompute.
- **Snapshot rebuilds** happen on the next request when any of these is true:
  - the snapshot is marked stale, which happens in the same transaction as any vision-test write;
  - the count or highest id of the user's usable rows has changed;
  - the algorithm version has changed.

  `flask aggregate-trends` rebuilds snapshots in bulk.

---

## 15. Reference

### 15.1 API
All endpoints are under `/api` and need a JWT unless noted.

| Area | Endpoints |
|---|---|
| Auth (`/auth`) | `POST /register`, `POST /login` (no JWT), `GET/PUT /profile`, `POST /refresh`, `POST /change-password` |
| Vision tests (`/vision-test`) | `POST /` submit, `GET /` history, `GET /<id>`, `GET /stats`, `POST /analyze-dry-eye` (accepts `on_device` results, multipart or base64, and `Prefer: respond-async`), `POST /check-photo-lighting` |
| Eye photos (`/eye-photos`) | `POST /` (per-eye `on_device` results, or an image as multipart; base64 accepted; `202` + `poll_url` with `Prefer: respond-async`), `GET /`, `GET /status`, `GET /timeline`, `GET /compare`, `POST /check-lighting`, `GET/DELETE /<id>` |
| Jobs (`/jobs`) | `GET /<job_id>`: `queued`, `running`, `done` or `failed`, plus the analysis response when done. Expires after 1 hour |
| Webcam (`/webcam`) | `POST /analysis`, `GET /metrics`, `GET /fatigue-trend` |
| Calibration (`/calibration`) | `POST /start`, `POST /baseline`, `POST /blink`, `POST /finalize`, `GET /status`, `POST /test` |
| Lens (`/lens`) | `POST /data`, `GET /effectiveness`, `GET /history` |
| Lifestyle (`/lifestyle`) | `POST /log`, `GET /logs`, `GET /trends`, `GET /correlations` |
| Trends (`/trend`) | `GET /`, `GET /prediction`, `GET /summary` (the last two include a `snapshot` field: `cached` or `refreshed`, with its time) |
| Alerts (`/alerts`) | `GET /`, `PUT /<id>/read`, `PUT /<id>/dismiss`, `PUT /<id>/action`, `PUT /mark-all-read`, `POST /<id>/resend` |
| Reports (`/report`) | `GET /` (PDF or JSON), `GET /clinician` |
| Notifications (`/notifications`) | `GET /vapid-public-key`, `GET/PUT /preferences`, `POST/DELETE /push-subscribe`, `POST /test` |
| Myopia (`/myopia`) | Subjects CRUD, `GET /subjects/<id>/dashboard`, prescriptions list/add/delete |
| Wellbeing (`/wellbeing`) | `GET /status`, `POST /connect`, `PUT/DELETE /connections/<id>`, `POST /sync`, `GET /days`, `POST /import` |
| Family (`/family`) | `GET/POST /`, `POST /invites`, `POST /join`, `POST /children`, `GET /children/<id>`, `PUT /children/<id>/goals`, `DELETE /invites/<id>` |
| Health | `GET /health` at the server root, not under `/api` (no JWT), including model warm-up status |

### 15.2 Data model (PostgreSQL)

| Table | Holds |
|---|---|
| `users` | Account, profile, prescription, lens, lifestyle defaults, onboarding answers, notification settings |
| `vision_tests` | Every result: score, response time, errors, `test_details` (JSONB). `data_quality_flag` / `data_quality_note` mark rows that must not be used; `VisionTest.usable()` excludes them everywhere results are analysed |
| `webcam_metrics` | Blink rate, squints, redness, fatigue score per session |
| `eye_photos` | Photo timeline with analysis, thumbnails, aligned crops and comparisons. `health_score` and `image_thumbnail` are nullable (cataract photos store no score; on-device photos store no image) |
| `analysis_jobs` | Background analysis jobs; rows older than 1 hour are purged |
| `trend_snapshots` | Per-user precomputed trend payload, algorithm version, source-row signature, `stale` flag |
| `vision_trends` | Stored trend and prediction history |
| `lens_data`, `lifestyle_logs`, `alerts`, `push_subscriptions` | Lens records, daily habits, generated alerts, Web Push endpoints |
| `myopia_subjects`, `myopia_prescription_entries` | Child profiles and prescription history |
| `digital_wellbeing_connections`, `screen_time_days` | Device links and synced daily screen time |
| `family_groups`, `family_members`, `family_invites` | Families, roles, goals, invite codes |

---

## 16. Configuration and operations

- **Core:** `DATABASE_URL`, `SECRET_KEY`, `JWT_SECRET_KEY`, `JWT_ACCESS_TOKEN_EXPIRES`, `ALLOWED_ORIGINS`, `FRONTEND_URL`, `MAX_CONTENT_LENGTH`
- **Email:** `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_USE_TLS`, `MAIL_USE_SSL`, `MAIL_SUPPRESS_SEND`
- **Web Push:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CLAIM_EMAIL`, `PUSH_TTL_SECONDS`
- **Models:** `MODEL_PATH`, `CATARACT_MODEL_PATH`, `CATARACT_CLASS_NAMES`, `CATARACT_CORN_MODEL_PATH`, `PATHOLOGY_MODEL_PATH`, `PATHOLOGY_CLASS_NAMES`, `SCLERA_MODEL_PATH`, `SCLERA_TTA` (off by default), `ONNX_MANIFEST_PATH`. Weights live at the repository root and are gitignored.
- **Performance:** `WARM_MODELS` (default on, off under tests), `ANALYSIS_WORKERS` (default 2)
- **Tests:** `TEST_DATABASE_URL`
- **Web app:** `VITE_API_URL` (default `http://localhost:5002/api`), `VITE_ENABLE_PUSH`
- **Optional storage:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- **Nightly trend refresh (optional):** `0 3 * * * cd eyevio && FLASK_APP=run.py flask aggregate-trends` (`--user-id N` for one user, `--force` for all). Stale snapshots also refresh on the next request.
- **Run locally:**
  - API: `cd eyevio && PORT=5002 ./venv/bin/python run.py`
  - Web app: `cd eyevio-frontend && npm run dev`

---

## 17. Quality: tests and CI

| Suite | Size | Covers |
|---|---|---|
| Stimulus tests (`eyevio-frontend/tests/stimuli.test.mjs`) | 54 tests, 22 golden PNGs | Every rendered stimulus in every orientation (see below) |
| Scoring tests (`tests/scoring.test.mjs`) | 15 tests | Optotype size, renderable logMAR, glare and convergence bands, CSF cut-off, OSDI completeness, display checks |
| Vision-scoring checks (`scripts/run-vision-scoring-tests.mjs`) | 112 checks | Adaptive procedures and scoring in simulation, including guess correction, vernier, side-vision reliability, glare ceiling and perfect-run behaviour |
| Chatbot retrieval checks | fixture set | Correct library entries and abstention |
| On-device parity (`npm run test:parity`) | 204 checks (+ model outputs when weights are present) | Browser pipeline against the server pipeline, number by number |
| Backend (`eyevio/tests/`) | 90 pytest tests | Change detection, trends, cataract screening, CORN, on-device validation, uploads, jobs, trend snapshots, the validation-study statistics, the API |

**Stimulus tests in detail**
- They render gratings, vernier pairs, Gaussian blobs, Tumbling E and the Landolt C on a stub canvas.
- Orientation is measured from the pixels with a structure tensor and must match the label.
- Contrast, cycle count, aperture, soft edge, phase and dithered sub-step amplitude are checked.
- The vernier offset must be within 0.05 px.
- Golden images are compared pixel by pixel, allowing ±1 grey level on at most 0.5% of pixels. `npm run test:update-golden` accepts an intended change.

**CI** (`.github/workflows/ci.yml`, on pushes to `main` and on pull requests)
- **Backend job:**
  - a PostgreSQL 16 service;
  - migrations must upgrade from empty, downgrade to base and upgrade again;
  - then pytest. The 2 tests that need gitignored model weights skip, and 88 run.
- **Frontend job:** `npm ci`, `npm run lint:ci`, `npm test`, `npm run test:parity` and a production build. Golden-image diffs are uploaded when a test fails.
- **Lint budget:** `lint:ci` fails on any error or on more than 139 warnings, so the warning count can only go down.

---

## 18. Known limitations

**Clinical scope**
- **Not diagnostic.** Every output is wellness screening. The glare, side-vision and lens tests do not diagnose cataract or glaucoma.
- **No clinical validation yet.** The validation study is designed and its analysis is built, but it has not been run (Section 13). The repeatability priors used for change alerts are conservative estimates, not measurements.
- **Image models** learned a dataset shortcut and have no externally sourced test set. The cataract model abstains on most webcam-like photos, and severity grading waits on a graded dataset.

**Screen and device**
- **Screen colour and luminance are assumed, not measured.** Contrast and colour tests assume an sRGB panel with standard gamma. Night Shift, True Tone, auto-brightness and panel ageing can't be detected from a browser; the colour test relies on the user's checklist, and wide-gamut and HDR screens only get a warning.
- **Acuity** depends on the card calibration and pixel density. Very small rows may be below the display's resolution, and are reported as the chart floor.
- **Test limits:**
  - Acuity can floor.
  - Glare can hit its ceiling (2.05 logCS or above in both conditions reads "no measurable loss").
  - Colour thresholds can exceed the screen gamut.
  - NPC is floored at about 10–15 cm, because closer faces leave the camera's frame or focus.

**Individual tests**
- **Colour thresholds** are in u′v′ on the user's own screen. The typical limits are approximate home-screen values, not Cambridge Colour Test norms.
- **Vernier** thresholds depend on pixel density and distance. The task is validated only in simulation.
- **Side Vision** gives no absolute sensitivity and can't detect loss that affects all four quadrants equally.
- **Side Vision Game** eccentricities assume a 50.8 cm distance, with no camera check.
- **Eye Glow:**
  - It needs a phone, a dark room, a helper and HTTPS (browsers block the camera on plain HTTP except on `localhost`).
  - iPhone Safari can't control the torch, so a second light is needed.
  - Distance assumes a typical phone lens.
- **Dry Eye:**
  - The Efron-style redness grade is calibrated on EyeVio's own scale, not validated against published scales.
  - White balancing reduced colour-cast error in testing: the same eye scored 21–22 under neutral, warm and cool light, against 61 uncorrected under warm light.
  - The tear break-up proxy is symptom-based, not fluorescein TBUT.
- **Children's eye spacing** uses age-band medians. An individual child can differ by several millimetres, which shifts the distance check by a few percent.

**Data and history**
- **Method versions start new baselines.** Results from older test versions aren't compared with current ones. Glare results before September 27, 2026 are flagged `glare_orientation_bug` and excluded (Appendix B).

**Platform**
- **On-device analysis:**
  - The first use downloads that task's model (11 MB for redness, 46 MB for cataract), which is then cached.
  - Photos kept on the device can only be compared on their numbers; aligned-image comparison needs saved photos.
  - The pixel-based redness measure can come back empty on the device when too little sclera is found. The ML score is unaffected.
  - Timings are measured on the user's device but not benchmarked across devices.
- **Background jobs** run in a thread pool inside each API process. A job is lost if its process restarts.
- **Camera loops** still run on the main thread. Moving them into a Web Worker needs a migration to `@mediapipe/tasks-vision`.
- **Screen-time sync:** Android needs a native wrapper; iOS is blocked on Apple's entitlement.
- **Community** features aren't built. The **chatbot** is keyword-based, and abstains when phrasing doesn't match.

---

## 19. Roadmap

1. **Run the validation study** (Section 13). Then publish the Bland–Altman and ICC results and replace the change-detection priors with the measured test–retest SDs.
2. **Train cataract severity grading** once a clinician-graded, same-device photo set exists. Add an externally sourced test set for every image model.
3. **Screen photometry,** for example a phone-camera luminance and white-point check, to replace the sRGB assumption.
4. **A camera distance check for the Side Vision Game.**
5. **Home-screen normative data** for colour thresholds and vernier bias.
6. **Move camera loops into a Web Worker** (`@mediapipe/tasks-vision` with OffscreenCanvas).
7. **Native wrappers** for Android screen-time sync, and iOS once the entitlement is granted.
8. **Community features.**

---

## Appendix A — Release notes

**October 1, 2026**
- **Validation study:** protocol, statistics module, export and analysis scripts, templates and tests (Section 13).
- **Glare Test:**
  - the glare score (0–100) is now the headline, with a plain "you needed N× the contrast" line;
  - identical priors for both staircases (a perfect run is now Δ 0, score 100 instead of 96);
  - test-limit detection and messaging.
- **Line alignment:** visible answer confirmation, a progress bar and step prompts.
- **MediaPipe:** loading goes through one serialised loader with deferred close and pinned asset versions. This fixed "still waiting on run dependencies" hangs.
- **Service worker:** no longer intercepts other origins, and tolerates requests without an `Accept` header.

**September 2026**
- **Test-method redesign:**
  - Phase 1: physically sized ETDRS acuity, dual-task side vision, glare reframed as Δ logCS, OSDI-12 dry eye, phone-only eye glow, NPC added, near blur tolerance renamed.
  - Phase 2: qCSF contrast, confusion-axis colour, multi-contrast Amsler with vernier, psychometric side game, blink biofeedback and 20-20-20 breaks, children's HOTV and Tumbling E charts.
- **Models and analytics:**
  - model cards;
  - cataract recalibration with abstain and Grad-CAM;
  - CORN pipeline;
  - Reliable Change Index alerts;
  - Theil–Sen trends with prediction intervals;
  - composite scores and polynomial/exponential forecasts removed;
  - myopia risk score replaced by a risk-factor profile;
  - retrieval-based chatbot.
- **Efficiency:**
  - on-device ONNX inference by default;
  - multipart uploads with face crops;
  - async analysis jobs;
  - route-level code splitting (entry chunk 1,850 KB → 316 KB);
  - face-api.js and WebGazer removed;
  - JSONB and composite indexes;
  - trend snapshots.
- **Quality:** golden-image and orientation tests for every stimulus, scoring tests and GitHub Actions CI.
- **UX fixes:**
  - side vision practice rounds and fixed step order;
  - Amsler "Looks aligned" and "Skip this part" in the vernier task;
  - side-game hit counting under StrictMode.

---

## Appendix B — Presentation note: the bug I shipped and the suite that stops it coming back

**The bug.** Until September 27, 2026 the glare test labelled its stripes wrongly: the grating called "horizontal" was drawn vertical, and vice versa. People who answered correctly were marked wrong on half the trials, so glare scores looked worse than they were. Nothing caught it because nothing looked at the pixels. The scoring code was correct and the drawing code was correct, but they disagreed about what an angle meant.

**The response**
- Every affected row is flagged in the database (`glare_orientation_bug`) and left out of trends, alerts and reports, but not deleted.
- The test canvas and its answer buttons now draw from one definition: gratings from `GRATING_ORIENTATIONS` and `paintGrating` in `src/utils/psychophysics.js`, and E and Landolt C shapes from `src/utils/stimulusGeometry.js`.
- Every rendered stimulus is tested for its measured orientation and against a golden image, and CI runs those tests on every change.

**The proof.** Reintroducing the original bug (swapping horizontal and vertical, diagonals untouched) fails 17 tests. The first picture is built from the images that failing run saved: the shipped rendering on the left, the golden image on the right.

![Shipped glare gratings next to their golden images: horizontal and vertical were swapped](assets/stripe_bug_before_after.png)

All 22 golden images, one per rendered stimulus and orientation:

![Contact sheet of the 22 golden stimulus images](assets/stimulus_goldens.png)
