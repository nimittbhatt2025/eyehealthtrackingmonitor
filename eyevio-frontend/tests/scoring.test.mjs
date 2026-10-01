/**
 * Scoring and stimulus-sizing functions not covered by scripts/run-vision-scoring-tests.mjs.
 * Run: npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  findThresholdLineIndex,
  glareDeltaLogCS,
  interpretGlareDelta,
  interpretNearPointConvergence,
  lineAccuracy,
  linePassed,
  scoreGlareDelta,
} from '../src/utils/visionTestScoring.js'
import { csfCutoffLogFreq, csfLogSensitivity, REFERENCE_CSF } from '../src/utils/qcsf.js'
import { emptyOsdiAnswers, osdiComplete } from '../src/utils/dryEyeQuestionnaire.js'
import { optotypeHeightMm, optotypeHeightPx, smallestRenderableLogMAR } from '../src/utils/screenScale.js'
import { pxPerArcmin } from '../src/utils/vernier.js'
import { blockingDisplayIssues } from '../src/utils/colorThreshold.js'

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`)

describe('optotype size (acuity stimulus scale)', () => {
  it('a 20/20 letter subtends 5 arcmin', () => {
    close(optotypeHeightMm(0, 6000), 8.73, 0.01, '6 m')
    close(optotypeHeightMm(0, 400), 0.582, 0.001, '40 cm')
  })

  it('each 0.1 logMAR is a factor of 10^0.1 in size', () => {
    close(optotypeHeightMm(1, 3000) / optotypeHeightMm(0, 3000), 10, 0.01, 'logMAR 1 is 10× logMAR 0')
    close(optotypeHeightMm(0.3, 3000) / optotypeHeightMm(0.2, 3000), 10 ** 0.1, 1e-3, 'one line step')
  })

  it('pixels follow the calibrated px/mm', () => {
    close(optotypeHeightPx(0, 6000, 4), 4 * optotypeHeightMm(0, 6000), 1e-9, 'px = mm × px/mm')
  })

  it('smallest renderable line needs ≥ 5 device pixels (one per stroke row)', () => {
    const lines = [1, 0.5, 0.3, 0.2, 0.1, 0, -0.1]
    // 1 m, 4 px/mm: logMAR 0 = 1.45 mm = 5.8 px, logMAR -0.1 = 4.6 px.
    assert.equal(smallestRenderableLogMAR(lines, 1000, 4, 1), 0)
    assert.equal(smallestRenderableLogMAR(lines, 1000, 4, 2), -0.1, 'a 2× display draws one line finer')
    assert.equal(smallestRenderableLogMAR([0.3, 0.2], 300, 1, 1), 0.3, 'nothing renderable → largest line')
  })

  it('vernier offsets convert through px per arcmin', () => {
    close(pxPerArcmin(1000, 4, 1), 1.1636, 1e-3, '1 m at 4 px/mm')
    close(pxPerArcmin(1000, 4, 2), 2 * pxPerArcmin(1000, 4, 1), 1e-9, 'scales with DPR')
  })
})

describe('acuity line scoring', () => {
  it('line accuracy and the 60% pass rule', () => {
    const line = (c, n) => Array.from({ length: n }, (_, i) => ({ correct: i < c }))
    assert.equal(lineAccuracy([]), 0)
    assert.equal(lineAccuracy(line(3, 5)), 0.6)
    assert.equal(linePassed(line(3, 5)), true)
    assert.equal(linePassed(line(2, 5)), false)
    assert.equal(linePassed(line(2, 5), 0.4), true, 'custom threshold')
    assert.equal(findThresholdLineIndex({ 0: line(5, 5), 1: line(1, 5), 2: line(4, 5) }, 3), 2, 'last passed line wins')
    assert.equal(findThresholdLineIndex({}, 3), 0, 'nothing tested → line 0')
  })
})

describe('glare interpretation', () => {
  const run = (noGlare, glare, sd = 0.1) =>
    interpretGlareDelta({ logCSNoGlare: noGlare, logCSGlare: glare, deltaLogCS: glareDeltaLogCS(noGlare, glare), sdNoGlare: sd, sdGlare: sd })

  it('bands follow Δ logCS', () => {
    assert.equal(run(1.6, 1.55).band, 'good')
    assert.equal(run(1.6, 1.4).band, 'fair')
    assert.equal(run(1.6, 1.2).band, 'poor')
    assert.equal(run(1.6, 1.2).status, 'Large contrast loss under glare')
  })

  it('a low no-glare baseline is reported as such, whatever the Δ', () => {
    const r = run(1.0, 1.0)
    assert.equal(r.band, 'poor')
    assert.match(r.status, /even without glare/)
  })

  it('wide staircase SDs mark the result low-confidence', () => {
    assert.equal(run(1.6, 1.55, 0.1).lowConfidence, false)
    assert.equal(run(1.6, 1.55, 0.35).lowConfidence, true)
  })

  it('score index and Δ agree with the headline band', () => {
    assert.equal(glareDeltaLogCS(null, 1), null)
    assert.equal(scoreGlareDelta(glareDeltaLogCS(1.6, 1.3)), 40)
    assert.equal(scoreGlareDelta(Number.NaN), 0)
  })
})

describe('near point of convergence interpretation', () => {
  it('tones by break distance', () => {
    assert.equal(interpretNearPointConvergence(5).tone, 'green')
    assert.equal(interpretNearPointConvergence(8).tone, 'amber')
    assert.equal(interpretNearPointConvergence(14).tone, 'red')
    assert.equal(interpretNearPointConvergence(Number.NaN).tone, 'gray')
  })

  it('no break: close tracking is typical, far tracking is inconclusive', () => {
    assert.equal(interpretNearPointConvergence(8, { breakDetected: false }).tone, 'green')
    assert.equal(interpretNearPointConvergence(15, { breakDetected: false }).tone, 'amber')
  })
})

describe('contrast sensitivity function', () => {
  it('cut-off frequency is where the CSF reaches 100% contrast (log sensitivity 0)', () => {
    const cutoff = csfCutoffLogFreq(REFERENCE_CSF)
    close(csfLogSensitivity(cutoff, REFERENCE_CSF), 0, 1e-9, 'sensitivity at cut-off')
    assert.ok(10 ** cutoff > 20 && 10 ** cutoff < 80, `reference cut-off ${(10 ** cutoff).toFixed(1)} cpd is physiological`)
    assert.equal(csfCutoffLogFreq({ ...REFERENCE_CSF, peakGain: 0 }), REFERENCE_CSF.peakFreq)
  })
})

describe('questionnaire and display gates', () => {
  it('OSDI completeness', () => {
    const empty = emptyOsdiAnswers()
    assert.equal(osdiComplete(empty), false)
    assert.equal(osdiComplete(Object.fromEntries(Object.keys(empty).map((k) => [k, 0]))), true)
  })

  it('display modes that invalidate the colour test are blocking', () => {
    assert.deepEqual(blockingDisplayIssues({ colorDepth: 24 }), [])
    assert.equal(blockingDisplayIssues({ forcedColors: true, invertedColors: true, monochrome: true, colorDepth: 16 }).length, 4)
  })
})
