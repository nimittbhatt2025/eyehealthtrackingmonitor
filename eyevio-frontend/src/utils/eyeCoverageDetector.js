/**
 * Eye Coverage Detection
 *
 * Strategy (in order):
 * 1. Hand ↔ eye overlap (MediaPipe Hands) when the hands model loads
 * 2. Iris-region occlusion vs baseline (brightness / variance shift) — works for palm cover
 * 3. Eye Aspect Ratio — catches a closed/squinted eye when the hand model misses
 *
 * Coordinates are anatomical (subject's own left/right). MediaPipe reads the raw
 * video buffer; CSS mirroring on the preview does not affect landmark space.
 */

import { FaceMesh } from '@mediapipe/face_mesh'

// Anatomical: MediaPipe right-eye group = subject's right eye (left side of unmirrored frame)
const IRIS_RIGHT = [468, 469, 470, 471, 472]
const IRIS_LEFT = [473, 474, 475, 476, 477]
const CONTOUR_RIGHT = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
const CONTOUR_LEFT = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]

const EAR_POINTS_RIGHT = { p1: 33, p2: 160, p3: 159, p4: 133, p5: 145, p6: 144 }
const EAR_POINTS_LEFT = { p1: 362, p2: 387, p3: 386, p4: 263, p5: 374, p6: 373 }

const RESULT_TIMEOUT_MS = 200
const HAND_OVERLAP_THRESHOLD = 0.28
const EAR_COVERED_THRESHOLD = 0.15
const OCCLUSION_BRIGHTNESS_DROP = 28 // mean brightness drop vs baseline ⇒ covered
const OCCLUSION_VARIANCE_DROP_RATIO = 0.45 // variance collapse (flat palm skin)
const STREAK_REQUIRED = 3 // consecutive agreeing frames before reporting a cover

function distance(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function eyeAspectRatio(landmarks, points) {
  const p1 = landmarks[points.p1]
  const p2 = landmarks[points.p2]
  const p3 = landmarks[points.p3]
  const p4 = landmarks[points.p4]
  const p5 = landmarks[points.p5]
  const p6 = landmarks[points.p6]
  const vertical1 = distance(p2, p6)
  const vertical2 = distance(p3, p5)
  const horizontal = distance(p1, p4)
  if (horizontal < 1e-6) return 0
  return (vertical1 + vertical2) / (2 * horizontal)
}

function regionFromIndices(landmarks, indices, width, height, pad = 0.35) {
  const xs = indices.map((i) => landmarks[i].x * width)
  const ys = indices.map((i) => landmarks[i].y * height)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const w = Math.max(1, maxX - minX)
  const h = Math.max(1, maxY - minY)
  return {
    x: Math.max(0, minX - w * pad),
    y: Math.max(0, minY - h * pad),
    x2: Math.min(width, maxX + w * pad),
    y2: Math.min(height, maxY + h * pad),
    width: w * (1 + 2 * pad),
    height: h * (1 + 2 * pad),
  }
}

function sampleRegionStats(imageData, box) {
  const { data, width, height } = imageData
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(width - 1, Math.ceil(box.x2))
  const y1 = Math.min(height - 1, Math.ceil(box.y2))

  let sum = 0
  let sumSq = 0
  let count = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const idx = (y * width + x) * 4
      const b = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
      sum += b
      sumSq += b * b
      count += 1
    }
  }
  if (count === 0) return null
  const mean = sum / count
  const variance = Math.max(0, sumSq / count - mean * mean)
  return { mean, variance, count }
}

function boxesOverlapRatio(handBox, eyeBox) {
  const xOverlap = Math.max(0, Math.min(handBox.x2, eyeBox.x2) - Math.max(handBox.x, eyeBox.x))
  const yOverlap = Math.max(0, Math.min(handBox.y2, eyeBox.y2) - Math.max(handBox.y, eyeBox.y))
  const intersection = xOverlap * yOverlap
  const eyeArea = Math.max(1e-6, eyeBox.width * eyeBox.height)
  return intersection / eyeArea
}

export class EyeCoverageDetector {
  constructor(videoElement) {
    this.video = videoElement
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    this.isActive = false
    this.faceMesh = null
    this.hands = null
    this.handsAvailable = false
    this.lastResults = null
    this.lastHandResults = null
    this._facePending = null
    this._handPending = null
    this.baselineFace = null
    this._streak = { value: 'neither', count: 0 }
    this._ownsCamera = false
  }

  /**
   * Wire MediaPipe models to an already-playing video element.
   * Does not acquire a camera — the caller owns the stream.
   */
  async initialize() {
    if (!this.video) return false

    try {
      this.faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      })
      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      this.faceMesh.onResults((results) => {
        this.lastResults = results
        if (this._facePending) {
          this._facePending()
          this._facePending = null
        }
      })
      await this.faceMesh.initialize()

      // Hands is optional — palm occlusion still works via iris sampling
      try {
        const { Hands } = await import('@mediapipe/hands')
        this.hands = new Hands({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
        })
        this.hands.setOptions({
          selfieMode: false,
          maxNumHands: 2,
          modelComplexity: 0,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
        this.hands.onResults((results) => {
          this.lastHandResults = results
          if (this._handPending) {
            this._handPending()
            this._handPending = null
          }
        })
        await this.hands.initialize()
        this.handsAvailable = true
      } catch (err) {
        console.warn('MediaPipe Hands unavailable; using iris occlusion only:', err)
        this.hands = null
        this.handsAvailable = false
      }

      const ready = () => {
        this.canvas.width = this.video.videoWidth || 640
        this.canvas.height = this.video.videoHeight || 480
        this.isActive = true
      }

      if (this.video.readyState >= 2 && this.video.videoWidth) {
        ready()
        return true
      }

      await new Promise((resolve) => {
        const onReady = () => {
          ready()
          resolve()
        }
        this.video.onloadedmetadata = onReady
        // Already may have metadata after play()
        if (this.video.videoWidth) onReady()
      })

      return true
    } catch (error) {
      console.error('Failed to initialize eye coverage detector:', error)
      return false
    }
  }

  async _sendFace() {
    if (!this.faceMesh || !this.video?.videoWidth) return
    await new Promise((resolve) => {
      this._facePending = resolve
      setTimeout(() => {
        if (this._facePending === resolve) {
          this._facePending = null
          resolve()
        }
      }, RESULT_TIMEOUT_MS)
      this.faceMesh.send({ image: this.video }).catch(resolve)
    })
  }

  async _sendHands() {
    if (!this.hands || !this.handsAvailable || !this.video?.videoWidth) return
    await new Promise((resolve) => {
      this._handPending = resolve
      setTimeout(() => {
        if (this._handPending === resolve) {
          this._handPending = null
          resolve()
        }
      }, RESULT_TIMEOUT_MS)
      this.hands.send({ image: this.video }).catch(resolve)
    })
  }

  _irisIndices(landmarks) {
    const hasIris = landmarks.length > Math.max(...IRIS_LEFT)
    return {
      left: hasIris ? IRIS_LEFT : CONTOUR_LEFT,
      right: hasIris ? IRIS_RIGHT : CONTOUR_RIGHT,
      source: hasIris ? 'iris' : 'contour',
    }
  }

  _captureFrame() {
    const width = this.video.videoWidth
    const height = this.video.videoHeight
    if (!width || !height) return null
    this.canvas.width = width
    this.canvas.height = height
    this.ctx.drawImage(this.video, 0, 0)
    return this.ctx.getImageData(0, 0, width, height)
  }

  _eyeStats(landmarks, imageData) {
    const width = imageData.width
    const height = imageData.height
    const indices = this._irisIndices(landmarks)
    const leftBox = regionFromIndices(landmarks, indices.left, width, height)
    const rightBox = regionFromIndices(landmarks, indices.right, width, height)
    return {
      left: sampleRegionStats(imageData, leftBox),
      right: sampleRegionStats(imageData, rightBox),
      leftBox,
      rightBox,
      source: indices.source,
    }
  }

  async establishBaseline() {
    for (let attempt = 0; attempt < 12; attempt++) {
      await this._sendFace()

      if (!this.lastResults?.multiFaceLandmarks?.[0]) {
        await new Promise((r) => setTimeout(r, 150))
        continue
      }

      const landmarks = this.lastResults.multiFaceLandmarks[0]
      const leftEAR = eyeAspectRatio(landmarks, EAR_POINTS_LEFT)
      const rightEAR = eyeAspectRatio(landmarks, EAR_POINTS_RIGHT)

      if (leftEAR < 0.15 || rightEAR < 0.15) {
        await new Promise((r) => setTimeout(r, 150))
        continue
      }

      const imageData = this._captureFrame()
      if (!imageData) {
        await new Promise((r) => setTimeout(r, 150))
        continue
      }

      const stats = this._eyeStats(landmarks, imageData)
      if (!stats.left || !stats.right) {
        await new Promise((r) => setTimeout(r, 150))
        continue
      }

      this.baselineFace = {
        leftEAR,
        rightEAR,
        left: stats.left,
        right: stats.right,
        source: stats.source,
        timestamp: Date.now(),
      }
      this._streak = { value: 'neither', count: 0 }

      return {
        success: true,
        message: 'Face detected! Both eyes visible.',
        handsAvailable: this.handsAvailable,
      }
    }

    return {
      success: false,
      message:
        'Could not detect face with both eyes visible. Please ensure your face is clearly visible and well-lit.',
      handsAvailable: this.handsAvailable,
    }
  }

  _handOverlap(leftBox, rightBox) {
    const result = { left: false, right: false }
    if (!this.lastHandResults?.multiHandLandmarks?.length) return result

    for (const handLandmarks of this.lastHandResults.multiHandLandmarks) {
      const handXs = handLandmarks.map((lm) => lm.x * this.canvas.width)
      const handYs = handLandmarks.map((lm) => lm.y * this.canvas.height)
      const handBox = {
        x: Math.min(...handXs),
        y: Math.min(...handYs),
        x2: Math.max(...handXs),
        y2: Math.max(...handYs),
      }

      // Convert normalized eye boxes already in pixel space
      if (boxesOverlapRatio(handBox, leftBox) > HAND_OVERLAP_THRESHOLD) result.left = true
      if (boxesOverlapRatio(handBox, rightBox) > HAND_OVERLAP_THRESHOLD) result.right = true
    }
    return result
  }

  _isOccluded(current, baseline) {
    if (!current || !baseline) return false
    const brightnessDrop = baseline.mean - current.mean
    const varianceCollapsed =
      baseline.variance > 20 && current.variance < baseline.variance * OCCLUSION_VARIANCE_DROP_RATIO
    return brightnessDrop >= OCCLUSION_BRIGHTNESS_DROP || varianceCollapsed
  }

  _stabilize(raw) {
    if (raw === this._streak.value) {
      this._streak.count += 1
    } else {
      this._streak = { value: raw, count: 1 }
    }
    // Require a short streak for cover states; "neither" can clear faster
    if (raw === 'neither' || raw === 'unknown') return raw
    if (this._streak.count >= STREAK_REQUIRED) return raw
    return 'neither'
  }

  /**
   * Detect which anatomical eye is covered.
   * Returns: 'left' | 'right' | 'both' | 'neither' | 'unknown'
   */
  async detectCoveredEye() {
    if (!this.isActive || !this.video?.videoWidth || !this.faceMesh) return 'unknown'
    if (!this.baselineFace) return 'unknown'

    try {
      await Promise.all([this._sendFace(), this._sendHands()])

      if (!this.lastResults?.multiFaceLandmarks?.[0]) {
        return this._stabilize('neither')
      }

      const landmarks = this.lastResults.multiFaceLandmarks[0]
      const imageData = this._captureFrame()
      if (!imageData) return 'unknown'

      const stats = this._eyeStats(landmarks, imageData)
      let method = 'none'
      let leftCovered = false
      let rightCovered = false

      // 1) Hand overlap (pixel-space eye boxes)
      if (this.handsAvailable && stats.leftBox && stats.rightBox) {
        const hand = this._handOverlap(stats.leftBox, stats.rightBox)
        if (hand.left || hand.right) {
          leftCovered = hand.left
          rightCovered = hand.right
          method = 'hand'
        }
      }

      // 2) Iris occlusion vs baseline (primary for palm cover without hand landmarks)
      if (method === 'none') {
        leftCovered = this._isOccluded(stats.left, this.baselineFace.left)
        rightCovered = this._isOccluded(stats.right, this.baselineFace.right)
        if (leftCovered || rightCovered) method = 'iris-occlusion'
      }

      // 3) EAR fallback — closed / squinted eye
      if (method === 'none') {
        const leftEAR = eyeAspectRatio(landmarks, EAR_POINTS_LEFT)
        const rightEAR = eyeAspectRatio(landmarks, EAR_POINTS_RIGHT)
        leftCovered = leftEAR < EAR_COVERED_THRESHOLD
        rightCovered = rightEAR < EAR_COVERED_THRESHOLD
        if (leftCovered || rightCovered) method = 'ear'
      }

      let raw = 'neither'
      if (leftCovered && rightCovered) raw = 'both'
      else if (leftCovered) raw = 'left'
      else if (rightCovered) raw = 'right'

      const detected = this._stabilize(raw)
      this._lastMethod = method
      this._lastRaw = raw
      return detected
    } catch (error) {
      console.error('Eye coverage detection error:', error)
      return 'unknown'
    }
  }

  async verifyCoverage(expectedCovered) {
    const detected = await this.detectCoveredEye()
    return {
      detected,
      correct: detected === expectedCovered,
      message: this.getCoverageMessage(detected, expectedCovered),
      method: this._lastMethod || 'none',
      handsAvailable: this.handsAvailable,
    }
  }

  getCoverageMessage(detected, expected) {
    if (detected === 'unknown') {
      return 'Unable to detect eye coverage. Please ensure webcam access is granted.'
    }
    if (detected === expected) {
      return `Correct: your ${expected === 'left' ? 'left' : 'right'} eye looks covered.`
    }
    if (detected === 'neither') {
      return `Please cover your ${expected === 'left' ? 'LEFT' : 'RIGHT'} eye with your palm.`
    }
    if (detected === 'both') {
      return `Both eyes appear covered. Cover only your ${expected === 'left' ? 'LEFT' : 'RIGHT'} eye.`
    }
    return `Wrong eye covered. Please cover your ${expected === 'left' ? 'LEFT' : 'RIGHT'} eye instead.`
  }

  stop() {
    if (this.faceMesh) {
      try {
        this.faceMesh.close()
      } catch (e) {
        /* ignore */
      }
      this.faceMesh = null
    }
    if (this.hands) {
      try {
        this.hands.close()
      } catch (e) {
        /* ignore */
      }
      this.hands = null
    }
    // Never stop the shared camera here — the verification component owns it
    this.isActive = false
    this.baselineFace = null
    this._streak = { value: 'neither', count: 0 }
  }
}

export default EyeCoverageDetector
