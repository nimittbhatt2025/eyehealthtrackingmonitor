import { FaceMesh } from '@mediapipe/face_mesh'
import { Camera } from '@mediapipe/camera_utils'

/**
 * Eye gaze tracker using MediaPipe Face Mesh iris landmarks.
 */

const IRIS_SCALE = 18
const SMOOTHING = 0.35
const FACE_LOSS_GRACE_MS = 300

class EyeTracker {
  constructor() {
    this.faceMesh = null
    this.camera = null
    this.onGazeUpdate = null
    this.lastGazePosition = { x: 0.5, y: 0.5 }
    this.isInitialized = false
    this.lastDetectedAt = 0

    this.LEFT_EYE_INDICES = [33, 133, 160, 159, 158, 157, 173, 144]
    this.RIGHT_EYE_INDICES = [362, 263, 387, 386, 385, 384, 398, 373]
    this.LEFT_IRIS_INDICES = [468, 469, 470, 471, 472]
    this.RIGHT_IRIS_INDICES = [473, 474, 475, 476, 477]
  }

  async initialize(videoElement, onGazeUpdate) {
    this.onGazeUpdate = onGazeUpdate

    this.faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    })

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

    this.faceMesh.onResults((results) => this.onResults(results))

    this.camera = new Camera(videoElement, {
      onFrame: async () => {
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

    this.lastGazePosition.x =
      this.lastGazePosition.x * SMOOTHING + gazePosition.x * (1 - SMOOTHING)
    this.lastGazePosition.y =
      this.lastGazePosition.y * SMOOTHING + gazePosition.y * (1 - SMOOTHING)
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
    if (this.faceMesh) this.faceMesh.close()
    this.isInitialized = false
  }

  isReady() {
    return this.isInitialized
  }
}

export default EyeTracker
