/**
 * Shared scoring utilities for EyeVio vision tests.
 * All submitted scores should be clamped to 0–100 unless noted.
 */

export function clampScore(value, min = 0, max = 100, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

/**
 * Map monocular LogMAR to a 0–100 health score for one eye.
 * LogMAR 1.0 (20/200) → 0, LogMAR 0.0 (20/20) → 100, better than 20/20 capped at 100.
 */
export function logMARToEyeScore(logMAR) {
  const score = (1.0 - logMAR) * 100
  return clampScore(score, 0, 100)
}

/**
 * Combined visual acuity score from left and right LogMAR (average of per-eye scores).
 */
export function logMARToScore(leftLogMAR, rightLogMAR) {
  const left = logMARToEyeScore(leftLogMAR)
  const right = logMARToEyeScore(rightLogMAR)
  return clampScore((left + right) / 2)
}

/**
 * Normalize LogCS (log contrast sensitivity) to 0–100.
 * Higher LogCS = better sensitivity. maxLogCS defaults to elite threshold (2.7).
 */
export function logCSToScore(logCS, maxLogCS = 2.7) {
  if (!Number.isFinite(logCS) || maxLogCS <= 0) return 0
  return clampScore((logCS / maxLogCS) * 100)
}

/**
 * Compute clinical LogMAR from threshold line and letters missed on that line only.
 */
export function computeEyeLogMAR(thresholdLineLogMAR, lettersMissedOnLine = 0) {
  const missed = Number.isFinite(lettersMissedOnLine) ? lettersMissedOnLine : 0
  return thresholdLineLogMAR + 0.02 * missed
}

/**
 * ETDRS-style chart: 5 letters per line, 0.1 logMAR steps, letter-by-letter
 * scoring at 0.02 logMAR per letter. Lines are handled in integer tenths to
 * avoid float drift (logMAR 0.6 → 6).
 */
export const ETDRS_LETTERS_PER_LINE = 5
export const ETDRS_LINES_TENTHS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, -1, -2, -3]

/**
 * Next line to show, or null when the eye is finished.
 * tested: { [tenths]: lettersCorrect }. Starts at startTenths; steps up (larger)
 * until a line has ≥ passCorrect, then down until a line has ≤ stopCorrect or
 * the chart floor is reached.
 */
export function etdrsNextLine(tested, { startTenths = 6, passCorrect = 4, stopCorrect = 1, maxTenths = 10, floorTenths = -3 } = {}) {
  const keys = Object.keys(tested).map(Number)
  if (keys.length === 0) return startTenths
  const hasBase = keys.some((k) => tested[k] >= passCorrect)
  const top = Math.max(...keys)
  const bottom = Math.min(...keys)

  if (!hasBase && top < maxTenths) return top + 1
  if (tested[bottom] <= stopCorrect) return null
  if (bottom <= floorTenths) return null
  return bottom - 1
}

/**
 * logMAR = (base + 0.1) − 0.02 × letters correct on base line and all smaller lines.
 * With a `guessRate` (4-choice charts: 0.25), each line's count is corrected for
 * guessing — (c − n·g) / (1 − g), floored at 0 — so chance hits don't earn credit.
 */
export function etdrsScore(tested, { passCorrect = 4, guessRate = 0, lettersPerLine = ETDRS_LETTERS_PER_LINE } = {}) {
  const keys = Object.keys(tested).map(Number)
  if (keys.length === 0) return null
  const passing = keys.filter((k) => tested[k] >= passCorrect)
  const base = passing.length ? Math.max(...passing) : Math.max(...keys)
  const counted = keys.filter((k) => k <= base)
  const raw = counted.reduce((acc, k) => acc + tested[k], 0)
  const credited = guessRate > 0
    ? counted.reduce((acc, k) => acc + Math.max(0, (tested[k] - lettersPerLine * guessRate) / (1 - guessRate)), 0)
    : raw
  const logMAR = Math.round(((base + 1) / 10 - 0.02 * credited) * 100) / 100
  return { logMAR, lettersCorrect: raw, lettersCredited: Math.round(credited * 100) / 100, baseTenths: base }
}

/**
 * Per-chart ETDRS rules. 4-choice charts (HOTV, tumbling E) stop at ≤ 2 of 5
 * because guessing alone gets 2+ right about a third of the time.
 */
export const ACUITY_CHART_RULES = {
  sloan: { passCorrect: 4, stopCorrect: 1, guessRate: 0 },
  hotv: { passCorrect: 4, stopCorrect: 2, guessRate: 0.25 },
  tumbling_e: { passCorrect: 4, stopCorrect: 2, guessRate: 0.25 },
}

export function logMARToSnellen(logMAR, base = 20) {
  if (!Number.isFinite(logMAR)) return null
  return `${base}/${Math.round(base * 10 ** logMAR)}`
}

/**
 * Line pass threshold: at least 60% of letters correct on the line.
 */
export function lineAccuracy(responsesOnLine) {
  if (!responsesOnLine?.length) return 0
  const correct = responsesOnLine.filter((r) => r.correct).length
  return correct / responsesOnLine.length
}

export function linePassed(responsesOnLine, threshold = 0.6) {
  return lineAccuracy(responsesOnLine) >= threshold
}

/**
 * Find threshold line index: last line passed (≥60%), or 0 if none passed.
 */
export function findThresholdLineIndex(lineResponsesByLine, numLines, threshold = 0.6) {
  let thresholdIdx = 0
  for (let i = 0; i < numLines; i++) {
    const lineResponses = lineResponsesByLine[i] || []
    if (lineResponses.length > 0 && linePassed(lineResponses, threshold)) {
      thresholdIdx = i
    }
  }
  return thresholdIdx
}

/**
 * Area (deg²) covered by brush marks on an Amsler grid.
 * Marks are normalised 0–1; brush radius is a fraction of the grid width.
 */
export function amslerMarkedAreaDeg2(marks, brushFraction, gridDeg = 20, lattice = 40) {
  if (!marks?.length) return 0
  const r2 = brushFraction ** 2
  let covered = 0
  for (let i = 0; i < lattice; i++) {
    for (let j = 0; j < lattice; j++) {
      const x = (i + 0.5) / lattice
      const y = (j + 0.5) / lattice
      if (marks.some((m) => (m.x - x) ** 2 + (m.y - y) ** 2 <= r2)) covered++
    }
  }
  return Number((covered * (gridDeg / lattice) ** 2).toFixed(1))
}

/**
 * Per-eye Amsler v2 score. A defect at full contrast weighs most; one seen
 * only on the 5% grid is milder (low-contrast defects are larger and earlier).
 * A vernier bias flag caps an otherwise clean eye.
 */
export function scoreAmslerEye({ standardIssues, lowIssues, standardAreaDeg2 = 0, lowAreaDeg2 = 0, vernierFlags = 0 }) {
  let score = 100
  if (standardIssues) score = Math.max(20, 50 - standardAreaDeg2 / 4)
  else if (lowIssues) score = Math.max(50, 80 - lowAreaDeg2 / 4)
  if (vernierFlags > 0) score = Math.min(score, 85)
  return clampScore(Math.round(score))
}

function movingMedian(values, window) {
  const half = Math.floor(window / 2)
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - half), i + half + 1).filter(Number.isFinite).sort((a, b) => a - b)
    return slice.length ? slice[Math.floor(slice.length / 2)] : NaN
  })
}

/**
 * Objective near-point-of-convergence break from an approach recording.
 *
 * samples: time-ordered { distanceCm, ratio, right, left } where ratio is
 * pupil separation / outer-canthal span (falls as the eyes converge) and
 * right/left are per-eye nasal iris positions. A break is when the smoothed
 * ratio rebounds by riseThreshold above its running minimum while the face is
 * still at (or closer than) the distance of that minimum — one eye has
 * stopped converging.
 */
export function detectConvergenceBreak(samples, { riseThreshold = 0.02, window = 5, distanceSlackCm = 2 } = {}) {
  const valid = samples.filter((s) => Number.isFinite(s.ratio) && Number.isFinite(s.distanceCm))
  if (valid.length < window * 2) {
    return { breakDetected: false, breakDistanceCm: null, closestDistanceCm: null, convergenceRange: null, divergingEye: null }
  }
  const smooth = movingMedian(valid.map((s) => s.ratio), window)
  const closestDistanceCm = Math.min(...valid.map((s) => s.distanceCm))
  const startRatio = movingMedian(smooth.slice(0, window), window)[Math.floor(window / 2)]

  let minRatio = Infinity
  let minIdx = 0
  let breakIdx = null
  for (let i = 0; i < smooth.length; i++) {
    if (smooth[i] < minRatio) {
      minRatio = smooth[i]
      minIdx = i
    } else if (
      smooth[i] - minRatio >= riseThreshold &&
      valid[i].distanceCm <= valid[minIdx].distanceCm + distanceSlackCm
    ) {
      breakIdx = i
      break
    }
  }

  let divergingEye = null
  if (breakIdx != null) {
    const drop = (eye) => {
      const a = valid[minIdx][eye]
      const b = valid[breakIdx][eye]
      return Number.isFinite(a) && Number.isFinite(b) ? a - b : null
    }
    const dr = drop('right')
    const dl = drop('left')
    if (dr != null && dl != null && Math.abs(dr - dl) > 0.02) divergingEye = dr > dl ? 'right' : 'left'
  }

  return {
    breakDetected: breakIdx != null,
    breakDistanceCm: breakIdx != null ? Number(valid[minIdx].distanceCm.toFixed(1)) : null,
    closestDistanceCm: Number(closestDistanceCm.toFixed(1)),
    convergenceRange: Number.isFinite(startRatio) ? Number((startRatio - minRatio).toFixed(3)) : null,
    divergingEye,
  }
}

/** NPC trend index: ≤ 6 cm → 100, ≥ 20 cm → 0. */
export function scoreNearPointConvergence(npcCm) {
  if (!Number.isFinite(npcCm)) return null
  return clampScore(100 * (1 - Math.min(1, Math.max(0, (npcCm - 6) / 14))))
}

export function interpretNearPointConvergence(npcCm, { breakDetected = true } = {}) {
  if (!Number.isFinite(npcCm)) {
    return { tone: 'gray', title: 'Not measured', detail: 'Your face could not be tracked well enough to measure convergence.' }
  }
  if (!breakDetected) {
    return npcCm <= 10
      ? { tone: 'green', title: `No break before ${npcCm.toFixed(0)} cm`, detail: 'Your eyes kept converging as close as the camera could follow — within the typical range.' }
      : { tone: 'amber', title: `Tracked only to ${npcCm.toFixed(0)} cm`, detail: 'The camera lost your face before a break point. Try on a phone held at eye level, or in brighter light.' }
  }
  if (npcCm <= 6) return { tone: 'green', title: `Break at ${npcCm.toFixed(0)} cm`, detail: 'Typical near point of convergence.' }
  if (npcCm <= 10) return { tone: 'amber', title: `Break at ${npcCm.toFixed(0)} cm`, detail: 'Slightly remote. Common with tiredness; recheck when rested.' }
  return {
    tone: 'red',
    title: `Break at ${npcCm.toFixed(0)} cm`,
    detail: 'Remote near point of convergence. If near work gives you headaches or double vision, a binocular vision exam can check for convergence insufficiency.',
  }
}

/**
 * Side vision reliability, modelled on clinical perimetry reliability indices.
 * A session with too many fixation losses, false positives, or false negatives
 * is not scored.
 */
export const SIDE_VISION_RELIABILITY = {
  maxFixationLossRate: 0.2,
  maxFalsePositives: 1,
  maxFalseNegatives: 1,
}

export function sideVisionReliability({ fixationLosses, totalTrials, falsePositives, falseNegatives }) {
  const fixationLossRate = totalTrials > 0 ? fixationLosses / totalTrials : 1
  const reasons = []
  if (fixationLossRate > SIDE_VISION_RELIABILITY.maxFixationLossRate) {
    reasons.push('Too many centre numbers missed — your eyes probably moved toward the corners.')
  }
  if (falsePositives > SIDE_VISION_RELIABILITY.maxFalsePositives) {
    reasons.push('You reported flashes on rounds where nothing was shown.')
  }
  if (falseNegatives > SIDE_VISION_RELIABILITY.maxFalseNegatives) {
    reasons.push('You missed very bright flashes that should be easy to see.')
  }
  return {
    reliable: reasons.length === 0,
    reasons,
    fixationLossRate: Number(fixationLossRate.toFixed(2)),
    fixationLosses,
    falsePositives,
    falseNegatives,
  }
}

/**
 * Relative inter-quadrant asymmetry (log units). Absolute sensitivity is not
 * reported — a consumer screen cannot hold a calibrated background luminance.
 */
export function quadrantAsymmetry(thresholdsByQuadrant) {
  const entries = Object.entries(thresholdsByQuadrant).filter(([, t]) => Number.isFinite(t))
  if (entries.length === 0) return { relative: {}, maxAsymmetry: null, weakest: null }
  const best = Math.max(...entries.map(([, t]) => t))
  const relative = Object.fromEntries(entries.map(([id, t]) => [id, Number((t - best).toFixed(2))]))
  const [weakest] = entries.reduce((lo, cur) => (cur[1] < lo[1] ? cur : lo))
  return { relative, maxAsymmetry: Number((-relative[weakest]).toFixed(2)), weakest }
}

/** Trend index: asymmetry 0 → 100, ≥ 0.6 log units → 0. */
export function scoreSideVisionAsymmetry(maxAsymmetry, ceiling = 0.6) {
  if (!Number.isFinite(maxAsymmetry)) return 0
  return clampScore(100 * (1 - Math.min(ceiling, Math.max(0, maxAsymmetry)) / ceiling))
}

/**
 * Glare: contrast loss under veiling luminance.
 *
 * Primary metric: Δ logCS = logCS(no glare) − logCS(glare).
 * The 0–100 index is only a display/trend mapping: Δ ≤ 0 → 100, Δ ≥ 0.5 → 0.
 */
export const GLARE_DELTA_CEILING = 0.5
// QUEST's grid tops out at 2.2 logCS; ten all-correct trials settle around 2.1, so a threshold
// this high means the staircase ran out of room rather than finding a limit.
export const GLARE_CEILING_LOGCS = 2.05

export function glareDeltaLogCS(logCSNoGlare, logCSGlare) {
  if (!Number.isFinite(logCSNoGlare) || !Number.isFinite(logCSGlare)) return null
  return Number((logCSNoGlare - logCSGlare).toFixed(2))
}

export function scoreGlareDelta(deltaLogCS) {
  if (!Number.isFinite(deltaLogCS)) return 0
  const loss = Math.max(0, Math.min(GLARE_DELTA_CEILING, deltaLogCS))
  return clampScore(100 * (1 - loss / GLARE_DELTA_CEILING))
}

/**
 * Plain-language interpretation of a glare run. Bands are rough home-check
 * guides, not validated clinical norms.
 */
export function interpretGlareDelta({ logCSNoGlare, logCSGlare, deltaLogCS, sdNoGlare, sdGlare }) {
  const lowConfidence = (sdNoGlare ?? 0) > 0.3 || (sdGlare ?? 0) > 0.3
  const ceilingNoGlare = logCSNoGlare >= GLARE_CEILING_LOGCS
  const ceilingGlare = logCSGlare >= GLARE_CEILING_LOGCS
  let band
  let color
  let status
  let headline
  let detail
  let ceilingNote = null

  if (ceilingNoGlare && ceilingGlare) {
    band = 'good'
    color = 'green'
    status = 'No measurable contrast loss under glare'
    headline = 'You saw the faintest stripes this test can show, both with and without glare.'
    detail =
      'The test reached its limit in both conditions, so glare made no difference it can measure. A reassuring home check — not proof the lens is clear, and not a cataract exam.'
    ceilingNote = 'Both results are at the limit of this test; your true sensitivity may be even better.'
  } else if (logCSNoGlare < 1.2) {
    band = 'poor'
    color = 'red'
    status = 'Low contrast sensitivity even without glare'
    headline = 'Faint stripes were hard to see before any glare was added.'
    detail =
      'When the no-glare result is low, the glare comparison says little. Retake at ~50 cm in a dim room with your usual glasses; if this is new or persistent, book an eye exam.'
  } else if (deltaLogCS < 0.15) {
    band = 'good'
    color = 'green'
    status = 'Little contrast loss under glare'
    headline = 'The glare source barely changed the faintest stripes you could see.'
    detail =
      'A small drop is typical. This is a reassuring home check — not proof the lens is clear, and not a cataract exam.'
  } else if (deltaLogCS < 0.3) {
    band = 'fair'
    color = 'amber'
    status = 'Moderate contrast loss under glare'
    headline = 'You needed noticeably stronger stripes to see them with glare on.'
    detail =
      'A moderate drop can come from dirty glasses, dry eye, uncorrected prescription, or early lens changes. If night driving or headlights feel worse lately, mention it at an eye exam.'
  } else {
    band = 'poor'
    color = 'red'
    status = 'Large contrast loss under glare'
    headline = 'Glare made faint stripes much harder to see.'
    detail =
      'A large drop is the main signal this home check looks for. Many things can cause it, including lens cloudiness. Please book a full eye exam — this is not a cataract diagnosis.'
  }
  if (!ceilingNote && ceilingNoGlare) {
    ceilingNote = 'Your no-glare result reached the limit of this test, so the true loss under glare may be slightly larger.'
  }

  return {
    band,
    color,
    status,
    headline,
    detail,
    lowConfidence,
    ceilingNoGlare,
    ceilingGlare,
    ceilingNote,
    logCSNoGlare: Number(logCSNoGlare.toFixed(2)),
    logCSGlare: Number(logCSGlare.toFixed(2)),
    deltaLogCS,
    // How many times more contrast the stripes needed with glare on (1 = no change).
    contrastFactor: Number((10 ** Math.max(0, deltaLogCS ?? 0)).toFixed(2)),
    scoreMeaning:
      'Higher is better. 100 means glare did not change the faintest stripes you could see; 0 means glare made you need about 3× the contrast or more.',
  }
}

/**
 * Red reflex (Brückner-style) thresholds. Only left/right differences are
 * reported; absolute glow depends on camera, torch, pupil size and skin tone.
 */
export const RED_REFLEX_LIMITS = {
  minPupilPixels: 6,
  minReflexLuminance: 35,
  brightnessAsymmetry: 0.25,
  colourAsymmetry: 0.08,
  whiteAsymmetry: 0.25,
  paleBoth: 0.5,
}

const luma = (p) => 0.299 * p.r + 0.587 * p.g + 0.114 * p.b

/**
 * Colour summary of one pupil's reflex. The brightest pixels are dropped so the
 * torch's corneal glint does not read as a white reflex.
 */
export function summarizePupilReflex(pixels, { trimTop = 0.1 } = {}) {
  if (!pixels || pixels.length < RED_REFLEX_LIMITS.minPupilPixels) return null
  const sorted = [...pixels].sort((a, b) => luma(a) - luma(b))
  const kept = sorted.slice(0, Math.max(1, Math.floor(sorted.length * (1 - trimTop))))
  let r = 0
  let g = 0
  let b = 0
  let y = 0
  let white = 0
  kept.forEach((p) => {
    r += p.r
    g += p.g
    b += p.b
    y += luma(p)
    const max = Math.max(p.r, p.g, p.b)
    if (max > 120 && Math.min(p.r, p.g, p.b) / max > 0.7) white += 1
  })
  const n = kept.length
  const total = r + g + b
  return {
    luminance: y / n,
    redChroma: total ? r / total : 0,
    whiteFraction: white / n,
    pixels: n,
  }
}

const median = (values) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

/** Per-field median across frames, so one blink or glint frame can't dominate. */
export function medianPupilReflex(summaries) {
  const valid = summaries.filter(Boolean)
  if (!valid.length) return null
  return {
    luminance: median(valid.map((s) => s.luminance)),
    redChroma: median(valid.map((s) => s.redChroma)),
    whiteFraction: median(valid.map((s) => s.whiteFraction)),
    frames: valid.length,
  }
}

/**
 * Inter-ocular reflex symmetry, 0–100. A difference at the flag threshold maps
 * to 50 and twice the threshold to 0; a one-sided white reflex caps it at 30.
 */
export function redReflexSymmetry(right, left) {
  if (!right || !left) return null
  const L = RED_REFLEX_LIMITS
  const maxLum = Math.max(right.luminance, left.luminance)
  const brightnessAsymmetry = maxLum ? Math.abs(right.luminance - left.luminance) / maxLum : 0
  const colourAsymmetry = Math.abs(right.redChroma - left.redChroma)
  const whiteAsymmetry = Math.abs(right.whiteFraction - left.whiteFraction)
  const metrics = {
    brightnessAsymmetry: Number(brightnessAsymmetry.toFixed(3)),
    colourAsymmetry: Number(colourAsymmetry.toFixed(3)),
    whiteAsymmetry: Number(whiteAsymmetry.toFixed(3)),
  }

  if (maxLum < L.minReflexLuminance) {
    return { reflexVisible: false, symmetryScore: null, flags: [{ type: 'no_reflex', severity: 'info' }], ...metrics }
  }

  const flags = []
  if (whiteAsymmetry >= L.whiteAsymmetry) {
    flags.push({ type: 'white_reflex', eye: right.whiteFraction > left.whiteFraction ? 'right' : 'left', severity: 'critical' })
  }
  if (brightnessAsymmetry >= L.brightnessAsymmetry) {
    flags.push({ type: 'brightness', eye: right.luminance < left.luminance ? 'right' : 'left', severity: 'warning' })
  }
  if (colourAsymmetry >= L.colourAsymmetry) {
    flags.push({ type: 'colour', severity: 'warning' })
  }
  if (right.whiteFraction >= L.paleBoth && left.whiteFraction >= L.paleBoth) {
    flags.push({ type: 'pale_both', severity: 'warning' })
  }

  const worst = Math.max(
    brightnessAsymmetry / (2 * L.brightnessAsymmetry),
    colourAsymmetry / (2 * L.colourAsymmetry),
    whiteAsymmetry / (2 * L.whiteAsymmetry)
  )
  let symmetryScore = Math.round(100 * (1 - Math.min(1, worst)))
  if (flags.some((f) => f.severity === 'critical')) symmetryScore = Math.min(symmetryScore, 30)

  return { reflexVisible: true, symmetryScore, flags, ...metrics }
}

/** Viewing distance from inter-pupil pixels, assuming a typical phone main camera (~26 mm equiv). */
export function estimatePhoneCameraDistanceCm(eyeSpanPx, frameWidth, frameHeight, { ipdMm = 63 } = {}) {
  if (!eyeSpanPx || !frameWidth || !frameHeight) return null
  const focalPx = Math.max(frameWidth, frameHeight) / 1.385
  return (focalPx * ipdMm) / eyeSpanPx / 10
}

/** Degrees of visual angle for an on-screen offset. */
export function eccentricityDeg(offsetMm, viewingDistanceMm) {
  return (Math.atan(offsetMm / viewingDistanceMm) * 180) / Math.PI
}

const hitProbability = (ecc, e50, spread, lapse) => (1 - lapse) / (1 + Math.exp((ecc - e50) / spread))

/**
 * Maximum-likelihood logistic fit of hit (1/0) vs eccentricity:
 *   P(hit) = (1 − lapse) / (1 + exp((ecc − e50) / spread))
 * Reports e50 (eccentricity with 50% hits, null if beyond the tested range)
 * and the mean slope of the fitted curve over the tested range (% per degree).
 */
export function fitHitRateVsEccentricity(trials, { lapse = 0.03 } = {}) {
  const valid = trials.filter((t) => Number.isFinite(t.ecc))
  if (valid.length < 8) return null
  const eccs = valid.map((t) => t.ecc)
  const minEcc = Math.min(...eccs)
  const maxEcc = Math.max(...eccs)
  let best = null
  for (let e50 = 0; e50 <= 90; e50 += 0.5) {
    for (let k = 0; k < 30; k++) {
      const spread = 0.5 * 1.15 ** k
      let ll = 0
      for (const t of valid) {
        const p = Math.min(1 - 1e-6, Math.max(1e-6, hitProbability(t.ecc, e50, spread, lapse)))
        ll += t.hit ? Math.log(p) : Math.log(1 - p)
      }
      if (!best || ll > best.ll) best = { ll, e50, spread }
    }
  }
  const pMin = hitProbability(minEcc, best.e50, best.spread, lapse)
  const pMax = hitProbability(maxEcc, best.e50, best.spread, lapse)
  return {
    e50Deg: best.e50 <= maxEcc ? best.e50 : null,
    spreadDeg: Number(best.spread.toFixed(2)),
    slopePctPerDeg: maxEcc > minEcc ? Number(((100 * (pMax - pMin)) / (maxEcc - minEcc)).toFixed(2)) : 0,
    hitRateAtMin: Math.round(100 * pMin),
    hitRateAtMax: Math.round(100 * pMax),
    rangeDeg: [Number(minEcc.toFixed(1)), Number(maxEcc.toFixed(1))],
    n: valid.length,
  }
}

/** Theil–Sen line through reaction time (hits only) vs eccentricity; robust to a few slow taps. */
export function fitReactionTimeVsEccentricity(trials) {
  const pts = trials.filter((t) => t.hit && Number.isFinite(t.rt) && Number.isFinite(t.ecc))
  if (pts.length < 6) return null
  const slopes = []
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j].ecc - pts[i].ecc
      if (Math.abs(dx) > 0.5) slopes.push((pts[j].rt - pts[i].rt) / dx)
    }
  }
  if (!slopes.length) return null
  const median = (a) => {
    const s = [...a].sort((x, y) => x - y)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }
  const slope = median(slopes)
  const intercept = median(pts.map((p) => p.rt - slope * p.ecc))
  return {
    slopeMsPerDeg: Number(slope.toFixed(1)),
    interceptMs: Math.round(intercept),
    medianRtMs: Math.round(median(pts.map((p) => p.rt))),
    n: pts.length,
  }
}

/**
 * Peripheral awareness combined hit rate and reaction time.
 */
export function scorePeripheralAwareness(hitRatePercent, avgReactionTimeMs) {
  const reactionScore = clampScore(100 - avgReactionTimeMs / 10)
  return clampScore(hitRatePercent * 0.7 + reactionScore * 0.3)
}
