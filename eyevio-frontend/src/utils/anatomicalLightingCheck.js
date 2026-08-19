/**
 * Anatomical lighting assessment — per ROI luminance (ISO/IEC 29794-5 inspired).
 * Exposure, clipping, and left/right eye uniformity — not whole-face average.
 */

const LEFT_EYE = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
const RIGHT_EYE = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]
const FOREHEAD = [10, 151, 9, 8, 107]
const LEFT_CHEEK = [234, 227, 137, 177]
const RIGHT_CHEEK = [454, 447, 366, 401]

function lumaFromPixel(data, i) {
  return (data[i] + data[i + 1] + data[i + 2]) / 3
}

function roiStats(imageData, width, height, landmarks, indices, pad = 0.12) {
  if (!landmarks?.length) return null

  const xs = indices.map((idx) => landmarks[idx].x * width)
  const ys = indices.map((idx) => landmarks[idx].y * height)
  const xMin = Math.max(0, Math.min(...xs))
  const xMax = Math.min(width, Math.max(...xs))
  const yMin = Math.max(0, Math.min(...ys))
  const yMax = Math.min(height, Math.max(...ys))
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
  let count = 0

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4
      const l = lumaFromPixel(data, i)
      total += l
      if (l < 40) under++
      if (l > 245) over++
      count++
    }
  }

  if (!count) return null
  return {
    mean: total / count,
    underRatio: under / count,
    overRatio: over / count,
  }
}

function fallbackFaceStats(imageData) {
  const { data, width, height } = imageData
  const x0 = Math.floor(width * 0.22)
  const x1 = Math.floor(width * 0.78)
  const y0 = Math.floor(height * 0.18)
  const y1 = Math.floor(height * 0.72)
  const mid = Math.floor((x0 + x1) / 2)

  const side = (xa, xb) => {
    let total = 0
    let under = 0
    let over = 0
    let n = 0
    for (let y = y0; y < y1; y++) {
      for (let x = xa; x < xb; x++) {
        const i = (y * width + x) * 4
        const l = lumaFromPixel(data, i)
        total += l
        if (l < 40) under++
        if (l > 245) over++
        n++
      }
    }
    return n ? { mean: total / n, underRatio: under / n, overRatio: over / n } : null
  }

  return {
    leftEye: side(x0, mid),
    rightEye: side(mid, x1),
    forehead: side(Math.floor(width * 0.35), Math.floor(width * 0.65)),
  }
}

/**
 * Returns raw confidence 0–1 (higher = better lighting) and feature breakdown.
 */
export function assessAnatomicalLighting(imageData, landmarks = null) {
  if (!imageData) {
    return { confidence: 0, quality: 'poor', issues: ['Camera not ready'], recommendations: [] }
  }

  const { width, height } = imageData
  let leftEye
  let rightEye
  let forehead

  if (landmarks?.length >= 400) {
    leftEye = roiStats(imageData, width, height, landmarks, LEFT_EYE)
    rightEye = roiStats(imageData, width, height, landmarks, RIGHT_EYE)
    forehead = roiStats(imageData, width, height, landmarks, FOREHEAD, 0.2)
  } else {
    const fb = fallbackFaceStats(imageData)
    leftEye = fb.leftEye
    rightEye = fb.rightEye
    forehead = fb.forehead
  }

  const issues = []
  const recommendations = []
  let score = 1.0

  const eyeMean = [leftEye?.mean, rightEye?.mean].filter((v) => v != null)
  const avgEye = eyeMean.length ? eyeMean.reduce((a, b) => a + b, 0) / eyeMean.length : 0

  if (avgEye < 55) {
    issues.push('Eye regions too dark')
    recommendations.push('Add soft front-facing light')
    score -= 0.45
  } else if (avgEye < 75) {
    issues.push('Eye regions dim')
    recommendations.push('Brighten evenly from the front')
    score -= 0.22
  }

  if (avgEye > 210) {
    issues.push('Eye regions overexposed')
    recommendations.push('Reduce direct light on your face')
    score -= 0.4
  } else if (avgEye > 185) {
    issues.push('Eye regions quite bright')
    score -= 0.15
  }

  if (leftEye && rightEye) {
    const lrDelta = Math.abs(leftEye.mean - rightEye.mean)
    if (lrDelta > 28) {
      issues.push('Uneven light across eyes')
      recommendations.push('Face the light source — avoid strong side lighting')
      score -= 0.28
    } else if (lrDelta > 18) {
      issues.push('Mild left/right imbalance')
      score -= 0.12
    }
  }

  for (const roi of [leftEye, rightEye, forehead]) {
    if (!roi) continue
    if (roi.overRatio > 0.08) {
      issues.push('Glare on face')
      recommendations.push('Avoid windows or lamps behind you')
      score -= 0.25
      break
    }
    if (roi.underRatio > 0.2) {
      issues.push('Shadows on face')
      score -= 0.18
    }
  }

  score = Math.max(0, Math.min(1, score))
  const confidence = score

  let quality = 'good'
  if (score < 0.45) quality = 'poor'
  else if (score < 0.72) quality = 'fair'

  const message = issues.length
    ? `${issues[0]}.`
    : 'Eye-region lighting looks suitable.'

  return {
    confidence,
    quality,
    acceptable: score >= 0.45,
    issues,
    recommendations: recommendations.length
      ? recommendations
      : ['Keep even front-facing light on both eyes.'],
    message,
    metrics: {
      left_eye_mean: leftEye ? Math.round(leftEye.mean) : null,
      right_eye_mean: rightEye ? Math.round(rightEye.mean) : null,
      forehead_mean: forehead ? Math.round(forehead.mean) : null,
    },
  }
}

export function lightingUiFromStabilized(stabilized, raw) {
  const { state, ema } = stabilized
  let uiQuality = 'checking'
  if (state === 'positive') uiQuality = 'good'
  else if (state === 'fair') uiQuality = 'fair'
  else if (state === 'negative' || state === 'poor') uiQuality = 'poor'
  else if (ema >= 0.72) uiQuality = 'good'
  else if (ema >= 0.5) uiQuality = 'fair'
  else uiQuality = 'poor'

  return {
    ...raw,
    quality: uiQuality,
    acceptable: uiQuality !== 'poor',
    stable: state !== 'checking',
    ema: Math.round(ema * 100),
    advisory: true,
    blockCapture: false,
    message:
      uiQuality === 'good'
        ? raw.message
        : uiQuality === 'fair'
          ? `${raw.issues[0] || 'Lighting is acceptable but not ideal'}. You can capture; we'll re-check on submit.`
          : `${raw.issues[0] || 'Poor lighting'}. Improve light before capture for best results.`,
  }
}

export default assessAnatomicalLighting
