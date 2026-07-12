import { useState, useEffect, useRef, useCallback } from 'react'
import * as faceapi from '@vladmandic/face-api'
import distanceCalibration from '../utils/distanceCalibration'
import modelManager from '../utils/modelManager'
import cameraManager from '../utils/cameraManager'
import voiceRecognition from '../utils/voiceRecognition'
import { VisionTestShell } from './TestPrepLayout'

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
  testName = 'This Test',
  splitLayout = false,
  voiceConfirm = false,
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
  const [voiceConfirmListening, setVoiceConfirmListening] = useState(false)

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

  const handleDistanceConfirmed = useCallback(() => {
    voiceRecognition.stop()
    setVoiceConfirmListening(false)
    if (onDistanceValid) {
      onDistanceValid(true)
    }
  }, [onDistanceValid])

  // Voice command to confirm distance when user is far from screen
  useEffect(() => {
    if (!voiceConfirm || !voiceRecognition.isSupported()) return undefined
    if (!isValidDistance || validDurationCount < 20) {
      voiceRecognition.stop()
      setVoiceConfirmListening(false)
      return undefined
    }

    const started = voiceRecognition.start(
      (transcript) => {
        if (voiceRecognition.parseConfirmCommand(transcript)) {
          handleDistanceConfirmed()
        }
      },
      () => setVoiceConfirmListening(false)
    )
    setVoiceConfirmListening(started)

    return () => {
      voiceRecognition.stop()
      setVoiceConfirmListening(false)
    }
  }, [voiceConfirm, isValidDistance, validDurationCount, handleDistanceConfirmed])

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
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current)
      detectionIntervalRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    streamRef.current = null

    try {
      cameraManager.release()
    } catch (error) {
      console.warn('stopCamera: release failed', error)
    }

    cameraReadyRef.current = false
    setCameraReady(false)
    initializingRef.current = false
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

  const renderVideoPreview = () => (
    <div className="relative bg-gray-900 rounded-xl overflow-hidden w-full h-full min-h-[220px]">
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

      <div className="absolute top-3 right-3">
        {faceDetected ? (
          <div className="flex items-center gap-2 bg-green-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            Face detected
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg">
            <div className="w-2 h-2 bg-white rounded-full" />
            No face
          </div>
        )}
      </div>

      {blockUntilValid && !isValidDistance && faceDetected && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center text-white p-4">
            <h3 className="text-lg font-bold mb-1">Adjust your distance</h3>
            <p className="text-sm">Move {feedback?.action === 'move-back' ? 'back' : 'closer'}</p>
          </div>
        </div>
      )}
    </div>
  )

  const renderControlsPanel = () => (
    <>
      {feedback && currentDistance ? (
        <div className={`border-2 ${feedback.borderColor} rounded-xl p-4 ${feedback.bgColor} bg-opacity-20`}>
          <div className={`text-lg font-bold ${feedback.textColor} mb-1`}>
            {feedback.message}
          </div>
          <div className="text-gray-700 text-sm">
            Current: <span className="font-bold">{Math.round(currentDistance / 10)}cm</span>
            {' · '}
            Target: <span className="font-bold">{optimalDistanceCM}cm</span>
            {' '}(±{Math.round(toleranceMM / 10)}cm)
          </div>

          {isValidDistance && (
            <div className="mt-3">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${(validDurationCount / 20) * 100}%` }}
                />
              </div>
              <p className="text-xs text-center text-gray-600 mt-1.5">
                {validDurationCount >= 20
                  ? 'Distance stable'
                  : `Hold steady ${Math.max(0, Math.ceil((20 - validDurationCount) / 10))}s…`}
              </p>
            </div>
          )}

          {isValidDistance && validDurationCount >= 20 && (
            <div className="mt-4 space-y-2">
              {voiceConfirm && voiceRecognition.isSupported() && (
                <div className="text-xs bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-indigo-900">
                  {voiceConfirmListening ? (
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      Say <strong>&quot;ready&quot;</strong> or <strong>&quot;continue&quot;</strong> to begin
                    </span>
                  ) : (
                    'Voice confirm starting… allow microphone if prompted'
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={handleDistanceConfirmed}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg min-h-[44px]"
              >
                Distance confirmed — begin test
              </button>
            </div>
          )}

          <div className="mt-4">
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden relative">
              <div
                className={`h-full ${feedback.bgColor} transition-all duration-300`}
                style={{
                  width: `${Math.min(100, Math.max(0, (currentDistance / (optimalDistanceMM * 2)) * 100))}%`,
                }}
              />
              <div
                className="absolute top-0 w-0.5 h-full bg-purple-600"
                style={{ left: `${(optimalDistanceMM / (optimalDistanceMM * 2)) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Too close</span>
              <span className="font-bold text-purple-600">{optimalDistanceCM}cm</span>
              <span>Too far</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-2 border-gray-200 rounded-xl p-6 bg-gray-50 text-center text-gray-600">
          <p className="font-medium mb-1">Position your face in the camera</p>
          <p className="text-sm">Keep your face visible and well lit</p>
        </div>
      )}

      {splitLayout && voiceConfirm && (
        <p className="text-xs text-gray-500">
          You will stand about {optimalDistanceCM}cm away — use voice commands so you do not need to return to the screen.
        </p>
      )}
    </>
  )

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
                    calibratedRef.current = false
                    setCalibrated(false)
                    setIsCalibrating(true)
                    stopCamera()
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

  if (splitLayout) {
    return (
      <VisionTestShell
        title="Distance calibration"
        subtitle={`${testName} — stand ${optimalDistanceCM}cm (${Math.round(optimalDistanceMM / 25.4)}″) from the screen`}
        stimulus={renderVideoPreview()}
        controls={renderControlsPanel()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Distance Calibration Required</h2>
        <p className="text-lg text-gray-600">
          {testName} requires you to be <span className="font-bold text-purple-600">{optimalDistanceCM}cm</span> from the screen
        </p>
      </div>

      {renderVideoPreview()}

      {renderControlsPanel()}
    </div>
  )
}
