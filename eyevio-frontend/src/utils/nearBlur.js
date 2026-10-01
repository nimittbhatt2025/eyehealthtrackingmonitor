/**
 * Near Blur Tolerance — protocol and scoring.
 *
 * Target: a row of 5 Sloan letters, each 1.0 logMAR (50 arcmin) tall at the
 *   40 cm viewing distance, i.e. 5.8 mm, sized from the card-calibrated screen
 *   scale. Black on white, both eyes open, usual near glasses.
 * Blur: CSS Gaussian blur, whose radius is the Gaussian standard deviation.
 *   σ is specified in arcmin of visual angle and converted to CSS px from the
 *   viewing distance and screen scale.
 * Run (ascending method of limits): the row stays sharp for a random 2–4 s,
 *   then σ rises linearly at 0.4 arcmin/s. The run stops when the user reports
 *   blur (threshold = σ at that moment) or at the 8 arcmin cap (censored).
 * Session: 1 practice run (not scored), 4 scored runs and 1 catch run (no blur
 *   for 12 s) in random order. If the scored runs are not repeatable, up to 2
 *   more runs are added.
 * Native output: blur detection threshold, σ in arcmin (median of scored runs).
 */

export const NEAR_BLUR = {
  distanceMm: 400,
  distanceTolerance: 0.15,
  letterLogMAR: 1.0,
  letters: 5,
  holdMinS: 2,
  holdMaxS: 4,
  rampArcminPerS: 0.4,
  capArcmin: 8,
  catchDurationS: 12,
  practiceRuns: 1,
  scoredRuns: 4,
  catchRuns: 1,
  maxExtraRuns: 2,
  maxLog10Sd: 0.15,
  maxCensoredRuns: 1,
  indexLowArcmin: 0.5,
  indexHighArcmin: 8,
}

const SLOAN = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z']

export function randomSloanRow(n = NEAR_BLUR.letters, rand = Math.random) {
  const out = []
  while (out.length < n) {
    const letter = SLOAN[Math.floor(rand() * SLOAN.length)]
    if (letter !== out[out.length - 1]) out.push(letter)
  }
  return out.join('')
}

/** CSS px per arcmin of visual angle at the given distance. */
export function pxPerArcmin(distanceMm, pxPerMm) {
  return distanceMm * Math.tan(((1 / 60) * Math.PI) / 180) * pxPerMm
}

export function letterHeightPx(distanceMm, pxPerMm, logMAR = NEAR_BLUR.letterLogMAR) {
  return 5 * 10 ** logMAR * pxPerArcmin(distanceMm, pxPerMm)
}

/** σ (arcmin) at time t (s) since the run started, given its sharp hold. */
export function blurAtTime(tS, holdS, { rampArcminPerS = NEAR_BLUR.rampArcminPerS, capArcmin = NEAR_BLUR.capArcmin } = {}) {
  if (tS <= holdS) return 0
  return Math.min(capArcmin, (tS - holdS) * rampArcminPerS)
}

export function buildRunPlan(rand = Math.random) {
  const scored = Array.from({ length: NEAR_BLUR.scoredRuns }, () => ({ kind: 'scored' }))
  const catches = Array.from({ length: NEAR_BLUR.catchRuns }, () => ({ kind: 'catch' }))
  const mixed = [...scored, ...catches]
  for (let i = mixed.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[mixed[i], mixed[j]] = [mixed[j], mixed[i]]
  }
  const practice = Array.from({ length: NEAR_BLUR.practiceRuns }, () => ({ kind: 'practice' }))
  return [...practice, ...mixed].map((r) => ({
    ...r,
    holdS: NEAR_BLUR.holdMinS + rand() * (NEAR_BLUR.holdMaxS - NEAR_BLUR.holdMinS),
  }))
}

const median = (v) => {
  const s = [...v].sort((a, b) => a - b)
  if (!s.length) return null
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const sd = (v) => {
  if (v.length < 2) return null
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1))
}

/**
 * runs: [{ kind: 'scored'|'catch'|'practice', thresholdArcmin, censored, falseAlarm }]
 * Returns the native threshold, repeatability and whether more runs are needed.
 */
export function summarizeNearBlur(runs) {
  const scored = runs.filter((r) => r.kind === 'scored')
  const catches = runs.filter((r) => r.kind === 'catch')
  const falseAlarms = catches.filter((r) => r.falseAlarm).length
  const censored = scored.filter((r) => r.censored).length
  const measured = scored.filter((r) => !r.censored && r.thresholdArcmin > 0).map((r) => r.thresholdArcmin)
  const logs = measured.map((v) => Math.log10(v))
  const log10Sd = sd(logs)
  const thresholdArcmin = censored > NEAR_BLUR.maxCensoredRuns
    ? null
    : measured.length ? Number(median(measured).toFixed(2)) : null
  const repeatable = log10Sd != null && log10Sd <= NEAR_BLUR.maxLog10Sd
  const extraRunsUsed = Math.max(0, scored.length - NEAR_BLUR.scoredRuns)

  let status = 'ok'
  if (falseAlarms > 0) status = 'unreliable_catch'
  else if (censored > NEAR_BLUR.maxCensoredRuns) status = 'beyond_range'
  else if (measured.length < 3) status = 'too_few_runs'
  else if (!repeatable) status = 'not_repeatable'

  const needsExtraRun = status === 'not_repeatable' && extraRunsUsed < NEAR_BLUR.maxExtraRuns

  return {
    status,
    thresholdArcmin,
    log10Threshold: thresholdArcmin ? Number(Math.log10(thresholdArcmin).toFixed(3)) : null,
    log10Sd: log10Sd != null ? Number(log10Sd.toFixed(3)) : null,
    repeatable,
    scoredRuns: scored.length,
    measuredRuns: measured.length,
    censoredRuns: censored,
    catchRuns: catches.length,
    falseAlarms,
    extraRunsUsed,
    needsExtraRun,
    index: status === 'ok' ? nearBlurIndex(thresholdArcmin) : null,
  }
}

/**
 * Display index (not clinically validated): log-linear in the threshold,
 * 100 at ≤ 0.5 arcmin (blur noticed early) and 0 at ≥ 8 arcmin (the cap).
 */
export function nearBlurIndex(thresholdArcmin) {
  if (!(thresholdArcmin > 0)) return null
  const lo = Math.log10(NEAR_BLUR.indexLowArcmin)
  const hi = Math.log10(NEAR_BLUR.indexHighArcmin)
  const t = (hi - Math.log10(thresholdArcmin)) / (hi - lo)
  return Math.round(100 * Math.max(0, Math.min(1, t)))
}
