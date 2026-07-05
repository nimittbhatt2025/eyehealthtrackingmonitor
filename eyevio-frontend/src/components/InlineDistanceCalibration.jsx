import { useState, useEffect, useRef } from 'react'
import * as faceapi from '@vladmandic/face-api'
import distanceCalibration from '../utils/distanceCalibration'
import modelManager from '../utils/modelManager'
import cameraManager from '../utils/cameraManager'

/**
 * Distance Gate Component
 * Blocks test from starting until user is at correct distance
 * Test-specific distances based on clinical standards
 */

export default function InlineDistanceCalibration({ 
  testType = 'default',
  optimalDistanceMM = 500,
  toleranceMM = 100, // ±10cm tolerance by default
  onDistanceValid, // Called when user reaches correct distance
  onDistanceInvalid, // Called when user moves out of range
  blockUntilValid = true, // Whether to block test until distance is valid
  testName = 'This Test'
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const detectionIntervalRef = useRef(null)
  const initializingRef = useRef(false) // Prevent double initialization
  const cameraReadyRef = useRef(false) // Track camera state for interval
  const calibratedRef = useRef(false) // Track if we've calibrated (prevents recalibration)

  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [currentDistance, setCurrentDistance] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [isCalibrating, setIsCalibrating] = useState(true)
  const [calibrated, setCalibrated] = useState(false)
  const [isValidDistance, setIsValidDistance] = useState(false)
  const [validDurationCount, setValidDurationCount] = useState(0) // Stable for 2 seconds before proceeding
  const [loadingError, setLoadingError] = useState(null)

  const optimalDistanceCM = Math.round(optimalDistanceMM / 10)
  const minDistance = optimalDistanceMM - toleranceMM
  const maxDistance = optimalDistanceMM + toleranceMM

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!modelsLoaded || !cameraReady) {
        console.error('⏱️ Loading timeout - taking too long')
        setLoadingError('Loading is taking longer than expected. Please check console for errors.')
      }
    }, 15000) // 15 second timeout

    initCalibration()
    
    return () => {
      clearTimeout(timeoutId)
      stopCamera()
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current)
      }
    }
  }, [])

  // Re-assign stream when transitioning from loading to main view
  useEffect(() => {
    if (cameraReady && modelsLoaded && videoRef.current && streamRef.current) {
      console.log('🔄 Checking video stream assignment after state transition')
      
      // If video element doesn't have the stream, assign it
      if (videoRef.current.srcObject !== streamRef.current) {
        console.log('📺 Re-assigning stream to video element')
        videoRef.current.srcObject = streamRef.current
        videoRef.current.autoplay = true
        videoRef.current.muted = true
        videoRef.current.playsInline = true
        
        // Force play
        videoRef.current.play()
          .then(() => console.log('[OK] Video playing after re-assignment'))
          .catch(err => console.warn('[WARNING] Play failed after re-assignment:', err.message))
      } else {
        console.log('[OK] Video stream already assigned correctly')
      }
    }
  }, [cameraReady, modelsLoaded])

  // Track when user maintains valid distance (for UI feedback only)
  useEffect(() => {
    let timer
    if (isValidDistance) {
      // Increment every 100ms when at valid distance
      timer = setInterval(() => {
        setValidDurationCount(prev => prev + 1)
      }, 100)
    } else {
      setValidDurationCount(0)
      if (onDistanceInvalid) {
        onDistanceInvalid()
      }
    }
    
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isValidDistance, onDistanceInvalid])

  // Helper to set camera ready (updates both state and ref)
  const activateCamera = () => {
    console.log('[camera] Activating camera')
    cameraReadyRef.current = true
    setCameraReady(true)
    startFaceDetection()
  }

  const initCalibration = async () => {
    if (initializingRef.current) {
      console.log('[WARNING] Already initializing, skipping...')
      return
    }
    
    initializingRef.current = true
    
    try {
      console.log('🔄 Starting distance calibration initialization...')
      
      try {
        await modelManager.loadFaceAPIModels('/models')
        setModelsLoaded(true)
        console.log('📹 Starting camera...')
        startCamera()
      } catch (err) {
        console.error('[X] Model loading failed in initCalibration:', err)
        setLoadingError(`Model load failed: ${err.message}`)
        initializingRef.current = false
        return
      }
    } catch (error) {
      console.error('[X] Failed to initialize calibration:', error)
      console.error('Error details:', error.message, error.stack)
      setLoadingError(`Failed to load: ${error.message}`)
      initializingRef.current = false
    }
  }

  const startCamera = async () => {
    try {
      console.log('📹 Requesting camera access (via cameraManager)...')
      const stream = await cameraManager.acquire({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
      console.log('[OK] Camera access granted (shared stream)')
      console.log('📺 Video element exists?', !!videoRef.current)
      
      if (!videoRef.current) {
        console.error('[X] Video element ref is null!')
        setLoadingError('Video element not ready')
        return
      }
      
      console.log('[OK] Video element found, setting up stream...')
      
      // Store stream in ref immediately
  streamRef.current = stream
      
      // Assign stream to video element
      videoRef.current.srcObject = stream
      
      // Force autoplay and muted
      videoRef.current.autoplay = true
      videoRef.current.muted = true
      videoRef.current.playsInline = true
      
      console.log('🎬 Video element configured, waiting for ready state...')
      
      // Force play immediately
      const playPromise = videoRef.current.play()
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('[OK] Video playing immediately')
          })
          .catch(err => {
            console.warn('[WARNING] Immediate play failed:', err.message)
          })
      }
      
      // Add multiple event listeners as fallback
      videoRef.current.onloadedmetadata = () => {
        console.log('[OK] Video metadata loaded (onloadedmetadata)')
        if (!cameraReadyRef.current) {
          activateCamera()
        }
      }
      
      videoRef.current.oncanplay = () => {
        console.log('[OK] Video can play (oncanplay)')
        if (!cameraReadyRef.current) {
          activateCamera()
        }
      }
      
      // Immediate fallback
      setTimeout(async () => {
        console.log('⏰ 500ms timeout - checking video state...')
        if (!videoRef.current) {
          console.error('[X] Video ref lost!')
          return
        }
        
        console.log('Video readyState:', videoRef.current.readyState)
        console.log('Video paused:', videoRef.current.paused)
        
        try {
          await videoRef.current.play()
          console.log('[OK] Video playing via timeout')
          
          if (videoRef.current.readyState >= 1 && !cameraReadyRef.current) {
            console.log('[OK] Video ready - activating camera (500ms)')
            activateCamera()
          }
        } catch (err) {
          console.warn('[WARNING] Play failed:', err.message)
        }
      }, 500)
      
      // Additional fallback after 1 second
      setTimeout(() => {
        if (!cameraReadyRef.current && videoRef.current) {
          console.log('[OK] Force activating camera (1s fallback)')
          console.log('Video readyState:', videoRef.current.readyState)
          console.log('Video paused:', videoRef.current.paused)
          console.log('Video dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight)
          
          // Force play again
          videoRef.current.play().catch(e => console.warn('Play error:', e.message))
          
          activateCamera()
        } else if (!videoRef.current) {
          console.error('[X] Video ref lost after 1s!')
        }
      }, 1000)
    } catch (error) {
      console.error('[X] Camera access denied or error:', error)
      console.error('Error details:', error.message, error.name)
      setLoadingError(`Camera error: ${error.message}`)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    cameraReadyRef.current = false
    setCameraReady(false)
  }

  const startFaceDetection = () => {
    if (detectionIntervalRef.current) {
      console.log('[WARNING] Face detection already running')
      return
    }
    console.log('[target] Starting face detection interval')
    detectionIntervalRef.current = setInterval(async () => {
      await detectFace()
    }, 100)
  }

  const detectFace = async () => {
    if (!videoRef.current || !canvasRef.current || !cameraReadyRef.current) {
      if (!videoRef.current) console.warn('detectFace: No video ref')
      if (!canvasRef.current) console.warn('detectFace: No canvas ref')
      if (!cameraReadyRef.current) console.warn('detectFace: Camera not ready')
      return
    }

    // Check if video has valid dimensions
    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      console.warn('detectFace: Video dimensions not ready:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight)
      return
    }

    try {
      const detections = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }))
        .withFaceLandmarks()

      const canvas = canvasRef.current
      const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight }
      faceapi.matchDimensions(canvas, displaySize)
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (detections) {
        if (!faceDetected) {
          console.log('[OK] Face detected! IPD pixels:', detections.landmarks ? 'landmarks present' : 'no landmarks')
        }
        setFaceDetected(true)
        
        const landmarks = detections.landmarks.positions
        const leftEyePoints = landmarks.slice(36, 42)
        const rightEyePoints = landmarks.slice(42, 48)
        
        const leftEyeCenter = {
          x: leftEyePoints.reduce((sum, p) => sum + p.x, 0) / leftEyePoints.length,
          y: leftEyePoints.reduce((sum, p) => sum + p.y, 0) / leftEyePoints.length
        }
        
        const rightEyeCenter = {
          x: rightEyePoints.reduce((sum, p) => sum + p.x, 0) / rightEyePoints.length,
          y: rightEyePoints.reduce((sum, p) => sum + p.y, 0) / rightEyePoints.length
        }
        
        const measuredIPD = Math.sqrt(
          Math.pow(rightEyeCenter.x - leftEyeCenter.x, 2) +
          Math.pow(rightEyeCenter.y - leftEyeCenter.y, 2)
        )
        
        // Calibrate ONCE on first face detection using estimated focal constant
        if (!calibratedRef.current) {
          // For 640x480 webcam, focal constant is typically 500-700
          // Higher values = appears closer, lower = appears farther
          // 600 is a good middle ground
          const estimatedFocalConstant = 600
          console.log(`📏 One-time calibration with focal constant: ${estimatedFocalConstant}`)
          
          // Calculate what distance this IPD measurement represents
          const initialDistance = (estimatedFocalConstant * 63) / measuredIPD
          console.log(`📐 Initial distance: ${Math.round(initialDistance)}mm (IPD: ${measuredIPD.toFixed(1)}px)`)
          
          // Do one-time calibration
          distanceCalibration.calibrate(measuredIPD, initialDistance)
          calibratedRef.current = true
          setCalibrated(true)
          setIsCalibrating(false)
          console.log('[OK] Calibration complete - now tracking distance')
        }
        
        // Calculate distance (only after calibration)
        if (calibratedRef.current) {
          const distance = distanceCalibration.getDistance(measuredIPD)
          setCurrentDistance(distance)
          
          const fb = distanceCalibration.getDistanceFeedback(distance, testType)
          setFeedback(fb)
          
          // Check if distance is within valid range
          const valid = distance >= minDistance && distance <= maxDistance
          setIsValidDistance(valid)
        }
      } else {
        // Log occasionally when no face detected (every 50 attempts = 5 seconds)
        if (Math.random() < 0.02) {
          console.log('👤 No face detected - make sure your face is visible and well-lit')
        }
        setFaceDetected(false)
        setIsValidDistance(false)
      }
    } catch (error) {
      console.error('[X] Face detection error:', error)
      console.error('Error details:', error.message, error.stack)
    }
  }

  if (!modelsLoaded || !cameraReady) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-2xl p-8">
        {/* Hidden video element for camera initialization */}
        <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '640px', height: '480px' }} />
          <canvas ref={canvasRef} style={{ width: '640px', height: '480px' }} />
        </div>
        
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent"></div>
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Loading Distance Calibration...</h3>
            <p className="text-sm text-gray-600 mb-2">Initializing camera and AI models</p>
            {loadingError && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 font-medium mb-2">[WARNING] Error Loading</p>
                <p className="text-xs text-red-600">{loadingError}</p>
                <button
                  onClick={() => {
                    setLoadingError(null)
                    setModelsLoaded(false)
                    setCameraReady(false)
                    initializingRef.current = false
                    initCalibration()
                  }}
                  className="mt-3 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                >
                  Retry
                </button>
                <p className="text-xs text-gray-500 mt-3">
                  Check browser console (F12) for detailed logs
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Distance Calibration Required</h2>
        <p className="text-lg text-gray-600">
          {testName} requires you to be <span className="font-bold text-purple-600">{optimalDistanceCM}cm</span> from the screen
        </p>
      </div>

      {/* Video preview */}
      <div className="relative bg-gray-900 rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: '400px' }}>
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
            <div className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-full shadow-lg">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
              Face Detected
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-full shadow-lg">
              <div className="w-3 h-3 bg-white rounded-full"></div>
              No Face Detected
            </div>
          )}
        </div>

        {/* Distance overlay - blocks view if invalid */}
        {blockUntilValid && !isValidDistance && faceDetected && (
          <div className="absolute inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center text-white p-8">
              <svg className="w-20 h-20 mx-auto mb-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-2xl font-bold mb-2">Adjust Your Distance</h3>
              <p className="text-lg">Move {feedback?.action === 'move-back' ? 'BACK' : 'CLOSER'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Distance feedback */}
      {feedback && currentDistance ? (
        <div className={`border-4 ${feedback.borderColor} rounded-2xl p-6 ${feedback.bgColor} bg-opacity-20 transition-all duration-300`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <div className={`text-2xl font-bold ${feedback.textColor} mb-2`}>
                {feedback.message}
              </div>
              <div className="text-gray-700 text-lg">
                Current: <span className="font-bold">{Math.round(currentDistance / 10)}cm</span> | 
                Target: <span className="font-bold">{optimalDistanceCM}cm</span>
                {' '}(±{Math.round(toleranceMM / 10)}cm)
              </div>
            </div>
            <div className={`w-20 h-20 ${feedback.bgColor} rounded-full flex items-center justify-center flex-shrink-0 shadow-lg`}>
              {isValidDistance ? (
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

          {/* Progress bar */}
          {isValidDistance && (
            <div className="mt-4">
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${(validDurationCount / 20) * 100}%` }}
                ></div>
              </div>
              <p className="text-sm text-center text-gray-600 mt-2">
                {validDurationCount >= 20 
                  ? '✓ Distance stable - ready to continue' 
                  : `Hold steady for ${Math.max(0, Math.ceil((20 - validDurationCount) / 10))}s...`
                }
              </p>
            </div>
          )}

          {/* Continue button - only shows when stable at correct distance */}
          {isValidDistance && validDurationCount >= 20 && (
            <div className="mt-6">
              <button
                onClick={() => {
                  if (onDistanceValid) {
                    onDistanceValid(true)
                  }
                }}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-3"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Distance Confirmed - Begin Test
              </button>
            </div>
          )}

          {/* Visual distance scale */}
          <div className="mt-6">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden relative">
              <div 
                className={`h-full ${feedback.bgColor} transition-all duration-300`}
                style={{ 
                  width: `${Math.min(100, Math.max(0, (currentDistance / (optimalDistanceMM * 2)) * 100))}%` 
                }}
              ></div>
              {/* Target marker */}
              <div 
                className="absolute top-0 w-1 h-full bg-purple-600 shadow-lg"
                style={{ left: `${(optimalDistanceMM / (optimalDistanceMM * 2)) * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>Too close</span>
              <span className="font-bold text-purple-600">Target: {optimalDistanceCM}cm</span>
              <span>Too far</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-4 border-gray-300 rounded-2xl p-8 bg-gray-50">
          <div className="text-center text-gray-600">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <p className="text-lg font-medium mb-2">Position your face in the camera</p>
            <p className="text-sm">Make sure your face is fully visible</p>
          </div>
        </div>
      )}
    </div>
  )
}
