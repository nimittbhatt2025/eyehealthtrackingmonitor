import { FaceMesh } from '@mediapipe/face_mesh'
import { Camera } from '@mediapipe/camera_utils'

/**
 * MediaPipe-based Eye Tracking System
 * Provides real-time blink detection, eye movement analysis, and fatigue scoring
 * Uses Eye Aspect Ratio (EAR) for accurate blink detection
 */

// Eye landmark indices from MediaPipe FaceMesh
const LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144] // Left eye landmarks
const RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380] // Right eye landmarks
const LEFT_IRIS_INDICES = [468, 469, 470, 471, 472] // Left iris center
const RIGHT_IRIS_INDICES = [473, 474, 475, 476, 477] // Right iris center

// Thresholds
const DEFAULT_EAR_THRESHOLD = 0.21 // Default eye closed threshold (will be replaced with calibrated value)
const BLINK_MIN_DURATION = 80 // Minimum blink duration in ms (lowered for slim eyes)
const BLINK_MAX_DURATION = 500 // Maximum blink duration in ms (increased for variety)
const CONSECUTIVE_FRAMES = 1 // Frames required to confirm blink (more sensitive)

// Fatigue thresholds
const NORMAL_BLINK_RATE_MIN = 12
const NORMAL_BLINK_RATE_MAX = 20
const FATIGUE_BLINK_RATE_LOW = 10
const FATIGUE_BLINK_RATE_HIGH = 25

/**
 * Calculate Eye Aspect Ratio (EAR)
 * EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
 */
function calculateEAR(eyeLandmarks) {
  if (!eyeLandmarks || eyeLandmarks.length < 6) return 0

  const [p1, p2, p3, p4, p5, p6] = eyeLandmarks

  // Vertical distances
  const vertical1 = Math.sqrt(
    Math.pow(p2.x - p6.x, 2) + Math.pow(p2.y - p6.y, 2) + Math.pow(p2.z - p6.z, 2)
  )
  const vertical2 = Math.sqrt(
    Math.pow(p3.x - p5.x, 2) + Math.pow(p3.y - p5.y, 2) + Math.pow(p3.z - p5.z, 2)
  )

  // Horizontal distance
  const horizontal = Math.sqrt(
    Math.pow(p1.x - p4.x, 2) + Math.pow(p1.y - p4.y, 2) + Math.pow(p1.z - p4.z, 2)
  )

  const ear = (vertical1 + vertical2) / (2.0 * horizontal)
  return ear
}

/**
 * Calculate iris center position for gaze tracking
 */
function calculateIrisCenter(irisLandmarks) {
  if (!irisLandmarks || irisLandmarks.length === 0) return null

  const center = irisLandmarks.reduce(
    (acc, landmark) => ({
      x: acc.x + landmark.x / irisLandmarks.length,
      y: acc.y + landmark.y / irisLandmarks.length,
      z: acc.z + landmark.z / irisLandmarks.length,
    }),
    { x: 0, y: 0, z: 0 }
  )

  return center
}

/**
 * Calculate eye movement metrics
 */
function calculateEyeMovement(currentGaze, previousGaze) {
  if (!currentGaze || !previousGaze) return { distance: 0, velocity: 0 }

  const distance = Math.sqrt(
    Math.pow(currentGaze.x - previousGaze.x, 2) +
    Math.pow(currentGaze.y - previousGaze.y, 2)
  )

  return { distance, velocity: distance }
}

/**
 * Main Eye Tracker Class
 */
export class MediaEyeTracker {
  constructor(videoElement, canvasElement) {
    this.videoElement = videoElement
    this.canvasElement = canvasElement
    this.faceMesh = null
    this.camera = null
    this.isRunning = false

    // Load calibrated threshold from backend or use default
    this.earThreshold = this.loadCalibratedThreshold()
    console.log('[target] Using EAR threshold:', this.earThreshold)

    // Blink detection state with improved tracking
    this.blinkState = {
      isBlinking: false,
      blinkStartTime: null,
      consecutiveClosedFrames: 0,
      consecutiveOpenFrames: 0, // Track open frames too
      totalBlinks: 0,
      blinkDurations: [],
      blinkTimestamps: [],
      previousEAR: null, // Track EAR changes
      earHistory: [], // Store recent EAR values for adaptive threshold
    }

    // Eye movement tracking
    this.gazeHistory = []
    this.previousGaze = null
    this.fixationPoints = []
    this.saccadeCount = 0

    // Session metrics
    this.sessionStartTime = null
    this.sessionData = {
      blinkRate: 0,
      avgBlinkDuration: 0,
      eyeMovementVariance: 0,
      fixationDuration: 0,
      fatigueScore: 0,
    }

    // Callbacks
    this.onBlink = null
    this.onMetricsUpdate = null
    this.onFaceDetected = null
  }

  /**
   * Load calibrated threshold from localStorage (set by blink calibration)
   */
  loadCalibratedThreshold() {
    try {
      const calibrated = localStorage.getItem('blink_calibrated') === 'true'
      const threshold = parseFloat(localStorage.getItem('blink_threshold'))
      
      if (calibrated && !isNaN(threshold) && threshold > 0) {
        console.log('[OK] Using calibrated threshold from backend:', threshold)
        return threshold
      }
    } catch (error) {
      console.warn('[WARNING] Failed to load calibrated threshold:', error)
    }
    
    console.log('[WARNING] No calibration found, using default threshold:', DEFAULT_EAR_THRESHOLD)
    return DEFAULT_EAR_THRESHOLD
  }

  /**
   * Initialize MediaPipe FaceMesh
   */
  async initialize() {
    console.log(' Initializing MediaPipe FaceMesh...')

    this.faceMesh = new FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      },
    })

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true, // Enable iris tracking
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

    this.faceMesh.onResults((results) => this.onResults(results))

    console.log(' MediaPipe FaceMesh initialized')
    return true
  }

  /**
   * Start tracking
   */
  async start() {
    if (this.isRunning) return

    try {
      await this.initialize()

      this.camera = new Camera(this.videoElement, {
        onFrame: async () => {
          if (this.isRunning && this.faceMesh) {
            await this.faceMesh.send({ image: this.videoElement })
          }
        },
        width: 640,
        height: 480,
      })

      this.isRunning = true
      this.sessionStartTime = Date.now()
      await this.camera.start()

      console.log(' Eye tracking started')
      return true
    } catch (error) {
      console.error(' Failed to start eye tracking:', error)
      throw error
    }
  }

  /**
   * Stop tracking
   */
  stop() {
    this.isRunning = false

    if (this.camera) {
      this.camera.stop()
    }

    console.log('🛑 Eye tracking stopped')
    return this.getSessionSummary()
  }

  /**
   * Process FaceMesh results
   */
  onResults(results) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      if (this.onFaceDetected) {
        this.onFaceDetected(false)
      }
      return
    }

    if (this.onFaceDetected) {
      this.onFaceDetected(true)
    }

    const landmarks = results.multiFaceLandmarks[0]

    // Extract eye landmarks
    const leftEyeLandmarks = LEFT_EYE_INDICES.map((i) => landmarks[i])
    const rightEyeLandmarks = RIGHT_EYE_INDICES.map((i) => landmarks[i])

    // Calculate EAR for both eyes
    const leftEAR = calculateEAR(leftEyeLandmarks)
    const rightEAR = calculateEAR(rightEyeLandmarks)
    const avgEAR = (leftEAR + rightEAR) / 2

    // Blink detection
    this.detectBlink(avgEAR)

    // Eye movement tracking
    const leftIris = calculateIrisCenter(LEFT_IRIS_INDICES.map((i) => landmarks[i]))
    const rightIris = calculateIrisCenter(RIGHT_IRIS_INDICES.map((i) => landmarks[i]))

    if (leftIris && rightIris) {
      const currentGaze = {
        x: (leftIris.x + rightIris.x) / 2,
        y: (leftIris.y + rightIris.y) / 2,
        timestamp: Date.now(),
      }

      this.trackEyeMovement(currentGaze)
      this.previousGaze = currentGaze
    }

    // Update metrics
    this.updateMetrics()

    // Draw on canvas if available
    if (this.canvasElement) {
      this.drawLandmarks(landmarks)
    }
  }

  /**
   * Detect blinks using EAR with calibrated threshold and improved logic
   */
  detectBlink(ear) {
    const now = Date.now()

    // Store EAR history for adaptive threshold (optional future enhancement)
    this.blinkState.earHistory.push(ear)
    if (this.blinkState.earHistory.length > 100) {
      this.blinkState.earHistory.shift()
    }

    // Determine if eyes are closed using calibrated threshold
    const eyesClosed = ear < this.earThreshold

    if (eyesClosed) {
      // Eye is closed
      this.blinkState.consecutiveClosedFrames++
      this.blinkState.consecutiveOpenFrames = 0

      if (this.blinkState.consecutiveClosedFrames >= CONSECUTIVE_FRAMES && !this.blinkState.isBlinking) {
        // Blink start detected
        this.blinkState.isBlinking = true
        this.blinkState.blinkStartTime = now
        console.log('👁️ Blink START - EAR:', ear.toFixed(4), 'Threshold:', this.earThreshold.toFixed(4))
      }
    } else {
      // Eye is open
      this.blinkState.consecutiveOpenFrames++

      if (this.blinkState.isBlinking && this.blinkState.blinkStartTime) {
        // Blink end detected - require at least 1 open frame to confirm
        if (this.blinkState.consecutiveOpenFrames >= 1) {
          const blinkDuration = now - this.blinkState.blinkStartTime

          // Validate blink duration (more lenient for slim eyes)
          if (blinkDuration >= BLINK_MIN_DURATION && blinkDuration <= BLINK_MAX_DURATION) {
            this.blinkState.totalBlinks++
            this.blinkState.blinkDurations.push(blinkDuration)
            this.blinkState.blinkTimestamps.push(now)

            // Keep only last 100 blinks
            if (this.blinkState.blinkDurations.length > 100) {
              this.blinkState.blinkDurations.shift()
              this.blinkState.blinkTimestamps.shift()
            }

            console.log(`[OK] BLINK #${this.blinkState.totalBlinks} - Duration: ${blinkDuration}ms, EAR: ${ear.toFixed(4)}`)

            if (this.onBlink) {
              this.onBlink({
                count: this.blinkState.totalBlinks,
                duration: blinkDuration,
                timestamp: now,
                ear: ear,
              })
            }
          } else {
            console.log('[X] Invalid blink duration:', blinkDuration, 'ms (must be', BLINK_MIN_DURATION, '-', BLINK_MAX_DURATION, 'ms)')
          }

          // Reset blink state
          this.blinkState.isBlinking = false
          this.blinkState.blinkStartTime = null
        }
      }

      this.blinkState.consecutiveClosedFrames = 0
    }

    this.blinkState.previousEAR = ear
  }

  /**
   * Track eye movement and detect saccades/fixations
   */
  trackEyeMovement(currentGaze) {
    if (!this.previousGaze) return

    const movement = calculateEyeMovement(currentGaze, this.previousGaze)

    // Add to gaze history
    this.gazeHistory.push({
      ...currentGaze,
      movement: movement.distance,
    })

    // Keep only last 300 frames (~10 seconds at 30fps)
    if (this.gazeHistory.length > 300) {
      this.gazeHistory.shift()
    }

    // Detect saccades (rapid eye movements > threshold)
    const SACCADE_THRESHOLD = 0.05 // Adjust based on testing
    if (movement.distance > SACCADE_THRESHOLD) {
      this.saccadeCount++
    }

    // Detect fixations (low movement for extended period)
    const recentMovements = this.gazeHistory.slice(-30).map((g) => g.movement)
    const avgRecentMovement = recentMovements.reduce((a, b) => a + b, 0) / recentMovements.length

    if (avgRecentMovement < 0.01) {
      // Stable fixation
      this.fixationPoints.push(currentGaze)
    }
  }

  /**
   * Update session metrics
   */
  updateMetrics() {
    const sessionDurationMin = this.sessionStartTime
      ? (Date.now() - this.sessionStartTime) / 1000 / 60
      : 0

    // Calculate blink rate (blinks per minute)
    const blinkRate = sessionDurationMin > 0 ? this.blinkState.totalBlinks / sessionDurationMin : 0

    // Calculate average blink duration
    const avgBlinkDuration =
      this.blinkState.blinkDurations.length > 0
        ? this.blinkState.blinkDurations.reduce((a, b) => a + b, 0) / this.blinkState.blinkDurations.length
        : 0

    // Calculate eye movement variance
    const movements = this.gazeHistory.map((g) => g.movement)
    const avgMovement = movements.length > 0 ? movements.reduce((a, b) => a + b, 0) / movements.length : 0
    const variance =
      movements.length > 0
        ? movements.reduce((sum, m) => sum + Math.pow(m - avgMovement, 2), 0) / movements.length
        : 0

    // Calculate fatigue score (0-100)
    const fatigueScore = this.calculateFatigueScore(blinkRate, avgBlinkDuration, variance)

    this.sessionData = {
      blinkRate: Math.round(blinkRate * 10) / 10,
      avgBlinkDuration: Math.round(avgBlinkDuration),
      eyeMovementVariance: Math.round(variance * 10000) / 10000,
      fixationDuration: this.fixationPoints.length,
      fatigueScore: Math.round(fatigueScore),
      totalBlinks: this.blinkState.totalBlinks,
      saccadeCount: this.saccadeCount,
      sessionDurationMin: Math.round(sessionDurationMin * 10) / 10,
    }

    if (this.onMetricsUpdate) {
      this.onMetricsUpdate(this.sessionData)
    }
  }

  /**
   * Calculate fatigue score based on multiple metrics
   */
  calculateFatigueScore(blinkRate, avgBlinkDuration, movementVariance) {
    let score = 0

    // Blink rate scoring (40% weight)
    if (blinkRate < FATIGUE_BLINK_RATE_LOW) {
      score += 40 * (1 - blinkRate / FATIGUE_BLINK_RATE_LOW) // Strain
    } else if (blinkRate > FATIGUE_BLINK_RATE_HIGH) {
      score += 40 * ((blinkRate - FATIGUE_BLINK_RATE_HIGH) / 10) // Fatigue
    }

    // Blink duration scoring (30% weight)
    if (avgBlinkDuration > 300) {
      score += 30 * ((avgBlinkDuration - 300) / 200) // Prolonged blinks = fatigue
    }

    // Eye movement variance scoring (30% weight)
    // Lower variance = reduced micro-movements = fatigue
    const normalVariance = 0.001
    if (movementVariance < normalVariance) {
      score += 30 * (1 - movementVariance / normalVariance)
    }

    // Cap at 100
    return Math.min(100, Math.max(0, score))
  }

  /**
   * Reload calibrated threshold (call this after user completes calibration)
   */
  reloadThreshold() {
    const newThreshold = this.loadCalibratedThreshold()
    if (newThreshold !== this.earThreshold) {
      console.log('🔄 Threshold updated:', this.earThreshold, '→', newThreshold)
      this.earThreshold = newThreshold
    }
  }

  /**
   * Get session summary
   */
  getSessionSummary() {
    return {
      ...this.sessionData,
      status: this.getFatigueStatus(this.sessionData.fatigueScore),
      recommendation: this.getFatigueRecommendation(this.sessionData.fatigueScore),
    }
  }

  /**
   * Get fatigue status
   */
  getFatigueStatus(score) {
    if (score < 30) return 'Normal'
    if (score < 60) return 'Mild Strain'
    return 'High Fatigue'
  }

  /**
   * Get recommendation based on fatigue score
   */
  getFatigueRecommendation(score) {
    if (score < 30) {
      return 'Your eyes are healthy! Keep up the good habits.'
    } else if (score < 60) {
      return 'Consider taking a 5-minute break every hour. Try the 20-20-20 rule.'
    } else {
      return 'High eye fatigue detected. Take a 10-minute break immediately. Reduce screen time.'
    }
  }

  /**
   * Draw landmarks on canvas (optional visualization)
   */
  drawLandmarks(landmarks) {
    if (!this.canvasElement) return

    const ctx = this.canvasElement.getContext('2d')
    const width = this.canvasElement.width
    const height = this.canvasElement.height

    ctx.clearRect(0, 0, width, height)

    // Draw left eye
    ctx.fillStyle = '#00ff00'
    LEFT_EYE_INDICES.forEach((i) => {
      const landmark = landmarks[i]
      ctx.beginPath()
      ctx.arc(landmark.x * width, landmark.y * height, 2, 0, 2 * Math.PI)
      ctx.fill()
    })

    // Draw right eye
    ctx.fillStyle = '#0000ff'
    RIGHT_EYE_INDICES.forEach((i) => {
      const landmark = landmarks[i]
      ctx.beginPath()
      ctx.arc(landmark.x * width, landmark.y * height, 2, 0, 2 * Math.PI)
      ctx.fill()
    })

    // Draw iris centers
    const leftIris = calculateIrisCenter(LEFT_IRIS_INDICES.map((i) => landmarks[i]))
    const rightIris = calculateIrisCenter(RIGHT_IRIS_INDICES.map((i) => landmarks[i]))

    ctx.fillStyle = '#ff0000'
    if (leftIris) {
      ctx.beginPath()
      ctx.arc(leftIris.x * width, leftIris.y * height, 3, 0, 2 * Math.PI)
      ctx.fill()
    }
    if (rightIris) {
      ctx.beginPath()
      ctx.arc(rightIris.x * width, rightIris.y * height, 3, 0, 2 * Math.PI)
      ctx.fill()
    }
  }
}

export default MediaEyeTracker
