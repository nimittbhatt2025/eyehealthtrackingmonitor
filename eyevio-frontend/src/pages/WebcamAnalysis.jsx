import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { webcamAPI, calibrationAPI } from '../services/api'
import { toast } from 'react-hot-toast'
import cameraManager from '../utils/cameraManager.js'

function WebcamAnalysis() {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const analysisIntervalRef = useRef(null)
  const blinkStateRef = useRef({ previousEyesClosed: false, blinkInProgress: false, blinkCount: 0 })
  const sessionBlinkCountRef = useRef(0)
  
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [sessionStartTime, setSessionStartTime] = useState(null)
  const [sessionDuration, setSessionDuration] = useState(0)
  const [recentMetrics, setRecentMetrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [isCalibrated, setIsCalibrated] = useState(null) // null = checking, true/false = result
  const [showCalibrationPrompt, setShowCalibrationPrompt] = useState(false)
  
  // Live metrics (simulated for demo - would be real-time in production)
  const [liveMetrics, setLiveMetrics] = useState({
    blinkRate: 0,
    incompleteBlinks: 0,
    squintCount: 0,
    fatigueScore: 0,
    pupilSize: 0,
  })

  useEffect(() => {
    loadRecentMetrics()
    checkCalibration()
    return () => {
      stopCamera()
    }
  }, [])

  const checkCalibration = async () => {
    try {
      const response = await calibrationAPI.getStatus()
      
      // Check if calibrated from backend
      const calibrated = response.data.calibrated || false
      setIsCalibrated(calibrated)
      
      // If backend has a threshold, save it to localStorage
      if (response.data.threshold) {
        localStorage.setItem('blink_calibrated', 'true')
        localStorage.setItem('blink_threshold', response.data.threshold.toString())
        console.log(' Loaded saved threshold from database:', response.data.threshold)
      } else if (!calibrated) {
        // No calibration found
        localStorage.removeItem('blink_calibrated')
        localStorage.removeItem('blink_threshold')
      }
      
      if (!calibrated) {
        setShowCalibrationPrompt(true)
      }
    } catch (error) {
      console.error('Calibration check error:', error)
      // Fallback to localStorage
      const calibrated = localStorage.getItem('blink_calibrated') === 'true'
      setIsCalibrated(calibrated)
      
      if (!calibrated) {
        setShowCalibrationPrompt(true)
      }
    }
  }

  useEffect(() => {
    if (isAnalyzing && sessionStartTime) {
      intervalRef.current = setInterval(() => {
        const duration = Math.floor((Date.now() - sessionStartTime) / 1000)
        setSessionDuration(duration)
        
        // Calculate real blinks per minute
        const durationMinutes = duration / 60
        const blinksPerMinute = durationMinutes > 0 
          ? Math.round(sessionBlinkCountRef.current / durationMinutes) 
          : 0
        
        // Update live metrics with real blink rate
        setLiveMetrics({
          blinkRate: blinksPerMinute,
          incompleteBlinks: Math.floor(Math.random() * 5), // TODO: track incomplete blinks
          squintCount: Math.floor(Math.random() * 3),
          fatigueScore: Math.floor(Math.random() * 40) + 20,
          pupilSize: (Math.random() * 2 + 3).toFixed(1),
        })
      }, 2000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isAnalyzing, sessionStartTime])

  const loadRecentMetrics = async () => {
    setLoading(true)
    try {
      const response = await webcamAPI.getMetrics({ days: 7, limit: 5 })
      setRecentMetrics(response.data.metrics || [])
    } catch (error) {
      console.error('Failed to load metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  const startCamera = async () => {
    try {
      // Request camera permission via cameraManager
      const stream = await cameraManager.acquire({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      })

      // Set camera active first so video element gets rendered
      streamRef.current = stream
      setCameraActive(true)

      // Wait for next tick to ensure video element is rendered
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current
          // Ensure video plays
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play().catch(err => {
              console.error('Error playing video:', err)
            })
          }
          toast.success('Camera activated successfully!')
        }
      }, 0)
    } catch (error) {
      console.error('Failed to access camera:', error)
      let errorMessage = 'Failed to access camera.'
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera access denied. Please allow camera permissions in your browser settings.'
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera found on this device.'
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use by another application.'
      }
      
      toast.error(errorMessage)
      setCameraActive(false) // Reset state on error
      if (streamRef.current) {
        try { cameraManager.release() } catch (e) { try { streamRef.current.getTracks().forEach(t => t.stop()) } catch (err) {} }
        streamRef.current = null
      }
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      try { cameraManager.release() } catch (e) { try { streamRef.current.getTracks().forEach(track => track.stop()) } catch (err) {} }
      streamRef.current = null
      setCameraActive(false)
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
    // Stop analysis interval if running
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current)
      analysisIntervalRef.current = null
    }
  }

  // Capture frame from video for analysis
  const captureFrame = () => {
    if (!videoRef.current) return null
    
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.current, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.8)
  }

  // Real-time blink detection using calibrated threshold
  const startBlinkDetection = () => {
    const token = localStorage.getItem('access_token')
    const threshold = parseFloat(localStorage.getItem('blink_threshold')) || 0.15
    
    console.log(' Starting blink detection')
    console.log(' Calibrated threshold:', threshold)
    console.log('🔑 Token present:', !!token)
    
    // Reset blink state
    blinkStateRef.current = { previousEyesClosed: false, blinkInProgress: false, blinkCount: 0 }
    sessionBlinkCountRef.current = 0
    
    analysisIntervalRef.current = setInterval(async () => {
      const frame = captureFrame()
      if (!frame || frame === 'data:,') return
      
      try {
        // Use the test endpoint for real-time detection
        const response = await calibrationAPI.test({ frame })
        
        const ear = response.data?.ear
        const serverThreshold = response.data?.threshold
        
        if (ear === undefined || ear === null) {
          console.log('No EAR data in response:', response.data)
          return
        }
        
        const eyesClosed = ear < (serverThreshold || threshold)
        const state = blinkStateRef.current
        
        // Detect complete blink cycle (same logic as Step 2)
        if (eyesClosed && !state.previousEyesClosed) {
          // Eyes just closed - blink started
          console.log(' Eyes CLOSED - blink started, EAR:', ear.toFixed(3))
          state.blinkInProgress = true
        } else if (!eyesClosed && state.previousEyesClosed && state.blinkInProgress) {
          // Eyes just opened - complete blink detected!
          console.log(' Eyes OPENED - BLINK COMPLETE! EAR:', ear.toFixed(3))
          state.blinkInProgress = false
          state.blinkCount++
          sessionBlinkCountRef.current++
          
          console.log(' Blink detected! Total:', sessionBlinkCountRef.current)
        }
        
        state.previousEyesClosed = eyesClosed
      } catch (err) {
        console.error(' Blink detection error:', err.response?.data || err.message)
        // If session lost, try to reinitialize
        if (err.response?.status === 400 && err.response?.data?.error?.includes('calibration')) {
          console.error(' Calibration session lost! Please recalibrate.')
          if (analysisIntervalRef.current) {
            clearInterval(analysisIntervalRef.current)
            analysisIntervalRef.current = null
          }
        }
      }
    }, 33) // ~30 fps
  }

  const startAnalysis = () => {
    if (!cameraActive) {
      toast.error('Please activate camera first')
      return
    }
    
    // Check calibration before starting
    const calibrated = localStorage.getItem('blink_calibrated') === 'true'
    const hasThreshold = localStorage.getItem('blink_threshold')
    
    if (!calibrated || !hasThreshold) {
      setShowCalibrationPrompt(true)
      toast.error('Please calibrate blink detection first')
      return
    }
    
    setIsAnalyzing(true)
    setSessionStartTime(Date.now())
    startBlinkDetection()
    toast.success('Analysis started')
  }

  const stopAnalysis = async () => {
    setIsAnalyzing(false)
    
    // Stop blink detection
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current)
      analysisIntervalRef.current = null
    }
    
    const durationMinutes = sessionDuration / 60
    const totalBlinks = sessionBlinkCountRef.current
    const blinksPerMinute = durationMinutes > 0 ? Math.round(totalBlinks / durationMinutes) : 0
    
    console.log(`Session complete: ${totalBlinks} blinks in ${durationMinutes.toFixed(2)} minutes = ${blinksPerMinute} blinks/min`)
    
    // Submit analysis to backend
    try {
      const analysisData = {
        blink_rate: blinksPerMinute, // Real blink rate from detection
        incomplete_blinks: liveMetrics.incompleteBlinks,
        avg_blink_duration_ms: Math.floor(Math.random() * 150) + 100,
        squint_count: liveMetrics.squintCount,
        squint_duration_seconds: Math.floor(Math.random() * 30),
        sclera_redness_level: Math.floor(Math.random() * 5) + 1,
        tear_film_quality: Math.floor(Math.random() * 5) + 1,
        pupil_size_variation: parseFloat(liveMetrics.pupilSize),
        session_duration_minutes: durationMinutes,
        analysis_frames: Math.floor(durationMinutes * 60 * 30), // 30 fps
        notes: `Webcam analysis session - ${totalBlinks} total blinks detected`
      }
      
      const response = await webcamAPI.submitAnalysis(analysisData)
      toast.success(`Analysis saved! ${totalBlinks} blinks detected. Fatigue score: ${response.data.fatigue_score.toFixed(1)}`)
      
      // Reload recent metrics
      loadRecentMetrics()
      
      // Reset session
      setSessionDuration(0)
      setSessionStartTime(null)
      sessionBlinkCountRef.current = 0
      blinkStateRef.current = { previousEyesClosed: false, blinkInProgress: false, blinkCount: 0 }
      setLiveMetrics({
        blinkRate: 0,
        incompleteBlinks: 0,
        squintCount: 0,
        fatigueScore: 0,
        pupilSize: 0,
      })
    } catch (error) {
      console.error('Failed to save analysis:', error)
      toast.error('Failed to save analysis')
    }
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getFatigueColor = (score) => {
    if (score < 40) return 'text-green-600'
    if (score < 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getFatigueBgColor = (score) => {
    if (score < 40) return 'bg-green-100'
    if (score < 70) return 'bg-yellow-100'
    return 'bg-red-100'
  }

  return (
    <div className="space-y-8">
      {/* Calibration Required Modal */}
      {showCalibrationPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card shadow-elevated max-w-md w-full p-8 animate-fade-in-up">
            <div className="text-center">
              <div className="icon-tile w-16 h-16 bg-accent-50 text-accent-600 rounded-full mx-auto mb-4">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h2 className="section-title mb-3">Calibration Required</h2>
              <p className="text-gray-500 mb-6">
                Before using webcam analysis, you need to calibrate blink detection for accurate results. This takes only 30 seconds.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => navigate('/calibrate-blink')}
                  className="btn-primary min-h-[44px]"
                >
                  Calibrate Now
                </button>
                <button
                  onClick={() => setShowCalibrationPrompt(false)}
                  className="btn-secondary min-h-[44px]"
                >
                  Skip for Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="animate-fade-in-up">
        <h1 className="page-title">Webcam Analysis</h1>
        <p className="page-subtitle">Monitor eye fatigue and health in real-time</p>
        
        {/* Demo Notice */}
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-900">Demo Mode - Simulated Metrics</p>
              <p className="text-sm text-amber-700 mt-1">
                The blink rate, fatigue scores, and other metrics shown are currently simulated for demonstration purposes. 
                Real-time eye tracking with TensorFlow.js or similar ML libraries would be integrated in production.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Column - Video Feed */}
        <div className="lg:col-span-2 space-y-6">
          {/* Video Container */}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 overflow-hidden">
            <div className="relative bg-gray-900" style={{ paddingBottom: '56.25%' }}>
              {cameraActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 bg-gray-800 rounded-full flex items-center justify-center">
                      <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-gray-500 text-lg">Camera not active</p>
                    <p className="text-gray-600 text-sm mt-2">Click "Start Camera" to begin</p>
                  </div>
                </div>
              )}
              
              {/* Recording Indicator */}
              {isAnalyzing && (
                <div className="absolute top-4 left-4 badge badge-brand shadow-soft">
                  <span className="w-2 h-2 bg-accent-500 rounded-full animate-pulse"></span>
                  Recording
                </div>
              )}
              
              {/* Session Timer */}
              {isAnalyzing && (
                <div className="absolute top-4 right-4 bg-black bg-opacity-60 text-white px-4 py-2 rounded-full font-mono text-lg">
                  {formatDuration(sessionDuration)}
                </div>
              )}
            </div>

            {/* Camera Controls */}
            <div className="p-6 bg-gray-50 border-t border-gray-100/80">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-3">
                  {!cameraActive ? (
                    <button
                      onClick={startCamera}
                      className="btn-primary min-h-[44px]"
                    >
                      Start Camera
                    </button>
                  ) : (
                    <button
                      onClick={stopCamera}
                      className="btn-secondary min-h-[44px]"
                    >
                      Stop Camera
                    </button>
                  )}

                  {!isAnalyzing ? (
                    <button
                      onClick={startAnalysis}
                      disabled={!cameraActive}
                      className="btn-primary min-h-[44px]"
                    >
                      Start Analysis
                    </button>
                  ) : (
                    <button
                      onClick={stopAnalysis}
                      className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-3 bg-red-600 text-white rounded-full font-semibold shadow-soft hover:bg-red-700 transition-all duration-300 active:scale-[0.98]"
                    >
                      Stop & Save
                    </button>
                  )}
                </div>

                <div className="text-sm text-gray-600">
                  {cameraActive ? (
                    <span className="badge badge-success">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      Camera Active
                    </span>
                  ) : (
                    <span className="badge badge-neutral">
                      <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                      Camera Inactive
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-brand-soft border border-accent-100 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              How It Works
            </h3>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <span className="text-accent-600 font-semibold mr-2">1.</span>
                <span>Click "Start Camera" to activate your webcam</span>
              </li>
              <li className="flex items-start">
                <span className="text-accent-600 font-semibold mr-2">2.</span>
                <span>Position your face clearly in the frame</span>
              </li>
              <li className="flex items-start">
                <span className="text-accent-600 font-semibold mr-2">3.</span>
                <span>Click "Start Analysis" to begin monitoring</span>
              </li>
              <li className="flex items-start">
                <span className="text-accent-600 font-semibold mr-2">4.</span>
                <span>Use your computer normally for at least 1-2 minutes</span>
              </li>
              <li className="flex items-start">
                <span className="text-accent-600 font-semibold mr-2">5.</span>
                <span>Click "Stop & Save" to save your fatigue metrics</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Right Column - Live Metrics & History */}
        <div className="space-y-6">
          {/* Live Metrics */}
          {isAnalyzing && (
            <div className="card animate-fade-in-up">
              <h3 className="section-title mb-4">Live Metrics</h3>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-500">Blink Rate</span>
                    <span className="text-lg font-semibold text-gray-900">{liveMetrics.blinkRate}/min</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-accent-600 transition-all duration-500"
                      style={{ width: `${Math.min((liveMetrics.blinkRate / 30) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-500">Incomplete Blinks</span>
                    <span className="text-lg font-semibold text-gray-900">{liveMetrics.incompleteBlinks}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${Math.min((liveMetrics.incompleteBlinks / 10) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-500">Squint Count</span>
                    <span className="text-lg font-semibold text-gray-900">{liveMetrics.squintCount}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${Math.min((liveMetrics.squintCount / 5) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100/80">
                  <div className="text-center">
                    <div className="text-sm text-gray-500 mb-2">Fatigue Score</div>
                    <div className={`text-4xl font-bold ${getFatigueColor(liveMetrics.fatigueScore)}`}>
                      {liveMetrics.fatigueScore}%
                    </div>
                    <div className={`mt-3 inline-block px-4 py-2 rounded-full text-sm font-semibold ${getFatigueBgColor(liveMetrics.fatigueScore)} ${getFatigueColor(liveMetrics.fatigueScore)}`}>
                      {liveMetrics.fatigueScore < 40 ? 'Low Fatigue' : liveMetrics.fatigueScore < 70 ? 'Moderate Fatigue' : 'High Fatigue'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent Sessions */}
          <div className="card">
            <h3 className="section-title mb-4">Recent Sessions</h3>
            
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent-100 border-t-accent-600 mx-auto"></div>
              </div>
            ) : recentMetrics.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-600">No sessions yet</p>
                <p className="text-sm text-gray-500 mt-1">Start your first analysis</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentMetrics.map((metric) => (
                  <div key={metric.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100/80">
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-sm text-gray-500">{formatDate(metric.created_at)}</div>
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold ${getFatigueBgColor(metric.fatigue_score)} ${getFatigueColor(metric.fatigue_score)}`}>
                        {metric.fatigue_score.toFixed(1)}%
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Blinks:</span>
                        <span className="ml-1 font-semibold text-gray-900">{metric.blink_rate}/min</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Duration:</span>
                        <span className="ml-1 font-semibold text-gray-900">{metric.session_duration_minutes.toFixed(1)}m</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default WebcamAnalysis
