# EyeVio — Product Document

_Last updated October 1, 2026. Describes the product as built, compiled from the source code in `eyevio-frontend/` (web app) and `eyevio/` (API). Change history is in Appendix A._

---

## 1. Overview

EyeVio is a browser-based **research and educational prototype** for home vision checks. People take 12 interactive psychophysical and wellness tests (Section 4), can run a separate camera-based Eye Tracking Analysis and two photo modules (Section 5), log daily habits and follow their results over time. The app reports each test in its own units, flags repeated changes that exceed a test's retest noise, and produces a one-page summary of native measurements to show an eye doctor.

**Who it is for**
- Researchers, students and science-fair judges studying how well home vision tests and image models work, and where they fail.
- Adults curious about their own vision and screen habits (screen workers, glasses and contact-lens wearers, older adults), alongside regular eye exams, not instead of them.
- Parents logging a child's prescriptions and screen and outdoor habits to discuss with the child's eye doctor.

**Positioning.** EyeVio is a research and educational prototype. It has not been clinically validated, reviewed, cleared, or approved as a medical device. Its outputs must not be used to diagnose, exclude, monitor, or treat an eye condition.

The project reviews general-wellness and software-as-a-medical-device principles, but no regulatory classification has been obtained. Some functions (image models that name conditions, change alerts, a clinician summary) would go beyond general wellness if offered to the public, which is why the image models are confined to a research lab (Section 13), 0–100 indices never drive alerts or reports (principle 6), and the wording above appears with every result (`utils/samd.js`, `SamdDisclaimer`, the clinician PDF footer, Help and the chatbot).

**Product principles**
1. **Each test reports in its own units.** For example, acuity is in logMAR, contrast in AULCSF or logCS, glare in Δ logCS, colour as thresholds, Near Blur in arcminutes and NPC in centimetres. There is no combined 0–100 "vision score", because averaging tests measured in different units means nothing.
2. **A change must beat the test's own noise.** Change alerts use a Reliable Change Index and need two confirming sessions. Trends are drawn with confidence and prediction intervals.
3. **Honest output.** Results that sit at a test's limit say so. Nothing is reported as more certain than it is. Image models that were shown to rely on dataset shortcuts return no result to users at all.
4. **Private by default.** Photos remain on-device by default; an upload occurs only after an explicit storage choice or disclosed fallback (Section 5.2). Derived measurements (test results, per-eye photo numbers) are stored on the server with the account (Section 11).
5. **Calibrated stimulus geometry.** Geometric stimulus size is calibrated; luminance and color remain device-dependent. Size comes from matching the screen against a bank card; viewing distance is estimated by the camera or measured by hand. All major psychophysical stimuli (gratings, the side-vision blob, vernier lines, Tumbling E and the colour-test Landolt C) have pixel-level regression tests; the Sloan and HOTV letters, the Amsler grid, Near Blur letters and game targets do not (Section 18).
6. **Native measurement first; 0–100 only as a labelled display index.** Each result page leads with the test's own measurement (Section 4.1). Where a 0–100 number is still shown, it is labelled "Display index, not clinically validated", and it never raises an alert and never appears in the clinician report or as a validation endpoint. Change checks on a display index are shown as "display only" (Section 6.1).

---

## 2. Product map

| Area | Screen | Route |
|---|---|---|
| Public | Landing page, log in, register | `/`, `/login`, `/register` |
| Setup | Onboarding questionnaire, distance calibration, blink calibration | `/onboarding`, `/calibration`, `/calibrate-blink` |
| Home | Dashboard | `/dashboard` |
| Testing | Vision tests hub and the 12 psychophysical and wellness tests (Section 4), result detail pages | `/vision-tests`, `/vision-tests/<test>`, `/test-details/<id>` |
| Camera and photos (not counted among the 12 tests) | Eye Tracking Analysis (camera session) and two photo modules: Eye Health Photo Monitor and Lens Photo Timeline | `/eye-tracking-analysis`, `/eye-health-monitor`, `/cataract-opacity-monitor` |
| Tracking | Trends, Lifestyle log, Alerts, Reports | `/trends`, `/lifestyle`, `/alerts`, `/reports` |
| Family | Myopia Progression, Family & caregivers, Digital Wellbeing | `/myopia`, `/family`, `/digital-wellbeing` |
| Learn and engage | Eye Conditions Library, chatbot (on every page), Help, Achievements | `/eye-conditions`, `/help`, `/achievements` |
| Roadmap only (not in navigation) | Community placeholder, labelled "Roadmap only"; reachable only by typing the URL | `/community` |
| Research | Experimental AI Research Lab: the three image models as an experiment (Section 13) | `/research-lab` |
| Account | Profile, Settings | `/profile`, `/settings` |

Old routes redirect: `/webcam` → `/eye-tracking-analysis`, `/blink-calibration` → `/calibrate-blink`, and the earlier side-vision URL → `/vision-tests/side_vision` (kept for old bookmarks).

**Keyboard shortcuts:**
- `?` shows the list.
- `n` starts a new test.
- `/` focuses search.
- Navigation uses `g` followed by a letter: `g d` dashboard, `g t` tests, `g r` trends, `g e` eye tracking, `g l` lifestyle, `g a` achievements, `g s` settings, `g h` help, `g p` profile.

---

## 3. User journey

1. **Sign up and log in** with email and password. There is no email verification or password reset. The session is a 1-hour JWT access token kept in browser storage; when it expires the user signs in again (Section 11.2).
2. **Onboarding questionnaire:** eye-health history, glasses or contacts, daily habits (screen, sleep, outdoor time), goals, test frequency, notification preferences and units. The answers fill in the profile.
3. **Calibration:**
   - **Screen scale:** the user matches an on-screen card to a bank card (85.6 mm), so stimulus geometry (size in mm and visual angle) is calibrated. Luminance and colour are not calibrated and remain device-dependent.
   - **Viewing distance:** estimated from the pixel distance between the pupils, assuming a population-typical (or age-band) eye spacing, so it is an estimate rather than a measurement. The acuity and contrast tests monitor it continuously; the Amsler test checks it once at the start. The acuity test also accepts a hand-measured 1 m (tape, string or floor marker) when the camera can't be used.
   - **Blink thresholds:** optional personal calibration.
4. **Dashboard:**
   - change checks per test: confirmed change, "retest to confirm", or stable;
   - number of tests tracked, active alerts and a monthly summary;
   - quick actions (take a test, eye tracking, photo monitors), shareable reports and the clinician one-pager.
5. **Ongoing use:** take tests, capture photos, log habits, review trends, receive alerts and earn achievements.

---

## 4. Vision tests

### 4.1 Summary

This section covers the **12 psychophysical and wellness tests** on the Vision Tests hub. Eye Tracking Analysis and the two photo modules are separate (Section 5) and are not counted among them.

The 12 tests share a side-by-side layout, with the stimulus on the left and the answers on the right, and no page scrolling. Each explains its result in plain language and shows the research-prototype disclaimer. A result is saved to the server only when it meets the test's own reliability rule (for example, unreliable side-vision sessions and Eye Glow sessions with fewer than two usable captures are not saved). Each result stores a `method` and `method_version` in `test_details`, and change detection only compares results with the same version.

The headline on every result page is the native measurement. A 0–100 number, where one still exists, is shown smaller and labelled "Display index, not clinically validated"; it is not used for alerts, the clinician report or validation (principle 6). Four tests no longer have any index: Color Vision, Straight-Line, Dry Eye and Eye Glow save `score = NULL` (Section 16.2).

| Test (in-app name) | Route | Measures | Headline (native measurement) | 0–100 display index |
|---|---|---|---|---|
| Clear Vision Test | `/vision-tests/visual_acuity` | Distance visual acuity, each eye | logMAR | none |
| Color Vision Test | `/vision-tests/color_vision` | Colour discrimination on protan, deutan and tritan axes, on this display | u′v′ threshold (× 10⁻⁴) per axis, against provisional research reference values | none |
| Straight-Line Test | `/vision-tests/amsler_grid` | Perceived distortion (Amsler grid) and line-alignment hyperacuity | marked area (deg²) per eye and contrast; vernier threshold, bias and uncertainty (arcseconds), shown separately | none |
| Faint Shapes Test | `/vision-tests/contrast_sensitivity` | Full contrast sensitivity curve | AULCSF; logCS at 1/3/6/12 c/deg | AULCSF-percentage index |
| Side Vision Test | `/vision-tests/side_vision` | Relative sensitivity of the four corners of side vision (not a visual-field test) | inter-quadrant asymmetry (log units); fixation-loss, false-positive and false-negative rates | index |
| Glare Test | `/vision-tests/cataract_glare` | Contrast lost under glare | Δ logCS and the contrast multiplier (×10^Δ) | index |
| Dry Eye Check | `/vision-tests/dry_eye` | Symptoms, blinking, time to reported blur | OSDI 0–100 (the questionnaire's own scale); blink rate and inter-blink interval; median blur-report time (s); optional experimental redness image index, each shown separately | none |
| Eye Glow Test | `/vision-tests/red_reflex` | Left/right red-reflex appearance over repeated captures (phone only) | outcome category: asymmetry observed, no repeated asymmetry, no usable reflex, or capture unsuccessful | none |
| Near Blur Tolerance | `/vision-tests/accommodative_lag` | Smallest optical-style blur noticed on near letters at 40 cm | blur detection threshold (arcmin) | log-scaled comfort index, only for repeatable sessions |
| Convergence Near Point | `/vision-tests/near_point_convergence` | Closest distance both eyes keep a target single | break distance (cm), with reported and camera values and their agreement | index, only when a break was found |
| Side Vision Game | `/vision-tests/peripheral_awareness` | Side awareness and reaction time against distance from centre | e50 (degrees); % per degree; ms per degree | none |
| Posture & Lighting Check | `/vision-tests/ocular_ergonomics` | Screen distance, glare, blink rate, breaks | alert counts; observed blinks/min with a coaching category | ergonomics index |

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
- **Randomisation** (`utils/acuityChart.js`): every session draws a new seed for a seeded generator (mulberry32), so repeat tests see a different chart. A row is rejected if it repeats a row shown earlier in the session or in the last 60 rows shown on this device, or if it matches the row before it in more than one position. The seed is saved with the result, so the exact chart can be reproduced.

**Procedure**
- Forced choice: the user names each symbol in turn and guesses when unsure. Right and wrong are never shown.
- The test starts at 0.6 logMAR (or the chart floor if larger).
- **Base row:** the largest row with at least 4 of 5 symbols correct (raw count). If the starting row is not a base row, the test moves up one row at a time until one is found or the chart top (1.0 logMAR) is reached; a result with no base row is saved as `beyond_chart_top`.
- **Stopping rule:** after the base row, the test moves down one row at a time and stops when the smallest row shown has 1 or fewer correct (Sloan) or 2 or fewer correct (HOTV, Tumbling E), or when it reaches the chart floor.

**Scoring**
- logMAR = (base row + 0.1) − 0.02 × every symbol credited on the base row and smaller rows.
- **Four-choice charts (HOTV and E):** each row's count is guess-corrected, (c − 1.25) / 0.75 floored at 0, before the per-symbol credit. In simulation, a child who only guesses scores near the top of the chart (about 1.0 logMAR).
- **Saved per eye:** `logMAR_raw` (raw counts), `logMAR_guess_adjusted` (four-choice charts only; null for Sloan), the headline `logMAR`, letters correct and credited, letters correct per row, the base row and the floor/top flags.
- **Distance provenance:** `distance_method` (`camera_pupil_distance_estimate` or `manual_tape_measure` / `manual_string` / `manual_floor_marker` / `manual_helper`), `assumed_ipd_mm` and `ipd_source` (adult population mean or age-band median estimate). The camera distance is shown to the user as an estimate from typical eye spacing, not their own measurement.

**Children's mode**
- Answer buttons act as a matching card, so a helper can tap what the child names or points to.
- Tumbling E also accepts arrow keys and voice.
- An age band (3–5, 6–8, 9–12, 13+) scales the distance monitor's pupil-distance baseline to that age's median eye spacing (50, 53, 56 or 63 mm). Without this, a 5-year-old would sit at about 80 cm instead of 1 m and read about one line too good.

**Manual distance fallback.** When the camera can't estimate distance, or for a child (whose eye spacing is only an age-band estimate), the user can measure 1 m by hand (tape, string, floor marker or a helper) and confirm it. The camera then does not check distance during the test, and the result page says so.

**Result page and literature.** Validated home ETDRS methods show that standardized home testing can agree reasonably with clinical ETDRS, but the result depends on the specific protocol and population. EyeVio's own agreement has not been measured yet (Section 14), so no accuracy figure is claimed.

### 4.3 Color Vision Test — confusion-axis thresholds

Method: `confusion_axis_threshold_4afc`, version 2.

**Display check (before the test).** A web page can see only what the browser reports, so the check separates three kinds of information (`detectDisplayState()` in `utils/colorThreshold.js`):

| Kind | What | Effect |
|---|---|---|
| **Detected** (browser-reported media queries and `screen`) | forced colours, inverted colours, monochrome, colour depth, increased-contrast preference, `color-gamut` (srgb / p3 / rec2020, or below sRGB, or not reported), `dynamic-range: high` (HDR), local hour | Forced colours, inverted colours, monochrome or < 24-bit colour **block** the test. P3 / Rec.2020 / HDR and evening use **warn**. A reported gamut below sRGB marks every axis as not testable. |
| **Inferred** (computed, not measured) | the maximum u′v′ displacement per axis, computed for sRGB primaries (D65) at the dot luminances; the axis is "testable" only if that maximum is at least 4 × its provisional reference value | The physical panel's gamut, white point and gamma are **not measured**. On a P3 or HDR screen the browser's colour management may map sRGB values differently, which the app cannot see. |
| **Checklist only** (user-confirmed) | Night Shift / Night Light off, True Tone / adaptive colour off, brightness at about 75% (per-platform instructions) | Required before starting. Browsers do not expose these settings, so the app relies on the user's confirmation. |

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

- **Catch trials:** 4 rings defined by brightness (luminance × 2.2) instead of colour, mixed in with the staircase trials. Anyone attending can see them, whatever their colour vision.

**Output**
- A threshold per axis, worded as "Compared with provisional research reference values": 100 (protan), 100 (deutan) and 150 (tritan) × 10⁻⁴ u′v′, taken from published Cambridge Colour Test Trivector limits for young adults. They are not EyeVio norms; no EyeVio reference data exist yet.
- **Saved per axis:** threshold (units and u′v′), posterior SD, `uncertain` (SD > 0.3 log units), `beyond_screen_gamut`, the screen maximum (`screen_max_units`), `gamut_adequate`, the provisional reference and whether the threshold is above it. Per session: `screen_gamut` with the reported gamut, HDR flag, colour depth, the computed `max_displacement_units` per axis, the basis of that computation and the adequacy rule.
- **Gamut-inadequate axes** (maximum < 4 × reference, or a reported gamut below sRGB) are shown as "not testable on this screen" and never count towards a pattern.
- **Reliability:** an eye is unreliable when fewer than 3 of the 4 catch trials are right (a guesser passes with p ≈ 0.05) or nothing was seen on any axis. Unreliable runs are shown as such and not interpreted.
- A pattern label: `none`, `red_green` (with the leading axis), `tritan`, `generalised` or `unreliable`. Uncertain or untestable axes do not contribute.
- **No index.** The worst-axis index was removed; `score` is saved as null.
- **Same-display comparison only:** each result stores a `display_id` (a hash of platform, browser, screen size, pixel ratio, reported gamut, HDR and colour depth; not a person identifier). Change detection compares a colour result only with earlier results that have the same `display_id`.
- No severity labels are given.

### 4.4 Straight-Line Test — Amsler grid and line alignment

Method: `amsler_multicontrast_vernier`, version 2. "Perceived distortion" throughout: the grid records what the user reports seeing, not a retinal measurement.

**Grid**
- 20°×20° (20 cells of 1°) at 35.5 cm, sized from the card calibration.
- Shown first at full contrast, then at 5% contrast after a 5-second fixation countdown. Low-contrast grids may reveal a larger perceived distortion area in some users.
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

**Result (raw measurements only)**
- **Per eye, shown separately:** the marked area in deg² on the full-contrast grid and on the 5% grid; for each vernier location, the bias and threshold in arcseconds with their posterior SDs (uncertainty); flags; and reliability.
- **Reliability:** a location whose bias SD exceeds 35″ is "uncertain" and never flagged; an eye's vernier result is reliable with at most one uncertain location. Threshold flags are labelled experimental.
- Change detection tracks the larger marked area per eye (deg²).
- **No composite index.** The former per-eye index was removed; `score` is saved as null.

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
- **Display index** (not clinically validated): AULCSF as a percentage of an approximate healthy young-adult curve (peak logCS 2.1 at 3 c/deg), capped at 100 and averaged across eyes.
- **Validation:** the logCS at 1 c/deg is compared with Pelli–Robson as convergent validity only (a grating and a letter chart measure different quantities), and the qCSF is evaluated primarily by test–retest repeatability (Section 14).

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
- Right eye, then left. Each eye gets 32 trials: a QUEST staircase of 6 trials per quadrant, plus 4 false-positive catch trials (no blob) and 4 false-negative catch trials (a nominally high-contrast blob, 0.1 logCS). Screen contrast is not calibrated, so that contrast is nominal (`contrast_calibrated: false`).
- **Reliability:** a session is unreliable if fixation losses exceed 20%, or false positives or false negatives exceed 1 in 4. Unreliable sessions are shown but not saved.
- **Saved per eye:** fixation-loss rate (losses / trials), false-positive rate (false positives / valid catches), false-negative rate (misses / valid catches), with the counts behind each; catch trials with a fixation loss count neither way. The session also stores the sampling plan.

**Output:** relative asymmetry between quadrants only, never a sensitivity or dB value. The results show each rate as a percentage with its fraction.

**What it cannot do (shown to the user before and after the test)**
- **Equal or diffuse loss may not be detected.** The output compares the four corners with each other, so a loss that affects both eyes equally, or all four corners alike, can produce a "similar" result. "Similar" does not mean normal.
- **Small sample:** one spot location per corner and 6 staircase trials per corner per eye. A real visual-field test samples dozens of locations.
- It is not a visual-field test and does not test for any eye disease. It is never described as a glaucoma test; results from the earlier version are stored as `side_vision_legacy` and labelled "Side-vision home check (earlier version)" (Section 16.2).

### 4.7 Glare Test — contrast loss under glare

Method: `quest_4afc_delta_logcs`, version 2.

**Glare source**
- **Screen mode:** an on-screen bright ring, labelled "Simulated veiling luminance" everywhere it appears. It is not a physical glare source.
- **Torch mode:** a second phone's torch, set up with a fixed geometry each time (`TORCH_GEOMETRY` in `CataractTest.jsx`):
  - **Placement guide:** a top-down diagram shows the torch 30° to one side of the line of sight (the user picks left or right, and the choice is saved), 29 cm out from the screen centre;
  - **Distance:** viewing distance 50 cm, and torch about 58 cm from the tested eye;
  - **Brightness:** the torch on its brightest setting with the same room lighting as last time; an optional label records which phone was used, so the same torch can be reused;
  - **No-stare warning:** never look directly at the torch; keep looking at the test pattern;
  - all four checks (distance, placement, brightness, no-stare) must be ticked before the torch-on step.
- **Stop control:** "Stop — uncomfortable or need a break" is available on the torch-on screen and throughout testing. Stopping shows a "turn the torch off" message and saves nothing.
- Each result saves `glare_mode`, `glare_source_label` and, in torch mode, a `torch_setup` object with the geometry, side, phone and the confirmed checks. Change detection keeps screen-ring and torch sessions as separate series (Section 6.1).

**Procedure**
- Two QUEST staircases, without and with glare, each of 10 trials, picking grating orientation from 4 choices. They start after 2 practice trials.
- Screen mode interleaves the two conditions; torch mode runs the no-glare block first.
- Both staircases start from the same prior (1.5 ± 0.6 logCS). A lower prior for the glare condition would build a loss into the result before any answer.
- The direction never repeats from one trial to the next. Voice answers are supported.

**Result: Δ logCS = logCS(no glare) − logCS(glare)**
- **Headline:** "Contrast lost under glare: Δ X logCS", then the contrast multiplier, for example "×1.6 contrast needed with glare" (10^Δ), then both thresholds.
- **Display index** (0–100, not clinically validated, shown small): Δ 0 → 100, Δ ≥ 0.5 → 0.
- **Bands:** little loss (Δ < 0.15), moderate (< 0.3), large (≥ 0.3), and "low contrast sensitivity even without glare" when the no-glare result is below 1.2 logCS.
- **Test limit:** a threshold at or above 2.05 logCS means the staircase ran out of room (its grid tops out at 2.2).
  - If both conditions hit it, the result is "No measurable contrast loss under glare", and the user is told their sensitivity may be even better.
  - If only the no-glare result hits it, the page notes that the true loss may be slightly larger.
  - Both cases are saved as `ceiling_no_glare` and `ceiling_glare`.
- **Low confidence** is flagged when either staircase's SD exceeds 0.3.

### 4.8 Dry Eye Check

Method: `osdi12_blur_report_wb_photo` (or `osdi12_blur_report_no_photo` when the photo is skipped), version 3.

- **Questionnaire:** the full 12-item OSDI, with N/A allowed on the function and environment items. It is scored only when the core symptom items are complete, and the three subscales are kept. The OSDI is copyrighted; see the licence note in Section 11.
- **Blinking and blur-report check** (`components/TearStabilityCheck.jsx`): 30 s of natural reading gives blink rate and inter-blink interval. Three "keep your eyes open until the text looks blurry, then blink" trials give the **median blur-report time** in seconds, with how each trial ended (reported blur, an early blink, or the time cap). This is a subjective time-to-blur, **not tear break-up time**: no fluorescein or tear-film imaging is involved. No short/borderline bands are applied.
- **Photo (optional):** "Skip photo and save" finishes the check without a photo. If a photo is taken:
  - the browser is asked to lock white balance and exposure after 1.5 s, where supported;
  - frame colour is normalised to a reference face chroma before sclera redness is measured;
  - the photo is analysed on the device by default (Section 5.2). The pixel-based redness value is shown as an **experimental image index** on EyeVio's own scale, without a grade; the redness model's output is withheld (Section 13).
- **Result, each shown separately:** OSDI score and subscales; blink rate and inter-blink interval; median blur-report time; the experimental redness image index, or "No photo taken". No risk level is derived.
- **No combined index.** The former 40/40/20 questionnaire/photo/tear score was removed; `score` is saved as null. The detail page charts OSDI over time instead.

### 4.9 Eye Glow Test — red reflex symmetry

Method: `phone_rear_torch_bruckner_repeated_captures`, version 3. Phone only: it needs the rear camera, a dark room and a helper about 1 m away. It refuses to run on a laptop or front camera, because without a light next to the lens the reflex can't be judged.

**Capture**
- The torch is switched on through `MediaStreamTrack` where supported. Where it isn't (for example iPhone Safari), the user confirms that a second light is held beside the lens.
- The helper frames the face at 70–130 cm, estimated from pupil distance.
- Exposure is locked, the torch goes off for 3 s so the pupils widen, then 10 frames are captured within about 0.8 s.

**Analysis**
- Iris landmarks are found on each full-resolution crop, and a circle at 40% of the iris radius is sampled.
- The brightest 10% of pixels (the corneal glint) are dropped.
- Per-eye median luminance, red chroma and white-pixel fraction are computed across frames.

**Repeated captures** (`EYE_GLOW_CAPTURES`, `eyeGlowOutcome()` in `utils/visionTestScoring.js`)
- At least 2 usable captures are required, up to 3, with at most 3 failed attempts. Each capture computes the left-versus-right differences in brightness (%), red chroma and white fraction against flag levels (25%, 0.08 and 0.25).
- Another capture is requested while fewer than 2 are usable, or when a flag appears in only one capture, up to 3 in total.

**Outcome categories (the only headline)**

| Outcome | Rule |
|---|---|
| Asymmetry observed | the same flag (same measure, same eye) appears in at least 2 usable captures |
| No repeated asymmetry | at least 2 usable captures and no flag repeated. Labelled **"not an all-clear"** |
| No usable reflex | no usable glow in any capture |
| Capture unsuccessful | fewer than 2 usable captures |

- **Never "normal".** No outcome is displayed as normal or reassuring, no outcome uses a green tone, and the page says that none of these outcomes means the eyes are normal. The symmetry index was removed, so a high symmetry number can no longer suggest the absence of an abnormality; `score` is saved as null.
- "Asymmetry observed" is described educationally: what can cause a one-sided difference, and a suggestion to mention it to an eye care professional, especially for a child. There is no urgent-referral wording. Unrepeated flags are not shown as findings.
- **Kept out of tracking:** results are saved only with at least 2 usable captures (so "no usable reflex" and "capture unsuccessful" are shown but not saved), are marked `excluded_from: ['alerts', 'trends', 'clinician_report']`, and `red_reflex` is in `NOT_TRACKED_TESTS` (`change_detection.py`), so it never feeds change detection, trends, alerts or clinician-ranked notes.

### 4.10 Near Blur Tolerance

Route and `test_type`: `accommodative_lag` (kept so history is preserved). Method: `ascending_limits_gaussian_blur_near_letters`, version 2 (`utils/nearBlur.js`). It measures the smallest blur the user notices on near text. It does not measure accommodative lag or focusing fatigue; version 1 results are not comparable.

| Protocol element | Specification |
|---|---|
| **Target size** | A row of 5 random Sloan letters, each 1.0 logMAR (50 arcmin) tall at 40 cm, i.e. 5.8 mm, sized from the card calibration. Black on white, both eyes open, usual near glasses |
| **Viewing distance** | 40 cm, held by the camera distance monitor (±15%). Leaving the band pauses and restarts the run |
| **Blur method** | CSS Gaussian blur; σ (the Gaussian SD) is set in arcmin of visual angle and converted to pixels from distance and screen scale |
| **Run** | Ascending method of limits: sharp for a random 2–4 s, then σ rises at 0.4 arcmin/s. The user presses Space (or the button) at the first blur; threshold = σ at that moment |
| **Number of trials** | 1 practice run (unscored), 4 scored runs and 1 catch run (no blur for 12 s), in random order |
| **Stopping rule** | A run ends at the blur report or at the 8 arcmin cap (censored). The session ends after the planned runs plus any extra runs |
| **Repeatability criterion** | SD of log₁₀ thresholds across scored runs ≤ 0.15. If not met, up to 2 extra runs are added |
| **Status** | `ok`; `not_repeatable` (criterion still failed); `beyond_range` (more than 1 censored run); `unreliable_catch` (blur reported during the catch run); `too_few_runs` |
| **Native output** | Blur detection threshold, σ in arcmin (median of scored runs), with log₁₀ threshold and its within-session SD |
| **0–100 index** | Log-linear: 0.5 arcmin → 100, 8 arcmin → 0. Shown, explained and saved only when status is `ok`; otherwise null. Not clinically validated, never alerted on |

Change detection tracks log₁₀ threshold (version 2 only), with session SD = within-session SD / √runs; alerts are off. The page links to the Convergence Near Point test.

### 4.11 Convergence Near Point (NPC)

Method: `camera_npc_face_approach`, version 2.

- **Distance:** a 1.2 s baseline from pupil distance (an estimate, Section 3). During the approach, distance = baseline × (baseline eye-corner span ÷ current span).
- **Two break estimates per approach, kept separately:**
  - **Reported diplopia distance:** the estimated distance when the user pressed "They doubled" (median over the last 0.4 s). If the face wasn't tracked within 1.5 s of the press, it is recorded as "pressed, but face not tracked".
  - **Camera-estimated vergence break:** vergence is tracked as pupil separation ÷ outer eye-corner span; a break is a rebound of at least 0.02 above the running minimum while the face is no farther than at that minimum.
- **Camera confidence** (`assessNpcCamera()`, `NPC_CAMERA_LIMITS`). The camera break is "unable to measure" for that approach if any check fails, and the reason is shown:
  - **pupil localisation:** iris landmarks in ≥ 70% of approach frames and at least 20 located samples;
  - **eye-corner span:** at least 60 px throughout, and stable during the baseline (coefficient of variation ≤ 5%);
  - **face angle:** head turn (yaw, from unequal eye widths) mean within ±0.2 and SD ≤ 0.08; head tilt (roll, from the eye-corner line) SD ≤ 5°.
- **Recorded break and why:** per approach, the break is whichever came first while approaching (the farther distance) of the reported diplopia and a camera break that passed its checks. This follows the clinical push-up convention, where the break is recorded at the first of reported doubling or an observed eye deviation. Both values, their difference and an agreement flag (within 3 cm) are shown in a per-approach table and saved.
- **No break:** "No doubling reported before X cm" (the closest distance the camera followed with confidence) is shown in grey, as a camera limit rather than a measured break point, and is saved as `closest_no_break_cm` with `npc_cm` null. If neither a report nor a confident camera value exists, the approach is "unable to measure".
- **Repeat:** two approaches. A break at least 2 cm farther on the second approach is noted as possible tiredness, with the caveat that distances are estimates.
- **Saved:** `npc_cm` (mean break, null without a break), `reported_diplopia_cm`, `camera_break_cm`, `mean_agreement_cm`, `compared_approaches`, `agreeing_approaches`, `camera_unable_approaches`, the limits, `break_rule` and per-approach details. Nothing is saved when every approach is unable to measure.
- **Headline:** the break distance in cm. Change detection tracks centimetres for version 2 only; version 1 (which accepted camera breaks without confidence checks) falls back to display-only.
- **Display index** (not clinically validated): 6 cm or closer → 100, 20 cm or farther → 0; null when no break was found.

### 4.12 Side Vision Game — peripheral awareness

Method: `eccentricity_psychometric`, version 2.

- **Gameplay:** a "whack-a-mole" tap game with a centre-fixation check. Targets spawn at random radii between a safe zone and the edge, with ±15° direction jitter.
- **Hit-rate curve:** P(hit) = 0.97 / (1 + exp((ecc − e50) / spread)), fitted by maximum likelihood. It reports the mean slope in % per degree, and e50, the eccentricity where catch rate falls to 50%.
- **Reaction time:** a Theil–Sen line of reaction time against eccentricity (ms per degree), plus the median reaction time.
- Taps made while looking away from the centre count as misses but are left out of both fits.
- **Eccentricity** uses the card-calibrated scale and an assumed 50.8 cm viewing distance.
- The wording is "side awareness", not a vision measurement. The results page is titled "Side Vision Game results — a reaction game, not a visual-field test". It leads with hits, misses, reaction time and the two fits. The 0–100 game index is a small labelled line with no grade.

### 4.13 Posture & Lighting Check — ocular ergonomics

- **Continuous camera monitor** for room and screen glare and for viewing distance.
- **Blink biofeedback** (`hooks/useBlinkCounter.js`, `utils/blinkCoach.js`):
  - MediaPipe eye-aspect-ratio blink detection, giving a rolling blinks-per-minute over the last 60 s, shown after 30 s of data.
  - **Coaching categories for the observed rate:** lower observed blink rate (under 8/min), intermediate (8–11), higher (12 or more). They are coaching categories for that session, not health classifications: camera blink counts vary with lighting, glasses and face angle, and blink rate varies widely between people. All three use the same neutral colour.
  - The window restarts when the face leaves the view, the tab is hidden or a break is running.
  - In the "lower" category, an in-page nudge suggests slow, complete blinks, at most every 2 minutes.
  - Saved as `coaching_category`, with the cut-offs and a note that they are not health classifications.
- **20-20-20 breaks:**
  - Every 20 min (or 30 min, or 1 min to try it out), an overlay offers a 20-second "look 6 metres away" break or "Snooze 5 min". "Break now" is always available.
  - With permission, a browser notification fires when the tab is in the background.
  - Distance and lighting alerts pause during a break.
- **Display index** (not clinically validated): reflects lighting and distance alerts only. Blink nudges and breaks never lower it. It is shown as a small "Setup index" line with no grade or colour; the results lead with duration, distance band, blinks and breaks.
- **Saved data:** `blink_rate` and `breaks_20_20_20` in `test_details`.

---

## 5. Camera and photo monitoring

These three modules are separate from the 12 tests in Section 4: one camera session (Eye Tracking Analysis) and two photo modules (Eye Health Photo Monitor and Lens Photo Timeline).

### 5.1 Eye Tracking Analysis — `/eye-tracking-analysis`
- A **quick check** (about 90 s) and an **extended session** (about 5 min, with coaching).
- Measures blink rate (eye aspect ratio) and squinting. The headline is the blink rate in blinks per minute; feedback is driven by blink rate.
- A **fatigue index** is shown as a display index (not clinically validated). It never raises an alert; the former `high_fatigue` alert was retired.
- Session history and trend (`/api/webcam/metrics`, `/api/webcam/fatigue-trend`).
- **Blink calibration** (`/calibrate-blink`): a two-step capture of a baseline and of blinks, which personalises the blink thresholds to the user's eye shape.

### 5.2 Eye Health Photo Monitor — `/eye-health-monitor`
- Guided eye-photo capture, stored as a timeline. The `condition_type` is a user-chosen label for organising photos (dry eye, cornea scar, glaucoma, general or cataract); it does not change the analysis, and the app does not test for any of these conditions.
- **Photos remain on-device by default; an upload occurs only after an explicit storage choice or disclosed fallback.** The same applies in the Dry Eye Check and the Lens timeline.
  - By default the photo is analysed in the browser and only per-eye numbers are sent to the API; the image is discarded when the page closes.
  - **Explicit storage choice:** the "Save photos to my account" switch uploads the photo, which is then stored on the server with the account.
  - **Disclosed fallback:** when the browser can't run the analysis (no WebAssembly SIMD, Web Workers or WebCrypto, or a model fails to download, fails its hash check or takes over 90 s), the photo is sent to the server for analysis. The result states that it was analysed on the server and why.
  - Each result says where it was analysed and why.
- **Capture-quality gate** (v2.11): checks framing (both eyes visible and large enough), extreme lighting, shadows, backlight and one-sided glare. Framing problems block capture; extreme lighting can be acknowledged and overridden.
- **Glasses detection:** a warning only, never a block.
- **Month-over-month comparison:**
  - landmark-aligned eye crops, structural similarity (SSIM), per-metric changes and a comparison-confidence score;
  - "retake to confirm" logic before a sustained change is shown ("Photos look different from your reference");
  - comparisons rest on unvalidated appearance indices, so they are shown on the page but **never raise an alert** (the `eye_health_deterioration` alert was retired);
  - with photos kept on the device, comparison uses the numbers only.
- **Image models:** the redness, cataract and pathology models are not shown to users. The page returns only "Experimental analysis completed", "Result is not clinically interpretable" and "This model is currently being evaluated for dataset shortcuts" (Section 13).

### 5.3 Lens Photo Timeline — `/cataract-opacity-monitor`
- Captures zoomed, high-resolution **pupil close-ups** of both eyes as a timeline.
- The **capture-quality gate** (framing, focus, lighting) runs as before; it does not depend on any disease model.
- **No cataract result is shown.** No likelihood, band, grade or Grad-CAM reaches the user. The page shows the three experimental messages and links to the AI Research Lab. The model's behaviour is presented there as an experiment (Section 13).
- Not LOCS III grading, and not a size in millimetres.

### 5.4 Experimental AI Research Lab — `/research-lab`
The cataract, sclera-redness and pathology models are presented as a research finding rather than a feature:

> High test accuracy did not demonstrate clinical validity. Occlusion testing revealed that the model learned dataset-specific shortcuts rather than ocular features.

The page shows, from the model-card evaluation files (`public/research-lab/*_eval.json`, kept identical to `docs/model_cards/assets/` by a test):
- the masking experiment: performance with the full image, with the eye hidden, and chance, plus how much performance survives without the eye;
- calibration (temperature, ECE, Brier, reliability diagram), Grad-CAM figures and central-attention fractions;
- out-of-distribution behaviour, dataset leakage counts and limitations;
- what EyeVio does with these models now, and what would have to change before any result could be shown.

The previous "research triage panel" for the pathology model was removed from the user-facing screens.

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
- **Alerts:** the two most recent sessions must both be reliably worse before a `vision_decline` alert fires. A single reliably worse session shows "possible change — retest to confirm". The alert reads "Repeated change in a home vision check", says it is a home check, not a diagnosis, and suggests seeing an eye care professional if the user has noticed a change.
- **Native units only:** acuity (logMAR), contrast (AULCSF), glare (Δ logCS), colour (log threshold), Amsler (marked area, deg²), NPC (break distance, cm) and Near Blur (log₁₀ arcmin; display only, never alerted). A test without a native measure falls back to its 0–100 display index, which is shown as "display only" and **never** raises an alert. Tests whose index was retired (score null) have no fallback series.
- **What is compared:** only results with the same `method_version`, and never rows with a data-quality flag. Glare keeps screen-ring and torch sessions as separate series (`glare Δ logCS (screen ring)`, `glare Δ logCS (torch)`). Colour compares only results with the same `display_id`.
- **Not tracked:** Eye Glow (`red_reflex`) is in `NOT_TRACKED_TESTS`; it has no series, trend card or alert.
- The priors will be replaced by measured repeatability from the validation study (Section 14).

### 6.2 Trends — `/trends`
- **Cards:** one per test type, eye and method version, in the test's own units.
- **Fit:** a Theil–Sen robust slope with its rank-based 95% CI (Sen, 1968). A trend needs at least 6 sessions spanning at least 28 days; otherwise the card says so instead of fitting.
- **Verdict:** worsening or improving only when the slope CI excludes 0 **and** the projected change reaches the MCID.
- **Forecast:**
  - always drawn as a shaded 95% prediction interval (robust MAD scale, Student-t quantile), never a bare line;
  - capped at half the observed span, and never more than 90 days.
  - Polynomial and exponential curves, and prescription predictions, are not used.
- **Also shown:** tests completed, the average fatigue index (labelled as a display index, with no recommendation attached) and lifestyle next to the selected test.
- **Speed:** responses come from a per-user precomputed snapshot (Section 15.6).

### 6.3 Lifestyle — `/lifestyle`
- A daily log of screen time, sleep, physical activity, outdoor time, diet and hydration, symptoms and notes.
- Period averages, and correlations between habits, test results and fatigue (`/api/lifestyle/correlations`).

### 6.4 Lens tracking
- Lens type and purchase date, and an effectiveness index from recent results (a display index, not clinically validated).
- The index no longer recommends replacement or raises an alert; the `lens_replacement` alert was retired.

---

## 7. Alerts and notifications

| Alert | Trigger |
|---|---|
| `vision_decline` | The two most recent sessions of a test are both reliably worse than baseline in the test's native unit (RCI > 1.96 and change ≥ MCID). Medium severity |
| `myopia_progression` | Prescriptions the family logged show fast change (≥ 0.5 D/year). Titled "Prescription change logged"; suggests asking the eye doctor who measured them. Medium severity |
| `family_child_alert` | Copy of a child's alert sent to their caregivers |
| `system_test` | Test notification sent from Settings |

**Retired alerts.** These rested on 0–100 indices or on the image models and no longer fire: `high_fatigue` (fatigue index), `lens_replacement` (effectiveness index), `eye_health_deterioration` (photo appearance indices), and `vision_decline` on a display index. Migration `b2e5f8c1d4a7` dismisses any stored ones, and the clinician report filters them out.

**Delivery and management**
- An in-app alerts page: mark read, dismiss, record the action taken, mark all read, resend.
- Email over SMTP, and Web Push with VAPID keys (subscribed per device).
- Per-user notification preferences.

---

## 8. Reports and data export

- **Health report** (`/reports`; `GET /api/report?days=30&format=pdf|json`): per-test latest native measurement (OD/OS) and session counts, webcam blink summary, lifestyle patterns and lens information for a chosen period. Fatigue and lens effectiveness appear only as labelled display indices; no score-based recommendations.
- **Clinician one-pager** (`GET /api/report/clinician`): a single-page PDF headed "UNVALIDATED RESEARCH & EDUCATIONAL PROTOTYPE · Not clinically validated · Not for diagnosis or treatment". It contains:
  - the latest home result per test **in native units** (logMAR, AULCSF, Δ logCS with the contrast multiplier, thresholds, deg², NPC cm with reported and camera values, Near Blur arcmin, OSDI, blink rate and blur-report time), with OD/OS and date. 0–100 app indices are omitted, and Eye Glow is left out entirely;
  - a sparkline of better-eye logMAR from the current acuity method;
  - up to five "automated notes (not clinically validated)", **unranked**, from alerts that are still in use;
  - a blinking / myopia card, and the positioning statement in the footer.

  Rows with a data-quality flag and retired alerts are left out.
- **Data export** (Profile → Export Data): CSV files of vision tests and lifestyle logs. Eye photos and their metrics, alerts, myopia, family and screen-time records are not exported. Settings → Privacy & Data downloads only the app settings as JSON (Section 11.2).

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
- What is stored about children, who can see it, and what is missing (consent, audit logging, deletion) is in Section 12.

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
- **Achievements** (`/achievements`): 12 badges for test milestones, streaks (3-day, week, month), lifestyle logging and Early Adopter. No badge depends on a test result or display index.
- **Community:** roadmap only. It is not in the navigation or keyboard shortcuts of this build; the placeholder page at `/community` is labelled "Roadmap only" and has no posting, messaging or sharing.

---

## 11. Privacy and security

This section records what this build implements and what it does not. Most of the controls a public service handling health data needs are **not yet implemented**. The build is suitable for local development and a supervised research setting, not for public deployment (Section 20).

### 11.1 Photos and on-device analysis
- **Photos remain on-device by default; an upload occurs only after an explicit storage choice or disclosed fallback.**
  - **Storage choice:** "Save photos to my account" is off by default (`ml/onDeviceInference.js`, `OnDevicePrivacyToggle`).
  - **Disclosed fallback:** the browser can't run the models, face landmarks aren't found, a model file is missing or fails its integrity check, or analysis times out. The result says why the photo was sent.
  - **Fallback with saving off:** the server analyses the photo but stores no thumbnail and strips images from the stored analysis.
  - **Caveat:** the API stores the photo when a client omits `store_image`. The web app always sends it; other clients must too.
- **Model outputs:** the API rejects results from a model file whose SHA-256 isn't in the manifest, so a client can't submit its own findings. It also withholds the image models' outputs before anything is stored or returned (Section 13).
- **Saved photos** are stored in PostgreSQL as data-URL text, not as files or in object storage.

### 11.2 Security and privacy controls

Status: **Implemented**, **Partial** (some of the control exists, with the gap stated) or **Not implemented**.

| Control | Status | What exists in this build |
|---|---|---|
| Password hashing | Implemented | bcrypt |
| CORS and upload size | Implemented | `ALLOWED_ORIGINS` allow-list; `MAX_CONTENT_LENGTH` |
| Email verification | Not implemented | Accounts are active as soon as they register; the user table has no verification field |
| Password reset | Not implemented | The "Forgot password?" link does nothing. Only an authenticated `POST /api/auth/change-password` exists |
| Login rate limiting | Not implemented | No request limiter on any endpoint |
| Lockout and abuse controls | Not implemented | No failed-attempt counter, lockout or CAPTCHA |
| Refresh-token rotation and revocation | Partial | Access tokens expire after 1 hour (`JWT_ACCESS_TOKEN_EXPIRES`) and refresh tokens after 30 days. `POST /api/auth/refresh` issues a new access token but does not rotate the refresh token. There is no revocation list and no server-side logout. The web app doesn't keep the refresh token, so users sign in again when the access token expires |
| Token storage (cookie vs browser storage) | Browser storage; cookies not implemented | The access token and the user profile are kept in `localStorage` and sent as a Bearer header, so any script injected into the page could read them. No httpOnly cookies. CSRF protection isn't needed for header tokens and isn't present. Logout only clears browser storage |
| Authorisation for family and child records | Partial | Routes filter by the signed-in user, and caregiver access goes through `assert_can_view_child` (same family, caregiver role). **No automated tests** cover cross-family or caregiver/child access. The only cross-account test covers analysis jobs |
| Account and data deletion | Not implemented | **The Settings "Delete account" button shows a success message and clears browser storage without calling the server; no data is deleted.** No delete-account endpoint exists. Database cascades from the user row are defined for most tables, but not for `analysis_jobs`, `family_groups` or `family_invites` |
| Item-level deletion | Partial | Single eye photos, myopia profiles and prescriptions, push subscriptions, screen-time connections and family invites can be deleted. Vision test results, webcam metrics, lifestyle logs and alerts cannot |
| Configurable photo retention | Not implemented | The Settings "Data retention" menu is saved in the browser only and has no effect on the server. There is no purge job |
| Caregiver-access audit log | Not implemented | Caregiver views of a child's records are not logged |
| Encryption in transit | Not implemented in the app | The API serves plain HTTP. There is no TLS, HSTS or secure-proxy setting, and no reverse-proxy configuration in the repository. A deployment must terminate TLS in front of the API. Camera features need HTTPS on any host other than `localhost` |
| Encryption at rest | Not implemented | No database, field or photo encryption; this relies entirely on the host's disk encryption |
| Secrets management | Partial | Secrets come from environment variables or `.env` (gitignored; only `.env.example` is tracked). `SECRET_KEY` and `JWT_SECRET_KEY` fall back to placeholder values, and the production config does not refuse to start with them |
| Dependency and container scanning | Not implemented | CI runs tests, lint and the build only: no npm audit, pip-audit, Dependabot or CodeQL. There are no container images to scan |
| Backup and restore | Not implemented | No backup scripts, schedule or tested restore procedure |
| Privacy notice and consent records | Not implemented | The "Privacy Policy" link on the home page does nothing. No consent to app use is recorded. Consent version and date are recorded only for validation-study participants (Section 14) |
| Incident response | Not implemented | No incident-response or breach-notification plan |
| Data export | Partial | Profile → Export downloads CSV files of vision tests and lifestyle logs. `GET /api/report?format=json\|pdf` exports a chosen period of tests, webcam metrics, lifestyle and lens data. Settings → "Export my data" downloads only the cached profile and settings. Eye photos and their metrics, alerts, myopia, family and screen-time records are not exported |
| Permanent deletion | Not implemented | See account and data deletion |

**User-facing copy matches this table.** Help says that saved data is not encrypted by EyeVio, that the web app does not enforce HTTPS, and that account deletion is not available yet. Earlier copy claimed AES-256 storage, a full export and permanent deletion.

### 11.3 Retention and deletion of derived ocular metrics

Derived ocular metrics are the numbers EyeVio computes and stores:
- vision-test results and their `test_details`;
- per-eye photo metrics and comparisons;
- webcam blink metrics;
- alerts and trend snapshots;
- myopia prescriptions and progression.

- **Retention period:** none. Derived metrics are kept until the account is deleted, which is not yet possible (Section 11.2). No scheduled purge exists.
- **Photos analysed on the device:** the image is discarded after analysis. The derived per-eye numbers are uploaded and kept like any other result.
- **Deleting a photo** (`DELETE /api/eye-photos/<id>`) removes its row, including the derived metrics and any thumbnail.
- **Vision-test results** cannot be deleted one by one. A data-quality flag (`data_quality_flag`) excludes a row from analysis but keeps it.
- **Trend snapshots** are recomputed from the source rows, so they never hold data that the source tables no longer have.
- **Background jobs:** rows in `analysis_jobs`, including any result they carry, are purged one hour after creation.
- **Downloads:** exported CSV, JSON and PDF files leave EyeVio's control once downloaded.
- **Validation-study data** follows the study protocol instead: each participant has a `retain_until` date, and withdrawal removes them from all analyses (`docs/validation/PROTOCOL.md`).

### 11.4 Other
- **Timestamps:** stored in UTC. Photo timelines can group by the user's local date.
- **Validation study data:** files linking participants to accounts live in `data/validation/`, which is gitignored. Analysis outputs carry pseudonymous participant IDs only (Section 14).
- **OSDI licence:** OSDI is a copyrighted instrument. Permission and applicable conditions of use must be confirmed with the rights holder or authorized licensing organization before public deployment or distribution. Until confirmed, the questionnaire should be used only within the scope expressly permitted by its license.
  - **Rights holder:** AbbVie (formerly Allergan).
  - **To confirm in writing:** electronic reproduction; automated scoring; translation; modification (EyeVio allows N/A on the function and environment items and splits the items into sections); and inclusion in a publicly available app.
  - **Status:** not yet confirmed. The questionnaire screen shows an attribution and research-use note (`OSDI_LICENCE_NOTE` in `utils/dryEyeQuestionnaire.js`).

---

## 12. Child privacy

Children's data reaches EyeVio in two ways:
- **Managed child accounts** in Family & caregivers (Section 9.2);
- **Myopia Progression profiles**, which a parent keeps under their own account (Section 9.1).

Children's test results and photos use the same tables, retention and photo defaults as adults' (Section 11). None of the child-specific safeguards below has been reviewed against COPPA, GDPR-K, the UK Age Appropriate Design Code or any other children's privacy law.

### 12.1 What is collected

| Record | Fields | Needed for |
|---|---|---|
| Managed child account | Display name; date of birth or age (optional); a generated placeholder email (`managed-…@children.eyevio.local`); a random password nobody knows | Age-band eye spacing for the distance check; age-appropriate charts |
| Myopia profile (under the parent's account) | Display name, date of birth, sex, an optional ethnicity note, school grade; prescriptions | Age-typical progression ranges and risk-factor display |
| Child's activity | Vision-test results, lifestyle logs, alerts and any photos, as for adults | The tests themselves |

**Minimum data collection: Partial.**
- **In place:** a managed child has no real email address and cannot sign in with a password. Notifications and email alerts are off on the child's account, and date of birth is optional.
- **Not in place:** no field-by-field review has decided what is needed. Name and date of birth could be replaced with a nickname and age band. The myopia profile's sex and ethnicity fields are optional, but the form doesn't say why each is asked.

### 12.2 Access
- **Caregivers** in the same family see a managed child's 30-day outdoor-vs-screen chart, recent tests, lifestyle logs and alerts. Alerts on a child's account are also sent to the family's caregivers.
- **Access check:** `assert_can_view_child` requires a caregiver role in the same family. **It has no automated tests** (Section 11.2).
- **Audit logging of caregiver access: Not implemented.** No record is kept of which caregiver viewed which child's data, or when.
- **Handing over the account:** a managed child account comes with a 90-day invite so the child can later claim it. Nothing is reviewed or reset at handover; the history moves with the account.

### 12.3 Consent and deletion
- **Parental consent: Not implemented.** Creating a managed child or a myopia profile records no consent, verifiable parental consent, or child assent. The validation study has its own consent and assent procedure for minors (`docs/validation/PROTOCOL.md`).
- **Deleting a child's data: Partial.**
  - Myopia profiles and their prescriptions can be deleted.
  - A managed child account, its test results and its family membership cannot be deleted, and a caregiver cannot remove a child from the family.
- **Retention:** as for adults (Section 11.3). There is no shorter period for children.

### 12.4 Required before children use a public build
- verifiable parental consent, recorded with version and date;
- a reviewed minimum-data set (nickname and age band where possible);
- caregiver-access audit logging;
- authorisation tests for family and child records;
- child-account and child-data deletion;
- a children's privacy notice;
- legal review for the regions where the app will be offered.

---

## 13. AI and machine learning

| Component | Runs in | Purpose | Status |
|---|---|---|---|
| MediaPipe Face Mesh and Hands (`@mediapipe/face_mesh` 0.4.1633559619, `@mediapipe/hands` 0.4.1675469240) | Browser | Distance monitor, eye-cover check, pupil regions, live eye tracking, blink counting, convergence break, red-reflex sampling | Active |
| MediaPipe Face Landmarker (`face_landmarker.task`) | Server | Landmarks for crops, framing, lighting regions and alignment | Active |
| Bayesian psychophysics (`qcsf.js`, `psychophysics.js`, `vernier.js`, `colorThreshold.js`) | Browser | qCSF; QUEST for colour, glare and side vision; Psi for vernier; logistic fit for the side game | Active |
| Sclera redness ResNet-18, bounded ordinal (`sclera_redness_ordinal.pth`) | Browser (int8 ONNX, 11 MB) or server | Redness score and 0–4 grade. Single pass; 5-pass test-time augmentation is opt-in (`SCLERA_TTA=1`) | **Research lab only.** Output withheld from users |
| Cataract ResNet-18 (`cataract_detection_resnet18.pth`, `cataract_model_meta.json`, `cataract_ood_stats.npz`) | Browser (fp32 ONNX, 46 MB, including OOD score and CAM) or server | Calibrated likelihood and band, "cannot assess", Grad-CAM | **Research lab only.** Output withheld from users; not active |
| Cataract CORN ordinal head (`train_cataract_corn.py`, `corn_gate.py`) | Server | Severity grade (normal / immature / mature) | Built and tested; not trained, not approved, release-gated (below) |
| Pathology ResNet-18 (`pathology_resnet18.pth`) | Server | Four-class classification | **Research lab only.** Output withheld from users |
| White-balance normalisation (`dry_eye_analysis.py`) | Browser and server | Removes colour casts before the pixel-based redness measure (gains 0.7–1.4) | Active; the measure is shown as experimental, without a grade |
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

**The finding: dataset shortcuts.** High test accuracy did not demonstrate clinical validity. Occlusion testing revealed that the model learned dataset-specific shortcuts rather than ocular features.
- With the eye masked out, performance barely changes: cataract AUC 0.998 (0.99985 with the full image), redness AUC 0.993, pathology macro-F1 0.68 (chance is 0.25).
- All three models share a public data source. Near-duplicate leakage was found for redness (8 of 187) and pathology (51 of 348), and redness labels are weak, derived from folders.

**What the product does about it**
- The three models' outputs are **withheld from users** everywhere: API responses, stored history, findings, photo comparison, the timeline, alerts and reports (`withhold_model_outputs()` in `app/ai_models/experimental_models.py`). Where a model ran, the user sees only: "Experimental analysis completed", "Result is not clinically interpretable", "This model is currently being evaluated for dataset shortcuts".
- The photo capture-quality gate stays, because it does not depend on disease classification.
- The models' behaviour is shown as an experiment in the **AI Research Lab** (`/research-lab`, Section 5.4).
- `EXPERIMENTAL_IMAGE_MODELS_USER_FACING=1` re-enables user-facing output for research builds only. It is off by default and must stay off in any public deployment.
- Before any result could be shown again, a model would need an external, clinician-labelled test set from the same kind of camera, and a masking test showing that performance depends on the eye.

**CORN release gate.** Placing trained CORN files next to the server never switches the ordinal grader on. `eyevio/app/ai_models/corn_gate.py` loads it only when every check passes, and `model_status()` reports each failed check by name (`ordinal_grader_gate`):

| Check | Requirement |
|---|---|
| Feature toggle | `CATARACT_CORN_ENABLED=1` set explicitly (off by default) |
| Model-card approval flag | `cataract_corn.approved: true` in `docs/model_cards/approvals.json`, with approver and date. Currently `false` |
| Version and levels | meta `version` = approved `model_version` = `corn_v1`; meta `levels` = approved levels (normal / immature / mature) |
| Dataset metadata | meta `dataset` {name, version}, written by the training script's required `--dataset-name` / `--dataset-version`, equals the approved dataset |
| Weights | SHA-256 of the weights file equals the approved hash |
| Validation thresholds | held-out test n ≥ 150; QWK ≥ 0.70 with lower 95% CI ≥ 0.60; MAE ≤ 0.35 grades; per-threshold ECE ≤ 0.05 |

Approval also requires a masked-eye shortcut control recorded in the model card. Even when enabled, the ordinal output sits inside the cataract result, which is withheld from users (above).

**Model serving**
- The server loads and runs each model once in a background thread at startup (`WARM_MODELS`). `GET /health` reports which models are warm and how long each took.
- Model paths can be overridden with environment variables (Section 17).

---

## 14. Scientific validity and the validation study

**What is checked today**
- **Stimuli:** all major psychophysical stimuli (gratings, the side-vision blob, vernier lines, Tumbling E and the colour-test Landolt C) have orientation, contrast and golden-image tests (Section 18). Geometric size is calibrated; luminance and colour on the user's screen are not measured.
- **Scoring:** scoring and adaptive procedures are tested in simulation, for example guessing children, vernier false flags, a perfect glare run and side-vision catch trials.
- **Image models:** have model cards with confidence intervals and calibration, and a masking test that showed they rely on dataset shortcuts (Section 13).

**What is not yet validated:** agreement of any home test with its clinical reference, and the real test–retest repeatability of each test on users' own devices.

**Validation study (protocol v2.0, ready for ethics review and preregistration).** The protocol is in `docs/validation/PROTOCOL.md`.
- **Design:** a clinic visit with masked reference tests and the app, plus an app retest at home 1–7 days later.
  - **Randomisation:** method order and app test order are randomised per participant, stratified by arm and device class (phone vs computer).
  - **Recruitment quota:** at least 25 analysable adults per device stratum.
  - **Staging:** the study may run acuity first (stage 1, the primary endpoint), with an interim-report rule when fewer than 60 adults are analysable.
- **Participants:** adults, 60 analysable (75 recruited), at least a third with reduced vision so the range is wide enough for ICC to mean something. A **separate paediatric arm** (8–17) is analysed and reported on its own, never pooled with adults, and starts only after the school or fair's human-participant requirements are met.
- **Comparisons:**
  - **agreement** (same quantity): acuity against an ETDRS chart at 4 m; NPC against an RAF rule;
  - **convergent validity** (different quantities): qCSF logCS at 1 c/deg against Pelli–Robson, correlation only. **No Bland–Altman or ICC** between a grating threshold and a letter-chart threshold;
  - **repeatability:** every app measure. For qCSF this is the primary evaluation;
  - **testability:** the completion rate of every app test, with calibration failures and unreliable sessions counted rather than silently excluded.
- **Protocol rules:** correction (unaided, glasses, contacts) recorded for every measurement, with the same correction required for both methods; device class, model, screen size and pixel density, browser, OS, camera and ambient lux recorded per session, with device-class subgroups (≥ 10 pairs); reference within 24 h of the app; retest 1–7 days; pre-defined exclusions, each counted in the report; one eye per participant in the primary analysis, both eyes with participant-cluster bootstrap CIs as a sensitivity analysis.
- **Ethics:** preregistration before enrolment; consent, parental permission and child assent; withdrawal; data retention; adverse-event recording; a checklist of school/fair requirements before any data from minors.
- **Statistics** (`eyevio/app/utils/agreement.py`):
  - Bland–Altman bias and 95% limits of agreement, each with a CI, plus checks for proportional bias and normality (agreement measures only);
  - ICC(A,1) for absolute agreement and ICC(C,1) for consistency, with McGraw & Wong CIs. Checked against the Shrout & Fleiss (1979) worked example;
  - Pearson r (Fisher-z CI) and Spearman ρ (Bonett–Wright CI) for convergent validity;
  - within-subject SD and coefficient of repeatability;
  - Wilson CIs for completion rates, and a participant-cluster bootstrap.
- **Pre-specified targets:** primary endpoint is adult acuity agreement (|bias| ≤ 0.05 logMAR, LoA half-width ≤ 0.15 logMAR, ICC(A,1) lower CI ≥ 0.75). Key secondary: qCSF CoR at 1 c/deg ≤ 0.30 logCS. Contrast vs Pelli–Robson: Pearson r lower CI ≥ 0.50.
- **Tools:**
  - `scripts/validation_export.py` pulls participants' results from the database (participant IDs only; withdrawn participants skipped) and can write a draft sessions file that includes unreliable attempts.
  - `scripts/validation_analyze.py` reads app results, references, participants and sessions, and writes `report.md`, `results.json`, Bland–Altman plots for agreement and retest, and scatter plots for convergent validity. `--simulate N` runs a labelled dry run with synthetic devices, corrections, failures, withdrawals and a paediatric arm. `--measures acuity_logmar` restricts the analysis and the testability table to stage 1.
  - Templates (`participants.csv`, `reference_measurements.csv`, `sessions.csv`) are in `docs/validation/templates/`.
- **Feedback into the product:** the measured test–retest SDs will replace the provisional priors in change detection.
- **Science fair:** `docs/SCIENCE_FAIR.md` presents only the stage 1 acuity study as the experiment, with fixed hypotheses, a results table to fill in from the study and a pre-judging checklist. The rest of EyeVio appears there only as context.
- **Later options for a true contrast agreement study:** an EyeVio Pelli–Robson-style letter task compared with the Pelli–Robson chart, or the qCSF compared with a validated CSF system at matched spatial frequencies.

---

## 15. Architecture

### 15.1 Stack

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

### 15.2 On-device inference
- **Worker:** `src/ml/eyeInference.worker.js` runs ONNX Runtime Web.
  - It uses WebGPU for the fp32 cataract model when offered, and WebAssembly SIMD otherwise.
  - WebAssembly is single-threaded, because threads need cross-origin isolation headers (`COOP`/`COEP`). It switches to up to 4 threads if they are added.
- **Model files:** downloaded once, checked against the SHA-256 in `public/models/manifest.json`, and kept in the Cache API.
- **Ported pipeline** (`src/ml/ocularAnalysis.js`, `src/ml/imageOps.js`): landmark cropping, white balance, ocular patch preparation, an antialiased 224 px resize, the heuristic redness and tear-film measures, and the cataract OOD score and class-activation map. The last two are part of the exported graph, so they come from the same inference call.
- **Parity with PyTorch** (`scripts/export_onnx.py`):
  - **Cataract (fp32):** probability within 5 × 10⁻⁷, with 100% agreement on band and "cannot assess".
  - **Redness (int8):** 100% grade agreement, MAE 0.138 against 0.134.
  - Cataract stays fp32 because int8 changed the "cannot assess" decision on 3% of webcam-like crops.
- **Parity with the server:** `npm run test:parity` runs the browser pipeline under Node and compares every intermediate number with the server's: 276 checks on 6 committed fixtures.
- **Server fallback:** used when the user opts to save photos, when the browser lacks WebAssembly SIMD, Web Workers or WebCrypto, or when a model fails to download, fails its hash check or takes longer than 90 s.

### 15.3 MediaPipe loading
All Face Mesh and Hands instances are created through `src/utils/mediapipeSolutions.js`. MediaPipe's runtime breaks if two instances load at once (they abort) or if an instance is closed while still loading (the next one hangs, printing "still waiting on run dependencies"). React StrictMode in development and quick page changes triggered both.

The loader therefore:
- initialises one instance at a time, page-wide;
- makes each frame wait for its instance to finish loading;
- delays closing an instance until loading has finished;
- loads assets from jsDelivr at the exact installed package versions, which are pinned in `package.json`.

### 15.4 Server path and transport
- **Warm start:** models warm at startup. The first analysis after a restart took 469 ms, against 7.5 s with lazy loading.
- **Background jobs:** with `Prefer: respond-async`, photo and dry-eye analysis return `202` and a job id. The client then polls `GET /api/jobs/<id>` while a thread pool (`ANALYSIS_WORKERS`, default 2) does the work.
- **Server inference:** stays on PyTorch, about 11 ms per model call. ONNX int8 was no faster and changed cataract decisions.
- **Uploads:**
  - Images go as multipart files; base64 is still accepted.
  - The browser crops to the face (landmark box plus 30%) and caps the long side at 1024 px. The crop is sent only if the server's framing check gives the same answer on it as on the full frame.
  - Blink-calibration frames are capped at 640 px.
  - In the default on-device mode, no image is sent.

### 15.5 Web app delivery
- **Code splitting:** every page is loaded with `React.lazy`, so MediaPipe and ONNX Runtime download only with the tests that use them. The entry chunk is 316 KB (103 KB gzipped).
- **Camera loops:** the live eye tracker runs Face Mesh at about 10 fps, with smoothing scaled by elapsed time. The blink counter keeps the full camera rate, because a blink lasts 100–150 ms.
- **Service worker** (`public/service-worker.js`):
  - network-first for pages, cache-first for same-origin static assets;
  - it never intercepts API calls, the Vite dev server or other origins, such as the MediaPipe files on jsDelivr;
  - in development it is unregistered unless `VITE_ENABLE_PUSH` is set.

### 15.6 Database and trend snapshots
- **Indexes and JSONB:** `(user_id, created_at)` indexes on `vision_tests` and `webcam_metrics`, and `(user_id, captured_at)` on `eye_photos`. `vision_tests.test_details` is JSONB with a GIN index (`jsonb_path_ops`).
- **Trend snapshots:** `/trend/prediction` and `/trend/summary` read a per-user snapshot from `trend_snapshots`. At 2,100 sessions this took 5.9 ms, against 324 ms to recompute.
- **Snapshot rebuilds** happen on the next request when any of these is true:
  - the snapshot is marked stale, which happens in the same transaction as any vision-test write;
  - the count or highest id of the user's usable rows has changed;
  - the algorithm version has changed.

  `flask aggregate-trends` rebuilds snapshots in bulk.

---

## 16. Reference

### 16.1 API
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

### 16.2 Data model (PostgreSQL)

| Table | Holds |
|---|---|
| `users` | Account, profile, prescription, lens, lifestyle defaults, onboarding answers, notification settings |
| `vision_tests` | Every result: `test_type`, `score` (nullable), response time, errors, `test_details` (JSONB). `score` is the 0–100 display index; it is NULL for the retired-index tests (`color_vision`, `amsler_grid`, `dry_eye`, `red_reflex`) and may be NULL for `accommodative_lag` and `near_point_convergence` when no index applies. Results from the earlier side-vision exercise have `test_type = 'side_vision_legacy'`. `data_quality_flag` / `data_quality_note` mark rows that must not be used; `VisionTest.usable()` excludes them everywhere results are analysed |
| `webcam_metrics` | Blink rate, squints, redness, fatigue score per session |
| `eye_photos` | Photo timeline with analysis, thumbnails, aligned crops and comparisons. `health_score` and `image_thumbnail` are nullable (cataract photos store no score; on-device photos store no image) |
| `analysis_jobs` | Background analysis jobs; rows older than 1 hour are purged |
| `trend_snapshots` | Per-user precomputed trend payload, algorithm version, source-row signature, `stale` flag |
| `vision_trends` | Stored trend and prediction history |
| `lens_data`, `lifestyle_logs`, `alerts`, `push_subscriptions` | Lens records, daily habits, generated alerts, Web Push endpoints |
| `myopia_subjects`, `myopia_prescription_entries` | Child profiles and prescription history |
| `digital_wellbeing_connections`, `screen_time_days` | Device links and synced daily screen time |
| `family_groups`, `family_members`, `family_invites` | Families, roles, goals, invite codes |

**Recent migrations**
- `b2e5f8c1d4a7`: dismisses stored alerts of the retired kinds (`high_fatigue`, `lens_replacement`, `eye_health_deterioration`, display-index `vision_decline`).
- `c4d7e1a9f2b6`: makes `vision_tests.score` nullable; for the four retired-index tests, moves stored scores to `test_details.legacy_display_index` and sets `score` to NULL; renames the earlier side-vision `test_type` to `side_vision_legacy`. Both steps are reversed on downgrade.

**Submission rules** (`routes/vision_test.py`): the earlier side-vision type is mapped to `side_vision_legacy` on submit; `score` is required except for the retired-index tests (always stored NULL) and `OPTIONAL_INDEX_TESTS` (`accommodative_lag`, `near_point_convergence`).

---

## 17. Configuration and operations

- **Core:** `DATABASE_URL`, `SECRET_KEY`, `JWT_SECRET_KEY`, `JWT_ACCESS_TOKEN_EXPIRES`, `ALLOWED_ORIGINS`, `FRONTEND_URL`, `MAX_CONTENT_LENGTH`
- **Email:** `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_USE_TLS`, `MAIL_USE_SSL`, `MAIL_SUPPRESS_SEND`
- **Web Push:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CLAIM_EMAIL`, `PUSH_TTL_SECONDS`
- **Models:** `MODEL_PATH`, `CATARACT_MODEL_PATH`, `CATARACT_CLASS_NAMES`, `CATARACT_CORN_MODEL_PATH`, `CATARACT_CORN_ENABLED` (off by default; one of several CORN gate checks, Section 13), `EXPERIMENTAL_IMAGE_MODELS_USER_FACING` (off by default), `PATHOLOGY_MODEL_PATH`, `PATHOLOGY_CLASS_NAMES`, `SCLERA_MODEL_PATH`, `SCLERA_TTA` (off by default), `ONNX_MANIFEST_PATH`. Weights live at the repository root and are gitignored.
- **Performance:** `WARM_MODELS` (default on, off under tests), `ANALYSIS_WORKERS` (default 2)
- **Tests:** `TEST_DATABASE_URL`
- **Web app:** `VITE_API_URL` (default `http://localhost:5002/api`), `VITE_ENABLE_PUSH`
- **Optional storage:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- **Nightly trend refresh (optional):** `0 3 * * * cd eyevio && FLASK_APP=run.py flask aggregate-trends` (`--user-id N` for one user, `--force` for all). Stale snapshots also refresh on the next request.
- **Run locally:**
  - API: `cd eyevio && PORT=5002 ./venv/bin/python run.py`
  - Web app: `cd eyevio-frontend && npm run dev`

---

## 18. Quality: tests and CI

| Suite | Size | Covers |
|---|---|---|
| Stimulus tests (`eyevio-frontend/tests/stimuli.test.mjs`) | 54 tests, 22 golden PNGs | All major psychophysical stimuli in every orientation: gratings (contrast and glare), side-vision blob, vernier pair, Tumbling E, colour-test Landolt C (see below). Not covered: Sloan and HOTV letters, the Amsler grid, Near Blur letters and blur, the NPC target and side-game targets |
| Scoring tests (`tests/scoring.test.mjs`) | 15 tests | Optotype size, renderable logMAR, glare and convergence bands, CSF cut-off, OSDI completeness, display checks |
| Research Lab assets (`tests/researchLabAssets.test.mjs`) | 7 tests | The lab's evaluation files match the model-card assets exactly; figures exist |
| Vision-scoring checks (`scripts/run-vision-scoring-tests.mjs`) | 142 checks | Adaptive procedures and scoring in simulation, including guess correction, vernier, side-vision reliability and rates, glare ceiling, perfect-run behaviour, blur-report time, Eye Glow outcomes, the Near Blur protocol, NPC camera confidence and break combination, and blink coaching categories |
| Chatbot retrieval checks | fixture set | Correct library entries and abstention |
| On-device parity (`npm run test:parity`) | 276 checks on 6 fixtures (+ model outputs when weights are present) | Browser pipeline against the server pipeline, number by number |
| Backend (`eyevio/tests/`) | 130 pytest tests | Change detection (native units, display index never alerts, same-display colour, separate glare sources, Eye Glow not tracked, NPC v2), submission rules (nullable score, retired indices, optional indices, legacy side-vision mapping), native-measure summaries and the clinician PDF, trends, cataract screening, CORN maths and release gate, on-device validation and output withholding, uploads, jobs, trend snapshots, the validation-study statistics (agreement, convergent validity, exclusions, completion, adult/paediatric split, cluster bootstrap, acuity-only staging), the API |

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
  - then pytest. The tests that need gitignored model weights skip; the rest run.
- **Frontend job:** `npm ci`, `npm run lint:ci`, `npm test`, `npm run test:parity` and a production build. Golden-image diffs are uploaded when a test fails.
- **Lint budget:** `lint:ci` fails on any error or on more than 136 warnings, so the warning count can only go down.

---

## 19. Known limitations

**Clinical scope**
- **Research prototype.** EyeVio has not been clinically validated, reviewed, cleared, or approved as a medical device, and no regulatory classification has been obtained. Its outputs must not be used to diagnose, exclude, monitor, or treat an eye condition. The glare, side-vision and lens modules do not test for or diagnose any eye disease.
- **No clinical validation yet.** The validation study is designed and its analysis is built, but it has not been run (Section 14). The repeatability priors used for change alerts are conservative estimates, not measurements.
- **0–100 display indices** remain on several result pages. Their cut points are design choices, not clinical thresholds.
- **Image models** learned dataset shortcuts and have no externally sourced test set, so their outputs are withheld from users and shown only in the AI Research Lab.
- **OSDI licence** terms for public distribution have not been confirmed with the rights holder (Section 11).

**Screen and device**
- **Geometric stimulus size is calibrated; luminance and color remain device-dependent.** Contrast and colour tests assume an sRGB panel with standard gamma. Night Shift, True Tone, auto-brightness and panel ageing can't be detected from a browser; the colour test relies on the user's checklist. The browser-reported gamut and HDR flags are detected, the per-axis gamut limits are inferred from sRGB primaries, and P3 or HDR screens get a warning only (Section 4.3).
- **Acuity** depends on the card calibration and pixel density. Very small rows may be below the display's resolution, and are reported as the chart floor.
- **Test limits:**
  - Acuity can floor.
  - Glare can hit its ceiling (2.05 logCS or above in both conditions reads "no measurable loss").
  - Colour thresholds can exceed the screen gamut.
  - NPC is floored at about 10–15 cm, because closer faces leave the camera's frame or focus; the camera break is "unable to measure" when its confidence checks fail.
  - Near Blur is censored at 8 arcmin.

**Individual tests**
- **Colour thresholds** are in u′v′ on the user's own screen and are compared only within the same display. The reference values are provisional (published Cambridge Colour Test limits measured on calibrated equipment), not EyeVio norms.
- **Vernier** thresholds depend on pixel density and distance. The task is validated only in simulation.
- **Side Vision** gives no absolute sensitivity, samples one location per corner, and may not detect loss that is equal in both eyes or diffuse across all four corners. Its catch-trial contrast is nominal because screen contrast is uncalibrated.
- **NPC** distances are camera estimates (about ±2–3 cm). Reported and camera breaks can disagree; both are kept and shown.
- **Near Blur** uses CSS Gaussian blur, which approximates but is not optical defocus; the threshold depends on screen pixel density and the calibration.
- **Blink coaching categories** (Posture & Lighting Check) are not health classifications; camera blink counts vary with lighting, glasses and face angle.
- **Side Vision Game** eccentricities assume a 50.8 cm distance, with no camera check.
- **Eye Glow:**
  - It never reports a normal result. A missing asymmetry in a phone photo does not rule out any eye condition.
  - It needs a phone, a dark room, a helper and HTTPS (browsers block the camera on plain HTTP except on `localhost`).
  - iPhone Safari can't control the torch, so a second light is needed.
  - Distance assumes a typical phone lens.
- **Dry Eye:**
  - The pixel-based redness measure is on EyeVio's own scale, not validated against published grading scales, so it is shown as experimental without a grade.
  - White balancing reduced colour-cast error in testing: the same eye scored 21–22 under neutral, warm and cool light, against 61 uncorrected under warm light.
  - The blur-report time is a subjective time-to-blur, not fluorescein tear break-up time, and has no clinical cut-offs.
- **Children's eye spacing** uses age-band medians. An individual child can differ by several millimetres, which shifts the distance check by a few percent.

**Data and history**
- **Method versions start new baselines.** Results from older test versions aren't compared with current ones. Glare results before September 27, 2026 are flagged `glare_orientation_bug` and excluded (Appendix B).

**Platform**
- **On-device analysis:**
  - The first use downloads that task's model (11 MB for redness, 46 MB for cataract), which is then cached.
  - Photos kept on the device can only be compared on their numbers; aligned-image comparison needs saved photos.
  - The pixel-based redness measure can come back empty on the device when too little sclera is found.
  - Timings are measured on the user's device but not benchmarked across devices.
- **Background jobs** run in a thread pool inside each API process. A job is lost if its process restarts.
- **Camera loops** still run on the main thread. Moving them into a Web Worker needs a migration to `@mediapipe/tasks-vision`.
- **Screen-time sync:** Android needs a native wrapper; iOS is blocked on Apple's entitlement.
- **Community** features aren't built (roadmap only). The **chatbot** is keyword-based, and abstains when phrasing doesn't match.

**Security and privacy**
- **Not ready for public deployment.** The build lacks:
  - email verification, password reset, rate limiting, lockout and token revocation;
  - account deletion, retention periods and caregiver-access audit logging;
  - encryption at rest, enforced HTTPS, dependency scanning, backups, a privacy notice, consent records and an incident-response plan.
- **Tokens:** the access token is kept in browser storage, readable by any script injected into the page.
- **No authorisation tests** cover family and child records.
- Status per control: Section 11.2. Children: Section 12.

---

## 20. Roadmap

1. **Obtain ethics approval, preregister and run the validation study** (Section 14), adults first, starting with the stage 1 acuity reference comparison and retest, **before the science fair is judged**. Publish the agreement, convergent-validity, repeatability and testability results, and replace the change-detection priors with the measured test–retest SDs. Start the paediatric arm only after the school or fair's requirements are met.
2. **Confirm the OSDI licence** with AbbVie or its authorized licensing organization before any public deployment.
3. **Image models:** collect an external, clinician-labelled test set from the same kind of camera, and repeat the masking test. No model returns a user-facing result until performance is shown to depend on the eye.
4. **A Pelli–Robson-style letter contrast task,** so contrast can be validated by agreement with the chart.
5. **Screen photometry,** for example a phone-camera luminance and white-point check, to replace the sRGB assumption.
6. **A camera distance check for the Side Vision Game.**
7. **Home-screen normative data** for colour thresholds and vernier bias.
8. **Move camera loops into a Web Worker** (`@mediapipe/tasks-vision` with OffscreenCanvas).
9. **Native wrappers** for Android screen-time sync, and iOS once the entitlement is granted.
10. **Community features.**
11. **Security and privacy baseline before any public deployment:**
   - **Accounts:** email verification, password reset, login rate limiting and lockout, refresh-token rotation with revocation, and httpOnly cookie sessions.
   - **Data rights:** account and data deletion, configurable retention for photos and derived metrics, and a complete data export.
   - **Hosting:** TLS with HSTS, encryption at rest, a refusal to start with placeholder secrets, dependency scanning in CI, and tested backup and restore.
   - **Policy:** a privacy notice and consent records, plus an incident-response plan.
   - **Children:** authorisation tests for family records, caregiver-access audit logging, and the children's requirements in Section 12.4.

---

## Appendix A — Release notes

**October 2026 — test-method honesty pass**
- **Clear Vision:** base-row and stopping rules specified; raw and guess-adjusted logMAR both saved; camera distance described as an IPD-based estimate, with a hand-measured 1 m fallback; seeded chart randomisation with no repeated rows (seed saved); literature wording on home ETDRS agreement.
- **Color:** provisional research reference values; gamut and maximum displacement saved per axis; gamut-inadequate axes marked untestable; luminance catch trials decide reliability; same-display comparison only (`display_id`); worst-axis index removed.
- **Straight-Line:** softened low-contrast wording; composite index removed; raw area, vernier bias, threshold, uncertainty and reliability shown.
- **Side Vision:** equal/diffuse-loss and small-sample warnings; false-positive, false-negative and fixation-loss rates saved; no calibrated-contrast claim; earlier results renamed `side_vision_legacy` and never described as a glaucoma test.
- **Glare (torch mode):** fixed placement diagram, distances, brightness and no-stare checks, and a stop control; the screen ring is labelled "Simulated veiling luminance"; torch and screen sessions tracked separately.
- **Dry Eye:** 40/40/20 combined score removed; the blur task is a blur-report time, not tear break-up, with no 5 s / 10 s bands; redness is an experimental image index; the photo can be skipped.
- **Eye Glow:** outcome categories over repeated captures; no "normal" result and no symmetry index; excluded from alerts, trends and the clinician report.
- **Near Blur Tolerance (v2):** fully specified ascending-limits protocol with a native arcmin threshold, repeatability rule and an index shown only for repeatable sessions.
- **NPC (v2):** reported diplopia distance and camera vergence break kept separately with their agreement; the camera break needs to pass pupil-localisation, eye-corner-span and face-angle checks or is "unable to measure".
- **Posture & Lighting:** blink rate shown as lower / intermediate / higher observed rate coaching categories.
- **Community** removed from the navigation (roadmap only). **CORN** ordinal grader now release-gated (toggle, approval, metadata, thresholds).
- **Data:** `vision_tests.score` nullable; migration `c4d7e1a9f2b6`.
- **Privacy and security documentation:**
  - Section 11 states each control as implemented, partial or not implemented, and adds retention and deletion of derived ocular metrics.
  - New standalone **Child privacy** section (Section 12); later sections renumbered.
- **Positioning wording:** the in-app headline and the clinician PDF header read "Unvalidated research and educational prototype"; "Not a medical device" removed everywhere.
- **0–100 numbers:** Ergonomics and Side Vision Game results no longer lead with a graded score (the index is a small labelled line). The Test Details "performance radar" (invented speed, consistency and focus percentages) was removed. The dashboard photo score and the Family dashboard percentage were removed. The three score-based achievement badges were removed.
- **Validation protocol:** randomisation stratified by device class with a per-stratum recruitment quota (`device_stratum` in `participants.csv`); optional acuity-first staging with an interim rule; NPC row updated to method version 2; `validation_analyze.py --measures`.
- **Science fair:** `docs/SCIENCE_FAIR.md`, the focused acuity experiment.
- **In-app privacy copy:**
  - The Settings "Delete account" button no longer reports a deletion that never happened; it is disabled, with an explanation.
  - The browser-only retention, anonymous-data and public-profile controls were removed.
  - Help no longer claims AES-256 storage, enforced HTTPS, full export or permanent deletion.

**October 2026 — research-prototype repositioning**
- **Image models withdrawn from users.** The cataract, sclera-redness and pathology models return no likelihood, band, grade or class anywhere in the app; where they run, the user sees only the three experimental messages. The photo capture-quality gate is unchanged. New **AI Research Lab** page presents the masking experiment, calibration, Grad-CAM and limitations. The cataract model is no longer "Active".
- **Positioning.** "Wellness software, not a medical device" and the SaMD framing were replaced with the research-prototype statement and the regulatory note (Section 1), in the app, the clinician PDF and this document.
- **Native measurements first.** Glare leads with Δ logCS and the contrast multiplier, NPC with break distance, Amsler with marked area and vernier results, Dry Eye with OSDI, blink rate and inter-blink interval, Eye Glow with inter-eye differences. Remaining 0–100 numbers are labelled "Display index, not clinically validated".
- **Alerts and reports.** `high_fatigue`, `lens_replacement`, `eye_health_deterioration` and display-index `vision_decline` alerts retired and dismissed by migration. Change detection uses deg² for Amsler and cm for NPC. Vision-change and myopia alerts reworded and lowered to medium severity. The clinician one-pager shows native units only, and its notes are unranked and labelled not clinically validated.
- **Validation protocol v2.0.** Contrast vs Pelli–Robson is convergent validity (no Bland–Altman); qCSF is judged by repeatability. Added randomised test order, correction and device recording, time-gap and retest rules, counted exclusions, a testability endpoint, cluster bootstrap for both eyes, a separate paediatric arm, preregistration, consent/assent/withdrawal/retention/adverse-event procedures and a minors checklist. Analysis code, templates and tests updated.
- **OSDI licence.** Licence wording and the list of uses to confirm with AbbVie added to the code, the questionnaire screen and Section 11.

**October 1, 2026**
- **Validation study:** protocol, statistics module, export and analysis scripts, templates and tests (Section 14).
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
- All major psychophysical stimuli (gratings, side-vision blob, vernier pair, Tumbling E, colour-test Landolt C) are tested for their measured orientation and against a golden image, and CI runs those tests on every change.

**The proof.** Reintroducing the original bug (swapping horizontal and vertical, diagonals untouched) fails 17 tests. The first picture is built from the images that failing run saved: the shipped rendering on the left, the golden image on the right.

![Shipped glare gratings next to their golden images: horizontal and vertical were swapped](assets/stripe_bug_before_after.png)

All 22 golden images, one per rendered stimulus and orientation:

![Contact sheet of the 22 golden stimulus images](assets/stimulus_goldens.png)
