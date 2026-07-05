import { useState, useEffect, useRef } from 'react'
import * as faceapi from '@vladmandic/face-api'
import cameraManager from '../utils/cameraManager.js'
import distanceCalibration, { OPTIMAL_DISTANCES } from '../utils/distanceCalibration'

/**
 * IPD Distance Calibration Component
 * Uses face detection to measure Interpupillary Distance (IPD) and calculate viewing distance
 */

export default function IPDDistanceCalibration({ 
  testType = 'default',
  onCalibrated, 
  onDistanceUpdate,
  showContinuous = false 
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const detectionIntervalRef = useRef(null)

  const [step, setStep] = useState('intro') // intro, loading-models, position, calibrating, monitoring
  const [cameraReady, setCameraReady] = useState(false)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [pixelIPD, setPixelIPD] = useState(null)
  const [currentDistance, setCurrentDistance] = useState(null)
  const [calibrated, setCalibrated] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [countdown, setCountdown] = useState(3)

  const optimalDistance = OPTIMAL_DISTANCES[testType] || OPTIMAL_DISTANCES.default
  const optimalDistanceCM = Math.round(optimalDistance / 10)

  // Load face detection models
  useEffect(() => {
    loadModels()
    return () => {
      stopCamera()
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current)
      }
    }
  }, [])

  // Start face detection when camera is ready
  useEffect(() => {
    if (cameraReady && modelsLoaded && (step === 'position' || step === 'monitoring')) {
      startFaceDetection()
    }
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current)
      }
    }
  }, [cameraReady, modelsLoaded, step])

  const loadModels = async () => {
    try {
      console.log('🔄 Starting to load face detection models...')
      setStep('loading-models')
      
      // Set backend to WebGL for better performance
      await faceapi.tf.setBackend('webgl')
      await faceapi.tf.ready()
      console.log('✓ TensorFlow backend initialized:', faceapi.tf.getBackend())
      
      const MODEL_URL = '/models'
      
      console.log('📦 Loading TinyFaceDetector from:', MODEL_URL)
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
      console.log('✓ TinyFaceDetector loaded')
      
      console.log('📦 Loading FaceLandmark68Net from:', MODEL_URL)
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
      console.log('✓ FaceLandmark68Net loaded')
      
      setModelsLoaded(true)
      console.log('[OK] All face detection models loaded successfully!')
      
      // Auto-progress to position step
      setTimeout(() => {
        console.log('-> Moving to position step')
        setStep('position')
        startCamera()
      }, 500)
    } catch (error) {
      console.error('[X] Failed to load models:', error)
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
      alert(`Failed to load face detection models: ${error.message}\n\nMake sure model files are in /public/models/`)
    }
  }

  const startCamera = async () => {
    try {
      const stream = await cameraManager.acquire({
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream

        videoRef.current.onloadedmetadata = () => {
          setCameraReady(true)
        }
      }
    } catch (error) {
      console.error('Camera acquire failed:', error)
      alert('Camera access is required for distance calibration.')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      try {
        cameraManager.release()
      } catch (e) {
        try { streamRef.current.getTracks().forEach(track => track.stop()) } catch (err) { /* ignore */ }
      }
      streamRef.current = null
    }
    setCameraReady(false)
  }

  const startFaceDetection = () => {
    if (detectionIntervalRef.current) return

    detectionIntervalRef.current = setInterval(async () => {
      await detectFace()
    }, 100) // Detect every 100ms for smooth feedback
  }

  const detectFace = async () => {
    if (!videoRef.current || !canvasRef.current) return

    try {
      const detections = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ 
          inputSize: 224,
          scoreThreshold: 0.5 
        }))
        .withFaceLandmarks()

      // Clear canvas
      const canvas = canvasRef.current
      const displaySize = { 
        width: videoRef.current.videoWidth, 
        height: videoRef.current.videoHeight 
      }
      faceapi.matchDimensions(canvas, displaySize)
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (detections) {
        setFaceDetected(true)
        
        // Get eye landmarks (left eye: 36-41, right eye: 42-47)
        const landmarks = detections.landmarks.positions
        
        // Calculate center of left eye
        const leftEyePoints = landmarks.slice(36, 42)
        const leftEyeCenter = {
          x: leftEyePoints.reduce((sum, p) => sum + p.x, 0) / leftEyePoints.length,
          y: leftEyePoints.reduce((sum, p) => sum + p.y, 0) / leftEyePoints.length
        }
        
        // Calculate center of right eye
        const rightEyePoints = landmarks.slice(42, 48)
        const rightEyeCenter = {
          x: rightEyePoints.reduce((sum, p) => sum + p.x, 0) / rightEyePoints.length,
          y: rightEyePoints.reduce((sum, p) => sum + p.y, 0) / rightEyePoints.length
        }
        
        // Calculate IPD in pixels
        const measuredIPD = Math.sqrt(
          Math.pow(rightEyeCenter.x - leftEyeCenter.x, 2) +
          Math.pow(rightEyeCenter.y - leftEyeCenter.y, 2)
        )
        
        setPixelIPD(measuredIPD)

        // Draw eyes and IPD line
        ctx.strokeStyle = '#00ff00'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(leftEyeCenter.x, leftEyeCenter.y, 5, 0, 2 * Math.PI)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(rightEyeCenter.x, rightEyeCenter.y, 5, 0, 2 * Math.PI)
        ctx.stroke()
        
        ctx.strokeStyle = '#00ffff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(leftEyeCenter.x, leftEyeCenter.y)
        ctx.lineTo(rightEyeCenter.x, rightEyeCenter.y)
        ctx.stroke()

        // Calculate distance if calibrated
        if (distanceCalibration.calibrated) {
          const distance = distanceCalibration.getDistance(measuredIPD)
          setCurrentDistance(distance)
          
          const fb = distanceCalibration.getDistanceFeedback(distance, testType)
          setFeedback(fb)
          
          if (onDistanceUpdate) {
            onDistanceUpdate(distance, fb)
          }
        }
      } else {
        setFaceDetected(false)
        setPixelIPD(null)
      }
    } catch (error) {
      console.error('[X] Face detection error:', error)
      console.error('Error stack:', error.stack)
      // Don't stop the detection loop, just log the error
    }
  }

  const handleStartCalibration = async () => {
    setStep('loading-models')
    await startCamera()
    setStep('position')
  }

  const handleCalibrate = () => {
    if (!pixelIPD) {
      alert('No face detected. Please ensure your face is visible.')
      return
    }

    // Validate measurement
    const validation = distanceCalibration.validateMeasurement(pixelIPD)
    if (!validation.valid) {
      alert(`Calibration failed: ${validation.reason}. ${validation.suggestion}`)
      return
    }

    // Start countdown
    setStep('calibrating')
    let count = 3
    setCountdown(count)
    
    const countdownInterval = setInterval(() => {
      count--
      setCountdown(count)
      
      if (count === 0) {
        clearInterval(countdownInterval)
        
        // Perform automatic calibration using current position as reference
        // We assume the user is at a reasonable starting distance (40cm default)
        const estimatedDistance = 400 // Start with 40cm assumption
        distanceCalibration.calibrate(pixelIPD, estimatedDistance)
        distanceCalibration.save()
        
        setCalibrated(true)
        setStep('monitoring')
        
        if (onCalibrated) {
          onCalibrated(true)
        }
      }
    }, 1000)
  }

  const renderIntro = () => (
    <div className="text-center space-y-6 max-w-2xl mx-auto">
      <div className="w-20 h-20 mx-auto bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mb-6">
        <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </div>
      
      <h2 className="text-3xl font-bold text-gray-900">Smart Distance Calibration</h2>
      <p className="text-lg text-gray-600">
        We'll use your eye distance (IPD) to accurately measure how far you are from the screen.
      </p>

      <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 text-left">
        <h3 className="font-bold text-blue-900 mb-3">How it works:</h3>
        <ol className="space-y-2 text-blue-800">
          <li className="flex gap-3">
            <span className="font-bold">1.</span>
            <span>We detect your face and measure the distance between your pupils (IPD)</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold">2.</span>
            <span>You position yourself at exactly {optimalDistanceCM}cm from the screen</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold">3.</span>
            <span>We calculate your camera's "focal constant" - now we can measure distance anytime!</span>
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
            Look directly at the camera
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Have a ruler or measuring tape handy
          </li>
        </ul>
      </div>

      <button
        onClick={handleStartCalibration}
        className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-10 py-4 rounded-full font-bold text-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl"
      >
        Start Calibration →
      </button>
    </div>
  )

  const renderLoadingModels = () => (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 mx-auto bg-blue-100 rounded-full flex items-center justify-center animate-pulse">
        <svg className="w-10 h-10 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </div>
      <h3 className="text-2xl font-bold text-gray-900">Loading AI Models...</h3>
      <p className="text-gray-600">Setting up face detection</p>
    </div>
  )

  const renderPosition = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">Auto-Calibration</h2>
        <p className="text-lg text-gray-600 mb-4">
          Position your face in the camera view
        </p>
        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 max-w-md mx-auto">
          <p className="text-sm text-blue-800 font-medium">
            [target] We'll automatically measure your distance using your eye spacing (IPD).
            <br />Average adult IPD is <span className="font-bold">63mm</span>.
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
        
        {/* Face detection indicator */}
        <div className="absolute top-4 right-4">
          {faceDetected ? (
            <div className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-full">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
              Face Detected
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-full">
              <div className="w-3 h-3 bg-white rounded-full"></div>
              No Face Detected
            </div>
          )}
        </div>

        {/* IPD measurement display */}
        {pixelIPD && (
          <div className="absolute bottom-4 left-4 bg-black/70 text-white px-4 py-2 rounded-lg">
            <div className="text-xs text-gray-300">IPD Measurement</div>
            <div className="text-lg font-bold">{pixelIPD.toFixed(1)} pixels</div>
          </div>
        )}

        {/* Center guide circle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 border-4 border-dashed border-white/50 rounded-full flex items-center justify-center">
            <div className="text-white text-center bg-black/50 px-4 py-2 rounded-lg">
              <div className="text-sm">Position your face</div>
              <div className="text-xs text-gray-300">to fit this circle</div>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleCalibrate}
        disabled={!faceDetected || !pixelIPD}
        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {faceDetected ? 'Calibrate Distance' : 'Waiting for Face Detection...'}
      </button>
    </div>
  )

  const renderCalibrating = () => (
    <div className="text-center space-y-8">
      <div className="w-32 h-32 mx-auto bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
        <div className="text-6xl font-bold text-white">{countdown}</div>
      </div>
      <h2 className="text-3xl font-bold text-gray-900">Hold Still!</h2>
      <p className="text-lg text-gray-600">Calibrating in {countdown}...</p>
    </div>
  )

  const renderMonitoring = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">Distance Monitoring</h2>
        <p className="text-lg text-gray-600">
          Optimal distance for this test: <span className="font-bold text-purple-600">{optimalDistanceCM}cm</span>
        </p>
      </div>

      {/* Distance feedback bar */}
      {feedback && currentDistance ? (
        <div className={`border-4 ${feedback.borderColor} rounded-2xl p-6 ${feedback.bgColor} bg-opacity-10 transition-all duration-300`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className={`text-2xl font-bold ${feedback.textColor} mb-2`}>
                {feedback.message}
              </div>
              <div className="text-gray-700 text-lg">
                Current: <span className="font-bold">{Math.round(currentDistance / 10)}cm</span> | 
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

          {/* Visual distance bar */}
          <div className="mt-4">
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden relative">
              <div 
                className={`h-full ${feedback.bgColor} transition-all duration-300`}
                style={{ 
                  width: `${Math.min(100, Math.max(0, (currentDistance / (optimalDistance * 1.5)) * 100))}%` 
                }}
              ></div>
              <div 
                className="absolute top-0 w-1 h-full bg-purple-600"
                style={{ left: `${(optimalDistance / (optimalDistance * 1.5)) * 100}%` }}
              ></div>
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
            <p className="text-lg font-medium mb-2">Measuring distance...</p>
            <p className="text-sm">Make sure your face is visible to the camera</p>
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
            className="absolute top-0 left-0 w-full h-full mirror"
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
