import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Eye, Activity, Zap, TrendingUp, Clock, AlertCircle, Brain, ThumbsUp, AlertTriangle } from 'lucide-react'
import MediaEyeTracker from '../utils/mediaEyeTracker'
import { generatePersonalizedFeedback, assessDoctorVisit } from '../utils/eyeHealthAI'
import { useAuthStore } from '../store/authStore'
import { authAPI, visionTestAPI, calibrationAPI } from '../services/api'

/**
 * Enhanced Eye Tracking Analysis Component
 * 5-minute session with real-time blink detection and fatigue scoring
 */
export default function EyeTrackingAnalysis() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const trackerRef = useRef(null)

  // Session state
  const [sessionState, setSessionState] = useState('instruction') // instruction, calibration, tracking, results
  const [isTracking, setIsTracking] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [sessionProgress, setSessionProgress] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState(300) // 5 minutes in seconds

  // Real-time metrics
  const [metrics, setMetrics] = useState({
    blinkRate: 0,
    avgBlinkDuration: 0,
    totalBlinks: 0,
    fatigueScore: 0,
    sessionDurationMin: 0,
  })

  // Session results with AI feedback
  const [results, setResults] = useState(null)
  const [personalizedFeedback, setPersonalizedFeedback] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [isCalibrated, setIsCalibrated] = useState(null) // null = checking, true/false = result

  const SESSION_DURATION = 300 // 5 minutes

  // Load user profile and check calibration on mount
  useEffect(() => {
    loadUserProfile()
    checkCalibration()
  }, [])

  const checkCalibration = async () => {
    try {
      const response = await calibrationAPI.getStatus()
      
      const calibrated = response.data.calibrated || false
      setIsCalibrated(calibrated)
      
      if (response.data.threshold) {
        localStorage.setItem('blink_calibrated', 'true')
        localStorage.setItem('blink_threshold', response.data.threshold.toString())
        console.log('[OK] Calibrated threshold loaded:', response.data.threshold)
      } else {
        console.log('[WARNING] No calibration found')
      }
    } catch (error) {
      console.error('Calibration check error:', error)
      // Fallback to localStorage
      const calibrated = localStorage.getItem('blink_calibrated') === 'true'
      setIsCalibrated(calibrated)
    }
  }

  const loadUserProfile = async () => {
    try {
      const response = await authAPI.getProfile()
      setUserProfile(response.data)
    } catch (error) {
      console.error('Failed to load user profile:', error)
    }
  }

  // Initialize camera and tracker
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (trackerRef.current) {
        trackerRef.current.stop()
      }
    }
  }, [])

  /**
   * Start the tracking session
   */
  const startSession = async () => {
    try {
      console.log('[camera] Starting camera session...')
      
      // Ensure we're in tracking state first (to mount video element)
      setSessionState('tracking')
      
      // Wait for next tick to ensure DOM is updated
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Check if video element exists
      if (!videoRef.current) {
        throw new Error('Video element not found. Please try again.')
      }
      
      console.log(' Video element ready:', videoRef.current)

      // Initialize tracker (it will handle camera internally)
      console.log(' Initializing MediaPipe tracker...')
      trackerRef.current = new MediaEyeTracker(videoRef.current, canvasRef.current)

      // Set up callbacks
      trackerRef.current.onBlink = (blinkData) => {
        console.log(' Blink detected:', blinkData)
      }

      trackerRef.current.onMetricsUpdate = (newMetrics) => {
        setMetrics(newMetrics)
      }

      trackerRef.current.onFaceDetected = (detected) => {
        setFaceDetected(detected)
        if (!detected && isTracking) {
          toast.error('Face not detected. Please stay in view.', { duration: 2000 })
        }
      }

      // Start tracking (MediaPipe Camera class will handle the stream)
      console.log(' Starting eye tracking...')
      await trackerRef.current.start()
      setIsTracking(true)
      toast.success('Eye tracking started! Keep your face in view.')

      // Start timer
      startTimer()
    } catch (error) {
      console.error(' Failed to start session:', error)
      setSessionState('instruction') // Go back to instruction screen
      
      let errorMessage = 'Failed to start camera. '
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Please allow camera permissions.'
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera found on this device.'
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Camera is already in use by another application.'
      } else if (error.message) {
        errorMessage += error.message
      }
      
      toast.error(errorMessage, { duration: 5000 })
    }
  }

  /**
   * Timer for session duration
   */
  const startTimer = () => {
    const startTime = Date.now()
    const endTime = startTime + SESSION_DURATION * 1000

    const timerInterval = setInterval(() => {
      const now = Date.now()
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000))
      const progress = ((SESSION_DURATION - remaining) / SESSION_DURATION) * 100

      setTimeRemaining(remaining)
      setSessionProgress(progress)

      if (remaining === 0) {
        clearInterval(timerInterval)
        completeSession()
      }
    }, 1000)
  }

  /**
   * Complete the session and show results
   */
  const completeSession = async () => {
    if (!trackerRef.current) return

    const sessionSummary = trackerRef.current.stop()
    setIsTracking(false)
    setResults(sessionSummary)

    console.log(' Session complete:', sessionSummary)

    // Generate personalized feedback using AI
    if (userProfile) {
      const testResult = {
        test_type: 'eye_tracking',
        score: Math.max(0, 100 - sessionSummary.fatigueScore),
        metadata: {
          fatigueScore: sessionSummary.fatigueScore,
          blinkRate: sessionSummary.blinkRate,
          totalBlinks: sessionSummary.totalBlinks,
          avgBlinkDuration: sessionSummary.avgBlinkDuration,
        },
      }

      const feedback = generatePersonalizedFeedback(testResult, {
        age: userProfile.age,
        screen_time_hours: userProfile.avg_screen_time_hours,
        avg_sleep_hours: userProfile.avg_sleep_hours,
        lens_type: userProfile.lens_type,
        activity_level: userProfile.activity_level,
        lighting_condition: userProfile.lighting_condition,
      })

      setPersonalizedFeedback(feedback)
      console.log(' AI Feedback generated:', feedback)
    }

    // Save to backend
    try {
      const response = await visionTestAPI.submit({
        test_type: 'eye_tracking',
        score: Math.max(0, 100 - sessionSummary.fatigueScore),
        notes: `Eye Tracking Analysis - Blink Rate: ${sessionSummary.blinkRate}/min, Fatigue Score: ${sessionSummary.fatigueScore}`,
        test_details: {
          blinkRate: sessionSummary.blinkRate,
          totalBlinks: sessionSummary.totalBlinks,
          avgBlinkDuration: sessionSummary.avgBlinkDuration,
          fatigueScore: sessionSummary.fatigueScore,
          status: sessionSummary.status,
          recommendation: sessionSummary.recommendation,
        },
      })

      console.log(' Session saved:', response.data)
      toast.success('Session saved successfully!')
      
      // Transition to results screen
      setSessionState('results')
    } catch (error) {
      console.error('Failed to save session:', error)
      toast.error('Failed to save session data')
      // Still show results even if save fails
      setSessionState('results')
    }
  }

  /**
   * Format time display
   */
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  /**
   * Get fatigue color
   */
  const getFatigueColor = (score) => {
    if (score < 30) return 'text-green-600'
    if (score < 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  /**
   * Get fatigue background color
   */
  const getFatigueBgColor = (score) => {
    if (score < 30) return 'bg-green-100'
    if (score < 60) return 'bg-yellow-100'
    return 'bg-red-100'
  }

  return (
    <div className="test-shell">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 animate-fade-in-up">
          <button
            onClick={() => navigate('/vision-tests')}
            className="btn-ghost mb-4 min-h-[44px] -ml-4"
          >
            ← Back to Tests
          </button>
          <h1 className="page-title">Eye Tracking Analysis</h1>
          <p className="page-subtitle">
            Advanced eye movement and blink rate analysis using AI-powered computer vision
          </p>
        </div>

        {/* Instruction State */}
        {sessionState === 'instruction' && (
          <div className="card p-8 animate-fade-in-up">
            <div className="text-center mb-8">
              <div className="icon-tile w-20 h-20 bg-accent-50 text-accent-600 rounded-full mx-auto mb-4">
                <Eye className="w-10 h-10" />
              </div>
              <h2 className="section-title mb-2">Before We Begin</h2>
              <p className="text-gray-500">Please read these instructions carefully</p>
            </div>

            <div className="space-y-6 mb-8">
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-brand-gradient text-white rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Position Yourself Correctly</h3>
                  <p className="text-gray-500">Sit 50–70 cm (arm's length) from your screen</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-brand-gradient text-white rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Ensure Good Lighting</h3>
                  <p className="text-gray-500">
                    Face a light source. Avoid backlighting or harsh shadows on your face
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-brand-gradient text-white rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Keep Your Head Stable</h3>
                  <p className="text-gray-500">
                    Minimize head movements during the test. Natural blinking is encouraged
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-brand-gradient text-white rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
                  4
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Duration: 5 Minutes</h3>
                  <p className="text-gray-500">
                    The session will automatically end after 5 minutes of continuous tracking
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-brand-gradient text-white rounded-full flex items-center justify-center flex-shrink-0 font-semibold">
                  5
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Calibration Status</h3>
                  <p className="text-gray-500">
                    {isCalibrated === null ? (
                      <span className="text-gray-500">Checking calibration...</span>
                    ) : isCalibrated ? (
                      <span className="text-green-600 font-medium">✓ Calibrated for accurate detection</span>
                    ) : (
                      <span className="text-amber-600 font-medium">
                        Not calibrated (may miss blinks, especially with slim eyes)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {isCalibrated === false && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-6">
                <div className="flex items-start space-x-4">
                  <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-amber-900 mb-2">Calibration Strongly Recommended</h3>
                    <p className="text-amber-800 text-sm mb-3">
                      <strong>Important for slim/hooded eyes:</strong> Without calibration, the system uses a generic threshold that may not detect your blinks accurately. 
                      Calibration takes 2 minutes and dramatically improves detection for all eye shapes.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => navigate('/calibrate-blink')}
                        className="btn-primary min-h-[44px]"
                      >
                        Calibrate Now (2 min)
                      </button>
                      <button
                        onClick={() => setIsCalibrated(true)} // Allow skip
                        className="btn-secondary min-h-[44px]"
                      >
                        Continue Anyway
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-brand-soft border border-accent-100 rounded-2xl p-4 mb-6">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-accent-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">What We Measure</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Blink rate (normal: 12-20 blinks/minute)</li>
                    <li>• Blink duration (normal: 100-300 milliseconds)</li>
                    <li>• Eye movement patterns (saccades & fixations)</li>
                    <li>• Eye fatigue indicators</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              onClick={startSession}
              className="btn-primary w-full min-h-[44px] py-4"
            >
              Start Eye Tracking Session
            </button>
          </div>
        )}

        {/* Tracking State */}
        {sessionState === 'tracking' && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Video Feed */}
            <div className="card p-6">
              <div className="relative bg-black rounded-xl overflow-hidden mb-4" style={{ aspectRatio: '4/3' }}>
                <video 
                  ref={videoRef} 
                  className="w-full h-full object-cover" 
                  playsInline 
                  autoPlay 
                  muted
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                  width="640"
                  height="480"
                />

                {/* Face Detection Indicator */}
                <div className="absolute top-4 left-4">
                  <div className={`badge shadow-soft ${faceDetected ? 'badge-success' : 'badge-danger'}`}>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        faceDetected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                      }`}
                    />
                    {faceDetected ? 'Face Detected' : 'No Face Detected'}
                  </div>
                </div>

                {/* Timer */}
                <div className="absolute top-4 right-4 bg-black/70 px-4 py-2 rounded-full">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-white" />
                    <span className="text-white font-mono text-lg">{formatTime(timeRemaining)}</span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-accent-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${sessionProgress}%` }}
                />
              </div>
            </div>

            {/* Real-Time Metrics */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">Blink Rate</span>
                  <div className="icon-tile w-9 h-9 bg-accent-50 text-accent-600 rounded-lg">
                    <Eye className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics.blinkRate}
                  <span className="text-sm text-gray-500 ml-1">/min</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">Normal: 12-20/min</div>
              </div>

              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">Total Blinks</span>
                  <div className="icon-tile w-9 h-9 bg-accent-50 text-accent-600 rounded-lg">
                    <Activity className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900">{metrics.totalBlinks}</div>
                <div className="text-xs text-gray-500 mt-1">Blinks detected</div>
              </div>

              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">Avg Duration</span>
                  <div className="icon-tile w-9 h-9 bg-accent-50 text-accent-600 rounded-lg">
                    <Zap className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics.avgBlinkDuration}
                  <span className="text-sm text-gray-500 ml-1">ms</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">Normal: 100-300ms</div>
              </div>

              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">Fatigue Score</span>
                  <div className={`icon-tile w-9 h-9 rounded-lg ${getFatigueBgColor(metrics.fatigueScore)} ${getFatigueColor(metrics.fatigueScore)}`}>
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className={`text-2xl font-bold ${getFatigueColor(metrics.fatigueScore)}`}>
                  {metrics.fatigueScore}
                  <span className="text-sm text-gray-500 ml-1">/100</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{results?.status || 'Analyzing...'}</div>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-brand-soft border border-accent-100 rounded-2xl p-4">
              <p className="text-gray-700 text-center">
                Keep your face in view and blink naturally. The session will complete automatically.
              </p>
            </div>
          </div>
        )}

        {/* Results State */}
        {sessionState === 'results' && results && (
          <div className="space-y-6 animate-fade-in-up">
            {/* AI-Powered Summary Card */}
            <div className="card p-8">
              <div className="text-center mb-8">
                <div
                  className={`w-20 h-20 ${getFatigueBgColor(
                    results.fatigueScore
                  )} rounded-full flex items-center justify-center mx-auto mb-4`}
                >
                  <Brain className={`w-10 h-10 ${getFatigueColor(results.fatigueScore)}`} />
                </div>
                <h2 className="section-title mb-2">
                  {personalizedFeedback?.title || 'Session Complete!'}
                </h2>
                <p className={`text-xl font-semibold ${getFatigueColor(results.fatigueScore)}`}>
                  {results.status}
                </p>
              </div>

              {/* Personalized Assessment */}
              {personalizedFeedback?.assessment && (
                <div className="bg-brand-soft border border-accent-100 rounded-2xl p-6 mb-8">
                  <div className="flex items-start space-x-3">
                    <div className="icon-tile bg-accent-50 text-accent-600">
                      <Brain className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">AI Analysis</h3>
                      <p className="text-gray-700 leading-relaxed">{personalizedFeedback.assessment}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Detailed Results */}
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="text-center p-4 bg-gray-50 rounded-2xl border border-gray-100/80">
                  <div className="text-3xl font-bold text-gray-900 mb-1">{results.blinkRate}</div>
                  <div className="text-sm text-gray-500">Blinks/Min</div>
                  <div className="text-xs text-gray-500 mt-1">(Normal: 12-20)</div>
                  {results.blinkRate < 12 && (
                    <div className="text-xs text-red-600 mt-2 font-medium"> Below normal</div>
                  )}
                  {results.blinkRate > 20 && (
                    <div className="text-xs text-amber-600 mt-2 font-medium"> Above normal</div>
                  )}
                </div>

                <div className="text-center p-4 bg-gray-50 rounded-2xl border border-gray-100/80">
                  <div className="text-3xl font-bold text-gray-900 mb-1">{results.avgBlinkDuration}</div>
                  <div className="text-sm text-gray-500">Avg Duration (ms)</div>
                  <div className="text-xs text-gray-500 mt-1">(Normal: 100-300)</div>
                  {results.avgBlinkDuration > 300 && (
                    <div className="text-xs text-amber-600 mt-2 font-medium"> Prolonged</div>
                  )}
                </div>

                <div className="text-center p-4 bg-gray-50 rounded-2xl border border-gray-100/80">
                  <div className={`text-3xl font-bold mb-1 ${getFatigueColor(results.fatigueScore)}`}>
                    {results.fatigueScore}
                  </div>
                  <div className="text-sm text-gray-500">Fatigue Score</div>
                  <div className="text-xs text-gray-500 mt-1">(Lower is better)</div>
                </div>
              </div>

              {/* Personalized Insights */}
              {personalizedFeedback?.insights && personalizedFeedback.insights.length > 0 && (
                <div className="mb-8">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2 text-accent-600" />
                    Key Insights About Your Eye Health
                  </h3>
                  <div className="space-y-3">
                    {personalizedFeedback.insights.map((insight, idx) => (
                      <div key={idx} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="text-gray-800">{insight}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Personalized Recommendations */}
              {personalizedFeedback?.recommendations && personalizedFeedback.recommendations.length > 0 && (
                <div className="mb-8">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                    <ThumbsUp className="w-5 h-5 mr-2 text-green-600" />
                    Personalized Action Plan
                  </h3>
                  <div className="space-y-3">
                    {personalizedFeedback.recommendations.map((rec, idx) => (
                      <div
                        key={idx}
                        className={`border rounded-xl p-4 ${
                          rec.priority === 'urgent'
                            ? 'bg-red-50 border-red-200'
                            : rec.priority === 'high'
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-green-50 border-green-200'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          {rec.priority === 'urgent' && (
                            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900 mb-1">{rec.action}</div>
                            <div className="text-sm text-gray-600">{rec.reason}</div>
                          </div>
                          <span
                            className={`badge ${
                              rec.priority === 'urgent'
                                ? 'badge-danger'
                                : rec.priority === 'high'
                                ? 'badge-warning'
                                : 'badge-success'
                            }`}
                          >
                            {rec.priority}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next Steps */}
              {personalizedFeedback?.nextSteps && personalizedFeedback.nextSteps.length > 0 && (
                <div className="mb-8">
                  <h3 className="font-semibold text-gray-900 mb-4"> Recommended Next Steps</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    {personalizedFeedback.nextSteps.map((step, idx) => (
                      <button
                        key={idx}
                        onClick={() => navigate(step.link)}
                        className="text-left bg-white hover:bg-accent-50 border border-gray-100/80 hover:border-accent-300 rounded-2xl p-4 shadow-soft hover:shadow-card transition-all duration-300 hover:-translate-y-0.5 min-h-[44px]"
                      >
                        <div className="font-semibold text-gray-900 mb-1">{step.step}</div>
                        <div className="text-sm text-gray-600">{step.reason}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Generic Recommendation (fallback) */}
              {!personalizedFeedback && (
                <div
                  className={`${getFatigueBgColor(results.fatigueScore)} border ${
                    results.fatigueScore < 30
                      ? 'border-green-200'
                      : results.fatigueScore < 60
                      ? 'border-yellow-200'
                      : 'border-red-200'
                  } rounded-xl p-6 mb-6`}
                >
                  <h3 className="font-semibold text-gray-900 mb-2">Recommendation</h3>
                  <p className="text-gray-700">{results.recommendation}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="btn-primary flex-1 min-h-[44px]"
                >
                  View Dashboard
                </button>
                <button
                  onClick={() => navigate('/trends')}
                  className="btn-secondary flex-1 min-h-[44px]"
                >
                  View Trends
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
