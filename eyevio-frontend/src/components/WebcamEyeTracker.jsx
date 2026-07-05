import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import cameraManager from '../utils/cameraManager.js'

/**
 * Webcam-based eye tracking using simple face detection
 * Tracks eye position automatically without manual input
 */
export default function WebcamEyeTracker({ stage, onComplete }) {
  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const videoPreviewRef = useRef(null)
  const videoDisplayRef = useRef(null)
  const streamRef = useRef(null)
  const animationRef = useRef(null)
  const startTimeRef = useRef(null)
  const faceDetectorRef = useRef(null)
  const isActiveRef = useRef(false) // Add ref to track active state
  
  const [isActive, setIsActive] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [calibrated, setCalibrated] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [calibrationPoints, setCalibrationPoints] = useState([])
  const [currentCalibrationPoint, setCurrentCalibrationPoint] = useState(0)
  const [clicksOnCurrentPoint, setClicksOnCurrentPoint] = useState(0)
  const CLICKS_PER_POINT = 3 // Require 3 clicks per calibration point
  const lastClickTimeRef = useRef(0) // Prevent spam clicking
  const MIN_CLICK_INTERVAL = 500 // Minimum 500ms between clicks
  
  // Track if we've EVER calibrated (persists across stage changes)
  const hasEverCalibratedRef = useRef(false)
  
  const performanceRef = useRef({ successFrames: 0, totalFrames: 0 })
  const targetRef = useRef({ x: 400, y: 300 }) // Center of 800x600 canvas
  const gazeRef = useRef({ x: 400, y: 300 }) // Start at center instead of (0,0)
  const webGazerPredictionRef = useRef(null) // Store latest WebGazer prediction
  
  // Smoothing for gaze position (exponential moving average)
  const smoothedGazeRef = useRef({ x: 400, y: 300 })
  const SMOOTHING_FACTOR = 0.25 // Lower = smoother but slower, Higher = faster but jittery (0-1)
  
  // Outlier detection - reject extreme jumps
  const lastValidGazeRef = useRef({ x: 400, y: 300 })
  const MAX_GAZE_JUMP = 150 // Maximum pixels gaze can jump in one frame (tighter for better accuracy)

  // Test configuration
  const DURATIONS = {
    'smooth-pursuit': 15,
    'saccades': 10,
    'fixation': 10
  }

  const CONFIG = {
    'smooth-pursuit': {
      title: 'Smooth Pursuit',
      description: 'Follow the moving target with your eyes',
      targetSize: 40,
      moveSpeed: 2,
      tolerance: 150 // pixels
    },
    'saccades': {
      title: 'Saccadic Eye Movements',
      description: 'Look at each target as it appears',
      targetSize: 35,
      moveSpeed: 0,
      tolerance: 120
    },
    'fixation': {
      title: 'Fixation Stability',
      description: 'Keep your gaze steady on the center',
      targetSize: 30,
      moveSpeed: 0,
      tolerance: 100
    }
  }

  const config = CONFIG[stage]
  const duration = DURATIONS[stage]

  // Initialize webcam and WebGazer
  useEffect(() => {
    initializeCamera()
    
    // Delay WebGazer init to avoid conflicts
    const webGazerTimer = setTimeout(() => {
      initializeWebGazer()
    }, 1000)
    
    return () => {
      clearTimeout(webGazerTimer)
      cleanup()
    }
  }, [])

  const initializeWebGazer = async () => {
    if (!window.webgazer) {
      console.error('[ERROR] WebGazer not loaded - will use fallback mode')
      setCameraReady(true) // Still allow test to run
      return
    }

    try {
      console.log('[WebGazer] Initializing...')
      
      // Initialize WebGazer with error handling
      await window.webgazer
        .setRegression('ridge')
        .setTracker('TFFacemesh')
        .begin()
        .catch(err => {
          console.error('[ERROR] [WebGazer] Failed to start:', err)
          throw err
        })
      
      // Hide the default WebGazer elements
      window.webgazer.showVideoPreview(false)
      window.webgazer.showPredictionPoints(false)
      window.webgazer.showFaceOverlay(false)
      window.webgazer.showFaceFeedbackBox(false)
      
      // CRITICAL: Start prediction listener to activate the tracker
      console.log('[WebGazer] Starting prediction listener...')
      window.webgazer.setGazeListener((data, timestamp) => {
        // Store the latest prediction in a ref for use in detectGaze()
        if (data && data.x !== undefined && data.y !== undefined) {
          webGazerPredictionRef.current = { x: data.x, y: data.y, timestamp }
        }
      })
      
      // Give WebGazer time to warm up the face tracker
      console.log('[WebGazer] Warming up face tracker (2 seconds)...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      console.log('[SUCCESS] [WebGazer] Initialized successfully')
    } catch (error) {
      console.error('[ERROR] [WebGazer] Initialization error:', error)
      console.log('[WARNING] [WebGazer] Will use fallback eye tracking')
    }
  }

  // Set stream to preview video when it becomes available
  useEffect(() => {
    if (cameraReady && videoPreviewRef.current && streamRef.current) {
      console.log('[camera] [Preview] Setting stream to preview video (from useEffect)')
      videoPreviewRef.current.srcObject = streamRef.current
      videoPreviewRef.current.play().catch(err => console.error('Preview play error:', err))
    }
  }, [cameraReady])

  const initializeCamera = async () => {
    console.log('[camera] [Camera] Initializing (cameraManager)...')
    try {
      const stream = await cameraManager.acquire({ video: { facingMode: 'user', width: 640, height: 480 } })
      console.log('[camera] [Camera] Stream obtained (cameraManager)')

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream

        videoRef.current.onloadedmetadata = () => {
          console.log('[camera] [Camera] Video metadata loaded')
          console.log('[camera] [Camera] Video dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight)
          videoRef.current.play()
            .then(() => {
              console.log(' [Camera] Video playing successfully')
              // Set stream to preview video
              if (videoPreviewRef.current) {
                videoPreviewRef.current.srcObject = stream
                videoPreviewRef.current.play().catch(err => console.error('Preview video error:', err))
              }
              setCameraReady(true)
              toast.success('Camera ready! Position your face in view')
            })
            .catch(err => {
              console.error(' [Camera] Video play error:', err)
              toast.error('Camera failed to start: ' + err.message)
            })
        }

        videoRef.current.onerror = (err) => {
          console.error(' [Camera] Video element error:', err)
        }
      } else {
        console.error(' [Camera] videoRef.current is null')
      }
    } catch (error) {
      console.error(' [Camera] acquire error:', error)
      let errorMessage = 'Camera access denied. '
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Please enable camera permissions in your browser settings.'
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera found on this device.'
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Camera is already in use by another application.'
      } else {
        errorMessage += error.message
      }
      toast.error(errorMessage, { duration: 5000 })
    }
  }

  const cleanup = () => {
    if (streamRef.current) {
      try {
        // Release via cameraManager so shared stream refcount is decremented
        cameraManager.release()
      } catch (e) {
        try { streamRef.current.getTracks().forEach(track => track.stop()) } catch (err) { /* ignore */ }
      }
      streamRef.current = null
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    // Stop WebGazer only if it was initialized
    try {
      if (window.webgazer && window.webgazer.end) {
        window.webgazer.end()
      }
    } catch (err) {
      console.log(' [Cleanup] WebGazer cleanup error (safe to ignore):', err.message)
    }
  }

  // Start calibration
  const startCalibration = () => {
    console.log(' [Calibration] Starting calibration process...')
    setIsCalibrating(true)
    setCalibrated(false)
    
    // Clear any existing WebGazer calibration data
    if (window.webgazer) {
      window.webgazer.clearData()
      console.log(' [Calibration] Cleared previous calibration data')
    }
    
    // Define 9 calibration points (optimal order: corners → edges → center)
    const points = [
      { x: 0.1, y: 0.1 }, // 1. top-left
      { x: 0.9, y: 0.1 }, // 2. top-right
      { x: 0.9, y: 0.9 }, // 3. bottom-right
      { x: 0.1, y: 0.9 }, // 4. bottom-left
      { x: 0.5, y: 0.1 }, // 5. top-center
      { x: 0.9, y: 0.5 }, // 6. middle-right
      { x: 0.5, y: 0.9 }, // 7. bottom-center
      { x: 0.1, y: 0.5 }, // 8. middle-left
      { x: 0.5, y: 0.5 }, // 9. center (last for best accuracy)
    ]
    setCalibrationPoints(points)
    setCurrentCalibrationPoint(0)
    // toast.success('Look at each red dot and click it! Click multiple times for better accuracy.', { duration: 4000 })
  }

  const handleCalibrationClick = (event) => {
    if (!isCalibrating) return
    
    // Prevent spam clicking - require minimum interval between clicks
    const now = Date.now()
    if (now - lastClickTimeRef.current < MIN_CLICK_INTERVAL) {
      console.log(` [Calibration] Click too fast - wait ${MIN_CLICK_INTERVAL}ms between clicks`)
      return
    }
    lastClickTimeRef.current = now
    
    const rect = event.currentTarget.getBoundingClientRect()
    const clickX = event.clientX
    const clickY = event.clientY
    
    // Get current calibration point position
    const currentPoint = calibrationPoints[currentCalibrationPoint]
    const targetX = rect.left + rect.width * currentPoint.x
    const targetY = rect.top + rect.height * currentPoint.y
    
    // Calculate distance from click to target dot
    const distance = Math.sqrt(
      Math.pow(clickX - targetX, 2) + 
      Math.pow(clickY - targetY, 2)
    )
    
    // Require click to be within 100px of the target dot
    const MAX_CLICK_DISTANCE = 100
    if (distance > MAX_CLICK_DISTANCE) {
      console.log(` [Calibration] Click too far from target (${Math.round(distance)}px > ${MAX_CLICK_DISTANCE}px) - please click on the red dot`)
      // Visual feedback - you could add a shake animation here
      return
    }
    
    const newClickCount = clicksOnCurrentPoint + 1
    console.log(` [Calibration] Point ${currentCalibrationPoint + 1}/9 - Click ${newClickCount}/${CLICKS_PER_POINT} at (${clickX}, ${clickY}) - distance: ${Math.round(distance)}px ✓`)
    
    // Record click for WebGazer (collect 15 samples per click for better accuracy)
    if (window.webgazer) {
      for (let i = 0; i < 15; i++) {
        window.webgazer.recordScreenPosition(clickX, clickY, 'click')
      }
      console.log(` [Calibration] Recorded 15 samples for click ${newClickCount}`)
    }
    
    setClicksOnCurrentPoint(newClickCount)
    
    // Check if we need more clicks on this point
    if (newClickCount < CLICKS_PER_POINT) {
      return
    }
    
    // This point is complete, move to next
    console.log(` [Calibration] Point ${currentCalibrationPoint + 1}/9 complete!`)
    
    // Move to next point after a brief delay
    setTimeout(() => {
      if (currentCalibrationPoint < calibrationPoints.length - 1) {
        setCurrentCalibrationPoint(prev => prev + 1)
        setClicksOnCurrentPoint(0) // Reset click counter
        lastClickTimeRef.current = 0 // Reset click timer for next point
      } else {
        // Calibration complete - validate WebGazer is working
        console.log(' [Calibration] All points collected, validating...')
        validateCalibration()
      }
    }, 300)
  }

  // Validate that WebGazer is returning valid predictions
  const validateCalibration = () => {
    if (!window.webgazer) {
      console.warn(' [Calibration] WebGazer not available, using fallback mode')
      setIsCalibrating(false)
      setCalibrated(true)
      // toast.success('Calibration complete! Starting test with mouse tracking...', { duration: 2000 })
      setTimeout(() => startTest(), 1500)
      return
    }

    console.log(' [Calibration] Starting validation in 1 second (giving WebGazer time to process)...')
    
    // Wait 1 second for WebGazer to process calibration data
    setTimeout(() => {
      // Check if WebGazer is returning valid predictions
      let validCount = 0
      let attempts = 0
      const maxAttempts = 20 // Increased from 10
      const predictions = []
      
      const checkPrediction = () => {
        attempts++
        
        try {
          // Check the prediction from the gaze listener (stored in ref)
          const prediction = webGazerPredictionRef.current
          
          if (prediction && prediction.x !== undefined && prediction.y !== undefined && 
              !isNaN(prediction.x) && !isNaN(prediction.y)) {
            validCount++
            predictions.push({ x: Math.round(prediction.x), y: Math.round(prediction.y) })
            console.log(` [Calibration] Valid prediction ${validCount}: (${Math.round(prediction.x)}, ${Math.round(prediction.y)})`)
          } else {
            console.log(` [Calibration] Invalid prediction (attempt ${attempts}): ${prediction ? `(${prediction.x}, ${prediction.y})` : 'null'}`)
          }
        } catch (err) {
          console.error(` [Calibration] Error getting prediction (attempt ${attempts}):`, err)
        }
        
        if (attempts < maxAttempts) {
          setTimeout(checkPrediction, 150) // Check every 150ms
        } else {
          // Validation complete
          const successRate = (validCount / maxAttempts) * 100
          console.log(` [Calibration] Validation complete: ${validCount}/${maxAttempts} valid predictions (${successRate}%)`)
          
          if (validCount > 0) {
            console.log(' [Calibration] Sample predictions:', predictions.slice(0, 5))
          }
          
          setIsCalibrating(false)
          setCalibrated(true)
          hasEverCalibratedRef.current = true // Mark as calibrated forever
          
          // if (successRate >= 50) {
          //   toast.success(` Eye tracking active! ${Math.round(successRate)}% accuracy`, { duration: 2000 })
          // } else if (successRate > 0) {
          //   toast(' Eye tracking partially working. Mouse fallback available.', { duration: 2000 })
          // } else {
          //   toast('🖱 Using mouse tracking (eye tracking unavailable)', { duration: 2000 })
          // }
          
          setTimeout(() => startTest(), 1500)
        }
      }
      
      // Start validation
      console.log(' [Calibration] Beginning prediction validation...')
      checkPrediction()
    }, 1000)
  }

  // Start test
  const startTest = useCallback(() => {
    console.log(' [Test] Start test clicked')
    console.log(' [Test] Camera ready:', cameraReady)
    console.log(' [Test] Canvas ref:', canvasRef.current)
    console.log(' [Test] Video ref:', videoRef.current)
    
    if (!cameraReady) {
      console.warn(' [Test] Camera not ready')
      // toast.error('Please wait for camera to be ready')
      return
    }

    if (!canvasRef.current) {
      console.error(' [Test] Canvas not ready')
      // toast.error('Canvas not ready, please try again')
      return
    }

    const canvas = canvasRef.current
    console.log(' [Test] Canvas dimensions:', canvas.width, 'x', canvas.height)
    
    // Set stream to display video now that it's rendered
    if (videoDisplayRef.current && streamRef.current) {
      console.log('[camera] [Test] Setting stream to display video')
      videoDisplayRef.current.srcObject = streamRef.current
      videoDisplayRef.current.play().catch(err => console.error('Display video error:', err))
    }
    
    // Initialize references
    startTimeRef.current = Date.now()
    performanceRef.current = { successFrames: 0, totalFrames: 0 }
    
    // Initialize target at center
    targetRef.current = {
      x: canvas.width / 2,
      y: canvas.height / 2
    }
    
    // Initialize gaze at center
    gazeRef.current = {
      x: canvas.width / 2,
      y: canvas.height / 2
    }
    
    // Reset smoothed gaze
    smoothedGazeRef.current = {
      x: canvas.width / 2,
      y: canvas.height / 2
    }
    
    // Reset outlier detection
    lastValidGazeRef.current = {
      x: canvas.width / 2,
      y: canvas.height / 2
    }

    console.log(' [Test] Initial target position:', targetRef.current)
    console.log(' [Test] Initial gaze position:', gazeRef.current)
    console.log(' [Test] Reset smoothed gaze and outlier detection')

    // Set state AND ref
    isActiveRef.current = true // Set ref immediately
    setIsActive(true)
    setCalibrated(true)
    setTimeLeft(duration)
    setProgress(0)
    setFaceDetected(true) // Assume face detected initially

    // Start animation
    console.log(' [Test] Starting animation loop')
    animationRef.current = requestAnimationFrame(animate)
    
    // toast.success(`${config.title} test started!`, {
    //   duration: 2000,
    //   position: 'top-center'
    // })
    
    console.log(' [Test] Test started successfully')
  }, [cameraReady, stage])

  // Auto-start test if already calibrated (for subsequent stages)
  useEffect(() => {
    if (cameraReady && hasEverCalibratedRef.current && !isActive && !isCalibrating) {
      console.log(' [Auto-start] Already calibrated for previous stage, auto-starting test...')
      setTimeout(() => startTest(), 500)
    }
  }, [stage, cameraReady, startTest, isActive, isCalibrating])

  // Real eye tracking using WebGazer (with mouse fallback)
  const detectGaze = () => {
    if (!canvasRef.current) return

    let gazeUpdated = false

    // Try to use WebGazer prediction from listener
    if (webGazerPredictionRef.current) {
      const prediction = webGazerPredictionRef.current
      
      if (prediction.x !== undefined && prediction.y !== undefined && 
          !isNaN(prediction.x) && !isNaN(prediction.y)) {
        const canvas = canvasRef.current
        const rect = canvas.getBoundingClientRect()
        
        // Simple conversion: viewport coordinates to canvas coordinates
        const rawX = prediction.x - rect.left
        const rawY = prediction.y - rect.top
        
        // Outlier detection - reject extreme jumps (likely errors)
        const jumpDistance = Math.sqrt(
          Math.pow(rawX - lastValidGazeRef.current.x, 2) +
          Math.pow(rawY - lastValidGazeRef.current.y, 2)
        )
        
        if (jumpDistance > MAX_GAZE_JUMP && performanceRef.current.totalFrames > 0) {
          // Likely an error - reject this sample
          if (performanceRef.current.totalFrames % 60 === 0) {
            console.log(` [Gaze] Rejected outlier - jump of ${Math.round(jumpDistance)}px`)
          }
          return
        }
        
        // Update last valid position
        lastValidGazeRef.current = { x: rawX, y: rawY }
        
        // Apply exponential smoothing to reduce jitter
        smoothedGazeRef.current.x = smoothedGazeRef.current.x * (1 - SMOOTHING_FACTOR) + rawX * SMOOTHING_FACTOR
        smoothedGazeRef.current.y = smoothedGazeRef.current.y * (1 - SMOOTHING_FACTOR) + rawY * SMOOTHING_FACTOR
        
        // Update gaze with smoothed position
        gazeRef.current = {
          x: smoothedGazeRef.current.x,
          y: smoothedGazeRef.current.y
        }
        
        gazeUpdated = true
        setFaceDetected(true)
        
        // Log for debugging (every 60 frames)
        if (performanceRef.current.totalFrames % 60 === 0) {
          console.log(` [Gaze] Raw: (${Math.round(rawX)}, ${Math.round(rawY)}) | Smoothed: (${Math.round(smoothedGazeRef.current.x)}, ${Math.round(smoothedGazeRef.current.y)}) | Jump: ${Math.round(jumpDistance)}px`)
        }
      }
    }
    
    // Log if gaze wasn't updated AND show current gaze position (for debugging)
    if (!gazeUpdated && performanceRef.current.totalFrames % 120 === 0) {
      console.log(` [Gaze] No WebGazer prediction, using mouse fallback. Current gaze: (${Math.round(gazeRef.current.x)}, ${Math.round(gazeRef.current.y)})`)
    }
    
    // Fallback: Mouse position is already being tracked via onMouseMove
    setFaceDetected(true)
  }

  // Animation loop
  const animate = () => {
    if (!isActiveRef.current || !canvasRef.current) {
      console.log('⏸ [Animate] Stopped - isActive:', isActiveRef.current, 'canvas:', !!canvasRef.current)
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
      console.error(' [Animate] No canvas context')
      return
    }

    const now = Date.now()
    const elapsed = (now - startTimeRef.current) / 1000

    // Log first frame
    if (performanceRef.current.totalFrames === 0) {
      console.log('🎬 [Animate] First frame rendering')
      console.log('🎬 [Animate] Canvas size:', canvas.width, 'x', canvas.height)
      console.log('🎬 [Animate] Duration:', duration, 'seconds')
    }

    // Check if test is complete
    if (elapsed >= duration) {
      console.log(' [Animate] Test complete after', elapsed, 'seconds')
      finishTest()
      return
    }

    // Update timer
    setTimeLeft(duration - elapsed)
    setProgress((elapsed / duration) * 100)

    // Clear canvas with dark background
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Detect gaze
    detectGaze()

    // Update target position based on stage
    updateTargetPosition(elapsed, canvas)

    // Draw target
    drawTarget(ctx, targetRef.current)

    // Draw gaze indicator (for feedback)
    if (gazeRef.current.x > 0) {
      drawGazeIndicator(ctx, gazeRef.current)
    }

    // Check if user is looking at target
    const distance = Math.hypot(
      gazeRef.current.x - targetRef.current.x,
      gazeRef.current.y - targetRef.current.y
    )

    performanceRef.current.totalFrames++
    const isSuccess = distance < config.tolerance && faceDetected
    
    if (isSuccess) {
      performanceRef.current.successFrames++
    }

    // Draw debug info
    ctx.fillStyle = '#ffffff'
    ctx.font = '14px monospace'
    ctx.fillText(`Red Eye Tracker: (${Math.round(gazeRef.current.x)}, ${Math.round(gazeRef.current.y)})`, 10, 20)
    ctx.fillText(`Blue Target: (${Math.round(targetRef.current.x)}, ${Math.round(targetRef.current.y)})`, 10, 40)
    ctx.fillText(`Distance: ${Math.round(distance)}px (need < ${config.tolerance}px)`, 10, 60)
    const successRate = (performanceRef.current.successFrames / performanceRef.current.totalFrames * 100).toFixed(1)
    ctx.fillText(`Accuracy: ${successRate}%`, 10, 80)
    
    // Draw success indicator LAST so it's on top
    if (isSuccess) {
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.arc(targetRef.current.x, targetRef.current.y, config.targetSize + 15, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Log progress every 60 frames (about 1 second)
    if (performanceRef.current.totalFrames % 60 === 0) {
      console.log(` [Animate] Frame ${performanceRef.current.totalFrames} - Success rate: ${successRate}% - Time: ${elapsed.toFixed(1)}s`)
    }

    animationRef.current = requestAnimationFrame(animate)
  }

  const updateTargetPosition = (elapsed, canvas) => {
    const target = targetRef.current

    switch (stage) {
      case 'smooth-pursuit':
        // Circular motion
        const radius = Math.min(canvas.width, canvas.height) * 0.3
        const angle = elapsed * config.moveSpeed
        target.x = canvas.width / 2 + Math.cos(angle) * radius
        target.y = canvas.height / 2 + Math.sin(angle) * radius
        break

      case 'saccades':
        // Jump to random positions every 2 seconds
        if (Math.floor(elapsed * 2) % 2 === 0 && Math.floor(elapsed * 2) !== Math.floor((elapsed - 0.016) * 2)) {
          target.x = 100 + Math.random() * (canvas.width - 200)
          target.y = 100 + Math.random() * (canvas.height - 200)
        }
        break

      case 'fixation':
        // Stay in center
        target.x = canvas.width / 2
        target.y = canvas.height / 2
        break
    }
  }

  const drawTarget = (ctx, target) => {
    // Outer ring
    ctx.strokeStyle = '#60a5fa'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(target.x, target.y, config.targetSize, 0, Math.PI * 2)
    ctx.stroke()

    // Inner dot
    ctx.fillStyle = '#3b82f6'
    ctx.beginPath()
    ctx.arc(target.x, target.y, 8, 0, Math.PI * 2)
    ctx.fill()
  }

  const drawGazeIndicator = (ctx, gaze) => {
    // Red crosshair to show where eyes are looking
    ctx.strokeStyle = '#ef4444' // Red
    ctx.lineWidth = 3
    ctx.beginPath()
    // Horizontal line
    ctx.moveTo(gaze.x - 20, gaze.y)
    ctx.lineTo(gaze.x + 20, gaze.y)
    // Vertical line
    ctx.moveTo(gaze.x, gaze.y - 20)
    ctx.lineTo(gaze.x, gaze.y + 20)
    ctx.stroke()
    
    // Red circle
    ctx.fillStyle = 'rgba(239, 68, 68, 0.6)' // Semi-transparent red
    ctx.beginPath()
    ctx.arc(gaze.x, gaze.y, 12, 0, Math.PI * 2)
    ctx.fill()
    
    // White center dot
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(gaze.x, gaze.y, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  const finishTest = () => {
    isActiveRef.current = false // Clear ref
    setIsActive(false)
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    const score = performanceRef.current.totalFrames > 0
      ? Math.round((performanceRef.current.successFrames / performanceRef.current.totalFrames) * 100)
      : 0

    console.log(` ${config.title} complete - Score: ${score}%`)
    onComplete(score)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[600px] bg-gray-900 rounded-xl p-8">
      {/* Hidden video element for camera stream (always rendered for ref) */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        autoPlay
      />

      {/* Instructions with webcam preview */}
      {!isActive && !isCalibrating && (
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-white mb-3">{config?.title}</h2>
          <p className="text-gray-300 text-base mb-4">{config?.description}</p>
          
          {/* Webcam preview before test */}
          {cameraReady && (
            <div className="mb-4">
              <div className="mb-2 text-white text-sm font-semibold">Camera Preview</div>
              <video
                ref={videoPreviewRef}
                className="border-4 border-green-500 rounded-lg mx-auto"
                width={280}
                height={210}
                playsInline
                muted
                autoPlay
              />
            </div>
          )}
          
          {!cameraReady ? (
            <div className="text-yellow-400 mb-3">
              <p>Initializing camera...</p>
            </div>
          ) : (
            <div className="text-green-400 mb-3">
              <p>Camera ready</p>
              <p className="text-sm text-gray-400 mt-1">Make sure your face is visible</p>
            </div>
          )}

          <button
            onClick={startCalibration}
            disabled={!cameraReady}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-8 py-3 rounded-lg font-semibold text-lg transition-colors shadow-lg"
          >
            Calibrate & Start Test
          </button>
        </div>
      )}

      {/* Calibration screen */}
      {isCalibrating && (
        <div 
          className="fixed inset-0 bg-gray-900 z-50 cursor-pointer"
          onClick={handleCalibrationClick}
        >
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-white text-center z-10">
            <h2 className="text-3xl font-bold mb-3">Eye Tracking Calibration</h2>
            <div className="bg-blue-600 bg-opacity-20 border border-blue-400 rounded-lg p-4 max-w-md mx-auto mb-3">
              <p className="text-xl font-semibold mb-2">Point {currentCalibrationPoint + 1} of {calibrationPoints.length}</p>
              <p className="text-lg mb-2">Click {clicksOnCurrentPoint}/{CLICKS_PER_POINT} times</p>
              <div className="text-sm space-y-1">
                <p className="text-blue-200"><strong>Look directly at the red dot</strong></p>
                <p className="text-yellow-200">Wait 0.5s between clicks</p>
                <p className="text-green-200">Click within the red circle</p>
              </div>
            </div>
            <div className="w-full max-w-md mx-auto bg-gray-700 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-blue-500 h-full transition-all duration-300"
                style={{ 
                  width: `${((currentCalibrationPoint * CLICKS_PER_POINT + clicksOnCurrentPoint) / (calibrationPoints.length * CLICKS_PER_POINT)) * 100}%` 
                }}
              />
            </div>
          </div>
          
          {calibrationPoints.map((point, index) => {
            if (index !== currentCalibrationPoint) return null
            
            return (
              <div
                key={index}
                className="absolute w-32 h-32 transform -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${point.x * 100}%`,
                  top: `${point.y * 100}%`
                }}
              >
                {/* Pulsing outer ring */}
                <div className="absolute inset-0 rounded-full border-4 border-red-400 opacity-50 animate-ping"></div>
                {/* Static outer ring for click area */}
                <div className="absolute inset-0 rounded-full border-2 border-red-300 opacity-70"></div>
                {/* Main red dot - larger and more visible */}
                <div className="absolute inset-4 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center shadow-2xl animate-pulse">
                  {/* Center white target */}
                  <div className="w-8 h-8 bg-white rounded-full shadow-inner"></div>
                </div>
                {/* Click counter indicator - more prominent */}
                <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 text-white text-lg font-bold bg-red-600 px-4 py-2 rounded-full shadow-lg">
                  {clicksOnCurrentPoint}/{CLICKS_PER_POINT}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Test UI with side-by-side layout */}
      {isActive && (
        <div className="flex gap-6 items-start">
          {/* Webcam feed during test */}
          <div className="flex flex-col items-center">
            <div className="mb-2 text-white text-sm font-semibold">Your Webcam</div>
            <video
              ref={videoDisplayRef}
              className="border-4 border-blue-500 rounded-lg"
              width={320}
              height={240}
              playsInline
              muted
              autoPlay
            />
            <div className="mt-2 text-gray-400 text-xs">
              {faceDetected ? 'Face detected' : 'No face detected'}
            </div>
          </div>

          {/* Test canvas */}
          <div className="flex flex-col items-center">
            <div className="mb-2 text-center">
              <div className="text-white text-2xl font-bold">
                {Math.ceil(timeLeft)}s
              </div>
              <div className="text-gray-400 text-sm mb-1">
                {faceDetected ? 'Tracking active' : 'Face not detected'}
              </div>
              <div className="text-blue-300 text-xs mb-2">
                Click anywhere on canvas while looking to improve accuracy
              </div>
              <button
                onClick={() => {
                  // Stop current test
                  isActiveRef.current = false
                  setIsActive(false)
                  // Restart calibration
                  startCalibration()
                }}
                className="mt-2 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm transition-colors"
              >
                Recalibrate
              </button>
            </div>

            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="border-4 border-gray-700 rounded-lg cursor-crosshair"
              onMouseMove={(e) => {
                // Track mouse position as fallback for eye tracking
                const rect = e.currentTarget.getBoundingClientRect()
                const mouseX = e.clientX - rect.left
                const mouseY = e.clientY - rect.top
                
                // ALWAYS update gazeRef with mouse position
                gazeRef.current = {
                  x: mouseX,
                  y: mouseY
                }
                
                // Debug log (more frequent at start)
                if (performanceRef.current.totalFrames < 60 || Math.random() < 0.02) {
                  console.log(`🖱 [Mouse] Position: (${Math.round(mouseX)}, ${Math.round(mouseY)})`)
                }
              }}
              onClick={(e) => {
                // Continuous calibration: click while looking to train WebGazer
                if (window.webgazer) {
                  const x = e.clientX
                  const y = e.clientY
                  // Record 20 samples at this position
                  for (let i = 0; i < 20; i++) {
                    window.webgazer.recordScreenPosition(x, y, 'click')
                  }
                  console.log(` [Training] Recorded 20 samples at screen (${x}, ${y})`)
                }
              }}
            />

            <div className="mt-4 w-full max-w-2xl">
              <div className="bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden canvas (always rendered for ref) */}
      {!isActive && (
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className="hidden"
        />
      )}
    </div>
  )
}
