import { useState, useEffect, useCallback, useRef } from 'react'
import cameraManager from '../utils/cameraManager.js'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import SamdDisclaimer from '../components/SamdDisclaimer'
import StableLightingPreview from '../utils/stableLightingPreview'
import { getLightingUiCopy } from '../utils/photoLightingCheck'

/**
 * Ocular Ergonomics AI - Ambient Monitor
 * 
 * Real-time posture & lighting analysis to prevent myopia progression
 * and reduce eye strain from poor viewing conditions
 * 
 * Monitors: Screen-to-Room Glare, Viewing Distance, Posture
 */

const OcularErgonomicsMonitor = () => {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const sampleInterval = useRef(null)
  const durationInterval = useRef(null)
  const alertTimeout = useRef(null)
  const lastAlertAt = useRef({})
  const alertCountsRef = useRef({ info: 0, warning: 0, critical: 0 })
  const lightingPreviewRef = useRef(null)
  const rollingAmbientRef = useRef([])
  const rollingDistanceRef = useRef([])

  const [lightingStatus, setLightingStatus] = useState('checking')
  const [lightingMessage, setLightingMessage] = useState('')
  const [distanceBandLabel, setDistanceBandLabel] = useState('Checking distance…')

  const [monitoringState, setMonitoringState] = useState('instructions') // instructions, setup, monitoring, paused
  const [cameraReady, setCameraReady] = useState(false)
  const [monitoringDuration, setMonitoringDuration] = useState(0) // seconds
  const [sampleCount, setSampleCount] = useState(0)
  const [lastSampleAt, setLastSampleAt] = useState(null)

  const SESSION_GOAL_SECONDS = 60
  
  // Environmental metrics
  const [ambientLight, setAmbientLight] = useState(0) // 0-255
  const [screenBrightness, setScreenBrightness] = useState(0) // 0-255
  const [glareLevel, setGlareLevel] = useState('optimal') // optimal, acceptable, poor, severe
  const [viewingDistance, setViewingDistance] = useState(0) // cm
  const [postureStatus, setPostureStatus] = useState('good') // good, leaning, too-close
  
  // Alert history
  const [alerts, setAlerts] = useState([])
  const [totalAlerts, setTotalAlerts] = useState(0)
  const [currentAlert, setCurrentAlert] = useState(null)
  
  // Session stats
  const [sessionStart, setSessionStart] = useState(null)
  const [ergonomicsScore, setErgonomicsScore] = useState(100)
  const [recommendations, setRecommendations] = useState([])

  // Thresholds
  const OPTIMAL_DISTANCE_MIN = 50 // cm
  const OPTIMAL_DISTANCE_MAX = 70 // cm
  const GLARE_THRESHOLD = 0.3 // ratio (legacy ambient ratio helper)

  const DISTANCE_BAND_LABELS = {
    good: 'Good distance',
    leaning: 'A bit close',
    'too-close': 'Too close',
    'too-far': 'Too far',
    unknown: 'Checking distance…',
  }

  const pushRolling = (arr, value, max = 5) => {
    const next = [...arr, value].slice(-max)
    return next
  }

  const rollingMean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

  useEffect(() => {
    lightingPreviewRef.current = new StableLightingPreview()
  }, [])

  const mapLightingToGlare = (status) => {
    if (status === 'extreme_problem') return 'severe'
    if (status === 'framing_problem') return 'poor'
    if (status === 'normal') return 'optimal'
    return 'acceptable'
  }
  const TOO_CLOSE_THRESHOLD = 35 // cm

  const bindStreamToVideo = useCallback(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    if (video.srcObject !== stream) {
      video.srcObject = stream
    }
    const play = () => {
      video.play().then(() => setCameraReady(true)).catch(() => {})
    }
    if (video.readyState >= 2) play()
    else video.onloadedmetadata = play
  }, [])

  // Initialize camera
  const initializeCamera = useCallback(async () => {
    try {
      const stream = await cameraManager.acquire({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })

      streamRef.current = stream
      bindStreamToVideo()
    } catch (err) {
      console.error('Camera access denied:', err)
    }
  }, [bindStreamToVideo])

  const clearTimers = useCallback(() => {
    if (sampleInterval.current) {
      clearInterval(sampleInterval.current)
      sampleInterval.current = null
    }
    if (durationInterval.current) {
      clearInterval(durationInterval.current)
      durationInterval.current = null
    }
    if (alertTimeout.current) {
      clearTimeout(alertTimeout.current)
      alertTimeout.current = null
    }
  }, [])

  // Stop camera
  const stopCamera = useCallback(() => {
    clearTimers()
    if (streamRef.current) {
      try { cameraManager.release() } catch (e) { try { streamRef.current.getTracks().forEach(track => track.stop()) } catch (err) {} }
      streamRef.current = null
    }
    setCameraReady(false)
  }, [clearTimers])

  const videoIsLive = () => {
    const video = videoRef.current
    return Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0)
  }

  // Measure ambient light from camera
  const measureAmbientLight = useCallback(() => {
    if (!videoIsLive() || !canvasRef.current) return null

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    // Average brightness across frame
    let totalBrightness = 0
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
      totalBrightness += brightness
    }

    return totalBrightness / (data.length / 4)
  }, [])

  // Estimate screen brightness (simplified - using system API would be better)
  const estimateScreenBrightness = useCallback(() => {
    // In a real app, you'd use Screen Brightness API or system calls
    // For now, we'll estimate based on white area detection
    
    // Create a hidden white div and measure its perceived brightness
    const testDiv = document.createElement('div')
    testDiv.style.position = 'absolute'
    testDiv.style.width = '100px'
    testDiv.style.height = '100px'
    testDiv.style.backgroundColor = 'white'
    testDiv.style.top = '-1000px'
    document.body.appendChild(testDiv)
    
    // Simplified: assume screen is at ~70% brightness (placeholder)
    const estimatedBrightness = 180
    
    document.body.removeChild(testDiv)
    return estimatedBrightness
  }, [])

  // Calculate glare level
  const calculateGlare = useCallback((ambient, screen) => {
    // Glare occurs when screen is much brighter than ambient light
    const ratio = screen / (ambient + 1) // +1 to avoid division by zero
    
    if (ratio < 2) return 'optimal' // Screen and room balanced
    if (ratio < 3) return 'acceptable' // Slight glare
    if (ratio < 5) return 'poor' // Noticeable glare
    return 'severe' // Excessive glare
  }, [])

  // Measure viewing distance using face size
  const measureViewingDistance = useCallback(() => {
    if (!videoIsLive() || !canvasRef.current) return null

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const faceWidth = estimateFaceWidth(imageData)
    if (!faceWidth || faceWidth < 20) return null

    // Average face width is ~14cm
    // Using simple pinhole camera model: distance = (realWidth * focalLength) / pixelWidth
    // Calibration factor for typical webcam
    const CALIBRATION_FACTOR = 3000
    const distance = CALIBRATION_FACTOR / (faceWidth + 1)

    return Math.max(20, Math.min(150, distance)) // Clamp to reasonable range
  }, [])

  // Estimate face width in pixels
  const estimateFaceWidth = (imageData) => {
    const data = imageData.data
    const width = imageData.width
    const height = imageData.height

    // Detect skin tones in center region
    let leftmost = width
    let rightmost = 0
    
    const centerY = Math.floor(height * 0.4)
    const searchHeight = Math.floor(height * 0.3)

    for (let y = centerY; y < centerY + searchHeight; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        
        // Simple skin tone detection
        if (r > 95 && g > 40 && b > 20 && r > g && r > b) {
          if (x < leftmost) leftmost = x
          if (x > rightmost) rightmost = x
        }
      }
    }

    return rightmost - leftmost
  }

  // Assess posture
  const assessPosture = useCallback((distance) => {
    if (distance < TOO_CLOSE_THRESHOLD) return 'too-close'
    if (distance < OPTIMAL_DISTANCE_MIN) return 'leaning'
    if (distance > OPTIMAL_DISTANCE_MAX) return 'too-far'
    return 'good'
  }, [])

  // Generate alert (throttled per type so the UI stays readable)
  const generateAlert = useCallback((type, message, severity) => {
    const now = Date.now()
    if (now - (lastAlertAt.current[type] || 0) < 12000) return
    lastAlertAt.current[type] = now

    const alert = {
      id: now,
      type,
      message,
      severity, // info, warning, critical
      timestamp: new Date().toISOString()
    }

    setAlerts(prev => [alert, ...prev].slice(0, 50)) // Keep last 50
    setTotalAlerts(prev => prev + 1)
    if (severity === 'critical') alertCountsRef.current.critical += 1
    else if (severity === 'warning') alertCountsRef.current.warning += 1
    else alertCountsRef.current.info += 1
    setCurrentAlert(alert)

    // Auto-dismiss after 10 seconds
    if (alertTimeout.current) clearTimeout(alertTimeout.current)
    alertTimeout.current = setTimeout(() => {
      setCurrentAlert(null)
    }, 10000)

    // Update ergonomics score
    setErgonomicsScore(prev => Math.max(0, prev - (severity === 'critical' ? 5 : severity === 'warning' ? 2 : 1)))
  }, [])

  const takeSample = useCallback(async () => {
    bindStreamToVideo()
    if (!videoIsLive() || !canvasRef.current) return

    try {
      const preview = lightingPreviewRef.current
      if (preview) {
        const ui = await preview.sample(videoRef.current, canvasRef.current)
        if (ui) {
          setLightingStatus(ui.status || 'checking')
          setLightingMessage(ui.message || getLightingUiCopy(ui.status)?.message || '')
          setGlareLevel(mapLightingToGlare(ui.status))
          if (ui.status === 'extreme_problem') {
            generateAlert('glare', ui.message || 'Lighting is too uneven for comfortable viewing.', 'critical')
          } else if (ui.status === 'framing_problem') {
            generateAlert('glare', ui.message || 'Face framing affects lighting read — center your face.', 'warning')
          }
        }
      }

      const ambient = measureAmbientLight()
      if (ambient != null) {
        rollingAmbientRef.current = pushRolling(rollingAmbientRef.current, ambient)
        const avgAmbient = rollingMean(rollingAmbientRef.current)
        setAmbientLight(Math.round(avgAmbient))
        setLastSampleAt(Date.now())
        setSampleCount((prev) => prev + 1)
      }

      const distance = measureViewingDistance()
      if (distance != null) {
        rollingDistanceRef.current = pushRolling(rollingDistanceRef.current, distance)
        const avgDistance = rollingMean(rollingDistanceRef.current)
        const posture = assessPosture(avgDistance)
        setViewingDistance(Math.round(avgDistance))
        setPostureStatus(posture)
        setDistanceBandLabel(DISTANCE_BAND_LABELS[posture] || DISTANCE_BAND_LABELS.unknown)

        if (posture === 'too-close') {
          generateAlert('distance', 'You are too close to the screen. Sit back to a comfortable arm’s length.', 'critical')
        } else if (posture === 'leaning') {
          generateAlert('distance', 'You are a little close. Sit back if you can.', 'warning')
        } else if (posture === 'too-far') {
          generateAlert('distance', 'You may be sitting too far from the screen.', 'warning')
        }
      }
    } catch (err) {
      console.warn('Ergonomics sample skipped:', err)
    }
  }, [bindStreamToVideo, measureAmbientLight, measureViewingDistance, assessPosture, generateAlert])

  const beginTimers = useCallback(() => {
    clearTimers()
    takeSample()
    sampleInterval.current = setInterval(takeSample, 2000)
    durationInterval.current = setInterval(() => {
      setMonitoringDuration((prev) => prev + 1)
    }, 1000)
  }, [clearTimers, takeSample])

  // Start monitoring
  const startMonitoring = useCallback(() => {
    rollingAmbientRef.current = []
    rollingDistanceRef.current = []
    alertCountsRef.current = { info: 0, warning: 0, critical: 0 }
    if (lightingPreviewRef.current) lightingPreviewRef.current.reset()
    setMonitoringState('monitoring')
    setSessionStart(Date.now())
    setErgonomicsScore(100)
    setAlerts([])
    setTotalAlerts(0)
    setMonitoringDuration(0)
    setSampleCount(0)
    setLastSampleAt(null)
    bindStreamToVideo()
    window.setTimeout(() => beginTimers(), 50)
  }, [bindStreamToVideo, beginTimers])

  // Pause monitoring
  const pauseMonitoring = useCallback(() => {
    clearTimers()
    setMonitoringState('paused')
  }, [clearTimers])

  // Resume monitoring
  const resumeMonitoring = useCallback(() => {
    setMonitoringState('monitoring')
    bindStreamToVideo()
    window.setTimeout(() => beginTimers(), 50)
  }, [bindStreamToVideo, beginTimers])

  // End session
  const endSession = useCallback(() => {
    clearTimers()

    // Generate recommendations
    const recs = []
    
    if (glareLevel === 'severe' || glareLevel === 'poor') {
      recs.push({
        type: 'lighting',
        title: 'Improve Room Lighting',
        description: 'Add ambient lighting behind your screen to reduce glare contrast. Use bias lighting or desk lamps.'
      })
    }

    if (postureStatus === 'too-close' || postureStatus === 'leaning') {
      recs.push({
        type: 'distance',
        title: 'Maintain Proper Distance',
        description: 'Keep your eyes 50-70cm (20-28 inches) from the screen. Use a monitor arm or raise your chair.'
      })
    }

    if (totalAlerts > monitoringDuration / 30) { // >1 alert per minute
      recs.push({
        type: 'breaks',
        title: 'Take More Breaks',
        description: 'Follow the 20-20-20 rule: Every 20 minutes, look 20 feet away for 20 seconds.'
      })
    }

    if (recs.length === 0) {
      recs.push({
        type: 'success',
        title: 'Excellent Ergonomics!',
        description: 'Your setup is optimal. Continue maintaining good habits.'
      })
    }

    setRecommendations(recs)
    
    // Submit to backend
    submitSession({
      duration: monitoringDuration,
      avgAmbientLight: rollingMean(rollingAmbientRef.current) ?? ambientLight,
      lighting_status: lightingStatus,
      lighting_message: lightingMessage,
      glareLevel,
      distance_band: postureStatus,
      distance_band_label: distanceBandLabel,
      avgDistance: rollingMean(rollingDistanceRef.current) ?? viewingDistance,
      postureStatus,
      totalAlerts,
      alertCounts: { ...alertCountsRef.current },
      ergonomicsScore,
      recommendations: recs
    })

    stopCamera()
    setMonitoringState('results')
  }, [monitoringDuration, totalAlerts, ambientLight, glareLevel, viewingDistance, postureStatus, distanceBandLabel, lightingStatus, lightingMessage, ergonomicsScore, stopCamera, clearTimers])

  // Submit session to backend
  const submitSession = async (session) => {
    try {
      await visionTestAPI.submit({
        test_type: 'ocular_ergonomics',
        score: session.ergonomicsScore,
        test_details: {
          duration_seconds: session.duration,
          avg_ambient_light: session.avgAmbientLight,
          lighting_status: session.lighting_status,
          lighting_message: session.lighting_message,
          glare_level: session.glareLevel,
          distance_band: session.distance_band,
          distance_band_label: session.distance_band_label,
          avg_viewing_distance_cm: session.avgDistance,
          posture_status: session.postureStatus,
          total_alerts: session.totalAlerts,
          alert_counts: session.alertCounts,
          recommendations: session.recommendations,
          timestamp: new Date().toISOString()
        }
      })
    } catch (err) {
      console.error('Failed to submit session:', err)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  // Re-attach camera after switching views (setup → monitoring remounts <video>)
  useEffect(() => {
    if (['setup', 'monitoring', 'paused'].includes(monitoringState)) {
      bindStreamToVideo()
    }
  }, [monitoringState, bindStreamToVideo])

  // Render instructions
  const renderInstructions = () => (
    <div className="test-shell">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/vision-tests')}
          className="mb-6 flex items-center text-blue-600 hover:text-blue-700 font-medium"
        >
          ← Back to Tests
        </button>

        <div className="test-panel p-8 md:p-12">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h1 className="page-title mb-2">Ocular Ergonomics AI</h1>
            <p className="text-xl text-gray-600">Real-Time Posture & Lighting Monitor</p>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-600 p-6 mb-8 rounded-r-xl">
            <h2 className="text-lg font-bold text-blue-900 mb-2">Why This Matters</h2>
            <p className="text-blue-800">
              <strong>50% of vision health</strong> is about your environment! Poor lighting, bad posture, 
              and incorrect viewing distance cause eye strain, headaches, and can accelerate myopia (nearsightedness) 
              in children and young adults. This AI monitors your setup in real-time and alerts you to problems 
              <strong> before</strong> they cause damage.
            </p>
          </div>

          <div className="space-y-6 mb-8">
            <h3 className="text-2xl font-bold text-gray-900">What We Monitor:</h3>
            
            <div className="grid gap-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-bold">L</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Screen-to-Room Glare</h4>
                  <p className="text-gray-600">Compares screen brightness to ambient light. Too much contrast = eye strain</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-bold">D</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Viewing Distance</h4>
                  <p className="text-gray-600">Tracks if you're too close (accelerates myopia) or leaning forward (neck strain)</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-bold">P</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Posture Analysis</h4>
                  <p className="text-gray-600">Detects when you're slouching or getting too close to the screen</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-bold">!</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Real-Time Alerts</h4>
                  <p className="text-gray-600">Instant notifications when conditions become harmful</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-6 mb-8">
            <h3 className="font-bold text-cyan-900 mb-3">Ideal Conditions:</h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span><strong>Distance:</strong> 50-70cm (arm's length) from screen</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span><strong>Lighting:</strong> Room brightness similar to screen (no dark rooms!)</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span><strong>Posture:</strong> Straight back, eyes level with top 1/3 of screen</span>
              </li>
            </ul>
          </div>

          <div className="bg-amber-50 border-l-4 border-amber-600 p-4 mb-8 rounded-r-xl">
            <p className="text-amber-900">
              <strong>Privacy Note:</strong> All analysis happens locally on your device. 
              Video is never uploaded or recorded.
            </p>
          </div>

          <div className="text-center">
            <button
              onClick={() => {
                setMonitoringState('setup')
                initializeCamera()
              }}
              className="btn-primary px-8 py-4 text-xl"
            >
              Start Monitoring
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // Render setup
  const renderSetup = () => (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-4">Enable Camera</h2>
        <p className="text-gray-400 mb-6">We'll use your camera to monitor posture and lighting</p>

        <div className="relative mb-6">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-w-2xl mx-auto rounded-2xl"
          />
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => {
              stopCamera()
              setMonitoringState('instructions')
            }}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-full font-semibold"
          >
            Cancel
          </button>
          
          <button
            onClick={startMonitoring}
            disabled={!cameraReady}
            className={`px-8 py-3 rounded-full font-semibold ${
              cameraReady
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-600 cursor-not-allowed opacity-50'
            }`}
          >
            {cameraReady ? 'Start Monitoring' : 'Initializing Camera...'}
          </button>
        </div>
      </div>
    </div>
  )

  // Render monitoring
  const renderMonitoring = () => {
    const isPaused = monitoringState === 'paused'
    const getGlareColor = (glare) => {
      if (glare === 'optimal') return 'bg-green-500'
      if (glare === 'acceptable') return 'bg-yellow-500'
      if (glare === 'poor') return 'bg-orange-500'
      return 'bg-red-500'
    }

    const getPostureColor = (posture) => {
      if (posture === 'good') return 'bg-green-500'
      if (posture === 'leaning' || posture === 'too-far') return 'bg-yellow-500'
      return 'bg-red-500'
    }

    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const progressPct = Math.min(100, Math.round((monitoringDuration / SESSION_GOAL_SECONDS) * 100))
    const waitingForSample = sampleCount === 0 && !isPaused

    return (
      <div className="min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide ${
                  isPaused ? 'bg-yellow-500 text-gray-900' : 'bg-red-600 text-white'
                }`}>
                  <span className={`w-2 h-2 rounded-full bg-white ${isPaused ? '' : 'animate-pulse'}`} />
                  {isPaused ? 'PAUSED' : 'LIVE'}
                </span>
                <h1 className="text-2xl font-bold">
                  {isPaused ? 'Session paused' : 'Check in progress'}
                </h1>
              </div>
              <p className="text-sm text-gray-400">
                {isPaused
                  ? 'Resume to keep measuring lighting and distance.'
                  : waitingForSample
                    ? 'Connecting camera and taking the first reading…'
                    : `Sampling lighting and posture every 2 seconds · ${sampleCount} reading${sampleCount === 1 ? '' : 's'}`}
              </p>
            </div>
            <div className="flex gap-3">
              {isPaused ? (
                <button
                  onClick={resumeMonitoring}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold min-h-[44px]"
                >
                  Resume
                </button>
              ) : (
                <button
                  onClick={pauseMonitoring}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-semibold min-h-[44px]"
                >
                  Pause
                </button>
              )}
              <button
                onClick={endSession}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold min-h-[44px]"
              >
                End session
              </button>
            </div>
          </div>

          {/* Session progress */}
          <div className="bg-gray-800 rounded-xl p-4 mb-6">
            <div className="flex items-end justify-between gap-4 mb-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Elapsed</p>
                <p className="font-mono text-3xl font-bold tabular-nums">{formatTime(monitoringDuration)}</p>
              </div>
              <p className="text-sm text-gray-400 text-right">
                Recommended {SESSION_GOAL_SECONDS}s sample — you can end anytime
              </p>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${isPaused ? 'bg-yellow-500' : 'bg-accent-500'}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {progressPct >= 100
                ? 'Sample complete. End session whenever you are ready.'
                : `${progressPct}% of the recommended check`}
            </p>
          </div>

          {/* Current alert banner */}
          {currentAlert && !isPaused && (
            <div className={`${
              currentAlert.severity === 'critical' ? 'bg-red-600' :
              currentAlert.severity === 'warning' ? 'bg-orange-600' :
              'bg-blue-600'
            } rounded-xl p-4 mb-6`}>
              <div className="flex items-start gap-3">
                <span className="text-3xl font-bold">!</span>
                <div className="flex-1">
                  <h3 className="font-bold text-lg mb-1">{currentAlert.type.toUpperCase()}</h3>
                  <p>{currentAlert.message}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Video feed */}
            <div>
              <div className="relative mb-4">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full rounded-2xl bg-black aspect-video object-cover ${isPaused ? 'opacity-60' : ''}`}
                />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/70 text-xs font-semibold">
                  <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-400' : 'bg-red-500 animate-pulse'}`} />
                  {isPaused ? 'Paused' : 'Camera live'}
                </div>
                {waitingForSample && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40">
                    <p className="text-sm font-semibold">Taking first reading…</p>
                  </div>
                )}
                {isPaused && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50">
                    <p className="text-lg font-semibold">Paused</p>
                  </div>
                )}
              </div>
              
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="font-bold mb-3">Session Info</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Duration:</span>
                    <span className="font-mono font-bold">{formatTime(monitoringDuration)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Readings:</span>
                    <span className="font-mono font-bold">{sampleCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Alerts:</span>
                    <span className="font-mono font-bold">{totalAlerts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Score:</span>
                    <span className={`font-mono font-bold ${
                      ergonomicsScore >= 80 ? 'text-green-400' :
                      ergonomicsScore >= 60 ? 'text-yellow-400' :
                      'text-red-400'
                    }`}>
                      {ergonomicsScore}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Last reading:</span>
                    <span className="text-gray-300">
                      {lastSampleAt ? 'just now' : 'waiting…'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="space-y-4">
              {/* Lighting */}
              <div className="bg-gray-800 rounded-xl p-6">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <span className="text-yellow-400">LIGHT</span> Lighting Analysis
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-400">Ambient Light</span>
                      <span className="font-mono">{ambientLight}/255</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${(ambientLight / 255) * 100}%` }}
                      />
                    </div>
                  </div>
                  
                  {lightingMessage && (
                    <p className="text-sm text-gray-400 mt-2">{lightingMessage}</p>
                  )}
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Glare Level:</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${getGlareColor(glareLevel)} text-white`}>
                        {glareLevel.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Posture */}
              <div className="bg-gray-800 rounded-xl p-6">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <span className="text-blue-400">DIST</span> Posture & Distance
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-gray-400">Viewing Distance</span>
                      <span className="font-mono font-bold text-2xl">{distanceBandLabel}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Comfortable arm’s length is about 50–70 cm. We show a band, not an exact number.
                    </p>
                    <div className="flex gap-2 text-xs mt-2">
                      <div className={`flex-1 rounded p-2 text-center border ${postureStatus === 'too-close' ? 'bg-red-900/30 border-red-600' : 'bg-gray-700 border-gray-600'}`}>
                        Too close
                      </div>
                      <div className={`flex-1 rounded p-2 text-center border ${postureStatus === 'good' ? 'bg-green-900/30 border-green-600' : 'bg-gray-700 border-gray-600'}`}>
                        Good distance
                      </div>
                      <div className={`flex-1 rounded p-2 text-center border ${postureStatus === 'too-far' ? 'bg-yellow-900/30 border-yellow-600' : 'bg-gray-700 border-gray-600'}`}>
                        Too far
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Posture:</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${getPostureColor(postureStatus)} text-white`}>
                        {postureStatus.toUpperCase().replace('-', ' ')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent alerts */}
              <div className="bg-gray-800 rounded-xl p-6 max-h-64 overflow-y-auto">
                <h3 className="font-bold mb-4">Recent Alerts</h3>
                {alerts.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No alerts yet - great job!</p>
                ) : (
                  <div className="space-y-2">
                    {alerts.slice(0, 5).map(alert => (
                      <div
                        key={alert.id}
                        className={`p-3 rounded-lg text-sm ${
                          alert.severity === 'critical' ? 'bg-red-900/30 border-l-4 border-red-600' :
                          alert.severity === 'warning' ? 'bg-orange-900/30 border-l-4 border-orange-600' :
                          'bg-blue-900/30 border-l-4 border-blue-600'
                        }`}
                      >
                        <p className="font-semibold">{alert.type.toUpperCase()}</p>
                        <p className="text-xs text-gray-400 mt-1">{alert.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render results
  const renderResults = () => {
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
            className="mb-6 flex items-center text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to Tests
          </button>

          <div className="test-panel p-8 md:p-12">
            <div className="text-center mb-8">
              <h1 className="page-title mb-2">Session Complete</h1>
              <p className="text-gray-600">Ergonomics Report</p>
            </div>

            {/* Score */}
            <div className={`border-2 rounded-2xl p-8 mb-8 text-center ${getScoreBg(ergonomicsScore)}`}>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">ERGONOMICS SCORE</h3>
              <div className={`text-7xl font-bold ${getScoreColor(ergonomicsScore)} mb-4`}>
                {ergonomicsScore}
              </div>
              <p className="text-lg font-semibold text-gray-700">
                {ergonomicsScore >= 80 ? 'Excellent Setup!' :
                 ergonomicsScore >= 60 ? 'Room for Improvement' :
                 'Needs Attention'}
              </p>
            </div>

            {/* Stats */}
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <div className="bg-blue-50 rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-blue-600 mb-2">
                  {Math.floor(monitoringDuration / 60)}m
                </div>
                <div className="text-sm text-blue-800">Duration</div>
              </div>
              <div className="bg-purple-50 rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-purple-600 mb-2">{totalAlerts}</div>
                <div className="text-sm text-purple-800">Total Alerts</div>
              </div>
              <div className="bg-cyan-50 rounded-xl p-6 text-center">
                <div className="text-lg font-bold text-cyan-600 mb-2">{distanceBandLabel}</div>
                <div className="text-sm text-cyan-800">Distance band</div>
              </div>
            </div>

            {/* Recommendations */}
            <div className="space-y-4 mb-8">
              <h3 className="text-2xl font-bold text-gray-900">Recommendations</h3>
              {recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className={`${
                    rec.type === 'success' ? 'bg-green-50 border-l-4 border-green-600' :
                    'bg-orange-50 border-l-4 border-orange-600'
                  } p-6 rounded-r-xl`}
                >
                  <h4 className="font-bold text-lg mb-2">{rec.title}</h4>
                  <p className="text-gray-700">{rec.description}</p>
                </div>
              ))}
            </div>

            <SamdDisclaimer testType="ocular_ergonomics" className="mb-6" />

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => setMonitoringState('instructions')}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold"
              >
                Monitor Again
              </button>
              <button
                onClick={() => navigate('/vision-tests')}
                className="flex-1 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main render
  if (monitoringState === 'instructions') return renderInstructions()
  if (monitoringState === 'setup') return renderSetup()
  if (monitoringState === 'monitoring') return renderMonitoring()
  if (monitoringState === 'paused') return renderMonitoring() // Same as monitoring
  if (monitoringState === 'results') return renderResults()

  return null
}

export default OcularErgonomicsMonitor
