import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'

/**
 * Cataract "Glare & Scatter" Test
 * 
 * Cataracts cloud the lens, causing light to scatter inside the eye.
 * This test uses sine-wave gratings with glare simulation to detect lens cloudiness
 * YEARS before cataracts are visible on examination.
 * 
 * The key: healthy eyes can see gratings through glare, but cataractous lenses
 * scatter the glare light, making the gratings disappear completely.
 */

const CataractTest = () => {
  const navigate = useNavigate()
  const [testState, setTestState] = useState('instructions') // instructions, testing, results
  const [currentTrial, setCurrentTrial] = useState(0)
  const [responses, setResponses] = useState([])
  const [startTime, setStartTime] = useState(null)
  const [testStartTime, setTestStartTime] = useState(null)
  const [currentStimulus, setCurrentStimulus] = useState(null)
  const [glareActive, setGlareActive] = useState(false)
  const [score, setScore] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [recognition, setRecognition] = useState(null)
  const [speechAvailable, setSpeechAvailable] = useState(false)
  const [useVoice, setUseVoice] = useState(false)
  const speechRetryCountRef = useRef(0)
  const recognitionRef = useRef(null)
  const useVoiceRef = useRef(false)
  const canvasRef = useRef(null)
  const handleResponseRef = useRef(null)

  // Test parameters
  const TOTAL_TRIALS = 20 // 4 spatial frequencies × 5 (2 no-glare, 3 glare)
  
  // Spatial frequencies in cycles per degree
  // Low freq = thick bars (easy), high freq = thin bars (hard)
  const spatialFrequencies = [
    { cpd: 1.5, description: 'Very Low (Thick bars)', difficulty: 'easy' },
    { cpd: 3.0, description: 'Low (Medium bars)', difficulty: 'medium' },
    { cpd: 6.0, description: 'Medium (Thin bars)', difficulty: 'hard' },
    { cpd: 12.0, description: 'High (Very thin bars)', difficulty: 'very-hard' }
  ]

  // Orientations for gratings
  const orientations = [
    { angle: 0, name: 'Horizontal', direction: 'horizontal' },
    { angle: 45, name: 'Diagonal Right', direction: 'diagonal-right' },
    { angle: 90, name: 'Vertical', direction: 'vertical' },
    { angle: 135, name: 'Diagonal Left', direction: 'diagonal-left' }
  ]

  const directionButtons = [
    { direction: 'horizontal', label: 'Horizontal' },
    { direction: 'vertical', label: 'Vertical' },
    { direction: 'diagonal-right', label: 'Diagonal Right' },
    { direction: 'diagonal-left', label: 'Diagonal Left' },
  ]

  // Draw sine-wave grating on canvas
  const drawGrating = useCallback((canvas, frequency, orientation, contrast = 0.8) => {
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    
    // Clear canvas
    ctx.fillStyle = '#888888' // Mid-gray background
    ctx.fillRect(0, 0, width, height)
    
    // Create image data
    const imageData = ctx.createImageData(width, height)
    const data = imageData.data
    
    // Convert angle to radians
    const angleRad = (orientation * Math.PI) / 180
    
    // Spatial frequency scaled to canvas size
    const wavelength = width / (frequency * 2)
    
    // Generate sine-wave grating
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Rotate coordinates
        const xRot = x * Math.cos(angleRad) + y * Math.sin(angleRad)
        
        // Calculate sine wave
        const sineValue = Math.sin((2 * Math.PI * xRot) / wavelength)
        
        // Convert to grayscale (0-255) with contrast adjustment
        const baseGray = 128
        const grayValue = Math.round(baseGray + (sineValue * contrast * 127))
        
        // Set pixel
        const index = (y * width + x) * 4
        data[index] = grayValue     // R
        data[index + 1] = grayValue // G
        data[index + 2] = grayValue // B
        data[index + 3] = 255       // A
      }
    }
    
    ctx.putImageData(imageData, 0, 0)
  }, [])

  // Generate a random stimulus
  const generateStimulus = useCallback((trialNum) => {
    // Cycle through conditions
    const freqIndex = Math.floor(trialNum / 5) % spatialFrequencies.length
    const trialInFreq = trialNum % 5
    const withGlare = trialInFreq >= 2 // First 2 trials without glare, next 3 with glare
    
    const freq = spatialFrequencies[freqIndex]
    const orientation = orientations[Math.floor(Math.random() * orientations.length)]
    
    // Reduce contrast slightly for glare trials (to stress the system more)
    const contrast = withGlare ? 0.6 : 0.8
    
    return {
      frequency: freq,
      orientation,
      withGlare,
      contrast,
      trial: trialNum
    }
  }, [])

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognitionInstance = new SpeechRecognition()
        recognitionInstance.continuous = false
        recognitionInstance.interimResults = false
        recognitionInstance.lang = 'en-US'

        recognitionInstance.onresult = (event) => {
          const speechResult = event.results[0][0].transcript.toLowerCase()
          setTranscript(speechResult)
          
          // Map spoken words to orientations
          const directionMap = {
            'horizontal': 'horizontal',
            'vertical': 'vertical',
            'diagonal right': 'diagonal-right',
            'diagonal left': 'diagonal-left',
            'right': 'diagonal-right',
            'left': 'diagonal-left'
          }
          
          // Check for direction keywords
          let detectedDirection = null
          for (const [keyword, direction] of Object.entries(directionMap)) {
            if (speechResult.includes(keyword)) {
              detectedDirection = direction
              break
            }
          }
          
          if (detectedDirection && handleResponseRef.current) {
            handleResponseRef.current(detectedDirection)
          } else {
            // If no valid direction found, show error
            setTranscript('Not recognized. Say: Horizontal, Vertical, Diagonal Right, or Diagonal Left')
            setTimeout(() => setTranscript(''), 2000)
          }
        }

        recognitionInstance.onerror = (event) => {
          setIsListening(false)

          // Fatal errors: stop voice and fall back to buttons (no retry loop)
          const fatalErrors = ['network', 'not-allowed', 'service-not-allowed', 'audio-capture', 'aborted']
          if (fatalErrors.includes(event.error)) {
            setSpeechAvailable(false)
            setUseVoice(false)
            const messages = {
              network: 'Voice needs internet. Tap a direction button below.',
              'not-allowed': 'Microphone blocked. Tap a direction button below.',
              'service-not-allowed': 'Voice not available. Tap a direction button below.',
              'audio-capture': 'No microphone found. Tap a direction button below.',
              aborted: '',
            }
            const msg = messages[event.error]
            if (msg) {
              setTranscript(msg)
              setTimeout(() => setTranscript(''), 4000)
            }
            return
          }

          if (event.error === 'no-speech') {
            return
          }

          // Transient errors: retry at most twice
          if (speechRetryCountRef.current < 2 && useVoiceRef.current) {
            speechRetryCountRef.current += 1
            setTranscript('Didn\'t catch that. Try again or tap a button.')
            setTimeout(() => setTranscript(''), 2000)
            setTimeout(() => {
              const rec = recognitionRef.current
              if (!rec || !useVoiceRef.current) return
              setIsListening(true)
              try {
                rec.start()
              } catch {
                setIsListening(false)
              }
            }, 1500)
          }
        }

        recognitionInstance.onend = () => {
          setIsListening(false)
        }

        recognitionRef.current = recognitionInstance
        setRecognition(recognitionInstance)
        setSpeechAvailable(true)
      }
    }
  }, [])

  useEffect(() => {
    useVoiceRef.current = useVoice
  }, [useVoice])

  // Start listening (voice mode only)
  const startListening = useCallback(() => {
    if (!useVoice || !recognition || testState !== 'testing') return
    setTranscript('')
    setIsListening(true)
    try {
      recognition.start()
    } catch (error) {
      setIsListening(false)
    }
  }, [recognition, testState, useVoice])

  // Auto-start listening when stimulus appears (voice mode only)
  useEffect(() => {
    if (useVoice && testState === 'testing' && currentStimulus && !isListening) {
      const delay = currentStimulus.withGlare ? 1500 : 800
      const timeout = setTimeout(() => {
        startListening()
      }, delay)
      return () => clearTimeout(timeout)
    }
  }, [currentStimulus, testState, isListening, startListening, useVoice])

  // Start the test
  const startTest = () => {
    setTestState('testing')
    setResponses([])
    setCurrentTrial(0)
    setTestStartTime(Date.now())
    setUseVoice(false)
    speechRetryCountRef.current = 0
    const stimulus = generateStimulus(0)
    setCurrentStimulus(stimulus)
    setStartTime(Date.now())
    setGlareActive(false)
    
    // Draw initial grating after a short delay
    setTimeout(() => {
      if (canvasRef.current) {
        drawGrating(canvasRef.current, stimulus.frequency.cpd, stimulus.orientation.angle, stimulus.contrast)
      }
    }, 100)
  }

  // Activate glare after stimulus is drawn
  useEffect(() => {
    if (testState === 'testing' && currentStimulus && canvasRef.current) {
      // Draw the grating
      drawGrating(canvasRef.current, currentStimulus.frequency.cpd, currentStimulus.orientation.angle, currentStimulus.contrast)
      
      // Activate glare after 500ms if this is a glare trial
      if (currentStimulus.withGlare) {
        const glareTimeout = setTimeout(() => {
          setGlareActive(true)
        }, 500)
        return () => clearTimeout(glareTimeout)
      } else {
        setGlareActive(false)
      }
    }
  }, [currentStimulus, testState, drawGrating])

  // Handle user response
  const handleResponse = useCallback((direction) => {
    if (!currentStimulus || !startTime) return

    // Stop current recognition
    if (recognition) {
      try {
        recognition.stop()
      } catch (e) {
        // Already stopped
      }
    }
    setIsListening(false)

    const responseTime = Date.now() - startTime
    const isCorrect = direction === currentStimulus.orientation.direction
    
    const response = {
      trial: currentTrial,
      frequency: currentStimulus.frequency,
      orientation: currentStimulus.orientation,
      withGlare: currentStimulus.withGlare,
      contrast: currentStimulus.contrast,
      userAnswer: direction,
      correct: isCorrect,
      responseTime,
      glareRecoveryTime: currentStimulus.withGlare ? responseTime - 500 : null
    }

    const newResponses = [...responses, response]
    setResponses(newResponses)
    setGlareActive(false)

    // Check if test should end
    if (currentTrial + 1 >= TOTAL_TRIALS) {
      finishTest(newResponses)
      return
    }

    // Continue test
    const nextTrial = currentTrial + 1
    setCurrentTrial(nextTrial)
    const newStimulus = generateStimulus(nextTrial)
    setCurrentStimulus(newStimulus)
    setStartTime(Date.now())
  }, [currentStimulus, startTime, recognition, currentTrial, responses, generateStimulus])

  // Update ref when handleResponse changes
  useEffect(() => {
    handleResponseRef.current = handleResponse
  }, [handleResponse])

  // Calculate final score and analyze for cataract risk
  const finishTest = async (finalResponses) => {
    setTestState('results')

    // Separate performance by glare condition
    const noGlareResponses = finalResponses.filter(r => !r.withGlare)
    const glareResponses = finalResponses.filter(r => r.withGlare)
    
    const noGlareAccuracy = noGlareResponses.filter(r => r.correct).length / noGlareResponses.length
    const glareAccuracy = glareResponses.filter(r => r.correct).length / glareResponses.length
    
    // Key cataract indicator: Drop in performance with glare
    const glareSensitivity = noGlareAccuracy - glareAccuracy
    
    // Performance by spatial frequency
    const freqPerformance = {}
    spatialFrequencies.forEach(freq => {
      const freqResponses = finalResponses.filter(r => r.frequency.cpd === freq.cpd)
      freqPerformance[freq.cpd] = {
        total: freqResponses.length,
        correct: freqResponses.filter(r => r.correct).length,
        accuracy: freqResponses.filter(r => r.correct).length / freqResponses.length,
        withGlare: freqResponses.filter(r => r.withGlare && r.correct).length / 
                   freqResponses.filter(r => r.withGlare).length
      }
    })
    
    // Overall score weighted heavily on glare performance
    const overallAccuracy = finalResponses.filter(r => r.correct).length / finalResponses.length
    const glareWeight = glareAccuracy * 0.7 + noGlareAccuracy * 0.3
    
    const finalScore = Math.round(glareWeight * 100)
    setScore(finalScore)

    // Cataract risk assessment based on glare sensitivity
    const cataractRisk = glareSensitivity > 0.4 ? 'high' : 
                         glareSensitivity > 0.25 ? 'moderate' : 'low'

    // Average response time in glare conditions
    const avgGlareResponseTime = glareResponses.length > 0 ?
      Math.round(glareResponses.reduce((sum, r) => sum + r.responseTime, 0) / glareResponses.length) : 0

    // Average response time
    const avgResponseTime = Math.round(
      finalResponses.reduce((sum, r) => sum + r.responseTime, 0) / finalResponses.length
    )

    // Submit to backend
    try {
      await visionTestAPI.submit({
        test_type: 'cataract_glare',
        score: finalScore,
        response_time_ms: avgResponseTime,
        errors: finalResponses.filter(r => !r.correct).length,
        test_details: {
          no_glare_accuracy: noGlareAccuracy,
          glare_accuracy: glareAccuracy,
          glare_sensitivity: glareSensitivity,
          cataract_risk: cataractRisk,
          frequency_performance: freqPerformance,
          avg_glare_response_time: avgGlareResponseTime,
          responses: finalResponses,
          test_duration_ms: Date.now() - testStartTime
        }
      })
    } catch (error) {
      console.error('Failed to submit test:', error)
    }
  }

  // Get risk interpretation
  const getRiskInterpretation = () => {
    const noGlare = responses.filter(r => !r.withGlare)
    const withGlare = responses.filter(r => r.withGlare)
    
    const noGlareAcc = noGlare.length > 0 ? noGlare.filter(r => r.correct).length / noGlare.length : 1
    const glareAcc = withGlare.length > 0 ? withGlare.filter(r => r.correct).length / withGlare.length : 1
    const sensitivity = noGlareAcc - glareAcc

    if (score >= 75 && sensitivity < 0.25) {
      return {
        status: 'Low Risk',
        color: 'green',
        message: 'Excellent glare recovery. Your lens appears clear with minimal light scatter.',
        icon: '✓',
        risk: 'low'
      }
    } else if (score >= 60 && sensitivity < 0.4) {
      return {
        status: 'Moderate Risk',
        color: 'yellow',
        message: 'Bright glare gave you some trouble. This can be an early sign of lens changes. It is worth booking an eye exam.',
        icon: '!',
        risk: 'moderate'
      }
    } else {
      return {
        status: 'Higher Risk',
        color: 'red',
        message: 'Bright glare made it much harder for you to see. This can be a sign that the lens in your eye is getting cloudy (cataracts). Please book a full eye exam.',
        icon: '!',
        risk: 'high'
      }
    }
  }

  return (
    <div className="test-shell">
      <div className="max-w-4xl mx-auto">
        {/* Instructions */}
        {testState === 'instructions' && (
          <div className="card p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-accent-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-accent-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h1 className="page-title mb-2">
                Glare Sensitivity Test
              </h1>
              <p className="text-sm text-accent-600 font-medium mb-4">
                See how much bright light and glare bother your eyes
              </p>
            </div>

            <div className="space-y-6 text-left">
              <div className="bg-accent-50 border-l-4 border-accent-500 p-6">
                <h3 className="font-semibold text-orange-900 mb-2 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  Why This Test Works
                </h3>
                <div className="text-sm text-orange-900 space-y-2">
                  <p>
                    <strong>Cataracts cloud your lens</strong>, causing light to scatter inside your eye. This is why people with cataracts struggle with night driving - oncoming headlights create "halos" that wash out everything.
                  </p>
                  <p className="mt-2">
                    This test copies that experience using:
                  </p>
                  <ul className="ml-4 mt-2 space-y-1">
                    <li>• <strong>Fuzzy striped patterns</strong> at different sizes</li>
                    <li>• <strong>A bright glare</strong> that acts like headlights at night</li>
                    <li>• <strong>How you cope with the glare</strong> — the key sign of a clear lens</li>
                  </ul>
                  <p className="mt-2">
                    <strong>The idea:</strong> A clear lens lets you still see the stripes through the glare. A cloudy lens scatters the glare, making the stripes disappear.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3">How It Works:</h3>
                <ol className="space-y-3 text-gray-700">
                  <li className="flex">
                    <span className="font-semibold mr-3">1.</span>
                    <span>You'll see fuzzy striped patterns tilted in different directions</span>
                  </li>
                  <li className="flex">
                    <span className="font-semibold mr-3">2.</span>
                    <span><strong>Tap the direction you see</strong>: Horizontal, Vertical, or Diagonal Right/Left</span>
                  </li>
                  <li className="flex">
                    <span className="font-semibold mr-3">3.</span>
                    <span><strong>Sometimes a bright white ring will flash</strong> (glare simulation)</span>
                  </li>
                  <li className="flex">
                    <span className="font-semibold mr-3">4.</span>
                    <span>Try to see the bars THROUGH the glare - this tests lens clarity</span>
                  </li>
                  <li className="flex">
                    <span className="font-semibold mr-3">5.</span>
                    <span>20 trials total (~4-5 minutes)</span>
                  </li>
                </ol>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <h3 className="font-semibold text-blue-900 mb-3">What the results can show:</h3>
                <div className="text-sm text-blue-800 space-y-2">
                  <p><strong>Clear lens:</strong> You can still see the stripes even when the glare is on</p>
                  <p><strong>Early cloudiness:</strong> The stripes get much harder to see once the glare appears</p>
                  <p><strong>More cloudiness:</strong> The stripes are hard to see even without glare</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-3">Before You Start:</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>You can also use voice if your browser supports it (optional)</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Dim your room lights slightly (to make glare effect more noticeable)</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Sit about 50cm from your screen</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>The bright flash is intentional - don't be alarmed!</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 flex gap-4">
              <button
                onClick={() => navigate('/vision-tests')}
                className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={startTest}
                className="flex-1 px-6 py-3 bg-accent-600 hover:bg-accent-700 text-white rounded-full font-semibold transition-colors"
              >
                Start Test
              </button>
            </div>
          </div>
        )}

        {/* Testing Phase */}
        {testState === 'testing' && currentStimulus && (
          <div className="card p-8">
            {/* Progress */}
            <div className="mb-8">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progress</span>
                <span>{currentTrial + 1} of {TOTAL_TRIALS}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-accent-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentTrial + 1) / TOTAL_TRIALS) * 100}%` }}
                />
              </div>
            </div>

            {/* Condition indicator */}
            <div className="text-center mb-6">
              <p className="text-sm font-semibold text-gray-600">
                {currentStimulus.withGlare ? 'Glare Condition' : 'Normal Condition'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Bars: {currentStimulus.frequency.description}
              </p>
            </div>

            {/* Stimulus Display with Canvas */}
            <div className="relative mb-12">
              <div className="relative w-full max-w-lg mx-auto">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={400}
                  className="w-full rounded-2xl border-4 border-gray-300"
                  style={{ imageRendering: 'pixelated' }}
                />
                
                {/* Glare overlay - bright white ring */}
                {glareActive && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div 
                      className="absolute inset-0 bg-white opacity-70 rounded-2xl animate-pulse"
                      style={{
                        boxShadow: '0 0 100px 50px rgba(255,255,255,0.9), inset 0 0 100px 50px rgba(255,255,255,0.7)'
                      }}
                    />
                    <div className="absolute w-3/4 h-3/4 rounded-full border-8 border-white opacity-90 animate-ping" />
                  </div>
                )}
              </div>
            </div>

            {/* Direction buttons — primary input */}
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 mb-4">
                Which way do the stripes run?
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto mb-6">
                {directionButtons.map(({ direction, label }) => (
                  <button
                    key={direction}
                    type="button"
                    onClick={() => handleResponse(direction)}
                    className="px-4 py-4 bg-accent-600 hover:bg-accent-700 text-white rounded-xl font-semibold text-sm transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {currentStimulus.withGlare && (
                <p className="text-sm text-accent-600 font-medium mb-4">
                  Try to see the bars through the glare
                </p>
              )}

              {transcript && (
                <div className="mb-4 text-sm font-medium text-accent-700">
                  {transcript}
                </div>
              )}

              {/* Optional voice input */}
              {speechAvailable && (
                <div className="border-t border-gray-200 pt-6 mt-2">
                  <p className="text-xs text-gray-500 mb-3">Or use your voice (needs internet)</p>
                  {!useVoice ? (
                    <button
                      type="button"
                      onClick={() => {
                        setUseVoice(true)
                        speechRetryCountRef.current = 0
                        startListening()
                      }}
                      className="px-5 py-2 border-2 border-gray-300 rounded-full text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Switch to voice
                    </button>
                  ) : (
                    <div>
                      <div className={`inline-flex items-center gap-3 px-5 py-3 rounded-2xl ${
                        isListening ? 'bg-accent-50 border-2 border-accent-400' : 'bg-gray-100 border-2 border-gray-300'
                      }`}>
                        <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-accent-600 animate-pulse' : 'bg-gray-400'}`} />
                        <span className="text-sm font-semibold text-gray-800">
                          {isListening ? 'Listening… say the direction' : 'Voice ready'}
                        </span>
                      </div>
                      <div className="flex gap-3 justify-center mt-3">
                        {!isListening && (
                          <button
                            type="button"
                            onClick={startListening}
                            className="px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-full text-sm font-semibold transition-colors"
                          >
                            Start speaking
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setUseVoice(false)
                            setIsListening(false)
                            if (recognition) {
                              try { recognition.stop() } catch { /* already stopped */ }
                            }
                          }}
                          className="px-4 py-2 border-2 border-gray-300 rounded-full text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Use buttons instead
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {testState === 'results' && (
          <div className="card p-8">
            <div className="text-center mb-8">
              <div className={`w-20 h-20 bg-${getRiskInterpretation().color}-100 rounded-full flex items-center justify-center mx-auto mb-4`}>
                <span className="text-4xl">{getRiskInterpretation().icon}</span>
              </div>
              <h2 className="text-3xl font-serif font-bold text-gray-900 mb-2">
                Test Complete!
              </h2>
              <p className="text-gray-600">Glare Sensitivity Results</p>
            </div>

            {/* Score Display */}
            <div className="bg-amber-50 rounded-2xl p-8 mb-8">
              <div className="text-center">
                <div className="text-6xl font-bold text-accent-700 mb-2">
                  {score}
                </div>
                <div className="text-sm text-gray-600 mb-4">Glare Recovery Score</div>
                <div className={`inline-block px-4 py-2 bg-${getRiskInterpretation().color}-100 text-${getRiskInterpretation().color}-800 rounded-full font-semibold`}>
                  {getRiskInterpretation().status}
                </div>
              </div>
            </div>

            {/* Risk Interpretation */}
            <div className={`bg-${getRiskInterpretation().color}-50 border border-${getRiskInterpretation().color}-200 rounded-xl p-6 mb-8`}>
              <h3 className={`font-semibold text-${getRiskInterpretation().color}-900 mb-2`}>
                What This Means
              </h3>
              <p className={`text-sm text-${getRiskInterpretation().color}-800`}>
                {getRiskInterpretation().message}
              </p>
            </div>

            {/* Performance Analysis */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="text-sm text-gray-600 mb-1">Without Glare</div>
                <div className="text-3xl font-bold text-gray-900">
                  {Math.round((responses.filter(r => !r.withGlare && r.correct).length / 
                    responses.filter(r => !r.withGlare).length) * 100)}%
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="text-sm text-gray-600 mb-1">With Glare</div>
                <div className="text-3xl font-bold text-accent-700">
                  {Math.round((responses.filter(r => r.withGlare && r.correct).length / 
                    responses.filter(r => r.withGlare).length) * 100)}%
                </div>
              </div>
            </div>

            {/* Educational Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
              <h3 className="font-semibold text-blue-900 mb-3">About cataracts and glare</h3>
              <div className="text-sm text-blue-800 space-y-2">
                <p>
                  A cataract is when the clear lens inside your eye slowly turns cloudy. The cloudy areas scatter light inside the eye instead of letting it pass through cleanly.
                </p>
                <p className="mt-3">
                  <strong>Why glare matters:</strong> When bright light (like headlights) hits a cloudy lens, it scatters and puts a "veil" over your vision. That makes it hard to see things like road signs or people at night.
                </p>
                <p className="mt-3">
                  <strong>What you can do if this test flags a concern:</strong>
                </p>
                <ul className="ml-4 mt-2 space-y-1">
                  <li>• Get a full eye exam with an eye doctor</li>
                  <li>• Mention any trouble with night driving, glare, or halos</li>
                  <li>• Cataracts can be fixed with a common, safe surgery if they affect daily life</li>
                  <li>• Wearing sunglasses outdoors may help slow them down</li>
                </ul>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => navigate('/vision-tests')}
                className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Back to Tests
              </button>
              <button
                onClick={() => {
                  setTestState('instructions')
                  setResponses([])
                  setCurrentTrial(0)
                  setScore(0)
                }}
                className="flex-1 px-6 py-3 bg-accent-600 hover:bg-accent-700 text-white rounded-full font-semibold transition-colors"
              >
                Take Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CataractTest
