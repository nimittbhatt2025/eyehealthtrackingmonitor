/**
 * Stable live lighting preview — flags only extreme problems.
 * Heuristics cannot reliably detect glasses; use self-confirmation instead.
 */

import { FaceMesh } from '@mediapipe/face_mesh'
import { QualityStabilizer } from './captureQualityStabilizer'

const LEFT_EYE = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
const RIGHT_EYE = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]

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

function roiMean(imageData, width, height, landmarks, indices, pad = 0.2) {
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
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4
      total += (data[i] + data[i + 1] + data[i + 2]) / 3
      n++
    }
  }
  return n ? total / n : 0
}

/** Raw score 0–1. Only penalize extreme lighting — avoids fair/good flicker in normal rooms. */
function scoreLighting(imageData, landmarks) {
  const { width, height } = imageData
  let leftMean = 0
  let rightMean = 0

  if (landmarks?.length >= 400) {
    leftMean = roiMean(imageData, width, height, landmarks, LEFT_EYE)
    rightMean = roiMean(imageData, width, height, landmarks, RIGHT_EYE)
  } else {
    const { data } = imageData
    const mid = Math.floor(width / 2)
    const y0 = Math.floor(height * 0.25)
    const y1 = Math.floor(height * 0.55)
    const avg = (x0, x1) => {
      let t = 0
      let n = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          t += (data[i] + data[i + 1] + data[i + 2]) / 3
          n++
        }
      }
      return n ? t / n : 0
    }
    leftMean = avg(Math.floor(width * 0.22), mid)
    rightMean = avg(mid, Math.floor(width * 0.78))
  }

  const avg = (leftMean + rightMean) / 2
  const lrDelta = Math.abs(leftMean - rightMean)
  let score = 1.0
  const issues = []

  if (avg < 42) {
    score -= 0.55
    issues.push('Too dark — add front-facing light')
  } else if (avg < 58) {
    score -= 0.2
    issues.push('A bit dim — more even light helps')
  }

  if (avg > 225) {
    score -= 0.5
    issues.push('Too bright — reduce direct glare')
  } else if (avg > 200) {
    score -= 0.15
    issues.push('Quite bright — softer light is better')
  }

  if (lrDelta > 48) {
    score -= 0.35
    issues.push('Strong shadow on one side of face')
  } else if (lrDelta > 38) {
    score -= 0.12
    issues.push('Slight uneven lighting')
  }

  score = Math.max(0, Math.min(1, score))
  return {
    confidence: score,
    issues,
    metrics: {
      left_eye_mean: Math.round(leftMean),
      right_eye_mean: Math.round(rightMean),
      left_right_delta: Math.round(lrDelta),
    },
    message: issues[0] || 'Lighting looks suitable for capture.',
  }
}

function toUi(stabilized, raw) {
  const { state, ema } = stabilized
  let quality = 'checking'
  if (state === 'positive' || ema >= 0.78) quality = 'good'
  else if (state === 'negative' || ema < 0.42) quality = 'poor'
  else if (ema >= 0.58) quality = 'fair'
  else quality = 'poor'

  return {
    quality,
    acceptable: quality !== 'poor',
    stable: state !== 'checking',
    ema: Math.round(ema * 100),
    issues: raw.issues,
    metrics: raw.metrics,
    message:
      quality === 'good'
        ? 'Lighting looks good.'
        : quality === 'fair'
          ? `${raw.issues[0] || 'Lighting is usable'}. You can still capture — we re-check on submit.`
          : `${raw.issues[0] || 'Lighting is too poor'}. Improve light for reliable results.`,
    recommendations: raw.issues.length ? [raw.issues[0]] : [],
  }
}

export class StableLightingPreview {
  constructor() {
    this.stabilizer = new QualityStabilizer({
      enterThreshold: 0.78,
      exitThreshold: 0.58,
      alpha: 0.12,
      minPositiveFrames: 8,
      minNegativeFrames: 4,
      positiveState: 'positive',
      negativeState: 'negative',
      initialState: 'checking',
    })
    this.faceMesh = null
    this.lastLandmarks = null
    this._pendingResolve = null
  }

  reset() {
    this.stabilizer.reset()
    this.lastLandmarks = null
  }

  async init() {
    this.faceMesh = await getFaceMesh()
    this.faceMesh.onResults((results) => {
      if (results.multiFaceLandmarks?.[0]) {
        this.lastLandmarks = results.multiFaceLandmarks[0]
      }
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
    return toUi(stabilized, raw)
  }
}

export default StableLightingPreview
