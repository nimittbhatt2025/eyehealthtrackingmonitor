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
 * Color vision: score diagnostic plates only (exclude demo); penalize control false positives.
 */
export function scoreColorVision(responses) {
  const diagnostic = responses.filter((r) => r.category !== 'demo' && r.plateId && !String(r.plateId).startsWith('d'))
  const scoringPool = diagnostic.length > 0
    ? diagnostic
    : responses.filter((r) => r.category !== 'demo')

  const controls = scoringPool.filter((r) => r.category === 'control')
  const nonControls = scoringPool.filter((r) => r.category !== 'control')

  const diagnosticCorrect = nonControls.filter((r) => r.correct).length
  const diagnosticTotal = nonControls.length
  const diagnosticAccuracy = diagnosticTotal > 0 ? (diagnosticCorrect / diagnosticTotal) * 100 : 100

  const controlFalsePositives = controls.filter((r) => !r.correct && r.userAnswer !== 'nothing').length
  const controlPenalty = controls.length > 0 ? (controlFalsePositives / controls.length) * 15 : 0

  return clampScore(diagnosticAccuracy - controlPenalty)
}

/**
 * Amsler grid graduated score from issues flag and mark counts.
 */
export function scoreAmslerGrid(leftHasIssues, rightHasIssues, leftMarkCount = 0, rightMarkCount = 0) {
  const eyeScore = (hasIssues, markCount) => {
    if (hasIssues) return 50
    if (markCount > 0) return clampScore(100 - Math.min(40, markCount * 2))
    return 100
  }
  const left = eyeScore(leftHasIssues, leftMarkCount)
  const right = eyeScore(rightHasIssues, rightMarkCount)
  return clampScore(Math.min(left, right))
}

/**
 * Side vision: blend accuracy with symmetry (penalize max peripheral LogCS deficit).
 */
export function scoreSideVision(overallAccuracy, maxDeficit = 0, maxDeficitScale = 0.5) {
  const accuracyComponent = clampScore(overallAccuracy * 100)
  const symmetryComponent = clampScore(100 - (maxDeficit / maxDeficitScale) * 100)
  return clampScore(accuracyComponent * 0.6 + symmetryComponent * 0.4)
}

/**
 * Glare tolerance score with sensitivity penalty.
 */
export function scoreGlareTolerance(noGlareAccuracy, glareAccuracy, glareSensitivity) {
  const base = glareAccuracy * 0.7 + noGlareAccuracy * 0.3
  const sensitivityPenalty = Math.min(0.3, glareSensitivity) * 0.5
  return clampScore((base - sensitivityPenalty) * 100)
}

/**
 * Red reflex: base intensity score with warning caps.
 */
export function scoreRedReflex(intensityScore, warnings = []) {
  let score = clampScore(intensityScore)
  const hasLeukocoria = warnings.some((w) => w.type === 'leukocoria')
  const hasAsymmetry = warnings.some((w) => w.type === 'asymmetry')
  if (hasLeukocoria) score = Math.min(score, 30)
  else if (hasAsymmetry) score = Math.min(score, 70)
  return score
}

/**
 * Peripheral awareness combined hit rate and reaction time.
 */
export function scorePeripheralAwareness(hitRatePercent, avgReactionTimeMs) {
  const reactionScore = clampScore(100 - avgReactionTimeMs / 10)
  return clampScore(hitRatePercent * 0.7 + reactionScore * 0.3)
}
