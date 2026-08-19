/**
 * Eyeglasses probability from eye-region landmarks + frame signature heuristics.
 * Live preview is advisory; backend runs final gate on capture.
 */

const LEFT_EYE = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
const RIGHT_EYE = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]

function bandEdgeDensity(gray, width, height, y0, y1, x0, x1) {
  let edges = 0
  let total = 0
  for (let y = y0; y < y1; y++) {
    for (let x = Math.max(1, x0); x < Math.min(width - 1, x1); x++) {
      const i = y * width + x
      const gx = Math.abs(gray[i + 1] - gray[i - 1])
      const gy = y > 0 && y < height - 1 ? Math.abs(gray[i + width] - gray[i - width]) : 0
      if (gx + gy > 32) edges++
      total++
    }
  }
  return total ? edges / total : 0
}

function eyeCrop(imageData, landmarks, indices, width, height) {
  const xs = indices.map((idx) => landmarks[idx].x * width)
  const ys = indices.map((idx) => landmarks[idx].y * height)
  const xMin = Math.max(0, Math.min(...xs))
  const xMax = Math.min(width, Math.max(...xs))
  const yMin = Math.max(0, Math.min(...ys))
  const yMax = Math.min(height, Math.max(...ys))
  const w = Math.max(1, xMax - xMin)
  const h = Math.max(1, yMax - yMin)
  return {
    x0: Math.floor(Math.max(0, xMin - w * 0.45)),
    y0: Math.floor(Math.max(0, yMin - h * 0.55)),
    x1: Math.ceil(Math.min(width, xMax + w * 0.45)),
    y1: Math.ceil(Math.min(height, yMax + h * 0.35)),
  }
}

function scoreEyeRegion(imageData, box) {
  const { data, width, height } = imageData
  const gray = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      gray[y * width + x] = (data[i] + data[i + 1] + data[i + 2]) / 3
    }
  }

  const rw = box.x1 - box.x0
  const rh = box.y1 - box.y0
  if (rw < 8 || rh < 8) return 0

  const upperRim = bandEdgeDensity(
    gray, width, height,
    box.y0 + Math.floor(rh * 0.08), box.y0 + Math.floor(rh * 0.28),
    box.x0, box.x1
  )
  const lowerRim = bandEdgeDensity(
    gray, width, height,
    box.y0 + Math.floor(rh * 0.62), box.y0 + Math.floor(rh * 0.82),
    box.x0, box.x1
  )
  const bridge = bandEdgeDensity(
    gray, width, height,
    box.y0 + Math.floor(rh * 0.35), box.y0 + Math.floor(rh * 0.52),
    box.x0 + Math.floor(rw * 0.25), box.x0 + Math.floor(rw * 0.75)
  )

  let p = 0
  if (upperRim > 0.07 && lowerRim > 0.055) p += 0.45
  else if (upperRim > 0.06 && bridge > 0.055) p += 0.32
  else if (upperRim > 0.055) p += 0.12
  if (bridge > 0.06) p += 0.15
  return Math.min(1, p)
}

/**
 * @returns {{ glassesProbability: number, signature: boolean }}
 */
export function assessEyewearProbability(imageData, landmarks = null) {
  if (!imageData) {
    return { glassesProbability: 0, signature: false }
  }

  const { width, height } = imageData

  if (landmarks?.length >= 400) {
    const left = eyeCrop(imageData, landmarks, LEFT_EYE, width, height)
    const right = eyeCrop(imageData, landmarks, RIGHT_EYE, width, height)
    const pL = scoreEyeRegion(imageData, left)
    const pR = scoreEyeRegion(imageData, right)
    const glassesProbability = Math.min(1, (pL + pR) / 2 + (pL > 0.35 && pR > 0.35 ? 0.15 : 0))
    return {
      glassesProbability,
      signature: glassesProbability >= 0.35,
    }
  }

  // Fallback without landmarks — conservative (low probability unless strong signal)
  const gray = new Float32Array(width * height)
  const { data } = imageData
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      gray[y * width + x] = (data[i] + data[i + 1] + data[i + 2]) / 3
    }
  }
  const rh = Math.floor(height * 0.55)
  const rw = width
  const upper = bandEdgeDensity(gray, width, height, Math.floor(rh * 0.2), Math.floor(rh * 0.38), 0, rw)
  const lower = bandEdgeDensity(gray, width, height, Math.floor(rh * 0.55), Math.floor(rh * 0.72), 0, rw)
  const p = upper > 0.07 && lower > 0.055 ? 0.55 : upper > 0.06 ? 0.25 : 0.1
  return { glassesProbability: p, signature: p >= 0.35 }
}

export function eyewearUiFromStabilized(stabilized, raw) {
  const { state, ema } = stabilized
  const likely = state === 'likely' || (state !== 'clear' && state !== 'checking' && ema >= 0.68)

  let status = 'checking'
  if (state === 'likely') status = 'likely_glasses'
  else if (state === 'clear') status = 'clear'
  else if (state === 'checking') status = 'checking'
  else status = ema >= 0.5 ? 'likely_glasses' : ema >= 0.35 ? 'uncertain' : 'clear'

  return {
    status,
    detected: status === 'likely_glasses',
    glassesProbability: Math.round((raw.glassesProbability ?? ema) * 100),
    confidence: Math.round(ema * 100),
    acceptable: true,
    advisory: true,
    blockCapture: false,
    message:
      status === 'likely_glasses'
        ? 'Frames may be present — remove glasses before capture. Final check runs when you submit.'
        : status === 'clear'
          ? 'No obvious frames detected. Contact lenses cannot be verified by camera.'
          : status === 'checking'
            ? 'Checking for eyeglass frames…'
            : 'Eyewear check inconclusive — remove glasses; we re-check on capture.',
    recommendations:
      status === 'likely_glasses'
        ? ['Remove eyeglasses and wait a few seconds for this indicator to settle.']
        : status === 'uncertain'
          ? ['Remove glasses and contact lenses; improve even lighting.']
          : [],
  }
}

export function getEyewearStatusClasses(eyewear) {
  if (!eyewear || eyewear.status === 'checking') return 'bg-gray-50 border-gray-200 text-gray-700'
  if (eyewear.status === 'likely_glasses') return 'bg-amber-50 border-amber-200 text-amber-900'
  if (eyewear.status === 'uncertain') return 'bg-amber-50 border-amber-200 text-amber-900'
  return 'bg-emerald-50 border-emerald-200 text-emerald-800'
}

export function getEyewearStatusLabel(eyewear) {
  if (!eyewear || eyewear.status === 'checking') return 'Checking eyewear…'
  if (eyewear.status === 'likely_glasses') return 'Frames may be present (advisory)'
  if (eyewear.status === 'uncertain') return 'Eyewear check inconclusive'
  return 'No obvious frames detected'
}

export default assessEyewearProbability
