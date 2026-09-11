/**
 * Pupil / iris region detector built on MediaPipe Face Mesh iris landmarks.
 *
 * Replaces fixed-position eye guesses with real landmarks so pixel sampling
 * lands on the pupil regardless of where the face sits in frame.
 *
 * Shared by the Eye Glow (red reflex) test and near-work pupil sampling.
 */

import { FaceMesh } from '@mediapipe/face_mesh'

// refineLandmarks adds iris points 468-477 (centre + 4 cardinal points per eye).
// MediaPipe's groups are anatomical: 468-472 is the subject's right eye, 473-477 the left.
// In an unmirrored frame the right eye appears on the image's left side.
const IRIS_RIGHT = [468, 469, 470, 471, 472]
const IRIS_LEFT = [473, 474, 475, 476, 477]
// Eye contours, used when iris refinement is unavailable
const CONTOUR_RIGHT = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
const CONTOUR_LEFT = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]

// Pupil is smaller than the iris; in dim light it sits near this fraction of iris radius.
const PUPIL_TO_IRIS_RATIO = 0.62
const MIN_REGION_RADIUS_PX = 8
const RESULT_TIMEOUT_MS = 200
const STALE_LANDMARK_MS = 500

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
    faceMesh
      .initialize()
      .then(() => {
        sharedFaceMesh = faceMesh
        resolve(faceMesh)
      })
      .catch(reject)
  })

  return meshInitPromise
}

function centroid(landmarks, indices, width, height) {
  let sumX = 0
  let sumY = 0
  indices.forEach((i) => {
    sumX += landmarks[i].x * width
    sumY += landmarks[i].y * height
  })
  return { x: sumX / indices.length, y: sumY / indices.length }
}

function maxRadius(landmarks, indices, center, width, height) {
  let radius = 0
  indices.forEach((i) => {
    const dx = landmarks[i].x * width - center.x
    const dy = landmarks[i].y * height - center.y
    radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy))
  })
  return radius
}

/**
 * Convert landmarks into pupil sampling circles in pixel space.
 *
 * Coordinates are in the raw video frame's space — the same space a canvas
 * drawImage() produces — so CSS mirroring of the preview does not affect them.
 * Regions are exposed both anatomically (for reporting per eye) and by screen
 * position (for drawing overlays).
 */
function regionsFromLandmarks(landmarks, width, height) {
  if (!landmarks || !width || !height) return null

  const hasIris = landmarks.length > Math.max(...IRIS_LEFT)
  const rightIndices = hasIris ? IRIS_RIGHT : CONTOUR_RIGHT
  const leftIndices = hasIris ? IRIS_LEFT : CONTOUR_LEFT

  const build = (indices) => {
    const center = centroid(landmarks, indices, width, height)
    const spread = maxRadius(landmarks, indices, center, width, height)
    // Iris landmarks describe the iris edge; eye contours are much wider than the pupil.
    const scale = hasIris ? PUPIL_TO_IRIS_RATIO : 0.28
    return {
      x: center.x,
      y: center.y,
      radius: Math.max(MIN_REGION_RADIUS_PX, spread * scale),
      irisRadius: spread,
    }
  }

  const anatomicalRight = build(rightIndices)
  const anatomicalLeft = build(leftIndices)
  const [screenLeft, screenRight] = [anatomicalRight, anatomicalLeft].sort((a, b) => a.x - b.x)

  return {
    source: hasIris ? 'iris-landmarks' : 'eye-contour-landmarks',
    anatomicalLeft,
    anatomicalRight,
    screenLeft,
    screenRight,
    // Pixel distance between eye centres — a stable distance/scale cue.
    eyeSpanPx: Math.abs(anatomicalLeft.x - anatomicalRight.x),
  }
}

/**
 * Fixed-position circles used when no face is detected.
 * Frame coordinates are unmirrored, so the image's left half holds the right eye.
 */
export function fallbackPupilRegions(width, height) {
  const radius = Math.max(MIN_REGION_RADIUS_PX, Math.round(Math.min(width, height) * 0.045))
  const y = Math.floor(height * 0.4)
  const anatomicalRight = { x: Math.floor(width * 0.35), y, radius, irisRadius: radius }
  const anatomicalLeft = { x: Math.floor(width * 0.65), y, radius, irisRadius: radius }

  return {
    source: 'fallback-fixed-position',
    anatomicalLeft,
    anatomicalRight,
    screenLeft: anatomicalRight,
    screenRight: anatomicalLeft,
    eyeSpanPx: Math.floor(width * 0.3),
  }
}

/** Average colour stats for a circular region of an ImageData buffer. */
export function sampleRegionPixels(imageData, region) {
  if (!imageData || !region) return []

  const { data, width, height } = imageData
  const radius = Math.round(region.radius)
  const cx = Math.round(region.x)
  const cy = Math.round(region.y)
  const pixels = []

  const yStart = Math.max(0, cy - radius)
  const yEnd = Math.min(height - 1, cy + radius)
  const xStart = Math.max(0, cx - radius)
  const xEnd = Math.min(width - 1, cx + radius)

  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy > radius * radius) continue
      const idx = (y * width + x) * 4
      pixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] })
    }
  }

  return pixels
}

/**
 * Estimate relative pupil size inside an iris circle.
 *
 * MediaPipe gives iris landmarks, not the pupil. Within the iris ROI the pupil
 * is the darkest central area, so dark-pixel fraction tracks pupil area and is
 * already normalised to iris size (robust to viewing distance).
 *
 * Returns a 0–100 score (higher ≈ larger pupil). Averaged across both eyes.
 */
export function estimatePupilSizeFromRegions(imageData, regions) {
  if (!imageData || !regions) return null

  const scoreEye = (region) => {
    if (!region) return null
    // Sample the full iris disc when available; fall back to the pupil circle.
    const irisRegion = {
      x: region.x,
      y: region.y,
      radius: Math.max(region.irisRadius || region.radius, region.radius),
    }
    const pixels = sampleRegionPixels(imageData, irisRegion)
    if (pixels.length < 12) return null

    let sum = 0
    const brightness = pixels.map((p) => {
      const b = (p.r + p.g + p.b) / 3
      sum += b
      return b
    })
    const mean = sum / brightness.length
    // Adaptive threshold: pupil is darker than the surrounding iris/sclera edge.
    const threshold = Math.max(18, Math.min(mean * 0.72, mean - 12))
    let dark = 0
    brightness.forEach((b) => {
      if (b <= threshold) dark += 1
    })
    return (dark / brightness.length) * 100
  }

  const left = scoreEye(regions.anatomicalLeft)
  const right = scoreEye(regions.anatomicalRight)
  const scores = [left, right].filter((v) => Number.isFinite(v))
  if (scores.length === 0) return null

  return {
    size: scores.reduce((a, b) => a + b, 0) / scores.length,
    left,
    right,
    source: regions.source,
  }
}

/**
 * Tracks pupil regions from a live <video> element.
 * Call track() on an interval; read getRegions() when sampling a frame.
 */
export class PupilRegionTracker {
  constructor() {
    this.faceMesh = null
    this.lastLandmarks = null
    this.lastDetectedAt = 0
    this._pendingResolve = null
    this._initPromise = null
    this._unavailable = false
  }

  async init() {
    if (this.faceMesh) return this.faceMesh
    if (this._initPromise) return this._initPromise

    this._initPromise = getFaceMesh()
      .then((faceMesh) => {
        this.faceMesh = faceMesh
        faceMesh.onResults((results) => {
          this.lastLandmarks = results.multiFaceLandmarks?.[0] || null
          if (this.lastLandmarks) this.lastDetectedAt = Date.now()
          if (this._pendingResolve) {
            this._pendingResolve()
            this._pendingResolve = null
          }
        })
        return faceMesh
      })
      .catch((err) => {
        // Never block a test on model load — callers fall back to fixed regions.
        console.warn('Pupil landmark model unavailable:', err)
        this._unavailable = true
        return null
      })

    return this._initPromise
  }

  async track(video) {
    if (this._unavailable || !video?.videoWidth) return null
    if (!this.faceMesh) await this.init()
    if (!this.faceMesh) return null

    await new Promise((resolve) => {
      this._pendingResolve = resolve
      setTimeout(() => {
        if (this._pendingResolve === resolve) {
          this._pendingResolve = null
          resolve()
        }
      }, RESULT_TIMEOUT_MS)
      this.faceMesh.send({ image: video }).catch(resolve)
    })

    return this.getRegions(video.videoWidth, video.videoHeight)
  }

  /** Latest regions in pixel space, or null when no recent detection. */
  getRegions(width, height) {
    if (!this.lastLandmarks) return null
    if (Date.now() - this.lastDetectedAt > STALE_LANDMARK_MS) return null
    return regionsFromLandmarks(this.lastLandmarks, width, height)
  }

  get faceDetected() {
    return Boolean(this.lastLandmarks) && Date.now() - this.lastDetectedAt <= STALE_LANDMARK_MS
  }

  get modelUnavailable() {
    return this._unavailable
  }

  reset() {
    this.lastLandmarks = null
    this.lastDetectedAt = 0
  }

  stop() {
    this._pendingResolve = null
    this.reset()
    // Shared FaceMesh instance stays alive for other screens.
    this.faceMesh = null
    this._initPromise = null
  }
}

export default PupilRegionTracker
