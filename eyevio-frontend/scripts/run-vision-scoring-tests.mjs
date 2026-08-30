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
  scoreColorVision,
  scoreAmslerGrid,
  scoreSideVision,
  scoreGlareTolerance,
  scoreRedReflex,
  scorePeripheralAwareness,
} from '../src/utils/visionTestScoring.js'

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

const colorResponses = [
  { category: 'demo', correct: true },
  { category: 'screening', correct: true },
  { category: 'screening', correct: false, userAnswer: '12' },
  { category: 'control', correct: false, userAnswer: '57' },
]
const colorScore = scoreColorVision(colorResponses)
assert(colorScore < 100, 'color score excludes demo and penalizes control false positive')
assert(colorScore > 0, 'color score not zero with one diagnostic correct')

assert(scoreAmslerGrid(true, false, 0, 0) === 50, 'amsler issues caps at 50')
assert(scoreAmslerGrid(false, false, 10, 0) === 80, 'amsler marks without issues penalize')
assert(scoreAmslerGrid(false, false, 0, 0) === 100, 'amsler clear → 100')

assert(scoreSideVision(0.8, 0.1) > scoreSideVision(0.8, 0.4), 'side vision penalizes deficit')
assert(scoreGlareTolerance(1, 0.5, 0.5) < scoreGlareTolerance(1, 1, 0), 'glare sensitivity lowers score')
assert(scoreRedReflex(90, [{ type: 'leukocoria' }]) <= 30, 'leukocoria caps score')
assert(scorePeripheralAwareness(80, 500) <= 100, 'peripheral score bounded')
assert(scorePeripheralAwareness(80, 50) >= scorePeripheralAwareness(80, 500), 'faster reaction improves score')

console.log(`Vision scoring tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
