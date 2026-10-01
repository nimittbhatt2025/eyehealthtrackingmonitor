import { createFaceMesh } from './mediapipeSolutions'
import { Camera } from '@mediapipe/camera_utils'

/**
 * Eye gaze tracker using MediaPipe Face Mesh iris landmarks.
 */

const IRIS_SCALE = 18
// Per-frame EMA weight tuned at 30 fps; rescaled by elapsed time so the lag is rate-independent.
const SMOOTHING = 0.35
const SMOOTHING_REF_MS = 1000 / 30
const FACE_LOSS_GRACE_MS = 300
// Gaze only gates fixation in the peripheral test, so ~10 fps is ample and frees the main thread.
const INFERENCE_INTERVAL_MS = 100

class EyeTracker {
  constructor() {
    this.faceMesh = null
    this.camera = null
    this.onGazeUpdate = null
    this.lastGazePosition = { x: 0.5, y: 0.5 }
    this.isInitialized = false
    this.lastDetectedAt = 0
    this.lastSentAt = 0
    this.lastResultAt = 0

    this.LEFT_EYE_INDICES = [33, 133, 160, 159, 158, 157, 173, 144]
    this.RIGHT_EYE_INDICES = [362, 263, 387, 386, 385, 384, 398, 373]
    this.LEFT_IRIS_INDICES = [468, 469, 470, 471, 472]
    this.RIGHT_IRIS_INDICES = [473, 474, 475, 476, 477]
  }

  async initialize(videoElement, onGazeUpdate) {
    this.onGazeUpdate = onGazeUpdate

    this.faceMesh = createFaceMesh({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

    this.faceMesh.onResults((results) => this.onResults(results))

    this.camera = new Camera(videoElement, {
      onFrame: async () => {
        const now = performance.now()
        if (now - this.lastSentAt < INFERENCE_INTERVAL_MS) return
        this.lastSentAt = now
        await this.faceMesh.send({ image: videoElement })
      },
      width: 640,
      height: 480,
    })

    await this.camera.start()
    this.isInitialized = true
  }

  onResults(results) {
    const now = Date.now()

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      const withinGrace = now - this.lastDetectedAt < FACE_LOSS_GRACE_MS
      if (this.onGazeUpdate) {
        this.onGazeUpdate({
          x: this.lastGazePosition.x,
          y: this.lastGazePosition.y,
          detected: withinGrace,
        })
      }
      return
    }

    const landmarks = results.multiFaceLandmarks[0]
    const gazePosition = this.calculateGazeFromIris(landmarks)

    const t = performance.now()
    const elapsed = this.lastResultAt ? Math.min(t - this.lastResultAt, 1000) : SMOOTHING_REF_MS
    this.lastResultAt = t
    const keep = Math.pow(SMOOTHING, elapsed / SMOOTHING_REF_MS)

    this.lastGazePosition.x = this.lastGazePosition.x * keep + gazePosition.x * (1 - keep)
    this.lastGazePosition.y = this.lastGazePosition.y * keep + gazePosition.y * (1 - keep)
    this.lastDetectedAt = now

    if (this.onGazeUpdate) {
      this.onGazeUpdate({
        x: this.lastGazePosition.x,
        y: this.lastGazePosition.y,
        detected: true,
      })
    }
  }

  calculateGazeFromIris(landmarks) {
    const leftEyeCenter = this.getAveragePosition(landmarks, this.LEFT_EYE_INDICES)
    const leftIrisCenter = this.getAveragePosition(landmarks, this.LEFT_IRIS_INDICES)
    const rightEyeCenter = this.getAveragePosition(landmarks, this.RIGHT_EYE_INDICES)
    const rightIrisCenter = this.getAveragePosition(landmarks, this.RIGHT_IRIS_INDICES)

    const leftOffset = {
      x: (leftIrisCenter.x - leftEyeCenter.x) * IRIS_SCALE,
      y: (leftIrisCenter.y - leftEyeCenter.y) * IRIS_SCALE,
    }
    const rightOffset = {
      x: (rightIrisCenter.x - rightEyeCenter.x) * IRIS_SCALE,
      y: (rightIrisCenter.y - rightEyeCenter.y) * IRIS_SCALE,
    }

    const avgOffsetX = (leftOffset.x + rightOffset.x) / 2
    const avgOffsetY = (leftOffset.y + rightOffset.y) / 2

    let gazeX = 0.5 - avgOffsetX
    let gazeY = 0.5 + avgOffsetY

    gazeX = Math.max(0, Math.min(1, gazeX))
    gazeY = Math.max(0, Math.min(1, gazeY))

    return { x: gazeX, y: gazeY }
  }

  getAveragePosition(landmarks, indices) {
    let sumX = 0
    let sumY = 0
    indices.forEach((idx) => {
      sumX += landmarks[idx].x
      sumY += landmarks[idx].y
    })
    return { x: sumX / indices.length, y: sumY / indices.length }
  }

  stop() {
    if (this.camera) this.camera.stop()
    if (this.faceMesh) this.faceMesh.close().catch(() => {})
    this.isInitialized = false
  }

  isReady() {
    return this.isInitialized
  }
}

export default EyeTracker
