/**
 * Stable live lighting preview — flags only extreme problems.
 * Uses anatomical ROIs + temporal stabilizer (EMA, hysteresis, frame confirmation).
 */

import { FaceMesh } from '@mediapipe/face_mesh'
import { QualityStabilizer } from './captureQualityStabilizer'
import { getLightingUiCopy } from './photoLightingCheck'

const LEFT_EYE = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
const RIGHT_EYE = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]
const FOREHEAD = [10, 151, 9, 8, 107]

// Version 2.11 — eye-first framing (mirrors capture_quality.py)
const MIN_EYE_SPAN = 0.20
const EYE_EDGE_MARGIN = 0.04
const EYE_CENTER_Y_MIN = 0.10
const EYE_CENTER_Y_MAX = 0.75
const EXTREME_EYE_MEAN_LOW = 40
const EXTREME_EYE_MEAN_HIGH = 230
const MODERATE_EYE_MEAN_HIGH = 170
const MODERATE_EVEN_LR_DELTA = 18
const EXTREME_LR_DELTA = 55
const BACKLIGHT_EVEN_EYE_MEAN_MIN = 112
const BACKLIGHT_EVEN_LR_MAX = 18
const BACKLIGHT_SILHOUETTE_LR_MIN = 40
const BACKLIGHT_SILHOUETTE_RATIO_MIN = 1.6
const BACKLIGHT_SILHOUETTE_BRIGHT_MIN = 98
const BACKLIGHT_SILHOUETTE_DIM_MAX = 72
const BACKLIGHT_WINDOW_FLARE_LR_MIN = 45
const BACKLIGHT_WINDOW_FLARE_RATIO_MIN = 1.55
const BACKLIGHT_WINDOW_FLARE_BRIGHT_MIN = 130
const BACKLIGHT_HAZE_OVER_MIN = 0.05
const BACKLIGHT_HAZE_EYE_MEAN_MAX = 140
const FRAME_BACKLIGHT_VERTICAL_DELTA_MIN = 60
const FRAME_BACKLIGHT_UPPER_MEAN_MIN = 155
const FRAME_BACKLIGHT_LOWER_MEAN_MAX = 125
const FRAME_BACKLIGHT_UPPER_BRIGHT200_MIN = 0.28
const FRAME_BACKLIGHT_LOWER_BRIGHT200_MAX = 0.15
const FRAME_BACKLIGHT_LOWER_DARK_MAX = 100
const FRAME_SIDE_GLARE_MAX_OVER245_MIN = 0.12
const FRAME_SIDE_GLARE_OVER245_DELTA_MIN = 0.10
const FRAME_BACKLIGHT_RELAXED_VERTICAL_DELTA_MIN = 38
const FRAME_BACKLIGHT_RELAXED_UPPER_MEAN_MIN = 118
const FRAME_BACKLIGHT_RELAXED_LOWER_MEAN_MAX = 118
const EYE_DARK_MEAN_MAX = 42
const EYE_DARK_UNDER = 0.55
const EXTREME_OVER_RATIO = 0.15
const SCREEN_GLOW_FOREHEAD_MAX = 48
const SCREEN_GLOW_EYE_FOREHEAD_DELTA_MIN = 18
const SCREEN_GLOW_FRAME_LOWER_MAX = 72
const SCREEN_GLOW_UPPER_MEAN_MAX = 130

let sharedFaceMesh = null
let meshInitPromise = null

function getFaceMesh() {
  if (sharedFaceMesh) return Promise.resolve(sharedFaceMesh)
  if (meshInitPromise) return meshInitPromise
  meshInitPromise = new Promise((resolve, reject) => {
    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    })
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    faceMesh.initialize().then(() => {
      sharedFaceMesh = faceMesh
      resolve(faceMesh)
    }).catch(reject)
  })
  return meshInitPromise
}

function roiStats(imageData, width, height, landmarks, indices, pad = 0.15) {
  const xs = indices.map((i) => landmarks[i].x * width)
  const ys = indices.map((i) => landmarks[i].y * height)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const w = Math.max(1, xMax - xMin)
  const h = Math.max(1, yMax - yMin)
  const x0 = Math.floor(Math.max(0, xMin - w * pad))
  const y0 = Math.floor(Math.max(0, yMin - h * pad))
  const x1 = Math.ceil(Math.min(width, xMax + w * pad))
  const y1 = Math.ceil(Math.min(height, yMax + h * pad))

  const { data } = imageData
  let total = 0
  let under = 0
  let over = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4
      const luma = (data[i] + data[i + 1] + data[i + 2]) / 3
      total += luma
      if (luma < 40) under++
      if (luma > 245) over++
      n++
    }
  }
  if (!n) return { mean: 0, underRatio: 0, overRatio: 0 }
  return { mean: total / n, underRatio: under / n, overRatio: over / n }
}

function fallbackRoiStats(imageData) {
  const { data, width, height } = imageData
  const x0 = Math.floor(width * 0.2)
  const x1 = Math.floor(width * 0.8)
  const y0 = Math.floor(height * 0.12)
  const y1 = Math.floor(height * 0.88)
  const mid = Math.floor((x0 + x1) / 2)
  const fhY0 = Math.floor(height * 0.08)
  const fhY1 = Math.floor(height * 0.28)
  const fhX0 = Math.floor(width * 0.3)
  const fhX1 = Math.floor(width * 0.7)

  const side = (xa, xb, ya, yb) => {
    let total = 0
    let under = 0
    let over = 0
    let n = 0
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const i = (y * width + x) * 4
        const l = (data[i] + data[i + 1] + data[i + 2]) / 3
        total += l
        if (l < 40) under++
        if (l > 245) over++
        n++
      }
    }
    return n ? { mean: total / n, underRatio: under / n, overRatio: over / n } : { mean: 0, underRatio: 0, overRatio: 0 }
  }

  return {
    left: side(x0, mid, y0, y1),
    right: side(mid, x1, y0, y1),
    forehead: side(fhX0, fhX1, fhY0, fhY1),
  }
}

function frameBacklightStats(imageData) {
  const { data, width, height } = imageData
  const sample = (xa, xb, ya, yb) => {
    let total = 0
    let bright200 = 0
    let over245 = 0
    let n = 0
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const i = (y * width + x) * 4
        const luma = (data[i] + data[i + 1] + data[i + 2]) / 3
        total += luma
        if (luma > 200) bright200++
        if (luma > 245) over245++
        n++
      }
    }
    if (!n) return { mean: 0, bright200Ratio: 0, over245Ratio: 0 }
    return { mean: total / n, bright200Ratio: bright200 / n, over245Ratio: over245 / n }
  }

  const upper = sample(
    Math.floor(width * 0.2),
    Math.floor(width * 0.8),
    Math.floor(height * 0.05),
    Math.floor(height * 0.42),
  )
  const lower = sample(
    Math.floor(width * 0.25),
    Math.floor(width * 0.75),
    Math.floor(height * 0.48),
    Math.floor(height * 0.88),
  )
  const faceY0 = Math.floor(height * 0.2)
  const faceY1 = Math.floor(height * 0.75)
  const left = sample(Math.floor(width * 0.08), Math.floor(width * 0.42), faceY0, faceY1)
  const right = sample(Math.floor(width * 0.58), Math.floor(width * 0.92), faceY0, faceY1)
  const sideOver245Max = Math.max(left.over245Ratio, right.over245Ratio)
  const sideOver245Delta = Math.abs(left.over245Ratio - right.over245Ratio)

  return {
    upperMean: upper.mean,
    lowerMean: lower.mean,
    verticalDelta: upper.mean - lower.mean,
    upperBright200Ratio: upper.bright200Ratio,
    lowerBright200Ratio: lower.bright200Ratio,
    leftMean: left.mean,
    rightMean: right.mean,
    horizontalDelta: Math.abs(left.mean - right.mean),
    leftOver245Ratio: left.over245Ratio,
    rightOver245Ratio: right.over245Ratio,
    sideOver245Max,
    sideOver245Delta,
  }
}

function isBacklitSilhouetteFrame(frameStats) {
  const dimSide = Math.min(frameStats.leftMean, frameStats.rightMean)
  const brightSide = Math.max(frameStats.leftMean, frameStats.rightMean)
  const sideGlare = (
    frameStats.sideOver245Max > FRAME_SIDE_GLARE_MAX_OVER245_MIN
    && frameStats.sideOver245Delta > FRAME_SIDE_GLARE_OVER245_DELTA_MIN
  )
  return sideGlare && dimSide < 98 && (brightSide - dimSide) > 55
}

function isWindowBacklightFrame(frameStats, { relaxed = false } = {}) {
  const gradientBacklight = (
    frameStats.verticalDelta > FRAME_BACKLIGHT_VERTICAL_DELTA_MIN
    && frameStats.upperMean > FRAME_BACKLIGHT_UPPER_MEAN_MIN
    && frameStats.lowerMean < FRAME_BACKLIGHT_LOWER_MEAN_MAX
  )
  const flareBacklight = (
    frameStats.upperBright200Ratio > FRAME_BACKLIGHT_UPPER_BRIGHT200_MIN
    && frameStats.lowerBright200Ratio < FRAME_BACKLIGHT_LOWER_BRIGHT200_MAX
    && frameStats.lowerMean < FRAME_BACKLIGHT_LOWER_DARK_MAX
  )
  const severeUpperWashout = (
    frameStats.upperBright200Ratio > 0.72
    && frameStats.verticalDelta > 52
    && frameStats.upperMean > 190
  )
  if (gradientBacklight || flareBacklight || severeUpperWashout) return true
  if (!relaxed) return false
  const relaxedGradient = (
    frameStats.verticalDelta > FRAME_BACKLIGHT_RELAXED_VERTICAL_DELTA_MIN
    && frameStats.upperMean > FRAME_BACKLIGHT_RELAXED_UPPER_MEAN_MIN
    && frameStats.lowerMean < FRAME_BACKLIGHT_RELAXED_LOWER_MEAN_MAX
  )
  if (relaxedGradient) return true
  return isBacklitSilhouetteFrame(frameStats)
}

function appendFrameBacklightIssues(issues, recommendations, frameStats, { windowOnly = false } = {}) {
  const before = issues.length
  if (isWindowBacklightFrame(frameStats)) {
    issues.push('Bright window or light source is behind you — face is too dark')
    recommendations.push('Turn around to face the window, or close curtains and use front lighting')
  }
  if (!windowOnly) {
    if (
      frameStats.sideOver245Max > FRAME_SIDE_GLARE_MAX_OVER245_MIN
      && frameStats.sideOver245Delta > FRAME_SIDE_GLARE_OVER245_DELTA_MIN
    ) {
      issues.push('Strong one-sided glare is washing out part of your face')
      recommendations.push('Move the lamp in front of you, or turn so light hits both eyes evenly')
    }
  }
  return issues.length > before
}

function frameSupportsHarshAsymmetry(frameStats) {
  if (isWindowBacklightFrame(frameStats)) return true
  if (isBacklitSilhouetteFrame(frameStats)) return true
  return (
    frameStats.sideOver245Max > FRAME_SIDE_GLARE_MAX_OVER245_MIN
    && frameStats.sideOver245Delta > FRAME_SIDE_GLARE_OVER245_DELTA_MIN
  )
}

function isScreenGlowInDarkRoom(left, right, forehead, frameStats) {
  const eyeMean = (left.mean + right.mean) / 2
  if (eyeMean < EXTREME_EYE_MEAN_LOW) return false
  if (forehead.mean >= SCREEN_GLOW_FOREHEAD_MAX) return false
  if (eyeMean - forehead.mean < SCREEN_GLOW_EYE_FOREHEAD_DELTA_MIN) return false
  if (frameStats.lowerMean > SCREEN_GLOW_FRAME_LOWER_MAX) return false
  if (frameStats.upperMean > SCREEN_GLOW_UPPER_MEAN_MAX) return false
  if (isWindowBacklightFrame(frameStats)) return false
  return true
}

function frameMetricsFromStats(frameStats) {
  return {
    frame_upper_mean: Math.round(frameStats.upperMean),
    frame_lower_mean: Math.round(frameStats.lowerMean),
    frame_vertical_delta: Math.round(frameStats.verticalDelta),
    frame_upper_bright200_ratio: Math.round(frameStats.upperBright200Ratio * 1000) / 1000,
    frame_lower_bright200_ratio: Math.round(frameStats.lowerBright200Ratio * 1000) / 1000,
    frame_side_over245_max: Math.round(frameStats.sideOver245Max * 1000) / 1000,
    frame_side_over245_delta: Math.round(frameStats.sideOver245Delta * 1000) / 1000,
    frame_horizontal_delta: Math.round(frameStats.horizontalDelta),
  }
}

/** Returns null if OK, else 'too_far' | 'position' | 'uncertain'. */
function framingFailureKind(landmarks) {
  if (!landmarks?.length || landmarks.length < 400) return 'uncertain'
  const eyeIdx = LEFT_EYE.concat(RIGHT_EYE)
  let ySum = 0
  let xMin = 1
  let xMax = 0
  for (const i of eyeIdx) {
    const { x, y } = landmarks[i]
    ySum += y
    if (x < xMin) xMin = x
    if (x > xMax) xMax = x
  }
  const meanY = ySum / eyeIdx.length
  const eyeSpan = xMax - xMin

  if (eyeSpan < MIN_EYE_SPAN) return 'too_far'
  if (meanY < EYE_CENTER_Y_MIN || meanY > EYE_CENTER_Y_MAX) return 'position'
  if (xMin < EYE_EDGE_MARGIN || xMax > 1 - EYE_EDGE_MARGIN) return 'position'
  return null
}

function framingCopy(kind) {
  if (kind === 'too_far') {
    return {
      issues: ['Eyes too small in frame — move closer to the camera'],
      recommendations: [
        'Fill the frame with both eyes — chin and forehead can be out of view',
        'Move closer until both eyes are large and sharp',
      ],
      message: 'Move closer so both eyes fill more of the frame for accurate analysis.',
    }
  }
  if (kind === 'position') {
    return {
      issues: ['Both eyes not fully in view'],
      recommendations: [
        'Keep both eyes inside the frame and level',
        'Look straight at the camera with even light on both eyes',
      ],
      message: 'Keep both eyes fully in view before capturing.',
    }
  }
  return {
    issues: ['Could not detect both eyes clearly'],
    recommendations: ['Remove glasses, face the camera, and move closer'],
    message: 'Could not detect both eyes — move closer and look at the camera.',
  }
}

function faceFramingOk(landmarks) {
  return framingFailureKind(landmarks) == null
}

/** Returns 1 = normal, 0 = extreme problem (for stabilizer input). */
function scoreLighting(imageData, landmarks) {
  const { width, height } = imageData
  const frameStats = frameBacklightStats(imageData)

  const framingKind = framingFailureKind(landmarks)
  if (framingKind != null) {
    if (framingKind === 'too_far' || framingKind === 'position') {
      const copy = framingCopy(framingKind)
      return {
        confidence: 0,
        isExtreme: true,
        reason: 'framing',
        framingKind,
        issues: copy.issues,
        recommendations: copy.recommendations,
        metrics: {},
        message: copy.message,
      }
    }
    if (isWindowBacklightFrame(frameStats, { relaxed: true })) {
      const issues = []
      const recommendations = []
      if (isBacklitSilhouetteFrame(frameStats)) {
        issues.push('Strong one-sided glare is washing out part of your face')
        recommendations.push('Move the lamp in front of you, or turn so light hits both eyes evenly')
      }
      appendFrameBacklightIssues(issues, recommendations, frameStats, { windowOnly: true })
      return {
        confidence: 0,
        isExtreme: true,
        reason: 'lighting',
        issues,
        recommendations,
        metrics: frameMetricsFromStats(frameStats),
        message: issues[0],
      }
    }
    const copy = framingCopy('uncertain')
    return {
      confidence: 0,
      isExtreme: true,
      reason: 'framing',
      framingKind: 'uncertain',
      issues: copy.issues,
      recommendations: copy.recommendations,
      metrics: {},
      message: copy.message,
    }
  }

  const left = roiStats(imageData, width, height, landmarks, LEFT_EYE)
  const right = roiStats(imageData, width, height, landmarks, RIGHT_EYE)
  const forehead = roiStats(imageData, width, height, landmarks, FOREHEAD, 0.25)

  const eyeMean = (left.mean + right.mean) / 2
  const lrDelta = Math.abs(left.mean - right.mean)
  const eyeUnderMax = Math.max(left.underRatio, right.underRatio)
  const overRatio = Math.max(left.overRatio, right.overRatio, forehead.overRatio)
  const dimEye = Math.min(left.mean, right.mean)
  const brightEye = Math.max(left.mean, right.mean)
  const eyeRatio = brightEye / Math.max(dimEye, 1)

  const issues = []
  const recommendations = []

  if (eyeMean < EXTREME_EYE_MEAN_LOW) {
    issues.push('Lighting is too dark — move toward a light source')
    recommendations.push('Turn on soft front-facing room lights')
  }
  if (eyeMean > EXTREME_EYE_MEAN_HIGH) {
    issues.push('Lighting is too bright — reduce direct glare on your face')
    recommendations.push('Move away from windows or lamps shining at you')
  }
  if (eyeMean > MODERATE_EYE_MEAN_HIGH && eyeMean <= EXTREME_EYE_MEAN_HIGH && lrDelta <= MODERATE_EVEN_LR_DELTA) {
    issues.push('Face is evenly over-bright — soften lighting for reliable analysis')
    recommendations.push('Move away from strong backlight or reduce direct front light')
  }
  if (lrDelta > EXTREME_LR_DELTA && frameSupportsHarshAsymmetry(frameStats)) {
    issues.push('Strong uneven lighting across your eyes')
    recommendations.push('Face the light source directly')
  }
  if (eyeMean < EYE_DARK_MEAN_MAX && eyeUnderMax > EYE_DARK_UNDER) {
    issues.push('Eye regions too dark with heavy shadow')
    recommendations.push('Brighten evenly from the front')
  }
  if (isScreenGlowInDarkRoom(left, right, forehead, frameStats)) {
    issues.push('Room is too dark — turn on front-facing lights')
    recommendations.push('Move away from relying on your screen for light; use a lamp in front of you')
  }
  if (overRatio > EXTREME_OVER_RATIO) {
    issues.push('Severe glare or overexposure on your face')
    recommendations.push('Avoid bright windows or lamps behind you')
  }
  if (eyeMean >= BACKLIGHT_EVEN_EYE_MEAN_MIN && lrDelta <= BACKLIGHT_EVEN_LR_MAX) {
    const hasFrameBacklight = (
      frameStats.verticalDelta > FRAME_BACKLIGHT_VERTICAL_DELTA_MIN
      || (
        frameStats.upperBright200Ratio > FRAME_BACKLIGHT_UPPER_BRIGHT200_MIN
        && frameStats.lowerMean < FRAME_BACKLIGHT_LOWER_MEAN_MAX
      )
    )
    if (hasFrameBacklight) {
      issues.push('Strong backlight detected — turn away from the window')
      recommendations.push('Face a lamp or open wall instead of a bright window behind you')
    }
  }
  if (
    lrDelta >= BACKLIGHT_SILHOUETTE_LR_MIN
    && eyeRatio >= BACKLIGHT_SILHOUETTE_RATIO_MIN
    && brightEye >= BACKLIGHT_SILHOUETTE_BRIGHT_MIN
    && dimEye <= BACKLIGHT_SILHOUETTE_DIM_MAX
    && frameSupportsHarshAsymmetry(frameStats)
  ) {
    issues.push('Backlight is creating harsh shadows on your face')
    recommendations.push('Close curtains or rotate so light hits your face from the front')
  }
  if (
    lrDelta >= BACKLIGHT_WINDOW_FLARE_LR_MIN
    && eyeRatio >= BACKLIGHT_WINDOW_FLARE_RATIO_MIN
    && brightEye >= BACKLIGHT_WINDOW_FLARE_BRIGHT_MIN
    && frameSupportsHarshAsymmetry(frameStats)
  ) {
    issues.push('Strong glare from a bright source behind you')
    recommendations.push('Move so windows or lamps are in front of you, not behind')
  }
  if (overRatio > BACKLIGHT_HAZE_OVER_MIN && eyeMean < BACKLIGHT_HAZE_EYE_MEAN_MAX) {
    const frameSupportsHaze = (
      frameStats.verticalDelta > FRAME_BACKLIGHT_VERTICAL_DELTA_MIN
      || (
        frameStats.sideOver245Max > FRAME_SIDE_GLARE_MAX_OVER245_MIN
        && frameStats.sideOver245Delta > FRAME_SIDE_GLARE_OVER245_DELTA_MIN
      )
    )
    if (frameSupportsHaze) {
      issues.push('Haze or flare is washing out facial detail')
      recommendations.push('Reduce backlight and use softer front-facing light')
    }
  }
  appendFrameBacklightIssues(issues, recommendations, frameStats)

  const isExtreme = issues.length > 0

  return {
    confidence: isExtreme ? 0 : 1,
    isExtreme,
    reason: isExtreme ? 'lighting' : 'ok',
    issues,
    recommendations: recommendations.length ? recommendations : ['Keep even front-facing light on both eyes.'],
    metrics: {
      left_eye_mean: Math.round(left.mean),
      right_eye_mean: Math.round(right.mean),
      forehead_mean: Math.round(forehead.mean),
      left_right_delta: Math.round(lrDelta),
      under_ratio: Math.round(Math.max(eyeUnderMax, forehead.underRatio) * 1000) / 1000,
      over_ratio: Math.round(overRatio * 1000) / 1000,
      ...frameMetricsFromStats(frameStats),
    },
    message: issues[0] || 'Lighting looks good.',
  }
}

function dominantReason(reasonHistory, fallback) {
  if (!reasonHistory.length) return fallback
  const counts = {}
  for (const r of reasonHistory) {
    if (r === 'ok') continue
    counts[r] = (counts[r] || 0) + 1
  }
  let best = fallback
  let bestN = 0
  for (const [reason, n] of Object.entries(counts)) {
    if (n > bestN) {
      best = reason
      bestN = n
    }
  }
  return best
}

function toUi(stabilized, raw, reasonHistory) {
  const { state } = stabilized
  const checking = state === 'checking'
  const isBlocked = state === 'extreme'
  const stableReason = isBlocked
    ? dominantReason(reasonHistory, raw.reason)
    : 'ok'
  const isFraming = isBlocked && stableReason === 'framing'

  let status = 'normal'
  if (checking) status = 'checking'
  else if (isFraming) status = 'framing_problem'
  else if (isBlocked) status = 'extreme_problem'

  const copy = getLightingUiCopy({
    status,
    stable: !checking,
    framing_kind: isFraming ? (raw.framingKind || 'position') : undefined,
  })

  return {
    status,
    acceptable: !isBlocked,
    blockCapture: isBlocked && !checking,
    stable: !checking,
    ema: Math.round(stabilized.ema * 100),
    reason: isFraming ? 'framing' : (isBlocked ? 'lighting' : 'ok'),
    framing_kind: isFraming ? raw.framingKind : undefined,
    issues: raw.issues,
    metrics: raw.metrics,
    recommendations: raw.recommendations,
    message: copy.message,
    label: copy.label,
  }
}

export class StableLightingPreview {
  constructor() {
    this.stabilizer = new QualityStabilizer({
      windowSize: 6,
      failWindow: 3,
      badToExtreme: 2,
      recoverWindow: 4,
      goodToNormal: 3,
      positiveState: 'normal',
      negativeState: 'extreme',
      initialState: 'checking',
    })
    this.faceMesh = null
    this.lastLandmarks = null
    this._pendingResolve = null
    this._lastUi = null
    this._reasonHistory = []
  }

  reset() {
    this.stabilizer.reset()
    this.lastLandmarks = null
    this._lastUi = null
    this._reasonHistory = []
  }

  async init() {
    this.faceMesh = await getFaceMesh()
    this.faceMesh.onResults((results) => {
      // Clear when face is lost — otherwise stale eye ROIs sample the background mural.
      this.lastLandmarks = results.multiFaceLandmarks?.[0] || null
      if (this._pendingResolve) {
        this._pendingResolve()
        this._pendingResolve = null
      }
    })
  }

  async sample(video, canvas) {
    if (!video?.videoWidth) return null
    if (!this.faceMesh) await this.init()

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)

    await new Promise((resolve) => {
      this._pendingResolve = resolve
      setTimeout(() => {
        if (this._pendingResolve === resolve) {
          this._pendingResolve = null
          resolve()
        }
      }, 200)
      this.faceMesh.send({ image: video }).catch(resolve)
    })

    const raw = scoreLighting(imageData, this.lastLandmarks)
    const stabilized = this.stabilizer.push(raw.confidence)
    this._reasonHistory.push(raw.reason)
    if (this._reasonHistory.length > 6) this._reasonHistory.shift()
    const ui = toUi(stabilized, raw, this._reasonHistory)
    this._lastUi = ui
    return ui
  }
}

export default StableLightingPreview
