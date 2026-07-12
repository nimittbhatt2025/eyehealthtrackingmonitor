import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Eye, Activity, Zap, TrendingUp, Clock, AlertCircle, Brain, ThumbsUp, AlertTriangle } from 'lucide-react'
import MediaEyeTracker from '../utils/mediaEyeTracker'
import { generatePersonalizedFeedback, assessDoctorVisit } from '../utils/eyeHealthAI'
import { useAuthStore } from '../store/authStore'
import { authAPI, visionTestAPI, calibrationAPI } from '../services/api'
import { VisionTestShell, TestPrepLayout, TestDetails, TestExitButton } from '../components/TestPrepLayout'

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
    isCalibrating: true,
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

  const exitSession = useCallback(() => {
    const leave = () => {
      if (trackerRef.current) {
        try { trackerRef.current.stop() } catch { /* ignore */ }
      }
      setIsTracking(false)
      navigate('/vision-tests')
    }

    if (sessionState === 'tracking' && isTracking) {
      if (window.confirm('Exit this session? Your progress will be lost.')) {
        leave()
      }
      return
    }

    leave()
  }, [sessionState, isTracking, navigate])

  const renderMetricCard = (label, value, suffix, hint, icon) => (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <div className="icon-tile w-7 h-7 bg-accent-50 text-accent-600 rounded-lg">{icon}</div>
      </div>
      <div className="text-xl font-bold text-gray-900">
        {value}
        {suffix && <span className="text-sm text-gray-500 ml-1">{suffix}</span>}
      </div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  )

  const renderVideoFeed = () => (
    <div className="eye-coverage-video-wrap relative w-full h-full min-h-[200px] bg-black rounded-xl overflow-hidden">
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
      <div className="absolute top-3 left-3">
        <div className={`badge shadow-soft text-xs ${faceDetected ? 'badge-success' : 'badge-danger'}`}>
          <span className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          {faceDetected ? 'Face detected' : 'No face'}
        </div>
      </div>
      <div className="absolute top-3 right-3 bg-black/70 px-3 py-1.5 rounded-full flex items-center gap-2">
        <Clock className="w-4 h-4 text-white" />
        <span className="text-white font-mono text-sm">{formatTime(timeRemaining)}</span>
      </div>
    </div>
  )

  return (
    <div className="vision-test-page">
      <div className="vision-test-page-bar">
        <TestExitButton
          onExit={sessionState === 'results' ? () => navigate('/vision-tests') : exitSession}
          label={sessionState === 'results' ? 'Back to tests' : 'Exit session'}
        />
      </div>

        {/* Instruction State */}
        {sessionState === 'instruction' && (
          <TestPrepLayout
            title="Eye Tracking Analysis"
            subtitle="5-minute blink & fatigue monitoring (~5 min)"
            steps={[
              'Sit 50–70 cm from the screen with good face lighting.',
              'Keep your head still and blink naturally.',
              'Session ends automatically after 5 minutes.',
            ]}
            onBack={exitSession}
            onPrimary={startSession}
            primaryLabel="Start session"
            footerNote="Measures blink rate, duration, and fatigue indicators."
          >
            <TestDetails summary="Calibration status">
              <p className="text-xs">
                {isCalibrated === null ? (
                  'Checking calibration…'
                ) : isCalibrated ? (
                  <span className="text-green-700 font-medium">Calibrated — best detection accuracy</span>
                ) : (
                  <span className="text-amber-700 font-medium">Not calibrated — may miss some blinks</span>
                )}
              </p>
            </TestDetails>

            {isCalibrated === false && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
                <p className="font-semibold mb-2">Calibration recommended</p>
                <p className="mb-3">Especially for slim or hooded eyes — takes about 2 minutes.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => navigate('/calibrate-blink')} className="btn-primary min-h-[44px] text-sm">
                    Calibrate now
                  </button>
                  <button type="button" onClick={() => setIsCalibrated(true)} className="btn-secondary min-h-[44px] text-sm">
                    Continue anyway
                  </button>
                </div>
              </div>
            )}

            <TestDetails summary="What we measure">
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li>Blink rate (normal: 12–20/min)</li>
                <li>Blink duration (normal: 100–300 ms)</li>
                <li>Eye movement patterns</li>
                <li>Fatigue indicators</li>
              </ul>
            </TestDetails>
          </TestPrepLayout>
        )}

        {/* Tracking State */}
        {sessionState === 'tracking' && (
          <VisionTestShell
            title="Eye tracking session"
            subtitle="Blink naturally — keep your face in view"
            statusBar={(
              <span className="text-sm font-mono font-semibold text-gray-700">
                {Math.round(sessionProgress)}%
              </span>
            )}
            stimulus={renderVideoFeed()}
            controls={(
              <>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-accent-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${sessionProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 text-center">
                  {formatTime(timeRemaining)} remaining
                </p>

                {metrics.isCalibrating && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                    Calibrating blink detection — keep eyes open for a moment, then blink naturally.
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {renderMetricCard('Blink rate', metrics.blinkRate, '/min', 'Normal: 12–20', <Eye className="w-3.5 h-3.5" />)}
                  {renderMetricCard('Total blinks', metrics.totalBlinks, '', 'Detected', <Activity className="w-3.5 h-3.5" />)}
                  {renderMetricCard('Avg duration', metrics.avgBlinkDuration, 'ms', 'Normal: 100–300', <Zap className="w-3.5 h-3.5" />)}
                  {renderMetricCard(
                    'Fatigue',
                    metrics.fatigueScore,
                    '/100',
                    results?.status || 'Analyzing…',
                    <TrendingUp className={`w-3.5 h-3.5 ${getFatigueColor(metrics.fatigueScore)}`} />
                  )}
                </div>

                <p className="text-xs text-gray-600 bg-brand-soft border border-accent-100 rounded-lg px-3 py-2 mt-auto">
                  Keep your face centered. The session completes automatically when the timer ends.
                </p>
              </>
            )}
          />
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
  )
}
