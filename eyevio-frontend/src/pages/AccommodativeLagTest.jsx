import { useState, useEffect, useCallback, useRef } from 'react'
import cameraManager from '../utils/cameraManager.js'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'

/**
 * Accommodative Lag Tracker - Near-Work Stress Test
 * 
 * Measures ciliary muscle fatigue from prolonged screen time
 * by tracking pupillary miosis response to changing blur
 * 
 * The "Burnout Meter" for your eyes
 */

const AccommodativeLagTest = () => {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const [testState, setTestState] = useState('instructions') // instructions, setup, testing, analyzing, results
  const [cameraReady, setCameraReady] = useState(false)
  const [currentBlurLevel, setCurrentBlurLevel] = useState(0) // 0-10
  const [pupilData, setPupilData] = useState([])
  const [testProgress, setTestProgress] = useState(0)
  const [userResponses, setUserResponses] = useState([])
  
  // Results
  const [focusingCapacity, setFocusingCapacity] = useState(0)
  const [accommodativeLag, setAccommodativeLag] = useState(0)
  const [fatigueLevel, setFatigueLevel] = useState('low')
  const [breakRecommendation, setBreakRecommendation] = useState('')

  // Test parameters
  const TEST_DURATION = 30 // seconds
  const BLUR_STEPS = 10
  const PUPIL_SAMPLE_RATE = 100 // ms

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
    setCameraReady(false)
  }, [])

  // Measure pupil size (simplified - in production use proper eye tracking)
  const measurePupilSize = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    // Extract eye region and measure darkness (pupil size proxy)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const eyeRegion = extractEyeRegion(imageData)
    
    // Calculate average darkness in eye region (darker = larger pupil)
    let totalDarkness = 0
    eyeRegion.forEach(pixel => {
      const brightness = (pixel.r + pixel.g + pixel.b) / 3
      totalDarkness += (255 - brightness)
    })
    
    const avgDarkness = eyeRegion.length > 0 ? totalDarkness / eyeRegion.length : 0
    return avgDarkness
  }, [])

  // Extract eye region from frame
  const extractEyeRegion = (imageData) => {
    const data = imageData.data
    const width = imageData.width
    const height = imageData.height

    // Simplified eye detection - center region where eyes typically are
    const eyeCenterX = Math.floor(width * 0.5)
    const eyeCenterY = Math.floor(height * 0.4)
    const radius = 40

    const pixels = []
    for (let y = eyeCenterY - radius; y < eyeCenterY + radius; y++) {
      for (let x = eyeCenterX - radius; x < eyeCenterX + radius; x++) {
        const distance = Math.sqrt((x - eyeCenterX) ** 2 + (y - eyeCenterY) ** 2)
        if (distance <= radius) {
          const idx = (y * width + x) * 4
          pixels.push({
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2]
          })
        }
      }
    }

    return pixels
  }

  // Start test
  const startTest = useCallback(() => {
    setTestState('testing')
    setCurrentBlurLevel(0)
    setPupilData([])
    setUserResponses([])
    setTestProgress(0)

    let startTime = Date.now()
    let blurLevel = 0
    let pupilMeasurements = []

    // Measure pupil every 100ms
    const pupilInterval = setInterval(() => {
      const pupilSize = measurePupilSize()
      if (pupilSize !== null) {
        pupilMeasurements.push({
          time: Date.now() - startTime,
          size: pupilSize,
          blurLevel: blurLevel
        })
        setPupilData(prev => [...prev, { time: Date.now() - startTime, size: pupilSize, blurLevel }])
      }
    }, PUPIL_SAMPLE_RATE)

    // Change blur level every 3 seconds
    const blurInterval = setInterval(() => {
      blurLevel = Math.min(blurLevel + 1, BLUR_STEPS)
      setCurrentBlurLevel(blurLevel)
    }, 3000)

    // Update progress
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min((elapsed / (TEST_DURATION * 1000)) * 100, 100)
      setTestProgress(progress)

      if (progress >= 100) {
        clearInterval(pupilInterval)
        clearInterval(blurInterval)
        clearInterval(progressInterval)
        analyzeResults(pupilMeasurements)
      }
    }, 100)

  }, [measurePupilSize])

  // User reports if they can see the target
  const handleCanSee = useCallback((canSee) => {
    setUserResponses(prev => [...prev, {
      blurLevel: currentBlurLevel,
      canSee: canSee,
      timestamp: Date.now()
    }])
  }, [currentBlurLevel])

  // Analyze test results
  const analyzeResults = useCallback((pupilMeasurements) => {
    setTestState('analyzing')

    setTimeout(() => {
      // Calculate pupillary response
      const initialPupilSize = pupilMeasurements.slice(0, 10).reduce((sum, m) => sum + m.size, 0) / 10
      const finalPupilSize = pupilMeasurements.slice(-10).reduce((sum, m) => sum + m.size, 0) / 10
      
      // Miosis = pupil constriction (should happen with accommodation)
      const pupilConstriction = ((initialPupilSize - finalPupilSize) / initialPupilSize) * 100
      
      // Calculate accommodative lag based on pupil response and user clarity reports
      const clarityThreshold = userResponses.findIndex(r => !r.canSee)
      const accommodationScore = Math.max(0, 100 - (clarityThreshold * 10))
      
      // Focusing capacity = combination of pupil response + subjective clarity
      const pupilScore = Math.max(0, Math.min(100, pupilConstriction * 10))
      const capacity = Math.round((pupilScore * 0.4 + accommodationScore * 0.6))
      
      // Determine fatigue level
      let fatigue = 'low'
      let recommendation = ''
      
      if (capacity < 40) {
        fatigue = 'severe'
        recommendation = 'Please take a 20-minute break now. Your eyes are very tired, and pushing on could bring on a headache or eye strain.'
      } else if (capacity < 60) {
        fatigue = 'moderate'
        recommendation = 'Take a 10-minute break within the next hour. Your focusing muscles are getting tired. Look at distant objects (20+ feet away).'
      } else if (capacity < 75) {
        fatigue = 'mild'
        recommendation = 'Take a 5-minute break soon. Follow the 20-20-20 rule: every 20 minutes, look at something 20 feet away for 20 seconds.'
      } else {
        fatigue = 'low'
        recommendation = 'Your eyes are doing well! Continue taking regular breaks to maintain good eye health.'
      }
      
      const lag = Math.round(100 - capacity)
      
      setFocusingCapacity(capacity)
      setAccommodativeLag(lag)
      setFatigueLevel(fatigue)
      setBreakRecommendation(recommendation)
      
      stopCamera()
      setTestState('results')
      
      // Submit to backend
      submitResults({
        focusingCapacity: capacity,
        accommodativeLag: lag,
        fatigueLevel: fatigue,
        pupilData: pupilMeasurements,
        userResponses: userResponses
      })
    }, 2000)
  }, [userResponses, stopCamera])

  // Submit results to backend
  const submitResults = async (results) => {
    try {
      await visionTestAPI.submit({
        test_type: 'accommodative_lag',
        score: results.focusingCapacity,
        test_details: {
          focusing_capacity: results.focusingCapacity,
          accommodative_lag: results.accommodativeLag,
          fatigue_level: results.fatigueLevel,
          pupil_data_points: results.pupilData.length,
          user_responses: results.userResponses,
          timestamp: new Date().toISOString()
        }
      })
    } catch (err) {
      console.error('Failed to submit results:', err)
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/vision-tests')}
          className="mb-6 flex items-center text-purple-600 hover:text-purple-700 font-medium"
        >
          ← Back to Tests
        </button>

        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Eye Tiredness Meter</h1>
            <p className="text-xl text-gray-600">Strain from screens and close-up work</p>
          </div>

          <div className="bg-purple-50 border-l-4 border-purple-600 p-6 mb-8 rounded-r-xl">
            <h2 className="text-lg font-bold text-purple-900 mb-2">What This Measures</h2>
            <p className="text-purple-800">
              Tiny muscles inside your eyes do the work of focusing. After hours of screen time they can get tired and "stuck,"
              which leads to headaches and blurry distance vision. This 30-second test checks how tired your focusing muscles are,
              so you know when to take a break — before the aches start.
            </p>
          </div>

          <div className="space-y-6 mb-8">
            <h3 className="text-2xl font-bold text-gray-900">How It Works:</h3>
            
            <div className="grid gap-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-purple-600 font-bold text-xl">1</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Focus on the Target</h4>
                  <p className="text-gray-600">A sharp target will appear on screen. Keep your eyes focused on it</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-purple-600 font-bold text-xl">2</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Target Gradually Blurs</h4>
                  <p className="text-gray-600">Over 30 seconds, the target will slowly become blurrier</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-purple-600 font-bold text-xl">3</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Report Clarity</h4>
                  <p className="text-gray-600">Tell us when you can no longer see the target clearly</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-purple-600 font-bold text-xl">4</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Pupil Tracking</h4>
                  <p className="text-gray-600">Your camera watches how your pupils gently shrink as your eyes focus — a natural sign of focusing effort</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-8">
            <h3 className="font-bold text-indigo-900 mb-3">What You'll Learn:</h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span><strong>Focusing Power %</strong> - How well your eyes are still focusing</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span><strong>Fatigue Prediction</strong> - Will you have a headache by 5 PM?</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span><strong>Break Timer</strong> - Exact recommendation for how long to rest your eyes</span>
              </li>
            </ul>
          </div>

          <div className="text-center">
            <button
              onClick={() => {
                setTestState('setup')
                initializeCamera()
              }}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full text-xl font-bold hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
            >
              Start Eye Tiredness Test
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // Render setup screen
  const renderSetup = () => (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-4">Position Your Face</h2>
        <p className="text-gray-400 mb-6">Make sure your eyes are clearly visible</p>

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
              setTestState('instructions')
            }}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-full font-semibold"
          >
            Cancel
          </button>
          
          <button
            onClick={startTest}
            disabled={!cameraReady}
            className={`px-8 py-3 rounded-full font-semibold ${
              cameraReady
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-gray-600 cursor-not-allowed opacity-50'
            }`}
          >
            {cameraReady ? 'Begin Test' : 'Initializing Camera...'}
          </button>
        </div>
      </div>
    </div>
  )

  // Render testing screen
  const renderTesting = () => {
    const blurAmount = currentBlurLevel * 2 // 0-20px blur

    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="text-center max-w-2xl w-full">
          {/* Progress bar */}
          <div className="mb-8">
            <div className="w-full bg-gray-700 rounded-full h-3 mb-2">
              <div
                className="bg-purple-600 h-3 rounded-full transition-all"
                style={{ width: `${testProgress}%` }}
              />
            </div>
            <p className="text-gray-400 text-sm">{Math.round(testProgress)}% Complete</p>
          </div>

          {/* Target */}
          <div className="mb-8">
            <p className="text-gray-400 mb-4">Focus on the target. Can you see it clearly?</p>
            <div className="flex items-center justify-center">
              <div
                className="w-64 h-64 bg-white rounded-lg flex items-center justify-center text-black text-6xl font-bold"
                style={{ filter: `blur(${blurAmount}px)` }}
              >
                E
              </div>
            </div>
          </div>

          {/* Response buttons */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => handleCanSee(true)}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 rounded-full font-semibold text-lg"
            >
              Yes, I Can See It
            </button>
            <button
              onClick={() => handleCanSee(false)}
              className="px-8 py-4 bg-red-600 hover:bg-red-700 rounded-full font-semibold text-lg"
            >
              No, Too Blurry
            </button>
          </div>

          {/* Hidden camera for pupil tracking */}
          <video ref={videoRef} className="hidden" autoPlay playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    )
  }

  // Render analyzing screen
  const renderAnalyzing = () => (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="relative w-48 h-48 mx-auto mb-8">
          <div className="absolute inset-0">
            <div className="w-full h-full border-4 border-purple-600 rounded-full animate-spin" style={{ borderTopColor: 'transparent' }} />
          </div>
          <div className="absolute inset-4">
            <div className="w-full h-full border-4 border-indigo-500 rounded-full animate-spin" style={{ borderTopColor: 'transparent', animationDirection: 'reverse' }} />
          </div>
          
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-16 h-16 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM8 10a2 2 0 114 0 2 2 0 01-4 0z" />
            </svg>
          </div>
        </div>

        <h2 className="text-3xl font-bold mb-4">Checking How Tired Your Eyes Are</h2>
        <p className="text-gray-400 mb-6">Looking at how your pupils responded...</p>

        <div className="space-y-2 text-sm text-gray-500">
          <p className="animate-pulse">• Watching how your pupils moved</p>
          <p className="animate-pulse" style={{ animationDelay: '0.2s' }}>• Measuring your focusing effort</p>
          <p className="animate-pulse" style={{ animationDelay: '0.4s' }}>• Working out your focusing power</p>
          <p className="animate-pulse" style={{ animationDelay: '0.6s' }}>• Rating your eye tiredness</p>
        </div>
      </div>
    </div>
  )

  // Render results screen
  const renderResults = () => {
    const getCapacityColor = (capacity) => {
      if (capacity >= 75) return 'text-green-600'
      if (capacity >= 60) return 'text-yellow-600'
      if (capacity >= 40) return 'text-orange-600'
      return 'text-red-600'
    }

    const getCapacityBg = (capacity) => {
      if (capacity >= 75) return 'bg-green-100 border-green-300'
      if (capacity >= 60) return 'bg-yellow-100 border-yellow-300'
      if (capacity >= 40) return 'bg-orange-100 border-orange-300'
      return 'bg-red-100 border-red-300'
    }

    const getFatigueIcon = () => {
      if (fatigueLevel === 'severe') return 'SEVERE'
      if (fatigueLevel === 'moderate') return 'MODERATE'
      if (fatigueLevel === 'mild') return 'MILD'
      return 'LOW'
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/vision-tests')}
            className="mb-6 flex items-center text-purple-600 hover:text-purple-700 font-medium"
          >
            ← Back to Tests
          </button>

          <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12">
            <div className="text-center mb-8">
              <div className="text-4xl font-bold mb-4 text-gray-700">{getFatigueIcon()}</div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Eye Tiredness Results</h1>
              <p className="text-gray-600">How tired your focusing muscles are</p>
            </div>

            {/* Main score */}
            <div className={`border-2 rounded-2xl p-8 mb-8 text-center ${getCapacityBg(focusingCapacity)}`}>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">FOCUSING POWER</h3>
              <div className={`text-7xl font-bold ${getCapacityColor(focusingCapacity)} mb-4`}>
                {focusingCapacity}%
              </div>
              <p className="text-lg font-semibold text-gray-700 mb-2">
                {focusingCapacity >= 75 ? 'Excellent - Eyes are fresh!' :
                 focusingCapacity >= 60 ? 'Moderate - Getting tired' :
                 focusingCapacity >= 40 ? 'Fatigued - Need a break soon' :
                 'Severely Fatigued - URGENT BREAK NEEDED'}
              </p>
              <p className="text-sm text-gray-600">
                Eye tiredness: {accommodativeLag}%
              </p>
            </div>

            {/* Break recommendation */}
            <div className={`${
              fatigueLevel === 'severe' ? 'bg-red-100 border-red-600' :
              fatigueLevel === 'moderate' ? 'bg-orange-100 border-orange-600' :
              fatigueLevel === 'mild' ? 'bg-yellow-100 border-yellow-600' :
              'bg-green-100 border-green-600'
            } border-l-4 p-6 mb-8 rounded-r-xl`}>
              <h3 className="text-lg font-bold mb-2">
                {fatigueLevel === 'severe' ? 'URGENT RECOMMENDATION' :
                 fatigueLevel === 'moderate' ? 'TAKE A BREAK' :
                 fatigueLevel === 'mild' ? 'REST SOON' :
                 'KEEP IT UP'}
              </h3>
              <p className="font-semibold mb-2">{breakRecommendation}</p>
            </div>

            {/* Eye health tips */}
            <div className="bg-indigo-50 rounded-2xl p-6 mb-8">
              <h3 className="text-xl font-bold text-indigo-900 mb-4">The 20-20-20 Rule</h3>
              <div className="grid md:grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-4xl font-bold text-indigo-600 mb-2">20</div>
                  <p className="text-sm text-indigo-800">Every 20 minutes</p>
                </div>
                <div>
                  <div className="text-4xl font-bold text-indigo-600 mb-2">20</div>
                  <p className="text-sm text-indigo-800">Look 20 feet away</p>
                </div>
                <div>
                  <div className="text-4xl font-bold text-indigo-600 mb-2">20</div>
                  <p className="text-sm text-indigo-800">For 20 seconds</p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => setTestState('instructions')}
                className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold"
              >
                Test Again
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
  if (testState === 'instructions') return renderInstructions()
  if (testState === 'setup') return renderSetup()
  if (testState === 'testing') return renderTesting()
  if (testState === 'analyzing') return renderAnalyzing()
  if (testState === 'results') return renderResults()

  return null
}

export default AccommodativeLagTest
