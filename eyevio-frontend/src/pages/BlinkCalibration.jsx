import { useState, useRef, useEffect } from 'react'
import cameraManager from '../utils/cameraManager.js'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Eye, Check, AlertCircle, RefreshCw } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { calibrationAPI } from '../services/api'

const CalibrationSteps = {
  WELCOME: 'welcome',
  BASELINE: 'baseline',
  BLINK: 'blink',
  PROCESSING: 'processing',
  RESULTS: 'results',
  TEST: 'test'
}

export default function BlinkCalibration() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(CalibrationSteps.WELCOME)
  const [baselineSamples, setBaselineSamples] = useState(0)
  const [blinkSamples, setBlinkSamples] = useState(0)
  const [calibrationResult, setCalibrationResult] = useState(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState(null)
  const [testBlinkCount, setTestBlinkCount] = useState(0)
  const [cameraReady, setCameraReady] = useState(false)
  
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const captureIntervalRef = useRef(null)
  const isFinalizingRef = useRef(false)
  const testBlinkStateRef = useRef({ previousEyesClosed: false, blinkInProgress: false })

  // Start webcam
  const startWebcam = async () => {
    try {
      console.log('Requesting webcam access (cameraManager)...')
      const stream = await cameraManager.acquire({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        } 
      })
      
      console.log('Webcam access granted, stream:', stream)
      streamRef.current = stream
      
      // Wait for video element to be available (may not be mounted yet)
      const waitForVideoElement = async (retries = 10) => {
        for (let i = 0; i < retries; i++) {
          if (videoRef.current) {
            console.log('Video element found')
            return true
          }
          console.log(`Waiting for video element... attempt ${i + 1}/${retries}`)
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        return false
      }
      
      const videoAvailable = await waitForVideoElement()
      
      if (videoAvailable && videoRef.current) {
        videoRef.current.srcObject = stream
        console.log('Stream set to video element')
        
        // Wait for metadata to load
        videoRef.current.onloadedmetadata = async () => {
          console.log('Video metadata loaded')
          try {
            await videoRef.current.play()
            console.log('Video playing successfully')
            setCameraReady(true)
            toast.success('Camera activated!')
          } catch (playErr) {
            console.error('Play error:', playErr)
            setError(`Failed to start video: ${playErr.message}`)
          }
        }
      } else {
        console.error('Video ref not available after waiting')
        setError('Video element not found - please try again')
  // Stop the stream since we can't use it
  try { cameraManager.release() } catch (e) { try { stream.getTracks().forEach(track => track.stop()) } catch (err) {} }
      }
    } catch (err) {
      console.error('Webcam error:', err)
      setError(`Cannot access webcam: ${err.message}. Please allow camera access.`)
      toast.error('Camera access denied')
    }
  }

  // Stop webcam
  const stopWebcam = () => {
    if (streamRef.current) {
      try { cameraManager.release() } catch (e) { try { streamRef.current.getTracks().forEach(track => track.stop()) } catch (err) {} }
      streamRef.current = null
    }
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current)
      captureIntervalRef.current = null
    }
  }

  // Capture frame as base64
  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) {
      console.log('captureFrame: Missing video or canvas ref')
      return null
    }
    
    const canvas = canvasRef.current
    const video = videoRef.current
    
    // Check if video has valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.log('captureFrame: Video dimensions are 0')
      return null
    }
    
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    console.log('captureFrame: Captured frame, length:', dataUrl.length)
    return dataUrl
  }

  // Start calibration
  const handleStartCalibration = async () => {
    try {
      console.log('=== Starting calibration session ===')
      
      // Reset finalization flag
      isFinalizingRef.current = false
      
      const response = await calibrationAPI.start()
      
      console.log('Calibration session started:', response.data)
      
      // Move to baseline step
      setCurrentStep(CalibrationSteps.BASELINE)
      
      // Wait for React to render the video element before starting webcam
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Start webcam - baseline collection will start automatically when camera is ready
      await startWebcam()
      
    } catch (err) {
      toast.error('Failed to start calibration')
      console.error('Start calibration error:', err.response?.data || err.message)
      setError('Failed to start calibration: ' + (err.response?.data?.error || err.message))
    }
  }

  // Auto-start baseline collection when camera becomes ready
  useEffect(() => {
    if (cameraReady && currentStep === CalibrationSteps.BASELINE && !captureIntervalRef.current) {
      console.log('Camera ready, starting baseline collection')
      setTimeout(() => startBaselineCollection(), 500)
    }
  }, [cameraReady, currentStep])

  // Auto-start blink collection when camera becomes ready in BLINK step
  useEffect(() => {
    if (cameraReady && currentStep === CalibrationSteps.BLINK && !captureIntervalRef.current) {
      console.log('Camera ready in BLINK step, starting blink collection')
      // Reset blink samples when starting Step 2
      setBlinkSamples(0)
      setTimeout(() => startBlinkCollection(), 500)
    }
  }, [cameraReady, currentStep])

  // Ensure video stream persists when changing steps
  useEffect(() => {
    const reconnectStream = async () => {
      // Reset camera ready state when step changes
      setCameraReady(false)
      
      // Wait a bit for the new video element to mount
      await new Promise(resolve => setTimeout(resolve, 200))
      
      if (streamRef.current && videoRef.current) {
        console.log('Step changed to:', currentStep)
        console.log('Video element exists:', !!videoRef.current)
        console.log('Stream exists:', !!streamRef.current)
        console.log('Video has srcObject:', !!videoRef.current.srcObject)
        
        const waitForMetadata = () => {
          return new Promise((resolve) => {
            const checkDimensions = () => {
              const width = videoRef.current?.videoWidth || 0
              const height = videoRef.current?.videoHeight || 0
              console.log('Checking video dimensions:', width, 'x', height)
              
              if (width > 0 && height > 0) {
                console.log('Video metadata loaded successfully')
                resolve()
              } else {
                console.log('Waiting for video metadata...')
                videoRef.current.onloadedmetadata = () => {
                  console.log('onloadedmetadata fired, dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight)
                  // Wait a bit more to ensure dimensions are truly ready
                  setTimeout(() => {
                    console.log('After delay, dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight)
                    resolve()
                  }, 100)
                }
              }
            }
            
            // Small delay before checking to ensure element is fully mounted
            setTimeout(checkDimensions, 100)
          })
        }
        
        if (!videoRef.current.srcObject) {
          console.log('Reconnecting stream to video element for step:', currentStep)
          videoRef.current.srcObject = streamRef.current
          
          try {
            await videoRef.current.play()
            console.log('Video playing after reconnect')
            await waitForMetadata()
            setCameraReady(true)
          } catch (err) {
            console.error('Play error on reconnect:', err)
            setCameraReady(false)
          }
        } else {
          console.log('Video already has stream')
          try {
            await videoRef.current.play()
            await waitForMetadata()
            setCameraReady(true)
          } catch (err) {
            console.error('Error ensuring video plays:', err)
            setCameraReady(false)
          }
        }
      } else {
        console.log('Missing requirements - Stream:', !!streamRef.current, 'Video:', !!videoRef.current)
        // Retry after a delay
        setTimeout(() => reconnectStream(), 200)
      }
    }
    
    if (currentStep === CalibrationSteps.BASELINE || currentStep === CalibrationSteps.BLINK) {
      reconnectStream()
    }
  }, [currentStep])


  // Baseline collection (eyes open)
  const startBaselineCollection = () => {
    setIsCapturing(true)
    let sampleCount = 0
    const maxSamples = 150 // 5 seconds at 30fps
    
    captureIntervalRef.current = setInterval(async () => {
      const frame = captureFrame()
      if (!frame) {
        console.log('Baseline: Skipping frame (null or invalid)')
        return
      }
      
      if (frame === 'data:,') {
        console.log('Baseline: Skipping empty frame')
        return
      }
      
      try {
        const response = await calibrationAPI.submitBaseline({ frame })
        
        sampleCount = response.data.samples_collected
        setBaselineSamples(sampleCount)
        
        if (sampleCount >= maxSamples) {
          clearInterval(captureIntervalRef.current)
          captureIntervalRef.current = null
          setIsCapturing(false)
          toast.success('Baseline collected! Now blink 3 times slowly.')
          setCurrentStep(CalibrationSteps.BLINK)
          // Don't call startBlinkCollection here - let the useEffect handle it after camera reconnects
        }
      } catch (err) {
        console.error('Baseline capture error:', err.response?.data || err.message)
        
        // Check if session was lost
        if (err.response?.data?.error === 'No active calibration session') {
          console.log('Session lost during baseline! Restarting calibration...')
          clearInterval(captureIntervalRef.current)
          captureIntervalRef.current = null
          setIsCapturing(false)
          toast.error('Session lost. Please restart calibration.')
          setError('Calibration session expired. Please restart from the beginning.')
          setCurrentStep(CalibrationSteps.WELCOME)
        }
      }
    }, 33) // ~30fps
  }

  // Blink collection - count complete blinks, not frames
  const startBlinkCollection = () => {
    setIsCapturing(true)
    
    // Track blink state
    let blinkState = {
      previousEyesClosed: false,
      blinkInProgress: false,
      blinkCount: 0
    }
    
    captureIntervalRef.current = setInterval(async () => {
      // Check if we're already finalizing or interval was cleared
      if (!captureIntervalRef.current || isFinalizingRef.current) {
        console.log('Blink: Already finalizing or interval cleared, stopping')
        return
      }
      
      const frame = captureFrame()
      if (!frame) {
        console.log('Blink: Skipping frame (null or invalid)')
        return
      }
      
      if (frame === 'data:,') {
        console.log('Blink: Skipping empty frame')
        return
      }
      
      try {
        const response = await calibrationAPI.submitBlink({ frame })
        
        const ear = response.data.avg_ear
        const eyesClosed = ear < 0.20
        
        // Detect complete blink: eyes close then open
        if (eyesClosed && !blinkState.previousEyesClosed) {
          // Eyes just closed - blink started
          blinkState.blinkInProgress = true
          console.log(' Eyes CLOSED - blink started')
        } else if (!eyesClosed && blinkState.previousEyesClosed && blinkState.blinkInProgress) {
          // Eyes just opened - complete blink detected!
          blinkState.blinkInProgress = false
          blinkState.blinkCount++
          
          console.log(` BLINK ${blinkState.blinkCount} detected!`)
          setBlinkSamples(blinkState.blinkCount) // Show blink count, not backend samples
          toast.success(`Blink ${blinkState.blinkCount} detected!`)
          
          // Check if we have enough blinks (5 blinks minimum for good calibration)
          if (blinkState.blinkCount >= 5 && !isFinalizingRef.current) {
            console.log('Reached 5 blinks, finalizing...')
            isFinalizingRef.current = true
            clearInterval(captureIntervalRef.current)
            captureIntervalRef.current = null
            setIsCapturing(false)
            setTimeout(() => finalizeCalibration(), 100)
          }
        }
        
        blinkState.previousEyesClosed = eyesClosed
        
      } catch (err) {
        console.error('Blink capture error:', err.response?.data || err.message)
        
        // Check if session was lost
        if (err.response?.data?.error === 'No active calibration session') {
          console.log('Session lost! Restarting calibration...')
          clearInterval(captureIntervalRef.current)
          captureIntervalRef.current = null
          setIsCapturing(false)
          toast.error('Session lost. Please restart calibration from Step 1.')
          setError('Calibration session expired. Please restart from the beginning.')
          setCurrentStep(CalibrationSteps.WELCOME)
          return
        }
        
        if (err.response?.status === 400) {
          console.log('400 error - likely eyes not detected or invalid frame')
        }
      }
    }, 33)
  }

  // Finalize calibration
  const finalizeCalibration = async () => {
    console.log('=== Starting finalization ===')
    console.log('Blink samples collected:', blinkSamples)
    
    setCurrentStep(CalibrationSteps.PROCESSING)
    
    try {
      console.log('Calling finalize endpoint...')
      const response = await calibrationAPI.finalize()
      
      console.log('Finalize response:', response.data)
      
      if (response.data.success) {
        setCalibrationResult(response.data)
        // Mark as calibrated
        localStorage.setItem('blink_calibrated', 'true')
        localStorage.setItem('blink_threshold', response.data.threshold)
        toast.success('Calibration successful! Redirecting to webcam analysis...')
        
        // Navigate directly to eye tracking analysis
        setTimeout(() => {
          navigate('/eye-tracking-analysis')
        }, 1500)
      } else {
        console.error('Finalize failed:', response.data.error)
        setError(response.data.error || 'Calibration failed')
        toast.error('Calibration failed')
      }
    } catch (err) {
      console.error('=== Finalization error ===')
      console.error('Error message:', err.message)
      console.error('Error response:', err.response)
      console.error('Full error:', err)
      setError('Failed to finalize calibration: ' + (err.response?.data?.error || err.message))
      toast.error('Failed to finalize calibration')
    }
  }

  // Start test
  const startTest = () => {
    setCurrentStep(CalibrationSteps.TEST)
    setTestBlinkCount(0)
  }

  // Auto-start test blink detection when entering TEST step
  useEffect(() => {
    if (currentStep === CalibrationSteps.TEST && !captureIntervalRef.current) {
      console.log('=== TEST STEP DETECTED ===')
      console.log('Current interval:', captureIntervalRef.current)
      console.log('Will start test detection in 500ms...')
      setTimeout(() => {
        console.log('Timeout fired, calling startTestBlinkDetection')
        startTestBlinkDetection()
      }, 500)
    }
    
    // Cleanup on unmount or step change
    return () => {
      if (captureIntervalRef.current && currentStep !== CalibrationSteps.TEST) {
        console.log('Cleaning up test interval')
        clearInterval(captureIntervalRef.current)
        captureIntervalRef.current = null
      }
    }
  }, [currentStep])

  // Test blink detection - simple approach using frame analysis
  const startTestBlinkDetection = () => {
    // Reset state
    testBlinkStateRef.current = { previousEyesClosed: false, blinkInProgress: false }
    
    // Get threshold from calibrationResult or localStorage
    const threshold = calibrationResult?.threshold || parseFloat(localStorage.getItem('blink_threshold')) || 0.15
    
    console.log('=== Test detection started ===')
    console.log('Calibration result:', calibrationResult)
    console.log('Using threshold:', threshold)
    
    if (!threshold || threshold === 0.15) {
      console.warn(' Using default threshold 0.15 - calibration may not have completed!')
    }
    
    let frameCount = 0
    
    captureIntervalRef.current = setInterval(async () => {
      frameCount++
      const frame = captureFrame()
      if (!frame || frame === 'data:,') {
        if (frameCount % 10 === 0) console.log('Test: No valid frame (attempt', frameCount, ')')
        return
      }
      
      try {
        // Send frame to test endpoint
        const response = await calibrationAPI.test({ frame })
        
        // Check if eyes are closed based on EAR
        const ear = response.data?.ear
        const threshold = response.data?.threshold
        
        if (ear === undefined || ear === null) {
          console.log('No EAR value in response')
          return
        }
        
        const eyesClosed = ear < threshold
        const state = testBlinkStateRef.current
        
        console.log('EAR:', ear?.toFixed(3), '| Threshold:', threshold?.toFixed(3), '| Closed:', eyesClosed, '| Previous:', state.previousEyesClosed)
        
        // Detect complete blink: eyes close (transition to closed) then open (transition to open)
        if (eyesClosed && !state.previousEyesClosed) {
          // Eyes just closed
          console.log(' Eyes CLOSED - blink started')
          state.blinkInProgress = true
        } else if (!eyesClosed && state.previousEyesClosed && state.blinkInProgress) {
          // Eyes just opened - complete blink!
          console.log(' Eyes OPENED - BLINK COMPLETE!')
          state.blinkInProgress = false
          setTestBlinkCount(prev => {
            const newCount = prev + 1
            console.log(' Test blink detected! Count:', newCount)
            toast.success(`Blink ${newCount} detected!`)
            if (newCount >= 5) {
              clearInterval(captureIntervalRef.current)
              captureIntervalRef.current = null
              toast.success('Test complete! Calibration saved.')
            }
            return newCount
          })
        }
        
        state.previousEyesClosed = eyesClosed
      } catch (err) {
        console.error('Test blink detection error:', err.response?.data || err.message)
      }
    }, 100) // 10fps
  }

  // Restart calibration
  const restartCalibration = () => {
    stopWebcam()
    setCurrentStep(CalibrationSteps.WELCOME)
    setBaselineSamples(0)
    setBlinkSamples(0)
    setCalibrationResult(null)
    setError(null)
    setTestBlinkCount(0)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebcam()
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Eye className="w-10 h-10 text-teal-600" />
            <h1 className="text-4xl font-bold text-gray-800">Blink Calibration</h1>
          </div>
          <p className="text-gray-600">Personalize blink detection for accurate results</p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Persistent video - positioned to show in video feed areas */}
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="hidden"
            id="persistent-calibration-video"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: -1
            }}
          />
          <canvas ref={canvasRef} className="hidden" />
          
          <AnimatePresence mode="wait">
            {/* Welcome Step */}
            {currentStep === CalibrationSteps.WELCOME && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-center space-y-6"
              >
                <Camera className="w-24 h-24 mx-auto text-teal-500" />
                <h2 className="text-2xl font-bold text-gray-800">
                  Let's Calibrate Your Blink Detection
                </h2>
                <p className="text-gray-600 max-w-2xl mx-auto">
                  This quick 30-second process will learn your unique eye characteristics
                  to provide accurate blink counting. You'll need to:
                </p>
                
                <div className="grid md:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
                  <div className="bg-teal-50 p-4 rounded-lg">
                    <h3 className="font-semibold text-teal-800 mb-2">Step 1: Baseline</h3>
                    <p className="text-sm text-gray-700">
                      Look at the camera normally with eyes open for 5 seconds
                    </p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="font-semibold text-blue-800 mb-2">Step 2: Blink</h3>
                    <p className="text-sm text-gray-700">
                      Perform 10 slow, deliberate blinks when prompted
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleStartCalibration}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
                >
                  Start Calibration
                </button>
              </motion.div>
            )}

            {/* Baseline Step */}
            {currentStep === CalibrationSteps.BASELINE && (
              <motion.div
                key="baseline"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    Step 1: Baseline Collection
                  </h2>
                  <p className="text-gray-600">
                    Look at the camera normally. Keep your eyes open.
                  </p>
                </div>

                {/* Video Feed */}
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                  {/* Display video with same stream */}
                  <video
                    ref={(el) => {
                      if (el && streamRef.current && !el.srcObject) {
                        console.log('Setting stream to Baseline display video')
                        el.srcObject = streamRef.current
                        el.play().catch(e => console.error('Baseline display video play error:', e))
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Camera Status Indicator */}
                  {!cameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
                        <p className="text-white text-lg">Initializing camera...</p>
                        <p className="text-gray-400 text-sm mt-2">Please allow camera access if prompted</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Progress Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                    <div className="mb-2">
                      <div className="flex justify-between text-white text-sm mb-1">
                        <span>{cameraReady ? 'Collecting baseline...' : 'Waiting for camera...'}</span>
                        <span>{baselineSamples}/150 samples</span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-teal-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${(baselineSamples / 150) * 100}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Blink Step */}
            {currentStep === CalibrationSteps.BLINK && (
              <motion.div
                key="blink"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    Step 2: Blink Collection
                  </h2>
                  <p className="text-gray-600">
                    Blink slowly and deliberately 3 times
                  </p>
                </div>

                {/* Video Feed */}
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                  {/* Display video with same stream */}
                  <video
                    ref={(el) => {
                      if (el && streamRef.current && !el.srcObject) {
                        console.log('Setting stream to Blink display video')
                        el.srcObject = streamRef.current
                        el.play().catch(e => console.error('Blink display video play error:', e))
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Camera Status Indicator */}
                  {!cameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
                        <p className="text-white text-lg">Initializing camera...</p>
                        <p className="text-gray-400 text-sm mt-2">Please allow camera access if prompted</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Blink Counter */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className="bg-black/70 backdrop-blur-sm rounded-2xl p-8 text-center">
                      <p className="text-white text-sm mb-2">Blinks Detected</p>
                      <p className="text-6xl font-bold text-teal-400">{blinkSamples}/5</p>
                      <p className="text-gray-300 text-xs mt-2">Keep blinking slowly</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Processing Step */}
            {currentStep === CalibrationSteps.PROCESSING && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-center py-12"
              >
                <RefreshCw className="w-16 h-16 mx-auto text-teal-600 animate-spin mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  Processing Calibration...
                </h2>
                <p className="text-gray-600">
                  Calculating your personalized threshold
                </p>
              </motion.div>
            )}

            {/* Results Step */}
            {currentStep === CalibrationSteps.RESULTS && calibrationResult && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-12 h-12 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    Calibration Successful!
                  </h2>
                  <p className="text-gray-600">
                    Your personalized blink detection is ready
                  </p>
                </div>

                {/* Results Grid */}
                <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  <div className="bg-teal-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 mb-1">Your Threshold</p>
                    <p className="text-3xl font-bold text-teal-700">
                      {calibrationResult.threshold}
                    </p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 mb-1">Confidence</p>
                    <p className="text-3xl font-bold text-blue-700 capitalize">
                      {calibrationResult.confidence}
                    </p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 mb-1">Baseline EAR</p>
                    <p className="text-2xl font-bold text-purple-700">
                      {calibrationResult.baseline_mean}
                    </p>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 mb-1">Blink EAR</p>
                    <p className="text-2xl font-bold text-orange-700">
                      {calibrationResult.blink_mean}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={startTest}
                    className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                  >
                    Test It Now
                  </button>
                  <button
                    onClick={restartCalibration}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors"
                  >
                    Recalibrate
                  </button>
                </div>
              </motion.div>
            )}

            {/* Test Step */}
            {currentStep === CalibrationSteps.TEST && (
              <motion.div
                key="test"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    Test Your Calibration
                  </h2>
                  <p className="text-gray-600">
                    Blink 5 times to test accuracy
                  </p>
                </div>
                
                {/* Video Feed */}
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                  {/* Display video with same stream */}
                  <video
                    ref={(el) => {
                      if (el && streamRef.current && !el.srcObject) {
                        console.log('Setting stream to Test display video')
                        el.srcObject = streamRef.current
                        el.play().catch(e => console.error('Test display video play error:', e))
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Blink Counter Overlay */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className="bg-black/70 backdrop-blur-sm rounded-2xl p-12 text-center">
                      <p className="text-white text-sm mb-2">Blinks Detected</p>
                      <p className="text-7xl font-bold text-teal-400">{testBlinkCount}/5</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => navigate('/eye-tracking-analysis')}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors w-full"
                >
                  Go to Eye Tracking Analysis
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Display */}
          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800">Error</p>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
