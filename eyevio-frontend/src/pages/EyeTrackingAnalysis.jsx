import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Eye, Activity, Zap, TrendingUp, Clock, AlertCircle, Brain, ThumbsUp, AlertTriangle } from 'lucide-react'
import MediaEyeTracker from '../utils/mediaEyeTracker'
import { generatePersonalizedFeedback, assessDoctorVisit } from '../utils/eyeHealthAI'
import { useAuthStore } from '../store/authStore'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002'

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
      const token = localStorage.getItem('access_token')
      const response = await axios.get(`${API_URL}/calibration/status`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
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
      const token = localStorage.getItem('access_token')
      const response = await axios.get(`${API_URL}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
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
      const token = localStorage.getItem('access_token')
      const response = await axios.post(
        `${API_URL}/api/vision-tests`,
        {
          test_type: 'eye_tracking',
          score: Math.max(0, 100 - sessionSummary.fatigueScore),
          notes: `Eye Tracking Analysis - Blink Rate: ${sessionSummary.blinkRate}/min, Fatigue Score: ${sessionSummary.fatigueScore}`,
          metadata: {
            blinkRate: sessionSummary.blinkRate,
            totalBlinks: sessionSummary.totalBlinks,
            avgBlinkDuration: sessionSummary.avgBlinkDuration,
            fatigueScore: sessionSummary.fatigueScore,
            status: sessionSummary.status,
            recommendation: sessionSummary.recommendation,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/vision-tests')}
            className="text-primary-600 hover:text-primary-700 mb-4 flex items-center"
          >
            ← Back to Tests
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Eye Tracking Analysis</h1>
          <p className="text-gray-600">
            Advanced eye movement and blink rate analysis using AI-powered computer vision
          </p>
        </div>

        {/* Instruction State */}
        {sessionState === 'instruction' && (
          <div className="bg-white rounded-2xl shadow-sm p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Eye className="w-10 h-10 text-primary-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Before We Begin</h2>
              <p className="text-gray-600">Please read these instructions carefully</p>
            </div>

            <div className="space-y-6 mb-8">
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center flex-shrink-0">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Position Yourself Correctly</h3>
                  <p className="text-gray-600">Sit 50–70 cm (arm's length) from your screen</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center flex-shrink-0">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Ensure Good Lighting</h3>
                  <p className="text-gray-600">
                    Face a light source. Avoid backlighting or harsh shadows on your face
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center flex-shrink-0">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Keep Your Head Stable</h3>
                  <p className="text-gray-600">
                    Minimize head movements during the test. Natural blinking is encouraged
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center flex-shrink-0">
                  4
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Duration: 5 Minutes</h3>
                  <p className="text-gray-600">
                    The session will automatically end after 5 minutes of continuous tracking
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center flex-shrink-0">
                  5
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Calibration Status</h3>
                  <p className="text-gray-600">
                    {isCalibrated === null ? (
                      <span className="text-gray-500">Checking calibration...</span>
                    ) : isCalibrated ? (
                      <span className="text-green-600 font-medium">✓ Calibrated for accurate detection</span>
                    ) : (
                      <span className="text-orange-600 font-medium">
                        [WARNING] Not calibrated (may miss blinks, especially with slim eyes)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {isCalibrated === false && (
              <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-6 mb-6">
                <div className="flex items-start space-x-4">
                  <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-orange-900 mb-2">[WARNING] Calibration Strongly Recommended</h3>
                    <p className="text-orange-800 text-sm mb-3">
                      <strong>Important for slim/hooded eyes:</strong> Without calibration, the system uses a generic threshold that may not detect your blinks accurately. 
                      Calibration takes 2 minutes and dramatically improves detection for all eye shapes.
                    </p>
                    <div className="flex space-x-3">
                      <button
                        onClick={() => navigate('/blink-calibration')}
                        className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                      >
                        Calibrate Now (2 min)
                      </button>
                      <button
                        onClick={() => setIsCalibrated(true)} // Allow skip
                        className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg font-semibold transition-colors"
                      >
                        Continue Anyway
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">What We Measure</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
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
              className="w-full bg-primary-600 text-white py-4 rounded-xl font-semibold hover:bg-primary-700 transition-colors"
            >
              Start Eye Tracking Session
            </button>
          </div>
        )}

        {/* Tracking State */}
        {sessionState === 'tracking' && (
          <div className="space-y-6">
            {/* Video Feed */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
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
                  <div
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
                      faceDetected ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        faceDetected ? 'bg-white animate-pulse' : 'bg-white'
                      }`}
                    />
                    <span className="text-white text-sm font-medium">
                      {faceDetected ? 'Face Detected' : 'No Face Detected'}
                    </span>
                  </div>
                </div>

                {/* Timer */}
                <div className="absolute top-4 right-4 bg-black/70 px-4 py-2 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-white" />
                    <span className="text-white font-mono text-lg">{formatTime(timeRemaining)}</span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${sessionProgress}%` }}
                />
              </div>
            </div>

            {/* Real-Time Metrics */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 text-sm">Blink Rate</span>
                  <Eye className="w-4 h-4 text-primary-600" />
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics.blinkRate}
                  <span className="text-sm text-gray-500 ml-1">/min</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">Normal: 12-20/min</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 text-sm">Total Blinks</span>
                  <Activity className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{metrics.totalBlinks}</div>
                <div className="text-xs text-gray-500 mt-1">Blinks detected</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 text-sm">Avg Duration</span>
                  <Zap className="w-4 h-4 text-yellow-600" />
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {metrics.avgBlinkDuration}
                  <span className="text-sm text-gray-500 ml-1">ms</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">Normal: 100-300ms</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600 text-sm">Fatigue Score</span>
                  <TrendingUp className="w-4 h-4 text-red-600" />
                </div>
                <div className={`text-2xl font-bold ${getFatigueColor(metrics.fatigueScore)}`}>
                  {metrics.fatigueScore}
                  <span className="text-sm text-gray-500 ml-1">/100</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{results?.status || 'Analyzing...'}</div>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-blue-900 text-center">
                Keep your face in view and blink naturally. The session will complete automatically.
              </p>
            </div>
          </div>
        )}

        {/* Results State */}
        {sessionState === 'results' && results && (
          <div className="space-y-6">
            {/* AI-Powered Summary Card */}
            <div className="bg-white rounded-2xl shadow-sm p-8">
              <div className="text-center mb-8">
                <div
                  className={`w-20 h-20 ${getFatigueBgColor(
                    results.fatigueScore
                  )} rounded-full flex items-center justify-center mx-auto mb-4`}
                >
                  <Brain className={`w-10 h-10 ${getFatigueColor(results.fatigueScore)}`} />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">
                  {personalizedFeedback?.title || 'Session Complete!'}
                </h2>
                <p className={`text-xl font-semibold ${getFatigueColor(results.fatigueScore)}`}>
                  {results.status}
                </p>
              </div>

              {/* Personalized Assessment */}
              {personalizedFeedback?.assessment && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
                  <div className="flex items-start space-x-3">
                    <Brain className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-blue-900 mb-2"> AI Analysis</h3>
                      <p className="text-blue-800 leading-relaxed">{personalizedFeedback.assessment}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Detailed Results */}
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="text-center p-4 bg-gray-50 rounded-xl">
                  <div className="text-3xl font-bold text-gray-900 mb-1">{results.blinkRate}</div>
                  <div className="text-sm text-gray-600">Blinks/Min</div>
                  <div className="text-xs text-gray-500 mt-1">(Normal: 12-20)</div>
                  {results.blinkRate < 12 && (
                    <div className="text-xs text-red-600 mt-2 font-medium"> Below normal</div>
                  )}
                  {results.blinkRate > 20 && (
                    <div className="text-xs text-yellow-600 mt-2 font-medium"> Above normal</div>
                  )}
                </div>

                <div className="text-center p-4 bg-gray-50 rounded-xl">
                  <div className="text-3xl font-bold text-gray-900 mb-1">{results.avgBlinkDuration}</div>
                  <div className="text-sm text-gray-600">Avg Duration (ms)</div>
                  <div className="text-xs text-gray-500 mt-1">(Normal: 100-300)</div>
                  {results.avgBlinkDuration > 300 && (
                    <div className="text-xs text-yellow-600 mt-2 font-medium"> Prolonged</div>
                  )}
                </div>

                <div className="text-center p-4 bg-gray-50 rounded-xl">
                  <div className={`text-3xl font-bold mb-1 ${getFatigueColor(results.fatigueScore)}`}>
                    {results.fatigueScore}
                  </div>
                  <div className="text-sm text-gray-600">Fatigue Score</div>
                  <div className="text-xs text-gray-500 mt-1">(Lower is better)</div>
                </div>
              </div>

              {/* Personalized Insights */}
              {personalizedFeedback?.insights && personalizedFeedback.insights.length > 0 && (
                <div className="mb-8">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2 text-blue-600" />
                    Key Insights About Your Eye Health
                  </h3>
                  <div className="space-y-3">
                    {personalizedFeedback.insights.map((insight, idx) => (
                      <div key={idx} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
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
                        className={`border rounded-lg p-4 ${
                          rec.priority === 'urgent'
                            ? 'bg-red-50 border-red-300'
                            : rec.priority === 'high'
                            ? 'bg-orange-50 border-orange-300'
                            : 'bg-green-50 border-green-300'
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
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              rec.priority === 'urgent'
                                ? 'bg-red-100 text-red-700'
                                : rec.priority === 'high'
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-green-100 text-green-700'
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
                        className="text-left bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg p-4 transition-colors"
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
              <div className="flex space-x-4">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="flex-1 bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors"
                >
                  View Dashboard
                </button>
                <button
                  onClick={() => navigate('/trends')}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
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
