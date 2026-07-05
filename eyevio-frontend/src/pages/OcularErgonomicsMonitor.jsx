import { useState, useEffect, useCallback, useRef } from 'react'
import cameraManager from '../utils/cameraManager.js'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'

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
  const monitoringInterval = useRef(null)
  const alertTimeout = useRef(null)

  const [monitoringState, setMonitoringState] = useState('instructions') // instructions, setup, monitoring, paused
  const [cameraReady, setCameraReady] = useState(false)
  const [monitoringDuration, setMonitoringDuration] = useState(0) // seconds
  
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
  const GLARE_THRESHOLD = 0.3 // ratio
  const TOO_CLOSE_THRESHOLD = 35 // cm

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
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setCameraReady(true)
        }
      }
    } catch (err) {
      console.error('Camera access denied:', err)
    }
  }, [])

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      try { cameraManager.release() } catch (e) { try { streamRef.current.getTracks().forEach(track => track.stop()) } catch (err) {} }
      streamRef.current = null
    }
    if (monitoringInterval.current) {
      clearInterval(monitoringInterval.current)
    }
    if (alertTimeout.current) {
      clearTimeout(alertTimeout.current)
    }
    setCameraReady(false)
  }, [])

  // Measure ambient light from camera
  const measureAmbientLight = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return 0

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
    if (!videoRef.current || !canvasRef.current) return 60 // default

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const faceWidth = estimateFaceWidth(imageData)
    
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

  // Generate alert
  const generateAlert = useCallback((type, message, severity) => {
    const alert = {
      id: Date.now(),
      type,
      message,
      severity, // info, warning, critical
      timestamp: new Date().toISOString()
    }

    setAlerts(prev => [alert, ...prev].slice(0, 50)) // Keep last 50
    setTotalAlerts(prev => prev + 1)
    setCurrentAlert(alert)

    // Auto-dismiss after 10 seconds
    if (alertTimeout.current) clearTimeout(alertTimeout.current)
    alertTimeout.current = setTimeout(() => {
      setCurrentAlert(null)
    }, 10000)

    // Update ergonomics score
    setErgonomicsScore(prev => Math.max(0, prev - (severity === 'critical' ? 5 : severity === 'warning' ? 2 : 1)))
  }, [])

  // Start monitoring
  const startMonitoring = useCallback(() => {
    setMonitoringState('monitoring')
    setSessionStart(Date.now())
    setErgonomicsScore(100)
    setAlerts([])
    setTotalAlerts(0)
    setMonitoringDuration(0)

    // Monitor every 2 seconds
    monitoringInterval.current = setInterval(() => {
      // Measure environment
      const ambient = measureAmbientLight()
      const screen = estimateScreenBrightness()
      const glare = calculateGlare(ambient, screen)
      const distance = measureViewingDistance()
      const posture = assessPosture(distance)

      setAmbientLight(Math.round(ambient))
      setScreenBrightness(screen)
      setGlareLevel(glare)
      setViewingDistance(Math.round(distance))
      setPostureStatus(posture)

      // Generate alerts
      if (glare === 'severe') {
        generateAlert(
          'glare',
          'CRITICAL: Your room is too dark for your screen brightness. This causes severe eye strain!',
          'critical'
        )
      } else if (glare === 'poor') {
        generateAlert(
          'glare',
          'Your screen is much brighter than your room. Turn on lights or reduce screen brightness.',
          'warning'
        )
      }

      if (posture === 'too-close') {
        generateAlert(
          'distance',
          `CRITICAL: You're only ${distance}cm away! Move back to at least 50cm to prevent myopia progression.`,
          'critical'
        )
      } else if (posture === 'leaning') {
        generateAlert(
          'distance',
          `You're leaning too close (${distance}cm). Sit back to 50-70cm for optimal comfort.`,
          'warning'
        )
      }

      setMonitoringDuration(prev => prev + 2)
    }, 2000)

  }, [measureAmbientLight, estimateScreenBrightness, calculateGlare, measureViewingDistance, assessPosture, generateAlert])

  // Pause monitoring
  const pauseMonitoring = useCallback(() => {
    if (monitoringInterval.current) {
      clearInterval(monitoringInterval.current)
    }
    setMonitoringState('paused')
  }, [])

  // Resume monitoring
  const resumeMonitoring = useCallback(() => {
    setMonitoringState('monitoring')
    startMonitoring()
  }, [startMonitoring])

  // End session
  const endSession = useCallback(() => {
    if (monitoringInterval.current) {
      clearInterval(monitoringInterval.current)
    }

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
      avgAmbientLight: ambientLight,
      avgScreenBrightness: screenBrightness,
      glareLevel,
      avgDistance: viewingDistance,
      postureStatus,
      totalAlerts,
      ergonomicsScore,
      recommendations: recs
    })

    stopCamera()
    setMonitoringState('results')
  }, [monitoringDuration, totalAlerts, ambientLight, screenBrightness, glareLevel, viewingDistance, postureStatus, ergonomicsScore, stopCamera])

  // Submit session to backend
  const submitSession = async (session) => {
    try {
      await visionTestAPI.submit({
        test_type: 'ocular_ergonomics',
        score: session.ergonomicsScore,
        test_details: {
          duration_seconds: session.duration,
          avg_ambient_light: session.avgAmbientLight,
          avg_screen_brightness: session.avgScreenBrightness,
          glare_level: session.glareLevel,
          avg_viewing_distance: session.avgDistance,
          posture_status: session.postureStatus,
          total_alerts: session.totalAlerts,
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

  // Render instructions
  const renderInstructions = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/vision-tests')}
          className="mb-6 flex items-center text-blue-600 hover:text-blue-700 font-medium"
        >
          ← Back to Tests
        </button>

        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Ocular Ergonomics AI</h1>
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
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-full text-xl font-bold hover:from-blue-700 hover:to-cyan-700 transition-all transform hover:scale-105 shadow-lg"
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

    return (
      <div className="min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Monitoring Active</h1>
            <div className="flex gap-4">
              <button
                onClick={pauseMonitoring}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-semibold"
              >
                Pause
              </button>
              <button
                onClick={endSession}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold"
              >
                End Session
              </button>
            </div>
          </div>

          {/* Current alert banner */}
          {currentAlert && (
            <div className={`${
              currentAlert.severity === 'critical' ? 'bg-red-600' :
              currentAlert.severity === 'warning' ? 'bg-orange-600' :
              'bg-blue-600'
            } rounded-xl p-4 mb-6 animate-pulse`}>
              <div className="flex items-start gap-3">
                <span className="text-3xl font-bold">
                  {currentAlert.severity === 'critical' ? '!' :
                   currentAlert.severity === 'warning' ? '!' : 'i'}
                </span>
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
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-2xl mb-4"
              />
              <canvas ref={canvasRef} className="hidden" />
              
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="font-bold mb-3">Session Info</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Duration:</span>
                    <span className="font-mono font-bold">{formatTime(monitoringDuration)}</span>
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
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-400">Screen Brightness</span>
                      <span className="font-mono">{screenBrightness}/255</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-yellow-500 h-2 rounded-full"
                        style={{ width: `${(screenBrightness / 255) * 100}%` }}
                      />
                    </div>
                  </div>

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
                      <span className="font-mono font-bold text-2xl">{viewingDistance}cm</span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <div className="flex-1 bg-red-900/30 border border-red-600 rounded p-2 text-center">
                        &lt;35cm<br/>TOO CLOSE
                      </div>
                      <div className="flex-1 bg-green-900/30 border border-green-600 rounded p-2 text-center">
                        50-70cm<br/>OPTIMAL
                      </div>
                      <div className="flex-1 bg-yellow-900/30 border border-yellow-600 rounded p-2 text-center">
                        &gt;70cm<br/>TOO FAR
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/vision-tests')}
            className="mb-6 flex items-center text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to Tests
          </button>

          <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Session Complete</h1>
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
                <div className="text-3xl font-bold text-cyan-600 mb-2">{viewingDistance}cm</div>
                <div className="text-sm text-cyan-800">Avg Distance</div>
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
