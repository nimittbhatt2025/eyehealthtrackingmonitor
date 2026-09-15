import { useState, useEffect, useCallback, useRef } from 'react'
import cameraManager from '../utils/cameraManager.js'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import SamdDisclaimer from '../components/SamdDisclaimer'
import { scoreRedReflex } from '../utils/visionTestScoring'
import {
  PupilRegionTracker,
  fallbackPupilRegions,
  sampleRegionPixels,
} from '../utils/pupilRegionDetector'

/**
 * Red Glow (Reflex) Analyzer - Digital Bruckner Test
 * 
 * Analyzes the red reflex from the retina to detect:
 * - Cataracts (opacity in the lens)
 * - Leukocoria (white pupil - serious condition)
 * - Refractive errors (myopia/hyperopia asymmetry)
 * 
 * Transforms smartphone into a "Smart Ophthalmoscope"
 */

const RedReflexTest = () => {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const analysisWorkerRef = useRef(null)
  const pupilTrackerRef = useRef(null)
  const distanceStatusRef = useRef('checking')

  const [testState, setTestState] = useState('instructions') // instructions, setup, calibrating, scanning, analyzing, results
  const [cameraReady, setCameraReady] = useState(false)
  const [distanceStatus, setDistanceStatus] = useState('checking') // too-close, perfect, too-far, checking
  const [eyesLocated, setEyesLocated] = useState(false)
  const [trackingQuality, setTrackingQuality] = useState(null)
  const [scanProgress, setScanProgress] = useState(0)
  const [capturedFrames, setCapturedFrames] = useState([])
  const [analysisResults, setAnalysisResults] = useState(null)
  const [error, setError] = useState(null)

  // Test results
  const [reflexIntensityScore, setReflexIntensityScore] = useState(0)
  const [symmetryScore, setSymmetryScore] = useState(0)
  const [leftEyeData, setLeftEyeData] = useState(null)
  const [rightEyeData, setRightEyeData] = useState(null)
  const [warnings, setWarnings] = useState([])

  // Initialize camera with optimal settings for red reflex
  const initializeCamera = useCallback(async () => {
    try {
      const constraints = {
        video: {
          facingMode: 'user',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        }
      }

      const stream = await cameraManager.acquire(constraints)
      streamRef.current = stream

      if (!pupilTrackerRef.current) {
        pupilTrackerRef.current = new PupilRegionTracker()
        // Warm the model up front; failures fall back to fixed-position sampling.
        pupilTrackerRef.current.init()
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setCameraReady(true)
        }
      }
    } catch (err) {
      console.error('Camera initialization failed:', err)
      setError('Camera access denied. Please allow camera access to continue.')
    }
  }, [])

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      try { cameraManager.release() } catch (e) { try { streamRef.current.getTracks().forEach(track => track.stop()) } catch (err) {} }
      streamRef.current = null
    }
    if (pupilTrackerRef.current) {
      pupilTrackerRef.current.stop()
      pupilTrackerRef.current = null
    }
    setCameraReady(false)
  }, [])

  // Inter-pupil distance as a fraction of frame width. With a typical webcam FOV this
  // lands near 0.09 at 60cm and 0.06 at 90cm; the band is kept wide for usable framing.
  const IPD_RATIO_TOO_CLOSE = 0.13
  const IPD_RATIO_TOO_FAR = 0.045

  const applyDistanceStatus = (status) => {
    if (distanceStatusRef.current === status) return
    distanceStatusRef.current = status
    setDistanceStatus(status)
  }

  // Measure viewing distance from iris landmarks, falling back to skin-tone face width
  const measureDistance = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    if (!video.videoWidth) return

    const regions = await pupilTrackerRef.current?.track(video)

    if (regions) {
      setEyesLocated(true)
      const ipdRatio = regions.eyeSpanPx / video.videoWidth
      if (ipdRatio > IPD_RATIO_TOO_CLOSE) {
        applyDistanceStatus('too-close')
      } else if (ipdRatio < IPD_RATIO_TOO_FAR) {
        applyDistanceStatus('too-far')
      } else {
        applyDistanceStatus('perfect')
      }
      return
    }

    setEyesLocated(false)

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const faceWidth = estimateFaceWidth(imageData)

    if (faceWidth > 350) {
      applyDistanceStatus('too-close')
    } else if (faceWidth < 100) {
      applyDistanceStatus('too-far')
    } else {
      applyDistanceStatus('perfect')
    }
  }, [])

  // Simplified face width estimation from center-band skin tones (subsampled)
  const estimateFaceWidth = (imageData) => {
    const data = imageData.data
    const width = imageData.width
    const height = imageData.height
    let leftmost = width
    let rightmost = 0
    const centerY = Math.floor(height * 0.4)
    const searchHeight = Math.floor(height * 0.3)
    const step = Math.max(2, Math.floor(width / 320))
    for (let y = centerY; y < centerY + searchHeight; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        if (r > 95 && g > 40 && b > 20 && r > g && r > b) {
          if (x < leftmost) leftmost = x
          if (x > rightmost) rightmost = x
        }
      }
    }
    return rightmost > leftmost ? rightmost - leftmost : 0
  }

  // Landmark tracking is async, so self-schedule instead of a fixed interval to avoid overlap
  useEffect(() => {
    if (!cameraReady || (testState !== 'setup' && testState !== 'calibrating')) return undefined

    let cancelled = false
    let timeoutId = null

    const loop = async () => {
      if (cancelled) return
      try {
        await measureDistance()
      } catch (err) {
        console.warn('Distance check failed:', err)
      }
      if (!cancelled) timeoutId = setTimeout(loop, 250)
    }

    loop()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [cameraReady, testState, measureDistance])

  // Start distance monitoring when camera is live
  const startCalibration = useCallback(() => {
    setTestState('calibrating')
    measureDistance()
  }, [measureDistance])

  // Analyze eye region for red reflex characteristics
  const analyzeEyeRegion = (pixels) => {
    if (pixels.length === 0) return null

    let totalRed = 0
    let totalGreen = 0
    let totalBlue = 0
    let redReflexPixels = 0
    let whitePixels = 0
    let darkPixels = 0

    pixels.forEach(pixel => {
      totalRed += pixel.r
      totalGreen += pixel.g
      totalBlue += pixel.b

      // Red reflex: R > 200, G < 50, B < 50
      if (pixel.r > 200 && pixel.g < 50 && pixel.b < 50) {
        redReflexPixels++
      }

      // White/yellow (leukocoria): all channels high
      if (pixel.r > 200 && pixel.g > 200 && pixel.b > 200) {
        whitePixels++
      }

      // Dark spots (opacity): all channels low
      if (pixel.r < 50 && pixel.g < 50 && pixel.b < 50) {
        darkPixels++
      }
    })

    const avgRed = totalRed / pixels.length
    const avgGreen = totalGreen / pixels.length
    const avgBlue = totalBlue / pixels.length

    const whitePercentage = (whitePixels / pixels.length) * 100
    const darkPercentage = (darkPixels / pixels.length) * 100

    return {
      redIntensity: avgRed,
      greenIntensity: avgGreen,
      blueIntensity: avgBlue,
      isWhite: whitePercentage > 30, // More than 30% white pixels = leukocoria
      hasOpacity: darkPercentage > 20 // More than 20% dark pixels = opacity
    }
  }

  // Analyze a single captured frame using its paired pupil regions.
  // Eyes are keyed anatomically, so "leftEye" is the user's own left eye.
  const analyzeRedReflex = (imageData, regions) => {
    return {
      leftEye: analyzeEyeRegion(sampleRegionPixels(imageData, regions.anatomicalLeft)),
      rightEye: analyzeEyeRegion(sampleRegionPixels(imageData, regions.anatomicalRight)),
    }
  }

  // Analyze captured frame samples for red reflex (lightweight — no full ImageData retained)
  const analyzeFrames = useCallback((frames) => {
    if (frames.length === 0) {
      setError('No frames captured. Please try again.')
      setTestState('setup')
      return
    }

    // Prefer frames where the pupils were actually located. Fixed-position sampling
    // is only used when landmarks were unavailable for most of the scan.
    const landmarkFrames = frames.filter(
      (frame) => frame.regions?.source !== 'fallback-fixed-position'
    )
    const landmarkRatio = landmarkFrames.length / frames.length
    const usedLandmarks = landmarkFrames.length >= Math.ceil(frames.length * 0.2)
    const scoredFrames = usedLandmarks ? landmarkFrames : frames

    const confidence = !usedLandmarks ? 'low' : landmarkRatio >= 0.7 ? 'high' : 'moderate'

    const leftEyeIntensities = []
    const rightEyeIntensities = []
    const flagCounts = {}
    const countFlag = (key) => {
      flagCounts[key] = (flagCounts[key] || 0) + 1
    }

    scoredFrames.forEach(({ leftEye, rightEye }) => {
      if (leftEye) {
        leftEyeIntensities.push(leftEye.redIntensity)
        if (leftEye.isWhite) countFlag('left:leukocoria')
        if (leftEye.hasOpacity) countFlag('left:opacity')
      }
      if (rightEye) {
        rightEyeIntensities.push(rightEye.redIntensity)
        if (rightEye.isWhite) countFlag('right:leukocoria')
        if (rightEye.hasOpacity) countFlag('right:opacity')
      }
    })

    if (leftEyeIntensities.length === 0 || rightEyeIntensities.length === 0) {
      setError('Could not read the glow in both eyes. Re-frame your face and try again.')
      setTestState('setup')
      return
    }

    const warnings = []
    const MIN_FLAG_RATIO = 0.3
    Object.entries(flagCounts).forEach(([key, count]) => {
      if (count / scoredFrames.length < MIN_FLAG_RATIO) return
      const [eye, type] = key.split(':')
      warnings.push({
        eye,
        type,
        severity: type === 'leukocoria' ? 'critical' : 'warning',
      })
    })

    const avgLeftIntensity = leftEyeIntensities.reduce((a, b) => a + b, 0) / leftEyeIntensities.length
    const avgRightIntensity = rightEyeIntensities.reduce((a, b) => a + b, 0) / rightEyeIntensities.length

    const intensityDiff = Math.abs(avgLeftIntensity - avgRightIntensity)
    const symmetryPercent = Math.max(0, 100 - (intensityDiff / 2.55))

    const avgIntensity = (avgLeftIntensity + avgRightIntensity) / 2
    const intensityScore = (avgIntensity / 255) * 100

    if (intensityDiff > 38) {
      warnings.push({ type: 'asymmetry', severity: 'warning' })
    }

    setReflexIntensityScore(Math.round(intensityScore))
    setSymmetryScore(Math.round(symmetryPercent))
    setLeftEyeData({ intensity: Math.round(avgLeftIntensity), percentage: Math.round((avgLeftIntensity / 255) * 100) })
    setRightEyeData({ intensity: Math.round(avgRightIntensity), percentage: Math.round((avgRightIntensity / 255) * 100) })
    setWarnings(warnings)
    setTrackingQuality({
      confidence,
      landmarkRatio: Math.round(landmarkRatio * 100),
      framesScored: scoredFrames.length,
    })

    const reflexIntensityScore = Math.round(intensityScore)
    const symmetryScore = Math.round(symmetryPercent)
    const combinedScore = scoreRedReflex(reflexIntensityScore, warnings)

    stopCamera()
    setTestState('results')

    submitResults({
      reflexIntensityScore,
      symmetryScore,
      combinedScore,
      leftEyeIntensity: Math.round(avgLeftIntensity),
      rightEyeIntensity: Math.round(avgRightIntensity),
      warnings,
      detectionConfidence: confidence,
      landmarkFramePercent: Math.round(landmarkRatio * 100),
      framesScored: scoredFrames.length,
      analysis_note: usedLandmarks
        ? 'Eye regions located with MediaPipe iris landmarks.'
        : 'No face detected; eye regions estimated at fixed screen positions. Framing affects accuracy.',
    })
  }, [stopCamera])

  // Capture video frames for analysis
  const startScan = useCallback(async () => {
    if (distanceStatusRef.current !== 'perfect') {
      setError('Move to the green “Perfect” distance band before scanning.')
      return
    }
    setError(null)
    setTestState('scanning')
    setScanProgress(0)
    setCapturedFrames([])

    const frames = []
    // ~3s scan at 5fps — enough for reflex stats without flooding memory/main thread.
    const totalFrames = 15
    const captureIntervalMs = 200
    const trackIntervalMs = 200
    // Downscale before getImageData — full 1080p × N frames freezes the tab.
    const ANALYSIS_MAX_WIDTH = 640

    let frameCount = 0
    let trackingCancelled = false
    let captureTimerId = null
    let trackTimerId = null

    const trackOnce = async () => {
      if (trackingCancelled || !videoRef.current) return
      try {
        if (pupilTrackerRef.current) {
          await pupilTrackerRef.current.track(videoRef.current)
        }
      } catch (err) {
        console.warn('Pupil tracking failed mid-scan:', err)
      }
      if (!trackingCancelled) {
        trackTimerId = setTimeout(trackOnce, trackIntervalMs)
      }
    }
    trackOnce()

    const finishScan = () => {
      trackingCancelled = true
      if (captureTimerId) clearInterval(captureTimerId)
      if (trackTimerId) clearTimeout(trackTimerId)
      setTestState('analyzing')
      // Yield so the analyzing UI can paint before CPU-heavy scoring.
      window.setTimeout(() => analyzeFrames(frames), 50)
    }

    const captureFrame = () => {
      if (frameCount >= totalFrames) {
        finishScan()
        return
      }

      if (!videoRef.current || !canvasRef.current) return

      const video = videoRef.current
      if (!video.videoWidth) return

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      const scale = Math.min(1, ANALYSIS_MAX_WIDTH / video.videoWidth)
      const w = Math.max(1, Math.round(video.videoWidth * scale))
      const h = Math.max(1, Math.round(video.videoHeight * scale))
      canvas.width = w
      canvas.height = h
      ctx.drawImage(video, 0, 0, w, h)

      const imageData = ctx.getImageData(0, 0, w, h)
      const rawRegions =
        pupilTrackerRef.current?.getRegions(video.videoWidth, video.videoHeight) ||
        fallbackPupilRegions(video.videoWidth, video.videoHeight)

      // Scale landmark coords into the downscaled analysis canvas.
      const regions = {
        ...rawRegions,
        anatomicalLeft: rawRegions.anatomicalLeft && {
          ...rawRegions.anatomicalLeft,
          x: rawRegions.anatomicalLeft.x * scale,
          y: rawRegions.anatomicalLeft.y * scale,
          radius: Math.max(4, rawRegions.anatomicalLeft.radius * scale),
          irisRadius: rawRegions.anatomicalLeft.irisRadius
            ? Math.max(4, rawRegions.anatomicalLeft.irisRadius * scale)
            : undefined,
        },
        anatomicalRight: rawRegions.anatomicalRight && {
          ...rawRegions.anatomicalRight,
          x: rawRegions.anatomicalRight.x * scale,
          y: rawRegions.anatomicalRight.y * scale,
          radius: Math.max(4, rawRegions.anatomicalRight.radius * scale),
          irisRadius: rawRegions.anatomicalRight.irisRadius
            ? Math.max(4, rawRegions.anatomicalRight.irisRadius * scale)
            : undefined,
        },
      }

      const analysis = analyzeRedReflex(imageData, regions)
      frames.push({
        regions: { source: rawRegions.source },
        leftEye: analysis.leftEye,
        rightEye: analysis.rightEye,
      })

      frameCount += 1
      setScanProgress((frameCount / totalFrames) * 100)
    }

    captureTimerId = setInterval(captureFrame, captureIntervalMs)
  }, [analyzeFrames])

  // Submit results to backend
  const submitResults = async (results) => {
    try {
      await visionTestAPI.submit({
        test_type: 'red_reflex',
        score: results.combinedScore ?? results.reflexIntensityScore,
        test_details: {
          reflex_intensity_score: results.reflexIntensityScore,
          symmetry_score: results.symmetryScore,
          combined_score: results.combinedScore,
          left_eye_intensity: results.leftEyeIntensity,
          right_eye_intensity: results.rightEyeIntensity,
          warnings: results.warnings,
          detection_confidence: results.detectionConfidence,
          landmark_frame_percent: results.landmarkFramePercent,
          frames_scored: results.framesScored,
          analysis_note: results.analysis_note,
          timestamp: new Date().toISOString()
        }
      })
    } catch (err) {
      console.error('Failed to submit results:', err)
    }
  }

  // Start test flow
  const startTest = useCallback(() => {
    setTestState('setup')
    initializeCamera()
  }, [initializeCamera])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  // Render instruction screen
  const renderInstructions = () => (
    <div className="test-shell">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/vision-tests')}
          className="mb-6 flex items-center text-red-600 hover:text-red-700 font-medium"
        >
          ← Back to Tests
        </button>

        <div className="test-panel p-8 md:p-12">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                <circle cx="12" cy="12" r="3" fill="currentColor"/>
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" strokeWidth="2"/>
              </svg>
            </div>
            <h1 className="page-title mb-2">Eye Glow Test</h1>
            <p className="text-xl text-gray-600">Checks the glow from the back of your eyes</p>
          </div>

          <div className="bg-red-50 border-l-4 border-red-600 p-6 mb-8 rounded-r-xl">
            <h2 className="text-lg font-bold text-red-900 mb-2">What This Test Does</h2>
            <p className="text-red-800">
              Your camera looks at the glow that comes from the back of your eyes — the same red-eye you see in photos.
              A healthy, even glow in both eyes is a good sign. An uneven or cloudy glow can be an early hint of an eye problem worth checking.
            </p>
          </div>

          <div className="space-y-6 mb-8">
            <h3 className="text-2xl font-bold text-gray-900">How It Works:</h3>
            
            <div className="grid gap-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 font-bold text-xl">1</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Turn Screen Brightness Up</h4>
                  <p className="text-gray-600">The app uses your bright screen as a gentle light to see into your eyes</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 font-bold text-xl">2</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Position Yourself 60-90cm Away</h4>
                  <p className="text-gray-600">The app will guide you to the perfect distance for accurate scanning</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 font-bold text-xl">3</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">3-Second Video Scan</h4>
                  <p className="text-gray-600">Keep your eyes on the focal point while we capture a short video for analysis</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 font-bold text-xl">4</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Automatic Analysis</h4>
                  <p className="text-gray-600">We check how bright the glow is, whether both eyes match, and if anything looks cloudy</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-8">
            <h3 className="font-bold text-orange-900 mb-3">Before You Start:</h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span><strong>Find a dimly lit room</strong> - This helps your pupils dilate naturally</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span><strong>Remove glasses or contacts</strong> - We need clear access to your natural eye</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span><strong>Hold your device steady</strong> - Use both hands or prop it against something</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span><strong>Allow camera access</strong> - Needed to see the glow in your eyes</span>
              </li>
            </ul>
          </div>

          <div className="text-center">
            <button
              onClick={startTest}
              className="btn-primary px-8 py-4 text-xl"
            >
              Start Eye Glow Scan
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // Persistent camera layer — same video element through setup → scanning
  const renderCameraLayer = () => (
    <div
      className={
        testState === 'scanning'
          ? 'fixed top-0 left-0 w-[640px] h-[480px] opacity-0 pointer-events-none z-0'
          : 'relative mb-6 rounded-2xl overflow-hidden bg-gray-900 min-h-[200px]'
      }
      aria-hidden={testState === 'scanning'}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover max-w-2xl mx-auto"
      />
      <canvas ref={canvasRef} className="hidden" />
      {testState !== 'scanning' && (
        <>
          <p className="absolute top-2 left-2 z-10 text-xs text-white/70 bg-black/40 px-2 py-1 rounded">
            Live preview
          </p>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative">
              <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
              <svg className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" width="300" height="400" viewBox="0 0 300 400">
                <ellipse cx="150" cy="200" rx="140" ry="190" fill="none" stroke="white" strokeWidth="2" strokeDasharray="10,5" opacity="0.5" />
                <circle cx="100" cy="180" r="30" fill="none" stroke="red" strokeWidth="2" opacity="0.7" />
                <circle cx="200" cy="180" r="30" fill="none" stroke="red" strokeWidth="2" opacity="0.7" />
              </svg>
            </div>
          </div>
        </>
      )}
    </div>
  )

  const renderSetupPanels = () => (
    <>
        {/* Distance indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className={`px-4 py-2 rounded-full ${distanceStatus === 'too-close' ? 'bg-yellow-600' : 'bg-gray-700'}`}>
              Too Close
            </div>
            <div className={`px-6 py-3 rounded-full ${distanceStatus === 'perfect' ? 'bg-green-600' : 'bg-gray-700'}`}>
              Perfect
            </div>
            <div className={`px-4 py-2 rounded-full ${distanceStatus === 'too-far' ? 'bg-yellow-600' : 'bg-gray-700'}`}>
              Too Far
            </div>
          </div>

          {distanceStatus === 'perfect' && (
            <p className="text-center text-green-400 font-semibold">
              Perfect distance! Keep your eyes on the red dot.
            </p>
          )}
          {distanceStatus === 'too-close' && (
            <p className="text-center text-yellow-400">
              Move back a bit...
            </p>
          )}
          {distanceStatus === 'too-far' && (
            <p className="text-center text-yellow-400">
              Move closer...
            </p>
          )}

          {cameraReady && (
            <p className={`text-center text-sm mt-3 ${eyesLocated ? 'text-green-400' : 'text-gray-400'}`}>
              {eyesLocated
                ? 'Both pupils located — the scan will follow your eyes.'
                : 'Looking for your eyes… make sure your whole face is in frame.'}
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 rounded-xl p-4 mb-6">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => {
              stopCamera()
              setTestState('instructions')
            }}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-full font-semibold transition-colors"
          >
            Cancel
          </button>
          
          {!cameraReady ? (
            <button
              onClick={initializeCamera}
              className="px-8 py-3 bg-red-600 hover:bg-red-700 rounded-full font-semibold transition-colors"
            >
              Enable camera
            </button>
          ) : (
            <button
              onClick={startScan}
              disabled={distanceStatus !== 'perfect'}
              className="px-8 py-3 bg-green-600 hover:bg-green-700 rounded-full font-semibold transition-all transform hover:scale-105 disabled:opacity-50 disabled:transform-none"
            >
              Begin Scan
            </button>
          )}
        </div>
    </>
  )

  const renderCameraSession = () => (
    <div className={testState !== 'scanning' ? 'min-h-screen bg-black text-white p-4' : ''}>
      {testState !== 'scanning' && (
        <div className="max-w-4xl mx-auto text-center mb-8">
          <h2 className="text-3xl font-bold mb-2">Position Yourself</h2>
          <p className="text-gray-400">Stand 60-90cm (2-3 feet) from the camera</p>
        </div>
      )}
      <div className={testState !== 'scanning' ? 'max-w-4xl mx-auto' : ''}>
        {renderCameraLayer()}
        {testState !== 'scanning' && renderSetupPanels()}
      </div>
    </div>
  )

  // Render scanning screen
  const renderScanning = () => (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="relative w-64 h-64 mx-auto mb-8">
          {/* Animated scanning effect */}
          <div className="absolute inset-0 border-4 border-red-600 rounded-full animate-ping" />
          <div className="absolute inset-4 border-4 border-orange-500 rounded-full animate-pulse" />
          <div className="absolute inset-8 border-4 border-red-400 rounded-full" />
          
          {/* Progress circle */}
          <svg className="absolute inset-0 w-full h-full transform -rotate-90">
            <circle
              cx="128"
              cy="128"
              r="120"
              fill="none"
              stroke="rgba(239, 68, 68, 0.2)"
              strokeWidth="8"
            />
            <circle
              cx="128"
              cy="128"
              r="120"
              fill="none"
              stroke="rgb(239, 68, 68)"
              strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 120}`}
              strokeDashoffset={`${2 * Math.PI * 120 * (1 - scanProgress / 100)}`}
              strokeLinecap="round"
              className="transition-all duration-100"
            />
          </svg>
          
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl font-bold text-red-500 mb-2">{Math.round(scanProgress)}%</div>
              <div className="text-sm text-gray-400">Scanning...</div>
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-4">Checking the glow in your eyes</h2>
        <p className="text-gray-400 mb-2">Keep your eyes on the center point</p>
        <p className="text-gray-500 text-sm">Taking a quick 3-second video</p>

        {/* Scanning animation bars */}
        <div className="mt-8 flex justify-center gap-2">
          {[28, 44, 36, 52, 32].map((height, i) => (
            <div
              key={i}
              className="w-2 bg-red-600 rounded-full animate-pulse"
              style={{
                height: `${height}px`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )

  // Render analyzing screen
  const renderAnalyzing = () => (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="relative w-48 h-48 mx-auto mb-8">
          {/* Animated analysis */}
          <div className="absolute inset-0">
            <div className="w-full h-full border-4 border-red-600 rounded-full animate-spin" style={{ borderTopColor: 'transparent' }} />
          </div>
          <div className="absolute inset-4">
            <div className="w-full h-full border-4 border-orange-500 rounded-full animate-spin" style={{ borderTopColor: 'transparent', animationDirection: 'reverse' }} />
          </div>
          
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-16 h-16 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM8 10a2 2 0 114 0 2 2 0 01-4 0z" />
            </svg>
          </div>
        </div>

        <h2 className="text-3xl font-bold mb-4">Analyzing Results</h2>
        <p className="text-gray-400 mb-6">Looking at the glow in your eyes...</p>

        <div className="space-y-2 text-sm text-gray-500">
          <p className="animate-pulse">✓ Measuring how bright the glow is</p>
          <p className="animate-pulse" style={{ animationDelay: '0.2s' }}>✓ Checking that both eyes match</p>
          <p className="animate-pulse" style={{ animationDelay: '0.4s' }}>✓ Looking for cloudy areas</p>
          <p className="animate-pulse" style={{ animationDelay: '0.6s' }}>✓ Checking for a white glow</p>
        </div>
      </div>
    </div>
  )

  // Render results screen
  const renderResults = () => {
    const criticalWarnings = warnings.filter(w => w.severity === 'critical')
    const normalWarnings = warnings.filter(w => w.severity === 'warning')

    const getScoreColor = (score) => {
      if (score >= 80) return 'text-green-600'
      if (score >= 60) return 'text-yellow-600'
      return 'text-red-600'
    }

    const getScoreBg = (score) => {
      if (score >= 80) return 'bg-green-100 border-green-300'
      if (score >= 60) return 'bg-yellow-100 border-yellow-300'
      return 'bg-red-100 border-red-300'
    }

    return (
      <div className="test-shell">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/vision-tests')}
            className="mb-6 flex items-center text-red-600 hover:text-red-700 font-medium"
          >
            ← Back to Tests
          </button>

          <div className="test-panel p-8 md:p-12">
            <div className="text-center mb-8">
              <h1 className="page-title mb-2">Eye Glow Test Complete</h1>
              <p className="text-gray-600">Here's what the glow in your eyes looked like</p>
            </div>

            {/* Critical warnings */}
            {criticalWarnings.length > 0 && (
              <div className="bg-red-100 border-l-4 border-red-600 p-6 mb-8 rounded-r-xl">
                <h3 className="text-lg font-bold text-red-900 mb-2 flex items-center gap-2">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Please see an eye doctor soon
                </h3>
                <p className="text-red-800 font-semibold mb-2">
                  Something looked unusual in the glow. This isn't a diagnosis, but please book an appointment with an eye doctor soon to have it checked.
                </p>
                <ul className="text-red-700 space-y-1">
                  {criticalWarnings.map((warning, i) => (
                    <li key={i}>• {warning.type === 'leukocoria' ? 'A white glow was seen instead of the usual red' : warning.type}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Eye-location confidence — low confidence means the pupils were never found */}
            {trackingQuality && (
              <div
                className={`border-l-4 p-4 mb-8 rounded-r-xl ${
                  trackingQuality.confidence === 'low'
                    ? 'bg-yellow-50 border-yellow-500'
                    : 'bg-gray-50 border-gray-300'
                }`}
              >
                {trackingQuality.confidence === 'low' ? (
                  <p className="text-yellow-900 text-sm">
                    <strong>Low confidence:</strong> we couldn't find your pupils during this scan, so
                    the glow was measured at fixed screen positions. Retake the test with your whole
                    face in frame for a reliable reading.
                  </p>
                ) : (
                  <p className="text-gray-700 text-sm">
                    Pupils were tracked in {trackingQuality.landmarkRatio}% of frames
                    {trackingQuality.confidence === 'moderate'
                      ? ' — holding steadier will improve accuracy.'
                      : ' — good tracking.'}
                  </p>
                )}
              </div>
            )}

            {/* Main scores */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Reflex Intensity Score */}
              <div className={`border-2 rounded-2xl p-6 ${getScoreBg(reflexIntensityScore)}`}>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">GLOW BRIGHTNESS</h3>
                <div className={`text-6xl font-bold ${getScoreColor(reflexIntensityScore)} mb-2`}>
                  {reflexIntensityScore}
                  <span className="text-3xl">/100</span>
                </div>
                <p className="text-sm text-gray-600">
                  {reflexIntensityScore >= 80 ? 'Bright, healthy glow' :
                   reflexIntensityScore >= 60 ? 'Medium glow' :
                   'Faint glow'}
                </p>
              </div>

              {/* Symmetry Score */}
              <div className={`border-2 rounded-2xl p-6 ${getScoreBg(symmetryScore)}`}>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">BOTH EYES MATCH</h3>
                <div className={`text-6xl font-bold ${getScoreColor(symmetryScore)} mb-2`}>
                  {symmetryScore}
                  <span className="text-3xl">/100</span>
                </div>
                <p className="text-sm text-gray-600">
                  {symmetryScore >= 85 ? 'Both eyes look nicely balanced' :
                   symmetryScore >= 70 ? 'Slight difference between eyes' :
                   'Noticeable difference between eyes'}
                </p>
              </div>
            </div>

            {/* Eye comparison */}
            <div className="bg-gray-50 rounded-2xl p-6 mb-8">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Each eye on its own</h3>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Left eye */}
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <h4 className="font-bold text-gray-700 mb-3">Your Left Eye</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Glow brightness:</span>
                      <span className="font-semibold">{leftEyeData?.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-red-600 h-2 rounded-full transition-all"
                        style={{ width: `${leftEyeData?.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Right eye */}
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <h4 className="font-bold text-gray-700 mb-3">Your Right Eye</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Glow brightness:</span>
                      <span className="font-semibold">{rightEyeData?.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-red-600 h-2 rounded-full transition-all"
                        style={{ width: `${rightEyeData?.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Normal warnings */}
            {normalWarnings.length > 0 && (
              <div className="bg-yellow-50 border-l-4 border-yellow-600 p-6 mb-8 rounded-r-xl">
                <h3 className="text-lg font-bold text-yellow-900 mb-2">Things worth keeping an eye on</h3>
                <ul className="text-yellow-800 space-y-1">
                  {normalWarnings.map((warning, i) => (
                    <li key={i}>
                      • {warning.type === 'opacity' ? 'A small cloudy area was seen in this photo — an eye doctor can check the lens. This is not a cataract diagnosis.' :
                         warning.type === 'asymmetry' ? 'Your eyes looked a little different — an eye exam can check if your glasses need updating' :
                         warning.type}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            <div className="bg-blue-50 rounded-2xl p-6 mb-8">
              <h3 className="text-xl font-bold text-blue-900 mb-4">Next Steps</h3>
              <div className="space-y-3 text-blue-800">
                {criticalWarnings.length > 0 ? (
                  <>
                    <p className="font-semibold">Immediate action required:</p>
                    <p>• Schedule an appointment with an ophthalmologist within 24-48 hours</p>
                    <p>• Bring this report to your appointment</p>
                    <p>• Do not delay - early detection is crucial</p>
                  </>
                ) : symmetryScore < 85 || reflexIntensityScore < 80 ? (
                  <>
                    <p>• Consider scheduling a comprehensive eye exam</p>
                    <p>• Share this report with your eye care provider</p>
                    <p>• Monitor for changes in vision quality</p>
                    {symmetryScore < 85 && <p>• Your prescription may need updating</p>}
                  </>
                ) : (
                  <>
                    <p className="font-semibold">Your eyes look healthy!</p>
                    <p>• Continue annual eye exams</p>
                    <p>• Retest in 6 months to monitor any changes</p>
                    <p>• Maintain good eye health habits</p>
                  </>
                )}
              </div>
            </div>

            <SamdDisclaimer testType="red_reflex" className="mb-6" />

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => window.print()}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
              >
                Print Report
              </button>
              <button
                onClick={() => {
                  setTrackingQuality(null)
                  setEyesLocated(false)
                  setWarnings([])
                  setError(null)
                  setTestState('instructions')
                }}
                className="flex-1 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-semibold transition-colors"
              >
                Take Another Test
              </button>
              <button
                onClick={() => navigate('/vision-tests')}
                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main render — keep camera elements mounted through scanning
  return (
    <div className="relative">
      {testState === 'instructions' && renderInstructions()}
      {(testState === 'setup' || testState === 'calibrating' || testState === 'scanning') && renderCameraSession()}
      {testState === 'scanning' && renderScanning()}
      {testState === 'analyzing' && renderAnalyzing()}
      {testState === 'results' && renderResults()}
    </div>
  )
}

export default RedReflexTest
