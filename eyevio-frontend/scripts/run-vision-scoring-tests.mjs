/**
 * Unit tests for vision test scoring utilities.
 * Run: node eyevio-frontend/scripts/run-vision-scoring-tests.mjs
 */

import {
  clampScore,
  logMARToScore,
  logMARToEyeScore,
  logCSToScore,
  computeEyeLogMAR,
  findThresholdLineIndex,
  amslerMarkedAreaDeg2,
  etdrsNextLine,
  etdrsScore,
  ACUITY_CHART_RULES,
  logMARToSnellen,
  detectConvergenceBreak,
  scoreNearPointConvergence,
  assessNpcCamera,
  combineNpcApproach,
  yawProxy,
  NPC_CAMERA_LIMITS,
  quadrantAsymmetry,
  scoreSideVisionAsymmetry,
  sideVisionReliability,
  glareDeltaLogCS,
  scoreGlareDelta,
  interpretGlareDelta,
  summarizePupilReflex,
  medianPupilReflex,
  redReflexSymmetry,
  eyeGlowOutcome,
  needsAnotherGlowCapture,
  estimatePhoneCameraDistanceCm,
  scorePeripheralAwareness,
  eccentricityDeg,
  fitHitRateVsEccentricity,
  fitReactionTimeVsEccentricity,
} from '../src/utils/visionTestScoring.js'
import { createQuest, weibullPCorrect } from '../src/utils/psychophysics.js'
import {
  NEAR_BLUR,
  blurAtTime,
  buildRunPlan,
  letterHeightPx,
  nearBlurIndex,
  summarizeNearBlur,
} from '../src/utils/nearBlur.js'
import { createVernierPsi, pRight, summarizeVernier } from '../src/utils/vernier.js'
import { blinkBand, breakDue, rollingBlinkRate, summarizeBlinkSession } from '../src/utils/blinkCoach.js'
import {
  createQcsf,
  csfLogSensitivity,
  aulcsf,
  aulcsfPercentOfReference,
  maxRenderableFrequency,
} from '../src/utils/qcsf.js'
import {
  COLOR_AXES,
  WHITE_UV,
  uvYToXyz,
  xyzToLinearRgb,
  linearRgbToXyz,
  xyzToUv,
  axisPlan,
  displacedUv,
  dotRgb,
  summarizeColorThresholds,
} from '../src/utils/colorThreshold.js'
import {
  OSDI_QUESTIONS,
  NOT_APPLICABLE,
  calculateOsdi,
  osdiSeverity,
  summarizeBlurReportTime,
} from '../src/utils/dryEyeQuestionnaire.js'

let passed = 0
let failed = 0

function assert(condition, message) {
  if (!condition) {
    failed += 1
    console.error(`FAIL: ${message}`)
    return
  }
  passed += 1
}

assert(clampScore(150) === 100, 'clampScore caps at 100')
assert(clampScore(-10) === 0, 'clampScore floors at 0')
assert(logMARToEyeScore(0.0) === 100, '20/20 → 100')
assert(logMARToEyeScore(1.0) === 0, '20/200 → 0')
assert(logMARToEyeScore(-0.3) === 100, 'better than 20/20 capped at 100')
assert(logMARToScore(0.0, 0.0) === 100, 'both eyes 20/20 → 100')
assert(logCSToScore(2.7) === 100, 'max LogCS → 100')
assert(logCSToScore(2.0) === 74, 'LogCS 2.0 normalized')
assert(logCSToScore(0) === 0, 'LogCS 0 → 0')
assert(Math.abs(computeEyeLogMAR(0.3, 2) - 0.34) < 0.001, 'threshold line + 2 misses')

const lineResponses = {
  0: [{ correct: true }],
  1: [{ correct: true }, { correct: false }],
  2: [{ correct: true }, { correct: true }, { correct: false }],
}
assert(findThresholdLineIndex(lineResponses, 5) === 2, 'threshold line is last passed line')

{
  const white = xyzToLinearRgb(uvYToXyz(WHITE_UV.u, WHITE_UV.v, 0.2))
  assert(white.every((c) => Math.abs(c - 0.2) < 0.002), 'D65 white point maps to neutral grey')
  const rgb = [0.3, 0.2, 0.1]
  const xyz = linearRgbToXyz(rgb)
  const uv = xyzToUv(xyz)
  const back = xyzToLinearRgb(uvYToXyz(uv.u, uv.v, xyz.Y))
  assert(back.every((c, i) => Math.abs(c - rgb[i]) < 0.002), "u'v'Y ↔ linear sRGB round trip")

  const plan = axisPlan()
  assert(COLOR_AXES.every((a) => plan[a].max > 0.05 && plan[a].max < 0.3), 'every axis has usable sRGB gamut room')
  const target = displacedUv(plan.protan.dir, 0.02)
  let mean = 0
  let seed = 1
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 2000; i++) mean += dotRgb(target, 0.2, rand)[0] / 2000
  const exact = 255 * (1.055 * xyzToLinearRgb(uvYToXyz(target.u, target.v, 0.2))[0] ** (1 / 2.4) - 0.055)
  assert(Math.abs(mean - exact) < 0.1, 'stochastic rounding reproduces sub-code-value colour on average')

  const axes = (p, d, t) => ({
    protan: { threshold: p, sd: 0.1, maxDistance: 0.15, beyondGamut: p >= 0.15 },
    deutan: { threshold: d, sd: 0.1, maxDistance: 0.15, beyondGamut: d >= 0.15 },
    tritan: { threshold: t, sd: 0.1, maxDistance: 0.13, beyondGamut: t >= 0.13 },
  })
  assert(summarizeColorThresholds(axes(0.006, 0.007, 0.01)).pattern === 'none', 'typical thresholds → no pattern')
  const rg = summarizeColorThresholds(axes(0.15, 0.03, 0.01))
  assert(rg.pattern === 'red_green' && rg.leadingAxis === 'protan', 'protan-led red–green pattern')
  assert(summarizeColorThresholds(axes(0.006, 0.007, 0.05)).pattern === 'tritan', 'tritan-only pattern')
  assert(summarizeColorThresholds(axes(0.03, 0.03, 0.05)).pattern === 'generalised', 'all axes raised → generalised')
  assert(summarizeColorThresholds(axes(0.15, 0.15, 0.13)).pattern === 'unreliable', 'nothing seen on any axis → unreliable')
  assert(!('score' in rg) && !('score' in rg.perAxis.protan), 'no worst-axis score until reference data exist')
  const guesser = summarizeColorThresholds(axes(0.006, 0.007, 0.01), { catchCorrect: 1, catchTotal: 4 })
  assert(guesser.pattern === 'unreliable' && guesser.reliability.catch_failed, 'failed catch trials → unreliable')
  assert(summarizeColorThresholds(axes(0.006, 0.007, 0.01), { catchCorrect: 3, catchTotal: 4 }).reliable, '3 of 4 catch trials → reliable')
  const narrow = summarizeColorThresholds({ ...axes(0.006, 0.007, 0.05), tritan: { threshold: 0.05, sd: 0.1, maxDistance: 0.05, beyondGamut: true } })
  assert(!narrow.perAxis.tritan.testable && narrow.pattern === 'none', 'an axis the screen cannot test is reported, not counted as raised')
  const vague = summarizeColorThresholds({ ...axes(0.006, 0.007, 0.01), protan: { threshold: 0.03, sd: 0.45, maxDistance: 0.15, beyondGamut: false } })
  assert(vague.perAxis.protan.uncertain && vague.pattern === 'none', 'an uncertain axis is flagged, not counted as raised')
  assert(!summarizeColorThresholds(axes(0.006, 0.007, 0.01), { displayCoversSrgb: false }).perAxis.protan.testable, 'a display below sRGB cannot test any axis')
}

{
  assert(Math.abs(eccentricityDeg(508 * Math.tan(Math.PI / 12), 508) - 15) < 1e-6, 'eccentricity from offset and distance')
  let seed = 11
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const trials = Array.from({ length: 200 }, () => {
    const ecc = 3 + rand() * 30
    const hit = rand() < 0.97 / (1 + Math.exp((ecc - 20) / 3))
    return { ecc, hit, rt: hit ? 400 + 12 * ecc + (rand() - 0.5) * 80 : null }
  })
  const fit = fitHitRateVsEccentricity(trials)
  assert(fit && Math.abs(fit.e50Deg - 20) < 2.5, 'hit-rate fit recovers e50 ≈ 20°')
  assert(fit.slopePctPerDeg < -2, 'hit rate falls with eccentricity')
  const rt = fitReactionTimeVsEccentricity(trials)
  assert(rt && Math.abs(rt.slopeMsPerDeg - 12) < 4, 'reaction-time slope ≈ 12 ms/deg')
  const allHit = fitHitRateVsEccentricity(Array.from({ length: 30 }, (_, i) => ({ ecc: 3 + i, hit: true })))
  assert(allHit.e50Deg === null && Math.abs(allHit.slopePctPerDeg) < 0.5, 'all hits → no e50 inside range, flat slope')
  assert(fitHitRateVsEccentricity([{ ecc: 5, hit: true }]) === null, 'too few trials → no fit')
}

assert(amslerMarkedAreaDeg2([], 0.05) === 0, 'no marks → no area')
{
  const area = amslerMarkedAreaDeg2([{ x: 0.5, y: 0.5 }], 0.1)
  assert(Math.abs(area - Math.PI * 2 ** 2) < 1.5, 'one mark of radius 2° covers about 12.6 deg²')
}
{
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const run = (bias, sigma) => {
    const q = createVernierPsi({ random: rand })
    for (let i = 0; i < 40; i++) {
      const x = q.next()
      q.update(x, rand() < pRight(x, bias, sigma))
    }
    return q.estimate()
  }
  const aligned = run(0, 15)
  assert(Math.abs(aligned.bias) < 20, 'vernier psi: aligned observer has near-zero bias')
  assert(aligned.threshold > 5 && aligned.threshold < 45, 'vernier psi recovers a 15″ threshold roughly')
  const shifted = run(90, 20)
  assert(Math.abs(shifted.bias - 90) < 30, 'vernier psi recovers a 90″ bias')

  // An observer who answers "looks aligned" whenever the shift is within ±0.5σ of their bias.
  const runWithAligned = (bias, sigma) => {
    const q = createVernierPsi({ random: rand })
    for (let i = 0; i < 40; i++) {
      const x = q.next()
      const z = (x - bias) / sigma + (rand() + rand() + rand() - 1.5) * 2
      q.update(x, Math.abs(z) < 0.5 ? null : z > 0)
    }
    return q.estimate()
  }
  const alignedAnswers = runWithAligned(0, 15)
  assert(Math.abs(alignedAnswers.bias) < 20, 'vernier psi: "looks aligned" answers keep an aligned observer near zero bias')
  assert(alignedAnswers.trials === 40, 'vernier psi counts "looks aligned" answers as trials')
  const shiftedAligned = runWithAligned(90, 20)
  assert(Math.abs(shiftedAligned.bias - 90) < 30, 'vernier psi recovers a 90″ bias with "looks aligned" answers')
  {
    const q = createVernierPsi()
    const before = q.estimate().bias
    q.update(0, null)
    assert(Math.abs(q.estimate().bias - before) < 1e-6, 'one "looks aligned" at zero shift does not move the bias')
  }
  const s = summarizeVernier({
    center: { bias: 0, biasSd: 5, threshold: 15 },
    up: { bias: 100, biasSd: 15, threshold: 30 },
    down: { bias: 5, biasSd: 15, threshold: 30 },
    left: { bias: -5, biasSd: 15, threshold: 30 },
    right: { bias: 0, biasSd: 15, threshold: 150 },
  })
  assert(s.flags.some((f) => f.location === 'up' && f.kind === 'bias'), 'vernier flags a shifted location')
  assert(s.flags.some((f) => f.location === 'right' && f.kind === 'threshold'), 'vernier flags a raised parafoveal threshold')
  assert(!s.flags.some((f) => f.location === 'center'), 'vernier does not flag an aligned centre')
  assert(s.reliable && s.uncertainLocations.length === 0, 'vernier result with tight bias estimates is reliable')
  const noisy = summarizeVernier({
    center: { bias: 0, biasSd: 40, threshold: 15 },
    up: { bias: 120, biasSd: 45, threshold: 30 },
    down: { bias: 5, biasSd: 15, threshold: 30 },
    left: { bias: -5, biasSd: 15, threshold: 30 },
    right: { bias: 0, biasSd: 15, threshold: 30 },
  })
  assert(!noisy.reliable && !noisy.flags.some((f) => f.location === 'up'), 'uncertain locations are not flagged and make the eye unreliable')
}

{
  // Perfect to 0.0, one letter on -0.1, none on -0.2 → -0.02
  const tested = {}
  const truth = (t) => (t >= 0 ? 5 : t === -1 ? 1 : 0)
  let next = etdrsNextLine(tested)
  const order = []
  while (next != null) {
    order.push(next)
    tested[next] = truth(next)
    next = etdrsNextLine(tested)
  }
  assert(order[0] === 6 && order[order.length - 1] === -1, `ETDRS sequence starts at 0.6 and stops after a ≤1-correct line (${order.join(',')})`)
  assert(etdrsScore(tested).logMAR === -0.02, `ETDRS letter score -0.02 (got ${etdrsScore(tested).logMAR})`)

  // Fails start line → steps up until a line is passed, then continues down
  const weak = {}
  const truthWeak = (t) => (t >= 8 ? 5 : t === 7 ? 3 : t === 6 ? 2 : 0)
  next = etdrsNextLine(weak)
  const orderWeak = []
  while (next != null) {
    orderWeak.push(next)
    weak[next] = truthWeak(next)
    next = etdrsNextLine(weak)
  }
  assert(orderWeak.join(',') === '6,7,8,5', `ETDRS steps up then down (${orderWeak.join(',')})`)
  assert(etdrsScore(weak).logMAR === 0.7, `ETDRS weak eye logMAR 0.7 (got ${etdrsScore(weak).logMAR})`)
  assert(logMARToSnellen(0) === '20/20' && logMARToSnellen(0.3) === '20/40', 'logMAR → Snellen')
}

{
  const all = (v) => Object.fromEntries(OSDI_QUESTIONS.map((q) => [q.id, v]))
  assert(calculateOsdi(all(0)).osdiScore === 0, 'OSDI all-zero = 0')
  assert(calculateOsdi(all(4)).osdiScore === 100, 'OSDI all-four = 100')
  const withNA = { ...all(2), night_driving: NOT_APPLICABLE, watching_tv: NOT_APPLICABLE }
  const r = calculateOsdi(withNA)
  assert(r.osdiScore === 50 && r.answeredCount === 10, 'OSDI N/A items are excluded from the denominator')
  assert(calculateOsdi({ ...all(1), gritty: null }).osdiScore === null, 'OSDI needs all core symptom items')
  assert(osdiSeverity(12).severity === 'normal' && osdiSeverity(13).severity === 'mild' && osdiSeverity(33).severity === 'severe', 'OSDI bands')
  const blur = summarizeBlurReportTime([
    { seconds: 4, endedBy: 'blur' }, { seconds: 12, endedBy: 'blink' }, { seconds: 7, endedBy: 'blur' },
  ])
  assert(blur.medianSeconds === 7 && blur.endedByBlur === 2 && blur.endedByBlink === 1, 'blur-report time median + end reasons')
  assert(!('band' in blur) && !('score' in blur), 'blur-report time has no bands or score')
}

{
  // Simulated approach from 50 cm → 8 cm; right eye gives up at 14 cm.
  const samples = []
  for (let d = 50; d >= 8; d -= 0.5) {
    const conv = 0.7 - (1 / d) * 0.7
    const broke = d < 14
    const noise = (Math.random() - 0.5) * 0.004
    samples.push({
      distanceCm: d,
      ratio: (broke ? 0.7 - (1 / 14) * 0.7 + 0.035 : conv) + noise,
      right: broke ? 0.45 : 0.45 + 3 / d,
      left: 0.45 + 3 / d,
    })
  }
  const npc = detectConvergenceBreak(samples)
  assert(npc.breakDetected && Math.abs(npc.breakDistanceCm - 14) <= 1.5, `NPC break detected near 14 cm (got ${npc.breakDistanceCm})`)
  assert(npc.divergingEye === 'right', 'NPC identifies the diverging eye')

  const smooth = samples.map((s) => ({ ...s, ratio: 0.7 - (1 / s.distanceCm) * 0.7, right: s.left }))
  const none = detectConvergenceBreak(smooth)
  assert(!none.breakDetected && none.closestDistanceCm === 8, 'no break when convergence is maintained')
  assert(scoreNearPointConvergence(5) === 100 && scoreNearPointConvergence(20) === 0, 'NPC index bounds')
}

{
  const steady = Array.from({ length: 40 }, (_, i) => ({
    span: 150 + i, right: 0.5, left: 0.5, yaw: 0.02, rollDeg: 1,
  }))
  const baselineSpans = [150, 151, 149, 150]
  const ok = assessNpcCamera({ samples: steady, frames: 45, baselineSpans })
  assert(ok.status === 'ok' && ok.reasons.length === 0, 'NPC camera ok when tracked, large and steady')

  const lost = assessNpcCamera({ samples: steady.slice(0, 25), frames: 60, baselineSpans })
  assert(lost.status === 'unable_to_measure' && lost.reasons.includes('pupils_not_located'), 'NPC camera: pupils not located')

  const small = assessNpcCamera({ samples: steady.map((s) => ({ ...s, span: 40 })), frames: 40, baselineSpans: [40, 41] })
  assert(small.reasons.includes('eye_corner_span_too_small'), 'NPC camera: eye-corner span too small')

  const jitter = assessNpcCamera({ samples: steady, frames: 40, baselineSpans: [130, 170, 140, 165] })
  assert(jitter.reasons.includes('eye_corner_span_unstable'), 'NPC camera: unstable baseline span')

  const turning = assessNpcCamera({
    samples: steady.map((s, i) => ({ ...s, yaw: i % 2 ? 0.2 : -0.2 })), frames: 40, baselineSpans,
  })
  assert(turning.reasons.includes('face_angle_unstable'), 'NPC camera: face angle unstable')
  assert(yawProxy({ right: 30, left: 30 }) === 0 && yawProxy({ right: 0, left: 30 }) === null, 'yaw proxy')

  const both = combineNpcApproach({ reportedCm: 9, cameraBreakCm: 7.5, cameraOk: true })
  assert(both.npcCm === 9 && both.source === 'reported_first' && both.agreementCm === 1.5 && both.agree, 'NPC: first break wins, agreement kept')
  const camFirst = combineNpcApproach({ reportedCm: 8, cameraBreakCm: 14, cameraOk: true })
  assert(camFirst.npcCm === 14 && camFirst.source === 'camera_first' && camFirst.agree === false, 'NPC: camera break first, disagreement flagged')
  const camBad = combineNpcApproach({ reportedCm: 8, cameraBreakCm: 14, cameraOk: false })
  assert(camBad.npcCm === 8 && camBad.cameraBreakCm === null && camBad.agreementCm === null, 'NPC: unconfident camera break ignored')
  const nothing = combineNpcApproach({ reportedCm: null, cameraBreakCm: 14, cameraOk: false })
  assert(nothing.npcCm === null && nothing.source === 'none', 'NPC: unable to measure')
  assert(NPC_CAMERA_LIMITS.agreementCm === 3, 'NPC agreement limit')
}

{
  const asym = quadrantAsymmetry({ UL: 1.2, UR: 1.0, LL: 1.15, LR: 0.7 })
  assert(asym.weakest === 'LR' && asym.maxAsymmetry === 0.5, 'quadrant asymmetry = best − worst')
  assert(asym.relative.UL === 0, 'best quadrant is relative 0')
  assert(scoreSideVisionAsymmetry(0) === 100 && scoreSideVisionAsymmetry(0.6) === 0, 'asymmetry index bounds')
  const ok = sideVisionReliability({ fixationLosses: 2, totalTrials: 32, falsePositives: 1, falseNegatives: 0 })
  assert(ok.reliable, 'reliable session passes')
  const bad = sideVisionReliability({ fixationLosses: 10, totalTrials: 32, falsePositives: 2, falseNegatives: 2 })
  assert(!bad.reliable && bad.reasons.length === 3, 'unreliable session reports all three reasons')
  const rated = sideVisionReliability({
    fixationLosses: 4, totalTrials: 32, falsePositives: 1, falseNegatives: 0, fpCatches: 3, fnCatches: 4,
  })
  assert(rated.fixationLossRate === 0.13 && rated.falsePositiveRate === 0.33 && rated.falseNegativeRate === 0,
    'side vision saves FP/FN rates over valid catch trials')
  assert(ok.falsePositiveRate === null, 'no catch denominator → no rate')
}
assert(glareDeltaLogCS(1.6, 1.3) === 0.3, 'glare Δ logCS = no-glare − glare')
assert(scoreGlareDelta(0) === 100, 'no glare loss → 100')
assert(scoreGlareDelta(0.5) === 0, 'Δ 0.5 logCS → 0')
assert(scoreGlareDelta(-0.1) === 100, 'glare improvement capped at 100')
assert(scoreGlareDelta(0.25) === 50, 'Δ 0.25 → 50')
{
  const allRight = () => {
    const q = createQuest({ priorMean: 1.5, priorSd: 0.6 })
    for (let i = 0; i < 10; i++) q.update(q.next(), true)
    return q.estimate()
  }
  const ng = allRight()
  const g = allRight()
  const delta = glareDeltaLogCS(ng.threshold, g.threshold)
  const verdict = interpretGlareDelta({ logCSNoGlare: ng.threshold, logCSGlare: g.threshold, deltaLogCS: delta, sdNoGlare: ng.sd, sdGlare: g.sd })
  assert(delta === 0 && scoreGlareDelta(delta) === 100, 'glare: all answers right in both conditions → Δ 0, score 100')
  assert(verdict.ceilingNoGlare && verdict.ceilingGlare && verdict.band === 'good', 'glare: all-right run is flagged as at the test limit')
  const partial = interpretGlareDelta({ logCSNoGlare: 2.12, logCSGlare: 1.7, deltaLogCS: 0.42, sdNoGlare: 0.1, sdGlare: 0.1 })
  assert(partial.band === 'poor' && partial.ceilingNote && Math.abs(partial.contrastFactor - 2.63) < 0.01, 'glare: no-glare ceiling notes Δ may be larger')
}

// QUEST should converge near a simulated observer's true threshold.
{
  const trueThreshold = 1.4
  let seed = 42
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const errors = []
  for (let run = 0; run < 40; run++) {
    const q = createQuest({ priorMean: 1.2, priorSd: 0.6 })
    for (let t = 0; t < 30; t++) {
      const s = q.next()
      q.update(s, rand() < weibullPCorrect(s, trueThreshold))
    }
    errors.push(Math.abs(q.estimate().threshold - trueThreshold))
  }
  const meanErr = errors.reduce((a, b) => a + b, 0) / errors.length
  assert(meanErr < 0.15, `QUEST converges near true threshold (mean error ${meanErr.toFixed(3)})`)
}
const fill = (n, px) => Array.from({ length: n }, () => ({ ...px }))
const redPupil = summarizePupilReflex(fill(40, { r: 200, g: 60, b: 40 }))
const glintPupil = summarizePupilReflex([...fill(36, { r: 200, g: 60, b: 40 }), ...fill(4, { r: 255, g: 255, b: 255 })])
const whitePupil = summarizePupilReflex(fill(40, { r: 230, g: 220, b: 200 }))
const dimPupil = summarizePupilReflex(fill(40, { r: 100, g: 30, b: 20 }))
const darkPupil = summarizePupilReflex(fill(40, { r: 20, g: 10, b: 10 }))
assert(summarizePupilReflex(fill(3, { r: 1, g: 1, b: 1 })) === null, 'too few pupil pixels → null')
assert(glintPupil.whiteFraction === 0, 'corneal glint trimmed from reflex colour')
const same = redReflexSymmetry(redPupil, redPupil)
assert(same.flags.length === 0 && !('symmetryScore' in same), 'identical reflexes → no flags and no symmetry score')
const leuko = redReflexSymmetry(redPupil, whitePupil)
assert(leuko.flags.some((f) => f.type === 'white_reflex' && f.eye === 'left' && f.severity === 'critical'), 'one-sided white reflex flagged critical on that eye')
const dull = redReflexSymmetry(dimPupil, redPupil)
assert(dull.flags.some((f) => f.type === 'brightness' && f.eye === 'right'), 'dimmer eye flagged')
{
  const none = redReflexSymmetry(darkPupil, darkPupil)
  assert(eyeGlowOutcome([leuko]).outcome === 'capture_unsuccessful', 'one capture is never enough for an asymmetry prompt')
  assert(needsAnotherGlowCapture([leuko]), 'a single flagged capture asks for another')
  assert(eyeGlowOutcome([leuko, leuko]).outcome === 'asymmetry_observed', 'same flag in two captures → asymmetry observed')
  assert(eyeGlowOutcome([leuko, same]).outcome === 'no_repeated_asymmetry' && needsAnotherGlowCapture([leuko, same]),
    'disagreeing captures are not an asymmetry and ask for a third')
  assert(eyeGlowOutcome([leuko, same, leuko]).outcome === 'asymmetry_observed', 'flag repeated in 2 of 3 → asymmetry observed')
  assert(!needsAnotherGlowCapture([same, same]) && eyeGlowOutcome([same, same]).outcome === 'no_repeated_asymmetry',
    'two clean captures stop, with no "normal" outcome')
  assert(eyeGlowOutcome([none, none]).outcome === 'no_usable_reflex', 'no glow in any capture → no usable reflex')
  assert(eyeGlowOutcome([]).outcome === 'capture_unsuccessful', 'no captures → capture unsuccessful')
  assert(eyeGlowOutcome([dull, redReflexSymmetry(redPupil, dimPupil)]).outcome === 'no_repeated_asymmetry',
    'a dimmer eye that switches sides is not a repeated asymmetry')
}
assert(redReflexSymmetry(darkPupil, darkPupil).reflexVisible === false, 'no reflex in either eye → not scored')
assert(redReflexSymmetry(whitePupil, whitePupil).flags.some((f) => f.type === 'pale_both'), 'both pale reflexes flagged')
const med = medianPupilReflex([redPupil, dimPupil, redPupil, null])
assert(med.frames === 3 && med.luminance === redPupil.luminance, 'median reflex ignores null frames and outliers')
assert(Math.abs(estimatePhoneCameraDistanceCm(90, 1920, 1080) - 97) < 1, '90 px IPD in 1080p ≈ 1 m')
assert(scorePeripheralAwareness(80, 500) <= 100, 'peripheral score bounded')
assert(scorePeripheralAwareness(80, 50) >= scorePeripheralAwareness(80, 500), 'faster reaction improves score')

{
  const truth = { peakGain: 2.0, peakFreq: Math.log10(3), bandwidth: 3, truncation: 0.5 }
  assert(Math.abs(csfLogSensitivity(Math.log10(3), truth) - 2.0) < 1e-9, 'CSF peaks at peakGain')
  const halfOct = 10 ** (Math.log10(3) + (3 * Math.log10(2)) / 2)
  assert(Math.abs(csfLogSensitivity(Math.log10(halfOct), truth) - (2.0 - Math.log10(2))) < 1e-9, 'CSF halves at half-bandwidth above peak')
  assert(Math.abs(csfLogSensitivity(Math.log10(0.1), truth) - 1.5) < 1e-9, 'low-frequency plateau at peak − truncation')
  assert(Math.abs(maxRenderableFrequency(1000, 96 / 25.4, 1, 6) - 11) < 0.1, '96-dpi screen at 1 m renders up to ~11 cpd')
  assert(aulcsfPercentOfReference(99, 0.5, 16) === 100, 'percent of reference capped at 100')

  let seed = 7
  const rng = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  const freqs = [0.5, 1, 2, 4, 8, 16]
  const q = createQcsf({ frequencies: freqs, random: rng })
  for (let i = 0; i < 30; i++) {
    const stim = q.next()
    const thr = csfLogSensitivity(Math.log10(stim.frequency), truth)
    q.update(stim, rng() < weibullPCorrect(stim.logCS, thr, { beta: 3, guessRate: 0.25, lapseRate: 0.04 }))
  }
  const est = q.estimate()
  const trueArea = aulcsf(truth, Math.log10(0.5), Math.log10(16))
  assert(Math.abs(est.aulcsf - trueArea) < 0.35, `qCSF recovers simulated AULCSF (${est.aulcsf.toFixed(2)} vs ${trueArea.toFixed(2)})`)
  assert(est.trials === 30 && est.curve.length === freqs.length, 'qCSF estimate reports curve at tested frequencies')
}

{
  const start = 0
  const every3s = Array.from({ length: 40 }, (_, i) => (i + 1) * 3000) // 20/min
  assert(rollingBlinkRate(every3s, 20000, { startedAt: start }) === null, 'blink rate withheld during warm-up')
  assert(rollingBlinkRate(every3s, 60000, { startedAt: start }) === 20, 'blink rate over a full minute')
  assert(rollingBlinkRate(every3s, 45000, { startedAt: start }) === 20, 'blink rate scales a partial window to per-minute')
  assert(rollingBlinkRate(every3s, 120000, { startedAt: 90000 }) === 20, 'blink rate window starts at the last restart')
  assert(rollingBlinkRate([], 60000, { startedAt: 0 }) === 0, 'no blinks is a rate of zero, not null')
  assert(blinkBand(null) === 'warming_up' && blinkBand(5) === 'lower' && blinkBand(10) === 'intermediate' && blinkBand(16) === 'higher', 'blink coaching categories')
  assert(!breakDue(19 * 60000, 20 * 60000) && breakDue(20 * 60000, 20 * 60000), '20-20-20 break due at the interval')
  const s = summarizeBlinkSession(
    [{ rate: null }, { rate: 6 }, { rate: 6 }, { rate: 14 }, { rate: 14 }],
    30,
    120000
  )
  assert(s.meanRatePerMin === 15 && s.lowRateFraction === 0.5 && s.ratedSeconds === 4, 'blink session summary')
  assert(summarizeBlinkSession([], 3, 10000).meanRatePerMin === null, 'blink session mean withheld when too short')
}

{
  const sloan = ACUITY_CHART_RULES.sloan
  const four = ACUITY_CHART_RULES.tumbling_e
  // Perfect from 0.6 to 0.3, then 2/5 at 0.2 and 1/5 at 0.1.
  const tested = { 6: 5, 5: 5, 4: 5, 3: 5, 2: 2, 1: 1 }
  assert(etdrsScore(tested, sloan).logMAR === 0.24, 'Sloan scoring unchanged without guess correction')
  const e = etdrsScore(tested, four)
  assert(e.logMAR === 0.28 && e.lettersCorrect === 23 && e.lettersCredited === 21, `4-choice scoring removes chance hits (${e.logMAR})`)
  assert(etdrsScore({ 3: 5 }, four).logMAR === 0.3, 'a perfect 4-choice line still earns full credit')
  assert(etdrsNextLine({ 6: 5, 5: 2 }, { stopCorrect: sloan.stopCorrect }) === 4, 'Sloan continues after 2/5')
  assert(etdrsNextLine({ 6: 5, 5: 2 }, { stopCorrect: four.stopCorrect }) === null, '4-choice chart stops at 2/5')

  // Pure guessing on a 4-choice chart should score near the top of the chart, not climb down it.
  let seed = 11
  const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  let total = 0
  const runs = 400
  for (let r = 0; r < runs; r++) {
    const t = {}
    let next = 6
    while (next != null) {
      let c = 0
      for (let i = 0; i < 5; i++) if (rng() < 0.25) c++
      t[next] = c
      next = etdrsNextLine(t, { startTenths: 6, passCorrect: four.passCorrect, stopCorrect: four.stopCorrect })
    }
    total += etdrsScore(t, four).logMAR
  }
  assert(total / runs > 0.95, `guessing on a 4-choice chart scores ≈ chart top (${(total / runs).toFixed(2)})`)
}

{
  const mm = letterHeightPx(400, 1)
  assert(Math.abs(mm - 5.82) < 0.01, `near blur letters are 1.0 logMAR at 40 cm ≈ 5.8 mm (${mm.toFixed(2)})`)
  assert(blurAtTime(1.5, 2) === 0 && Math.abs(blurAtTime(4.5, 2) - 1.0) < 1e-9, 'blur holds at 0, then ramps 0.4 arcmin/s')
  assert(blurAtTime(100, 2) === NEAR_BLUR.capArcmin, 'blur ramp stops at the cap')
  const plan = buildRunPlan()
  assert(plan[0].kind === 'practice' && plan.filter((r) => r.kind === 'scored').length === 4 && plan.filter((r) => r.kind === 'catch').length === 1,
    'near blur plan: 1 practice, 4 scored, 1 catch')
  assert(plan.every((r) => r.holdS >= 2 && r.holdS <= 4), 'random hold 2–4 s')
  const scored = (vals) => vals.map((v) => ({ kind: 'scored', thresholdArcmin: v, censored: false }))
  const ok = summarizeNearBlur([{ kind: 'practice', thresholdArcmin: 5 }, ...scored([1.0, 1.2, 1.1, 0.9]), { kind: 'catch', falseAlarm: false }])
  assert(ok.status === 'ok' && ok.thresholdArcmin === 1.05 && ok.repeatable && ok.index != null, 'repeatable session → median threshold + index')
  const fa = summarizeNearBlur([...scored([1, 1, 1, 1]), { kind: 'catch', falseAlarm: true }])
  assert(fa.status === 'unreliable_catch' && fa.index === null, 'catch false alarm → not scored')
  const spread = summarizeNearBlur([...scored([0.5, 3, 1, 6]), { kind: 'catch', falseAlarm: false }])
  assert(spread.status === 'not_repeatable' && spread.needsExtraRun && spread.index === null, 'unrepeatable runs ask for an extra run')
  const capped = summarizeNearBlur([...scored([0.5, 3, 1, 6, 0.4, 5]), { kind: 'catch', falseAlarm: false }])
  assert(capped.status === 'not_repeatable' && !capped.needsExtraRun, 'extra runs stop after 2')
  const censored = summarizeNearBlur([
    ...scored([1, 1.1]),
    { kind: 'scored', thresholdArcmin: 8, censored: true },
    { kind: 'scored', thresholdArcmin: 8, censored: true },
  ])
  assert(censored.status === 'beyond_range' && censored.thresholdArcmin === null, 'two capped runs → beyond range')
  assert(nearBlurIndex(0.5) === 100 && nearBlurIndex(8) === 0 && nearBlurIndex(2) === 50, 'near blur index is log-linear 0.5→100, 8→0')
}

console.log(`Vision scoring tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
