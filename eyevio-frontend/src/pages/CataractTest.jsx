import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import SamdDisclaimer from '../components/SamdDisclaimer'
import { VisionTestShell } from '../components/TestPrepLayout'
import { scoreGlareTolerance, interpretGlareResults } from '../utils/visionTestScoring'

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
  const [resultSummary, setResultSummary] = useState(null)
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
    {
      direction: 'horizontal',
      label: 'Horizontal',
      hint: '← →',
      preview: 'repeating-linear-gradient(0deg, #fff 0 2px, transparent 2px 6px)',
    },
    {
      direction: 'vertical',
      label: 'Vertical',
      hint: '↑ ↓',
      preview: 'repeating-linear-gradient(90deg, #fff 0 2px, transparent 2px 6px)',
    },
    {
      direction: 'diagonal-right',
      label: 'Diag. right',
      hint: '↗',
      preview: 'repeating-linear-gradient(45deg, #fff 0 2px, transparent 2px 6px)',
    },
    {
      direction: 'diagonal-left',
      label: 'Diag. left',
      hint: '↖',
      preview: 'repeating-linear-gradient(135deg, #fff 0 2px, transparent 2px 6px)',
    },
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
            'diag right': 'diagonal-right',
            'diag left': 'diagonal-left',
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

  // Calculate final score and analyze for glare tolerance (not a cataract diagnosis)
  const finishTest = async (finalResponses) => {
    const noGlareResponses = finalResponses.filter((r) => !r.withGlare)
    const glareResponses = finalResponses.filter((r) => r.withGlare)

    const noGlareTotal = noGlareResponses.length
    const glareTotal = glareResponses.length
    const noGlareCorrect = noGlareResponses.filter((r) => r.correct).length
    const glareCorrect = glareResponses.filter((r) => r.correct).length

    const noGlareAccuracy = noGlareTotal > 0 ? noGlareCorrect / noGlareTotal : 0
    const glareAccuracy = glareTotal > 0 ? glareCorrect / glareTotal : 0
    const glareSensitivity = Math.max(0, noGlareAccuracy - glareAccuracy)

    const freqPerformance = {}
    spatialFrequencies.forEach((freq) => {
      const freqResponses = finalResponses.filter((r) => r.frequency.cpd === freq.cpd)
      const glareFreq = freqResponses.filter((r) => r.withGlare)
      const noGlareFreq = freqResponses.filter((r) => !r.withGlare)
      freqPerformance[freq.cpd] = {
        label: freq.description,
        difficulty: freq.difficulty,
        total: freqResponses.length,
        correct: freqResponses.filter((r) => r.correct).length,
        accuracy: freqResponses.length
          ? freqResponses.filter((r) => r.correct).length / freqResponses.length
          : 0,
        noGlareAccuracy: noGlareFreq.length
          ? noGlareFreq.filter((r) => r.correct).length / noGlareFreq.length
          : null,
        glareAccuracy: glareFreq.length
          ? glareFreq.filter((r) => r.correct).length / glareFreq.length
          : null,
      }
    })

    const avgMs = (list) =>
      list.length
        ? Math.round(list.reduce((sum, r) => sum + r.responseTime, 0) / list.length)
        : null

    const avgGlareResponseTime = avgMs(glareResponses)
    const avgNoGlareResponseTime = avgMs(noGlareResponses)
    const avgResponseTime = avgMs(finalResponses) || 0

    const finalScore = scoreGlareTolerance(noGlareAccuracy, glareAccuracy, glareSensitivity)
    const interpretation = interpretGlareResults({
      score: finalScore,
      noGlareAccuracy,
      glareAccuracy,
      glareSensitivity,
      noGlareCorrect,
      noGlareTotal,
      glareCorrect,
      glareTotal,
      avgGlareResponseMs: avgGlareResponseTime,
      avgNoGlareResponseMs: avgNoGlareResponseTime,
    })

    const glareImpact =
      glareSensitivity > 0.4 ? 'high' : glareSensitivity > 0.25 ? 'moderate' : 'low'

    setScore(finalScore)
    setResultSummary({
      ...interpretation,
      glareImpact,
      freqPerformance,
      totalCorrect: finalResponses.filter((r) => r.correct).length,
      totalTrials: finalResponses.length,
      overallPct: finalResponses.length
        ? Math.round(
            (finalResponses.filter((r) => r.correct).length / finalResponses.length) * 100
          )
        : 0,
    })
    setTestState('results')

    try {
      await visionTestAPI.submit({
        test_type: 'cataract_glare',
        score: finalScore,
        response_time_ms: avgResponseTime,
        errors: finalResponses.filter((r) => !r.correct).length,
        test_details: {
          no_glare_accuracy: noGlareAccuracy,
          glare_accuracy: glareAccuracy,
          glare_sensitivity: glareSensitivity,
          glare_impact: glareImpact,
          no_glare_correct: noGlareCorrect,
          no_glare_total: noGlareTotal,
          glare_correct: glareCorrect,
          glare_total: glareTotal,
          frequency_performance: freqPerformance,
          avg_glare_response_time: avgGlareResponseTime,
          avg_no_glare_response_time: avgNoGlareResponseTime,
          interpretation_band: interpretation.band,
          interpretation_status: interpretation.status,
          scoring_note:
            'Score = 50% glare accuracy + 30% no-glare accuracy + 20% retention (1 − drop/0.5). Not a cataract diagnosis.',
          responses: finalResponses,
          test_duration_ms: Date.now() - testStartTime,
        },
      })
    } catch (error) {
      console.error('Failed to submit test:', error)
    }
  }

  const resultTone = {
    green: {
      badge: 'bg-green-100 text-green-800',
      panel: 'bg-green-50 border-green-200',
      title: 'text-green-900',
      body: 'text-green-800',
      iconBg: 'bg-green-100',
      iconText: 'text-green-700',
    },
    amber: {
      badge: 'bg-amber-100 text-amber-900',
      panel: 'bg-amber-50 border-amber-200',
      title: 'text-amber-900',
      body: 'text-amber-900',
      iconBg: 'bg-amber-100',
      iconText: 'text-amber-700',
    },
    red: {
      badge: 'bg-red-100 text-red-800',
      panel: 'bg-red-50 border-red-200',
      title: 'text-red-900',
      body: 'text-red-800',
      iconBg: 'bg-red-100',
      iconText: 'text-red-700',
    },
  }

  if (testState === 'testing' && currentStimulus) {
    return (
      <VisionTestShell
        title="Glare Sensitivity"
        subtitle={
          currentStimulus.withGlare
            ? `Glare on · ${currentStimulus.frequency.description}`
            : `No glare · ${currentStimulus.frequency.description}`
        }
        statusBar={
          <div className="flex items-center gap-3 min-w-[140px]">
            <span className="text-xs font-medium whitespace-nowrap">
              {currentTrial + 1}/{TOTAL_TRIALS}
            </span>
            <div className="w-24 bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-accent-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${((currentTrial + 1) / TOTAL_TRIALS) * 100}%` }}
              />
            </div>
          </div>
        }
        stimulus={(
          <div className="vision-test-stimulus-inner w-full h-full">
            <div className="relative max-w-full max-h-full aspect-square">
              <canvas
                ref={canvasRef}
                width={400}
                height={400}
                className="w-full h-full rounded-2xl border-2 border-gray-300"
                style={{ imageRendering: 'pixelated' }}
              />
              {glareActive && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-2xl overflow-hidden">
                  <div
                    className="absolute inset-0 bg-white opacity-70 animate-pulse"
                    style={{
                      boxShadow:
                        '0 0 100px 50px rgba(255,255,255,0.9), inset 0 0 100px 50px rgba(255,255,255,0.7)',
                    }}
                  />
                  <div className="absolute w-3/4 h-3/4 rounded-full border-8 border-white opacity-90 animate-ping" />
                </div>
              )}
            </div>
          </div>
        )}
        controls={(
          <>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Which way do the stripes run?
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Diag. right leans ↗ · Diag. left leans ↖
              </p>
              {currentStimulus.withGlare && (
                <p className="text-xs text-accent-700 font-medium mt-2 bg-accent-50 border border-accent-200 rounded-lg px-2 py-1.5">
                  Try to see the bars through the glare
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {directionButtons.map((btn) => (
                <button
                  key={btn.direction}
                  type="button"
                  onClick={() => handleResponse(btn.direction)}
                  className="flex flex-col items-center gap-1.5 px-2 py-3 bg-accent-600 hover:bg-accent-700 text-white rounded-xl text-xs font-semibold min-h-[72px] transition-colors"
                >
                  <span
                    className="w-9 h-9 rounded border border-white/40 shrink-0"
                    style={{ background: btn.preview }}
                    aria-hidden
                  />
                  <span>
                    {btn.hint} {btn.label}
                  </span>
                </button>
              ))}
            </div>

            {transcript && (
              <p className="text-sm font-medium text-accent-700 text-center">{transcript}</p>
            )}

            {speechAvailable && (
              <div className="border-t border-gray-200 pt-3 mt-auto">
                {!useVoice ? (
                  <button
                    type="button"
                    onClick={() => {
                      setUseVoice(true)
                      speechRetryCountRef.current = 0
                      startListening()
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[40px]"
                  >
                    Use voice instead
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${
                        isListening
                          ? 'bg-accent-50 border border-accent-400 text-accent-900'
                          : 'bg-gray-100 border border-gray-300 text-gray-700'
                      }`}
                    >
                      <div
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isListening ? 'bg-accent-600 animate-pulse' : 'bg-gray-400'
                        }`}
                      />
                      {isListening ? 'Listening… say the direction' : 'Voice ready'}
                    </div>
                    <div className="flex gap-2">
                      {!isListening && (
                        <button
                          type="button"
                          onClick={startListening}
                          className="flex-1 px-3 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-xl text-xs font-semibold min-h-[40px]"
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
                            try {
                              recognition.stop()
                            } catch {
                              /* already stopped */
                            }
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 min-h-[40px]"
                      >
                        Use buttons
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      />
    )
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
                    A cloudy lens can scatter light, which is one reason some people struggle with night glare.
                    This exercise copies that experience with striped patterns and a bright overlay.
                  </p>
                  <p className="mt-2">
                    <strong>Important:</strong> glare trouble has many causes. This is not a cataract exam,
                    not LOCS grading, and does not diagnose disease.
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

        {/* Results */}
        {testState === 'results' && resultSummary && (
          <div className="card p-8">
            {(() => {
              const tone = resultTone[resultSummary.color] || resultTone.amber
              return (
                <>
                  <div className="text-center mb-8">
                    <div
                      className={`w-20 h-20 ${tone.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}
                    >
                      <span className={`text-3xl font-bold ${tone.iconText}`}>
                        {resultSummary.band === 'good' ? '✓' : '!'}
                      </span>
                    </div>
                    <h2 className="text-3xl font-serif font-bold text-gray-900 mb-2">
                      Test Complete
                    </h2>
                    <p className="text-gray-600">Glare tolerance — home check only</p>
                  </div>

                  <div className="bg-amber-50 rounded-2xl p-8 mb-6">
                    <div className="text-center">
                      <div className="text-6xl font-bold text-accent-700 mb-2">{score}</div>
                      <div className="text-sm text-gray-600 mb-1">Glare Tolerance Score</div>
                      <p className="text-xs text-gray-500 mb-4 max-w-md mx-auto">
                        {resultSummary.scoreMeaning}
                      </p>
                      <div className={`inline-block px-4 py-2 rounded-full font-semibold ${tone.badge}`}>
                        {resultSummary.status}
                      </div>
                    </div>
                  </div>

                  <div className={`border rounded-xl p-6 mb-6 ${tone.panel}`}>
                    <h3 className={`font-semibold mb-2 ${tone.title}`}>What this means</h3>
                    <p className={`text-sm font-medium mb-2 ${tone.body}`}>{resultSummary.headline}</p>
                    <p className={`text-sm ${tone.body}`}>{resultSummary.detail}</p>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                      <div className="text-sm text-gray-600 mb-1">Without glare</div>
                      <div className="text-3xl font-bold text-gray-900">{resultSummary.noGlarePct}%</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {resultSummary.noGlareCorrect}/{resultSummary.noGlareTotal} correct
                        {resultSummary.avgNoGlareResponseMs != null && (
                          <> · ~{Math.round(resultSummary.avgNoGlareResponseMs / 100) / 10}s avg</>
                        )}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                      <div className="text-sm text-gray-600 mb-1">With glare</div>
                      <div className="text-3xl font-bold text-accent-700">{resultSummary.glarePct}%</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {resultSummary.glareCorrect}/{resultSummary.glareTotal} correct
                        {resultSummary.avgGlareResponseMs != null && (
                          <> · ~{Math.round(resultSummary.avgGlareResponseMs / 100) / 10}s avg</>
                        )}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                      <div className="text-sm text-gray-600 mb-1">Drop under glare</div>
                      <div
                        className={`text-3xl font-bold ${
                          resultSummary.dropPts >= 40
                            ? 'text-red-600'
                            : resultSummary.dropPts >= 25
                              ? 'text-amber-600'
                              : 'text-green-600'
                        }`}
                      >
                        {resultSummary.dropPts}
                        <span className="text-lg font-semibold"> pts</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Without − with glare accuracy
                      </div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="font-semibold text-gray-900 mb-3">
                      Overall: {resultSummary.totalCorrect}/{resultSummary.totalTrials} correct (
                      {resultSummary.overallPct}%)
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(resultSummary.freqPerformance || {}).map(([cpd, perf]) => (
                        <div
                          key={cpd}
                          className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{perf.label}</div>
                            <div className="text-xs text-gray-500">
                              {perf.correct}/{perf.total} correct
                              {perf.noGlareAccuracy != null && perf.glareAccuracy != null && (
                                <>
                                  {' '}
                                  · no glare {Math.round(perf.noGlareAccuracy * 100)}% · glare{' '}
                                  {Math.round(perf.glareAccuracy * 100)}%
                                </>
                              )}
                            </div>
                          </div>
                          <div className="font-bold text-gray-800 shrink-0">
                            {Math.round((perf.accuracy || 0) * 100)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
                    <h3 className="font-semibold text-blue-900 mb-3">About glare (education only)</h3>
                    <div className="text-sm text-blue-800 space-y-2">
                      <p>
                        Night glare can come from many things — uncorrected prescription, dry eye,
                        dirty lenses, or a cloudy crystalline lens. Only an eye doctor can sort those
                        out.
                      </p>
                      <p>
                        If this home check flags glare trouble: book a full eye exam, mention night
                        driving or halos, and do not treat these scores as a cataract diagnosis.
                      </p>
                    </div>
                  </div>

                  <SamdDisclaimer testType="cataract_glare" className="mb-8" />

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
                        setResultSummary(null)
                      }}
                      className="flex-1 px-6 py-3 bg-accent-600 hover:bg-accent-700 text-white rounded-full font-semibold transition-colors"
                    >
                      Take Again
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

export default CataractTest
