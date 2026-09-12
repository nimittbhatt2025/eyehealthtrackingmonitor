import { useState, useEffect, useRef, useCallback } from 'react'
import cameraManager from '../utils/cameraManager.js'
import distanceCalibration, {
  OPTIMAL_DISTANCES,
  estimateDistanceCmFromPixelIpd,
} from '../utils/distanceCalibration'
import { PupilRegionTracker } from '../utils/pupilRegionDetector'

/**
 * Standalone IPD Distance Calibration
 * Uses MediaPipe iris landmarks to measure IPD and calibrate camera focal constant.
 */

export default function IPDDistanceCalibration({
  testType = 'default',
  onCalibrated,
  onDistanceUpdate,
  showContinuous = false,
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const detectionIntervalRef = useRef(null)
  const pupilTrackerRef = useRef(null)
  const detectingRef = useRef(false)
  const pixelIpdRef = useRef(null)
  const rollingIpdRef = useRef([])
  const countdownIntervalRef = useRef(null)

  const [step, setStep] = useState('intro') // intro, loading-models, position, calibrating, monitoring
  const [cameraReady, setCameraReady] = useState(false)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [pixelIPD, setPixelIPD] = useState(null)
  const [trackingSource, setTrackingSource] = useState(null)
  const [currentDistance, setCurrentDistance] = useState(null)
  const [calibrated, setCalibrated] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [countdown, setCountdown] = useState(3)
  const [loadError, setLoadError] = useState(null)

  const optimalDistance = OPTIMAL_DISTANCES[testType] || OPTIMAL_DISTANCES.default
  const optimalDistanceCM = Math.round(optimalDistance / 10)

  const pushRolling = (arr, value, max = 5) => [...arr, value].slice(-max)
  const rollingMean = (arr) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current)
      stopCamera()
    }
  }, [])

  useEffect(() => {
    if (cameraReady && modelsLoaded && (step === 'position' || step === 'monitoring')) {
      startIpdTracking()
    }
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current)
        detectionIntervalRef.current = null
      }
    }
  }, [cameraReady, modelsLoaded, step])

  // Re-attach stream when the visible <video> remounts across steps.
  useEffect(() => {
    if (step !== 'position' && !(step === 'monitoring' && showContinuous)) return
    if (!streamRef.current || !videoRef.current) return
    const video = videoRef.current
    if (video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current
    }
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    video.play().catch(() => {})
  }, [step, showContinuous])

  const loadModels = async () => {
    try {
      setLoadError(null)
      setStep('loading-models')

      if (!pupilTrackerRef.current) {
        pupilTrackerRef.current = new PupilRegionTracker()
      }
      await pupilTrackerRef.current.init()

      if (pupilTrackerRef.current.modelUnavailable) {
        throw new Error('Could not load the MediaPipe iris model. Check your network and retry.')
      }

      setModelsLoaded(true)
      await startCamera()
      setStep('position')
    } catch (error) {
      console.error('Failed to load IPD models:', error)
      setLoadError(error.message || 'Failed to load iris tracking')
      setStep('intro')
    }
  }

  const startCamera = async () => {
    try {
      const stream = await cameraManager.acquire({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      if (!videoRef.current) {
        streamRef.current = stream
        setCameraReady(true)
        return
      }

      const video = videoRef.current
      video.srcObject = stream
      streamRef.current = stream
      video.autoplay = true
      video.muted = true
      video.playsInline = true

      const onReady = () => setCameraReady(true)
      video.onloadedmetadata = onReady
      if (video.readyState >= 1) onReady()
      video.play().catch(() => {})
    } catch (error) {
      console.error('Camera acquire failed:', error)
      setLoadError('Camera access is required for distance calibration.')
      setStep('intro')
    }
  }

  const stopCamera = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current)
      detectionIntervalRef.current = null
    }

    if (pupilTrackerRef.current) {
      pupilTrackerRef.current.stop()
      pupilTrackerRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    streamRef.current = null
    rollingIpdRef.current = []

    try {
      cameraManager.release()
    } catch {
      /* ignore */
    }

    setCameraReady(false)
  }

  const drawEyeOverlay = (regions, width, height) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    if (!regions) return

    // Raw frame coords — CSS scaleX(-1) mirrors video + canvas together.
    ctx.lineWidth = 3
    ;[regions.anatomicalLeft, regions.anatomicalRight].forEach((eye) => {
      if (!eye) return
      ctx.beginPath()
      ctx.arc(eye.x, eye.y, Math.max(6, eye.radius), 0, Math.PI * 2)
      ctx.strokeStyle = '#00ff00'
      ctx.stroke()
    })

    if (regions.anatomicalLeft && regions.anatomicalRight) {
      ctx.beginPath()
      ctx.moveTo(regions.anatomicalLeft.x, regions.anatomicalLeft.y)
      ctx.lineTo(regions.anatomicalRight.x, regions.anatomicalRight.y)
      ctx.strokeStyle = '#00ffff'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  const startIpdTracking = () => {
    if (detectionIntervalRef.current) return
    detectionIntervalRef.current = setInterval(() => {
      trackIpd()
    }, 200)
  }

  const trackIpd = async () => {
    if (!videoRef.current || !cameraReady) return
    if (videoRef.current.videoWidth === 0) return
    if (detectingRef.current) return
    detectingRef.current = true

    try {
      if (!pupilTrackerRef.current) {
        pupilTrackerRef.current = new PupilRegionTracker()
        await pupilTrackerRef.current.init()
      }

      const video = videoRef.current
      const regions = await pupilTrackerRef.current.track(video)
      drawEyeOverlay(regions, video.videoWidth, video.videoHeight)

      if (regions?.eyeSpanPx > 0) {
        rollingIpdRef.current = pushRolling(rollingIpdRef.current, regions.eyeSpanPx)
        const smoothedIpd = rollingMean(rollingIpdRef.current)
        pixelIpdRef.current = smoothedIpd
        setPixelIPD(smoothedIpd)
        setFaceDetected(true)
        setTrackingSource(regions.source || 'iris-landmarks')

        if (distanceCalibration.calibrated) {
          let distanceMm = null
          try {
            distanceMm = distanceCalibration.getDistance(smoothedIpd)
          } catch {
            const cm = estimateDistanceCmFromPixelIpd(smoothedIpd, video.videoWidth)
            distanceMm = cm != null ? cm * 10 : null
          }

          if (distanceMm != null) {
            setCurrentDistance(distanceMm)
            const fb = distanceCalibration.getDistanceFeedback(distanceMm, testType)
            setFeedback(fb)
            onDistanceUpdate?.(distanceMm, fb)
          }
        }
      } else {
        setFaceDetected(false)
        setPixelIPD(null)
        pixelIpdRef.current = null
        setTrackingSource(null)
        rollingIpdRef.current = []
      }
    } catch (error) {
      console.error('IPD tracking error:', error)
    } finally {
      detectingRef.current = false
    }
  }

  const handleStartCalibration = () => {
    loadModels()
  }

  const handleCalibrate = useCallback(() => {
    const measured = pixelIpdRef.current
    if (!measured) {
      alert('No pupils detected. Please ensure both eyes are visible.')
      return
    }

    const validation = distanceCalibration.validateMeasurement(measured)
    if (!validation.valid) {
      alert(`Calibration failed: ${validation.reason}. ${validation.suggestion}`)
      return
    }

    setStep('calibrating')
    let count = 3
    setCountdown(count)

    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)

    countdownIntervalRef.current = setInterval(() => {
      count -= 1
      setCountdown(count)

      if (count === 0) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null

        // Use the test's optimal distance as the known reference (matches UI copy).
        const knownDistanceMM = optimalDistance
        const ipdAtCapture = pixelIpdRef.current || measured
        distanceCalibration.calibrate(ipdAtCapture, knownDistanceMM)
        distanceCalibration.save()

        setCalibrated(true)
        setStep('monitoring')
        onCalibrated?.(true)
      }
    }, 1000)
  }, [optimalDistance, onCalibrated])

  const renderIntro = () => (
    <div className="text-center space-y-6 max-w-2xl mx-auto">
      <div className="w-20 h-20 mx-auto bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mb-6">
        <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </div>

      <h2 className="text-3xl font-bold text-gray-900">Smart Distance Calibration</h2>
      <p className="text-lg text-gray-600">
        We use MediaPipe iris landmarks (IPD) to measure how far you are from the screen.
      </p>

      <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 text-left">
        <h3 className="font-bold text-blue-900 mb-3">How it works:</h3>
        <ol className="space-y-2 text-blue-800">
          <li className="flex gap-3">
            <span className="font-bold">1.</span>
            <span>We detect your pupils and measure the spacing between them (IPD)</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold">2.</span>
            <span>You position yourself at exactly {optimalDistanceCM}cm from the screen</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold">3.</span>
            <span>We calculate your camera&apos;s focal constant — then we can measure distance anytime</span>
          </li>
        </ol>
      </div>

      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6">
        <h3 className="font-bold text-amber-900 mb-3">For best results:</h3>
        <ul className="space-y-2 text-amber-800 text-left">
          <li className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Good lighting on your face
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Look directly at the camera with both eyes visible
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Have a ruler or measuring tape handy
          </li>
        </ul>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {loadError}
        </div>
      )}

      <button
        type="button"
        onClick={handleStartCalibration}
        className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-10 py-4 rounded-full font-bold text-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl"
      >
        Start Calibration →
      </button>
    </div>
  )

  const renderLoadingModels = () => (
    <div className="text-center space-y-6">
      {/* Keep video mounted so camera attach works after load */}
      <div style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} />
      </div>
      <div className="w-20 h-20 mx-auto bg-blue-100 rounded-full flex items-center justify-center animate-pulse">
        <svg className="w-10 h-10 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </div>
      <h3 className="text-2xl font-bold text-gray-900">Loading iris tracking…</h3>
      <p className="text-gray-600">Starting MediaPipe Face Mesh</p>
    </div>
  )

  const renderPosition = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">Calibrate at {optimalDistanceCM}cm</h2>
        <p className="text-lg text-gray-600 mb-4">
          Sit at exactly {optimalDistanceCM}cm, then capture when pupils are locked
        </p>
        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 max-w-md mx-auto">
          <p className="text-sm text-blue-800 font-medium">
            Distance is measured from iris spacing (average adult IPD ≈ <span className="font-bold">63mm</span>).
          </p>
        </div>
      </div>

      <div className="relative bg-gray-900 rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full"
          style={{ transform: 'scaleX(-1)' }}
        />

        <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
          {faceDetected ? (
            <div className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-full">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
              Pupils locked
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-full">
              <div className="w-3 h-3 bg-white rounded-full" />
              Looking for eyes…
            </div>
          )}
          {trackingSource && (
            <span className="text-[10px] bg-black/50 text-white/90 px-2 py-0.5 rounded">
              via {trackingSource}
            </span>
          )}
        </div>

        {pixelIPD && (
          <div className="absolute bottom-4 left-4 bg-black/70 text-white px-4 py-2 rounded-lg">
            <div className="text-xs text-gray-300">IPD Measurement</div>
            <div className="text-lg font-bold">{pixelIPD.toFixed(1)} px</div>
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 border-4 border-dashed border-white/50 rounded-full flex items-center justify-center">
            <div className="text-white text-center bg-black/50 px-4 py-2 rounded-lg">
              <div className="text-sm">Position your face</div>
              <div className="text-xs text-gray-300">both eyes in view</div>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleCalibrate}
        disabled={!faceDetected || !pixelIPD}
        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {faceDetected ? `Calibrate at ${optimalDistanceCM}cm` : 'Waiting for pupil detection…'}
      </button>
    </div>
  )

  const renderCalibrating = () => (
    <div className="text-center space-y-8">
      <div className="w-32 h-32 mx-auto bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
        <div className="text-6xl font-bold text-white">{countdown}</div>
      </div>
      <h2 className="text-3xl font-bold text-gray-900">Hold still!</h2>
      <p className="text-lg text-gray-600">
        Capturing IPD at {optimalDistanceCM}cm… {countdown}
      </p>
    </div>
  )

  const renderMonitoring = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">Distance Monitoring</h2>
        <p className="text-lg text-gray-600">
          Optimal distance for this test:{' '}
          <span className="font-bold text-purple-600">{optimalDistanceCM}cm</span>
          {calibrated ? ' · calibrated' : ''}
        </p>
      </div>

      {feedback && currentDistance ? (
        <div className={`border-4 ${feedback.borderColor} rounded-2xl p-6 ${feedback.bgColor} bg-opacity-10 transition-all duration-300`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className={`text-2xl font-bold ${feedback.textColor} mb-2`}>
                {feedback.message}
              </div>
              <div className="text-gray-700 text-lg">
                Current: <span className="font-bold">{Math.round(currentDistance / 10)}cm</span>
                {' | '}
                Target: <span className="font-bold">{optimalDistanceCM}cm</span>
              </div>
            </div>
            <div className={`w-20 h-20 ${feedback.bgColor} rounded-full flex items-center justify-center flex-shrink-0`}>
              {feedback.status === 'perfect' ? (
                <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : feedback.action === 'move-back' ? (
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                </svg>
              ) : (
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          </div>

          <div className="mt-4">
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden relative">
              <div
                className={`h-full ${feedback.bgColor} transition-all duration-300`}
                style={{
                  width: `${Math.min(100, Math.max(0, (currentDistance / (optimalDistance * 1.5)) * 100))}%`,
                }}
              />
              <div
                className="absolute top-0 w-1 h-full bg-purple-600"
                style={{ left: `${(optimalDistance / (optimalDistance * 1.5)) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Too close</span>
              <span>Perfect</span>
              <span>Too far</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-4 border-gray-300 rounded-2xl p-6 bg-gray-50">
          <div className="text-center text-gray-600">
            <p className="text-lg font-medium mb-2">Measuring distance…</p>
            <p className="text-sm">Keep both eyes visible to the camera</p>
          </div>
        </div>
      )}

      {showContinuous && (
        <div className="relative bg-gray-900 rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover opacity-50"
            style={{ transform: 'scaleX(-1)' }}
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full"
            style={{ transform: 'scaleX(-1)' }}
          />
        </div>
      )}
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto p-6">
      {step === 'intro' && renderIntro()}
      {step === 'loading-models' && renderLoadingModels()}
      {step === 'position' && renderPosition()}
      {step === 'calibrating' && renderCalibrating()}
      {step === 'monitoring' && renderMonitoring()}
    </div>
  )
}
