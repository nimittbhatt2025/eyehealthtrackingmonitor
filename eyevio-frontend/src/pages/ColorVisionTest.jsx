import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCalibration } from '../context/CalibrationContext'
import { visionTestAPI } from '../services/api'
import voiceRecognition from '../utils/voiceRecognition'
import InlineDistanceCalibration from '../components/InlineDistanceCalibration'
import { TestPrepLayout, TestDetails, TestActiveBar } from '../components/TestPrepLayout'
import { 
  generateDeficiencyColors, 
  poissonDiskSampling,
  generateScientificPlate,
  simulateColorBlindness,
  validatePlate,
  hexToLab,
  labToHex
} from '../utils/ishiharaColorScience'
import removeEmojis from '../utils/removeEmojis.js'

/**
 * Color Vision Test (Ishihara-inspired)
 * Professional-grade color vision screening with:
 * - Ishihara-inspired pseudoisochromatic plates
 * - Protan (red) and Deutan (green) deficiency detection
 * - Severity classification (mild/moderate/severe)
 * - Monocular testing optional
 * - Safe medical language (screening, not diagnosis)
 */

const ColorVisionTest = () => {
  const navigate = useNavigate()
  const { isCalibrated, needsRecalibration, getConfidence, loadCalibration } = useCalibration()
  
  const [testState, setTestState] = useState('distance-gate') // distance-gate, instructions, testing, results
  const [distanceValid, setDistanceValid] = useState(false)
  const [currentPlateIndex, setCurrentPlateIndex] = useState(0)
  const [responses, setResponses] = useState([])
  const [showFeedback, setShowFeedback] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  
  // Voice recognition state
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceSupported] = useState(voiceRecognition.isSupported())
  const [userInput, setUserInput] = useState('')
  const [inputMethod, setInputMethod] = useState('type') // 'voice' or 'type' — tap is default
  const [voiceNotice, setVoiceNotice] = useState('')
  const [lastVoiceSubmitTime, setLastVoiceSubmitTime] = useState(0) // Prevent duplicate submissions
  const autoSubmitTimerRef = useRef(null) // Store auto-submit timer reference
  const pendingAnswerRef = useRef(null) // Store the pending answer to avoid closure issues
  
  // Test plates state
  const [testPlates, setTestPlates] = useState([])
  const [currentPlate, setCurrentPlate] = useState(null)
  const [generatedPlateSVG, setGeneratedPlateSVG] = useState(null)
  const [plateCache, setPlateCache] = useState(new Map()) // Cache generated plates
  
  // Simple fixed timing - 8 seconds for all plates (increased from 5)
  const [timeRemaining, setTimeRemaining] = useState(8)
  const FIXED_TIME_LIMIT = 8 // Fixed 8 second time limit for all plates (more lenient)
  const FEEDBACK_DURATION = 1200 // ms to show feedback before advancing
  const [responseStartTime, setResponseStartTime] = useState(null)
  
  // Developer tool: grayscale preview for validation
  const [showGrayscale, setShowGrayscale] = useState(false)
  
  // Comprehensive Ishihara-inspired test plate bank
  // Randomized on each test to prevent memorization
  const PLATE_BANK = [
    // Demo plates - NOT guaranteed to show, randomized like all others
    { id: 'd1', type: 'demo', answer: '57', protan: '57', deutan: '57', category: 'demo', difficulty: 1 },
    { id: 'd2', type: 'demo', answer: '83', protan: '83', deutan: '83', category: 'demo', difficulty: 1 },
    { id: 'd3', type: 'demo', answer: '29', protan: '29', deutan: '29', category: 'demo', difficulty: 1 },
    { id: 'd4', type: 'demo', answer: '6', protan: '6', deutan: '6', category: 'demo', difficulty: 1 },
    { id: 'd5', type: 'demo', answer: '45', protan: '45', deutan: '45', category: 'demo', difficulty: 1 },
    
    // Red-Green screening plates - diverse numbers
    { id: 'rg1', type: 'screening', answer: '8', protan: '3', deutan: '3', category: 'red-green', difficulty: 2 },
    { id: 'rg2', type: 'screening', answer: '29', protan: '70', deutan: '70', category: 'red-green', difficulty: 2 },
    { id: 'rg3', type: 'screening', answer: '5', protan: '2', deutan: '2', category: 'red-green', difficulty: 3 },
    { id: 'rg4', type: 'screening', answer: '42', protan: '24', deutan: '24', category: 'red-green', difficulty: 3 },
    { id: 'rg5', type: 'screening', answer: '35', protan: '5', deutan: '3', category: 'red-green', difficulty: 4 },
    { id: 'rg6', type: 'screening', answer: '16', protan: '18', deutan: '19', category: 'red-green', difficulty: 3 },
    { id: 'rg7', type: 'screening', answer: '96', protan: '69', deutan: '69', category: 'red-green', difficulty: 3 },
    { id: 'rg8', type: 'screening', answer: '17', protan: '71', deutan: '21', category: 'red-green', difficulty: 4 },
    { id: 'rg9', type: 'screening', answer: '58', protan: '85', deutan: '85', category: 'red-green', difficulty: 3 },
    
    // Protan (red deficiency) specific plates
    { id: 'p1', type: 'protan', answer: '6', protan: '9', deutan: '6', category: 'red', difficulty: 3 },
    { id: 'p2', type: 'protan', answer: '45', protan: '54', deutan: '45', category: 'red', difficulty: 3 },
    { id: 'p3', type: 'protan', answer: '73', protan: '37', deutan: '73', category: 'red', difficulty: 4 },
    { id: 'p4', type: 'protan', answer: '26', protan: '62', deutan: '26', category: 'red', difficulty: 4 },
    { id: 'p5', type: 'protan', answer: '97', protan: '79', deutan: '97', category: 'red', difficulty: 5 },
    { id: 'p6', type: 'protan', answer: '7', protan: '1', deutan: '7', category: 'red', difficulty: 3 },
    { id: 'p7', type: 'protan', answer: '2', protan: '8', deutan: '2', category: 'red', difficulty: 3 },
    { id: 'p8', type: 'protan', answer: '15', protan: '51', deutan: '15', category: 'red', difficulty: 4 },
    
    // Deutan (green deficiency) specific plates
    { id: 'dt1', type: 'deutan', answer: '15', protan: '15', deutan: '51', category: 'green', difficulty: 3 },
    { id: 'dt2', type: 'deutan', answer: '26', protan: '26', deutan: '62', category: 'green', difficulty: 3 },
    { id: 'dt3', type: 'deutan', answer: '45', protan: '45', deutan: '54', category: 'green', difficulty: 4 },
    { id: 'dt4', type: 'deutan', answer: '73', protan: '73', deutan: '37', category: 'green', difficulty: 4 },
    { id: 'dt5', type: 'deutan', answer: '8', protan: '8', deutan: '3', category: 'green', difficulty: 4 },
    { id: 'dt6', type: 'deutan', answer: '5', protan: '5', deutan: '2', category: 'green', difficulty: 5 },
    { id: 'dt7', type: 'deutan', answer: '3', protan: '3', deutan: '8', category: 'green', difficulty: 3 },
    { id: 'dt8', type: 'deutan', answer: '7', protan: '7', deutan: '1', category: 'green', difficulty: 3 },
    
    // Control plates - "nothing" visible (background only, no figure)
    { id: 'c1', type: 'control', answer: 'nothing', protan: 'nothing', deutan: 'nothing', category: 'control', difficulty: 2 },
    { id: 'c2', type: 'control', answer: 'nothing', protan: 'nothing', deutan: 'nothing', category: 'control', difficulty: 2 },
    
    // Severity test plates (subtle differences)
    { id: 's1', type: 'severity', answer: '16', protan: '18', deutan: '19', category: 'red-green', difficulty: 5 },
    { id: 's2', type: 'severity', answer: '42', protan: '44', deutan: '24', category: 'red-green', difficulty: 5 },
    { id: 's3', type: 'severity', answer: '35', protan: '33', deutan: '38', category: 'red-green', difficulty: 5 },
  ]

  // Generate randomized test plates when test starts
  const generateTestPlates = useCallback(() => {
    // ALWAYS start with 1 easy demo plate (confidence building)
    const demoPlates = PLATE_BANK.filter(p => p.type === 'demo')
    const firstPlate = [demoPlates[Math.floor(Math.random() * demoPlates.length)]]
    
    // Randomly select from remaining plates (excluding control "nothing" plates from first few)
    const nonControlPlates = PLATE_BANK.filter(p => p.type !== 'control' && p.type !== 'demo')
    const controlPlates = PLATE_BANK.filter(p => p.type === 'control')
    
    // Select 8-9 diagnostic plates + 1-2 control plates at the END
    const shuffledDiagnostic = shuffleArray(nonControlPlates).slice(0, 9)
    const shuffledControl = shuffleArray(controlPlates).slice(0, 1)
    
    // Combine: demo first, diagnostic middle, control last
    return [...firstPlate, ...shuffledDiagnostic, ...shuffledControl]
  }, [])
  
  // Shuffle array helper
  const shuffleArray = (array) => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  // Reload calibration when component mounts
  useEffect(() => {
    loadCalibration()
  }, [])

  // Initialize test plates when test starts
  useEffect(() => {
    if (testState === 'testing' && testPlates.length === 0) {
      const plates = generateTestPlates()
      setTestPlates(plates)
      setCurrentPlate(plates[0])
      setCurrentPlateIndex(0)
    }
  }, [testState, generateTestPlates])

  // Generate SVG for current plate (ONLY when plate changes, not on every keystroke)
  // WITH CACHING for instant re-display
  useEffect(() => {
    if (currentPlate) {
      const cacheKey = currentPlate.id
      
      // Check cache first
      if (plateCache.has(cacheKey)) {
        setGeneratedPlateSVG(plateCache.get(cacheKey))
      } else {
        // Generate and cache
        const svg = generateRealisticPlate(currentPlate)
        setGeneratedPlateSVG(svg)
        setPlateCache(prev => new Map(prev).set(cacheKey, svg))
      }
      
      // Start timer for new plate - adaptive based on difficulty
      // Fixed 5 second time limit for all plates
      setTimeRemaining(FIXED_TIME_LIMIT)
      setResponseStartTime(Date.now())
    }
  }, [currentPlate, plateCache, FIXED_TIME_LIMIT]) // Only regenerate when currentPlate changes
  
  // Countdown timer effect
  useEffect(() => {
    if (testState === 'testing' && timeRemaining > 0 && !showFeedback) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 0.1) {
            // Time's up - auto-submit as timeout
            handleTimeout()
            return 0
          }
          return prev - 0.1
        })
      }, 100)
      
      return () => clearInterval(timer)
    }
  }, [testState, timeRemaining, showFeedback])
  
  // Handle timeout (no answer)
  const handleTimeout = () => {
    // Don't timeout if they already answered
    if (showFeedback) {
      console.log('⏱️ Timeout cancelled - already showing feedback')
      return
    }
    
    // If user has input OR voice timer is pending, they're actively answering - don't timeout
    // Give them extra time to finish their answer
    if (userInput || autoSubmitTimerRef.current) {
      console.log('⏱️ Timeout skipped - user has input or pending submission:', userInput)
      
      // Give them 3 more seconds to complete their answer
      setTimeout(() => {
        if (!showFeedback) {
          console.log('⏱️ Grace period expired - forcing submission')
          
          // If they still have input but haven't submitted, force submit now
          if (userInput) {
            const submitBtn = document.querySelector('[data-submit-answer]')
            if (submitBtn) {
              submitBtn.click()
              return
            }
          }
          
          // Otherwise record timeout
          handleTimeoutNow()
        }
      }, 3000) // 3 second grace period
      
      return
    }
    
    handleTimeoutNow()
  }
  
  const handleTimeoutNow = () => {
    if (showFeedback) return
    
    console.log('⏱️ Time expired - recording timeout')
    
    // Record as incorrect/timeout
    const response = {
      plateId: currentPlate.id,
      userAnswer: 'timeout',
      correctAnswer: currentPlate.answer,
      correct: false,
      errorType: 'timeout',
      category: currentPlate.category,
      difficulty: currentPlate.difficulty,
      timestamp: Date.now(),
      responseTime: FIXED_TIME_LIMIT,
      timeAllowed: FIXED_TIME_LIMIT
    }
    
    setResponses(prev => [...prev, response])
    setShowFeedback(true)
    
    // Auto-advance to next plate after showing timeout
    setTimeout(() => {
      console.log('⏭️ Moving to next plate after timeout')
      handleNextPlate()
    }, 1500)
  }

  // Voice recognition for current plate (optional — tap buttons are primary)
  useEffect(() => {
    if (testState === 'testing' && voiceEnabled && inputMethod === 'voice' && currentPlate && !showFeedback) {
      const timer = setTimeout(() => {
        startVoiceRecognition()
      }, 300)
      
      return () => {
        clearTimeout(timer)
        if (isListening) {
          voiceRecognition.stop()
          setIsListening(false)
        }
      }
    } else {
      if (isListening) {
        voiceRecognition.stop()
        setIsListening(false)
      }
    }
  }, [testState, voiceEnabled, inputMethod, currentPlate, showFeedback])

  const handleVoiceError = (error) => {
    const fatalErrors = ['network', 'not-allowed', 'service-not-allowed', 'audio-capture']
    if (!fatalErrors.includes(error)) return

    voiceRecognition.stop()
    setIsListening(false)
    setVoiceEnabled(false)
    setInputMethod('type')

    const messages = {
      network: 'Voice needs internet. Tap a number below to continue.',
      'not-allowed': 'Microphone blocked. Tap a number below to continue.',
      'service-not-allowed': 'Voice unavailable. Tap a number below to continue.',
      'audio-capture': 'No microphone found. Tap a number below to continue.',
    }
    setVoiceNotice(messages[error] || 'Voice unavailable. Tap a number below.')
  }

  // Start voice recognition
  const startVoiceRecognition = () => {
    if (!voiceSupported || !voiceEnabled || inputMethod !== 'voice' || isListening || showFeedback) {
      return
    }
    
    setIsListening(true)
    
    voiceRecognition.start((transcript) => {
      console.log('[mic] Voice heard:', transcript)
      
      // Reduced debounce: Ignore if submitted less than 600ms ago (was 1200ms)
      const now = Date.now()
      if (now - lastVoiceSubmitTime < 600) {
        console.log('⏭️ Voice debounced - too soon')
        return
      }
      
      // Use the improved parser
      const parsed = voiceRecognition.parseResponse(transcript)
      console.log(' Parsed as:', parsed)
      
      if (parsed) {
        // Update the input field immediately - this is the source of truth
        setUserInput(parsed)
        console.log('📝 Answer set to:', parsed)
        
        // CRITICAL: Store in ref to avoid closure issues
        pendingAnswerRef.current = parsed
        
        // Clear any existing timer when user says a NEW number
        if (autoSubmitTimerRef.current) {
          console.log('🔄 Clearing old timer')
          clearTimeout(autoSubmitTimerRef.current)
          autoSubmitTimerRef.current = null
        }
        
        // MUCH FASTER: Wait only 0.8 seconds before auto-submitting (was 2 seconds)
        // This makes it feel instant while still allowing corrections
        autoSubmitTimerRef.current = setTimeout(() => {
          console.log('⏰ Auto-submitting now!')
          
          // Don't submit if already showing feedback
          if (showFeedback) {
            console.log('[X] Already submitted')
            autoSubmitTimerRef.current = null
            return
          }
          
          // Get the value from ref (more reliable than closure)
          const valueToSubmit = pendingAnswerRef.current
          console.log(' Submitting:', valueToSubmit)
          
          if (!valueToSubmit) {
            console.error('[X] No value to submit!')
            autoSubmitTimerRef.current = null
            return
          }
          
          setLastVoiceSubmitTime(Date.now())
          
          // Stop voice recognition BEFORE submitting
          if (isListening) {
            voiceRecognition.stop()
            setIsListening(false)
          }
          
          // Directly call handleAnswerSubmit with the value from ref
          submitAnswerWithValue(valueToSubmit)
          
          // Clear the ref after submission
          pendingAnswerRef.current = null
          autoSubmitTimerRef.current = null
        }, 800) // FASTER: 0.8 seconds (was 2 seconds)
      }
    }, handleVoiceError)
  }

  // Normalize answer (now just delegates to voiceRecognition parser)
  const normalizeAnswer = (input) => {
    if (!input) return ''
    return voiceRecognition.parseResponse(input) || input
  }

  // Handle answer submission with explicit value (for voice auto-submit)
  const submitAnswerWithValue = (value) => {
    if (!value || showFeedback) {
      console.log('[X] Cannot submit - empty value or already showing feedback')
      return
    }
    
    console.log('[OK] Submitting with value:', value)
    
    // CRITICAL: Stop voice recognition immediately to prevent duplicate submissions
    if (isListening) {
      voiceRecognition.stop()
      setIsListening(false)
      console.log('🛑 Stopped voice recognition')
    }
    
    // Clear any pending auto-submit timer
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current)
      autoSubmitTimerRef.current = null
    }
    
  const plate = currentPlate
  // Strip emojis and whitespace, normalize to lower-case
  const sanitized = removeEmojis(String(value || ''))
  const normalizedInput = sanitized.toLowerCase().trim()
    const correctAnswer = plate.answer.toLowerCase()
    const isCorrect = normalizedInput === correctAnswer
    
    // Determine error type
    let errorType = null
    if (!isCorrect) {
      if (normalizedInput === plate.protan.toLowerCase()) {
        errorType = 'protan'
      } else if (normalizedInput === plate.deutan.toLowerCase()) {
        errorType = 'deutan'
      } else {
        errorType = 'other'
      }
    }
    
    // Record response with timing data
    const responseTime = responseStartTime ? (Date.now() - responseStartTime) / 1000 : null
    
    const response = {
      plateId: plate.id,
      userAnswer: normalizedInput,
      correctAnswer: correctAnswer,
      correct: isCorrect,
      errorType,
      category: plate.category,
      difficulty: plate.difficulty,
      timestamp: Date.now(),
      responseTime, // Track how fast they responded
      timeAllowed: FIXED_TIME_LIMIT
    }
    
  setResponses(prev => [...prev, response])
    
    // Show feedback
    setShowFeedback(true)
    setLastResult(isCorrect ? 'correct' : 'incorrect')
    
    // Move to next plate after delay
    setTimeout(() => {
      if (currentPlateIndex < testPlates.length - 1) {
        const nextIndex = currentPlateIndex + 1
        setCurrentPlateIndex(nextIndex)
        setCurrentPlate(testPlates[nextIndex])
        setSelectedAnswer(null)
        setUserInput('')
        setShowFeedback(false)
        setLastResult(null)
        setResponseStartTime(Date.now())
        
        if (voiceEnabled && inputMethod === 'voice') {
          setTimeout(() => {
            startVoiceRecognition()
          }, 500)
        }
      } else {
        setTestState('results')
      }
    }, FEEDBACK_DURATION)
  }

  // Handle answer submission - auto-submit when user provides input
  const handleAnswerSubmit = () => {
    if (!userInput || showFeedback) return
    
    // Stop voice recognition immediately on submission
    if (isListening) {
      voiceRecognition.stop()
      setIsListening(false)
    }
    
    // Use the common submission function
    submitAnswerWithValue(userInput)
  }

  // Move to next plate
  const handleNextPlate = () => {
    // CRITICAL: Stop voice recognition immediately to prevent carryover
    if (isListening) {
      voiceRecognition.stop()
      setIsListening(false)
    }
    
    // Clear any pending auto-submit timer
    if (autoSubmitTimerRef.current) {
      console.log('🧹 Clearing auto-submit timer')
      clearTimeout(autoSubmitTimerRef.current)
      autoSubmitTimerRef.current = null
    }
    
    setShowFeedback(false)
    setUserInput('') // Clear any pending input
    setLastVoiceSubmitTime(0) // Reset debounce timer for new plate
    
    if (currentPlateIndex < testPlates.length - 1) {
      const nextIndex = currentPlateIndex + 1
      setCurrentPlateIndex(nextIndex)
      setCurrentPlate(testPlates[nextIndex])
    } else {
      // Test complete
      setTestState('results')
    }
  }

  // Analyze results
  const analyzeResults = () => {
    const totalPlates = responses.length
    const correctCount = responses.filter(r => r.correct).length
    const accuracy = (correctCount / totalPlates) * 100
    
    // Count error types
    const protanErrors = responses.filter(r => r.errorType === 'protan').length
    const deutanErrors = responses.filter(r => r.errorType === 'deutan').length
    const otherErrors = responses.filter(r => r.errorType === 'other').length
    
    // Determine deficiency type
    let deficiencyType = 'normal'
    let severity = 'none'
    
    if (accuracy >= 90) {
      deficiencyType = 'normal'
      severity = 'none'
    } else if (protanErrors > deutanErrors && protanErrors >= 2) {
      deficiencyType = 'protan'
      if (protanErrors >= 5) severity = 'severe'
      else if (protanErrors >= 3) severity = 'moderate'
      else severity = 'mild'
    } else if (deutanErrors > protanErrors && deutanErrors >= 2) {
      deficiencyType = 'deutan'
      if (deutanErrors >= 5) severity = 'severe'
      else if (deutanErrors >= 3) severity = 'moderate'
      else severity = 'mild'
    } else if (correctCount <= 5) {
      deficiencyType = 'red-green'
      severity = 'moderate'
    }
    
    return {
      totalPlates,
      correctCount,
      accuracy,
      protanErrors,
      deutanErrors,
      otherErrors,
      deficiencyType,
      severity
    }
  }

  // Submit results to backend
  const submitResults = async () => {
    try {
      const analysis = analyzeResults()
      const confidence = getConfidence()
      
      await visionTestAPI.submit({
        test_type: 'color_vision',
        score: Math.round(analysis.accuracy),
        test_details: {
          total_plates: analysis.totalPlates,
          correct_plates: analysis.correctCount,
          accuracy: analysis.accuracy,
          deficiency_type: analysis.deficiencyType,
          severity: analysis.severity,
          protan_errors: analysis.protanErrors,
          deutan_errors: analysis.deutanErrors,
          other_errors: analysis.otherErrors,
          responses: responses,
          calibration_confidence: confidence,
          test_duration_seconds: Math.round((responses[responses.length - 1]?.timestamp - responses[0]?.timestamp) / 1000),
          timestamp: new Date().toISOString()
        }
      })
      
      navigate('/vision-tests')
    } catch (error) {
      console.error('Failed to submit results:', error)
      alert('Failed to save results. Please try again.')
    }
  }

  // Start the test (skip glasses check, go directly to testing)
  const startTest = () => {
    const useVoice = inputMethod === 'voice' && voiceSupported
    setVoiceEnabled(useVoice)
    setVoiceNotice('')
    setTestState('testing')
  }

  // Render Distance Gate - blocks until user is at correct distance
  const renderDistanceGate = () => (
    <div className="test-shell">
      <div className="max-w-4xl mx-auto">
        <InlineDistanceCalibration
          testType="color_vision"
          optimalDistanceMM={355} // 14 inches (35.5cm) - Ishihara standard "near" zone
          toleranceMM={30} // ±3cm strict tolerance for color accuracy
          testName="Color Vision Test"
          blockUntilValid={true}
          onDistanceValid={(valid) => {
            if (valid && !distanceValid) {
              setDistanceValid(true)
              // Wait 2 seconds after successful distance lock, then proceed
              setTimeout(() => {
                setTestState('instructions')
              }, 2000)
            }
          }}
          onDistanceInvalid={() => {
            setDistanceValid(false)
          }}
        />

        {/* Skip button for testing */}
        <div className="mt-8 text-center">
          <button
            onClick={() => setTestState('instructions')}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Skip calibration (for testing only)
          </button>
        </div>
      </div>
    </div>
  )

  // Render Instructions
  const renderInstructions = () => (
    <TestPrepLayout
      title="Color Vision Test"
      subtitle="Tap the number you see on each plate (~3 min)"
      steps={[
        'Look at each colored dot pattern.',
        'Tap the number you see (or Nothing).',
        'Get a red-green screening result.',
      ]}
      onBack={() => navigate('/vision-tests')}
      onPrimary={startTest}
      primaryLabel="Start Test"
      footerNote="Screening only — not a clinical diagnosis."
    >
      <div className="flex gap-2 justify-center">
        <button
          type="button"
          onClick={() => setInputMethod('type')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold border-2 transition-colors ${
            inputMethod === 'type' ? 'border-accent-500 bg-accent-50 text-accent-900' : 'border-gray-200 text-gray-600'
          }`}
        >
          Tap numbers
        </button>
        <button
          type="button"
          onClick={() => setInputMethod('voice')}
          disabled={!voiceSupported}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold border-2 transition-colors ${
            inputMethod === 'voice' ? 'border-accent-500 bg-accent-50 text-accent-900' : 'border-gray-200 text-gray-600'
          } ${!voiceSupported ? 'opacity-50' : ''}`}
        >
          Voice (optional)
        </button>
      </div>
      <TestDetails summary="Quick prep">
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Bright, even light — remove tinted or blue-light glasses</li>
          <li>Screen brightness ~70–80%, Night Shift off</li>
          <li>Hold device at arm's length</li>
        </ul>
      </TestDetails>
      <TestDetails summary="Disclaimer & limits">
        <p className="text-xs">Home screening for red-green color trouble — not for clinical diagnosis, jobs, or legal use. See an eye care professional for official testing.</p>
      </TestDetails>
    </TestPrepLayout>
  )

  // Generate pseudoisochromatic plate (simplified visual representation)
  // Helper: Calculate luminance (Y) from hex color
  const getLuminance = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    
    // Convert to linear RGB
    const toLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    const rL = toLinear(r)
    const gL = toLinear(g)
    const bL = toLinear(b)
    
    // Calculate luminance (Y)
    return 0.2126 * rL + 0.7152 * gL + 0.0722 * bL
  }
  
  // Generate realistic Ishihara-style pseudoisochromatic plate
  const generateRealisticPlate = (plate) => {
    const startTime = performance.now()
    const isDemo = plate.category === 'demo'
    
    // Color palettes
    const colorPalettes = {
      demo: {
        number: ['#D67520', '#E07A22', '#EA7F24', '#D97926', '#CF7424', '#C56F22', '#DB7624', '#E57B26'],
        background: ['#7F921E', '#899C20', '#93A622', '#8CA226', '#788E1C', '#8FA424', '#99AE26', '#829820']
      },
      protan: {
        number: ['#D67520', '#E07A22', '#EA7F24', '#D97926', '#CF7424', '#C56F22', '#DB7624', '#E57B26'],
        background: ['#7F921E', '#899C20', '#93A622', '#8CA226', '#788E1C', '#8FA424', '#99AE26', '#829820']
      },
      deutan: {
        number: ['#D67520', '#E07A22', '#EA7F24', '#D97926', '#CF7424', '#C56F22', '#DB7624', '#E57B26'],
        background: ['#7F921E', '#899C20', '#93A622', '#8CA226', '#788E1C', '#8FA424', '#99AE26', '#829820']
      },
      redGreen: {
        number: ['#D67520', '#E07A22', '#EA7F24', '#D97926', '#CF7424', '#C56F22', '#DB7624', '#E57B26'],
        background: ['#7F921E', '#899C20', '#93A622', '#8CA226', '#788E1C', '#8FA424', '#99AE26', '#829820']
      }
    }
    
    let palette = colorPalettes.demo
    if (plate.category === 'red' || plate.type === 'protan') palette = colorPalettes.protan
    else if (plate.category === 'green' || plate.type === 'deutan') palette = colorPalettes.deutan
    else if (!isDemo) palette = colorPalettes.redGreen
    
    // Create canvas mask for number detection
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = 400
    maskCanvas.height = 400
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
    
    // Black background
    maskCtx.fillStyle = '#000000'
    maskCtx.fillRect(0, 0, 400, 400)
    
    // Draw white number if not "nothing"
    if (plate.answer !== 'nothing') {
      maskCtx.fillStyle = '#FFFFFF'
      maskCtx.strokeStyle = '#FFFFFF'
      maskCtx.textAlign = 'center'
      maskCtx.textBaseline = 'middle'
      
      // CRITICAL: Use lighter font weight for number 4 to make it thinner
      // For other numbers, use bold; for 4, use normal weight
      const fontWeight = plate.answer.includes('4') ? '600' : 'bold'
      maskCtx.font = `${fontWeight} 200px Arial, sans-serif`
      
      // ONLY fill - no strokes that can close holes
      maskCtx.fillText(plate.answer, 200, 200)
    }
    
    // Get mask pixel data
    const maskData = maskCtx.getImageData(0, 0, 400, 400)
    
    // DEBUG: Don't show mask - users can see the answer
    // Disabled for production
    
    // Helper: check if pixel is white (in number)
    const isInNumber = (x, y) => {
      const px = Math.round(x)
      const py = Math.round(y)
      if (px < 0 || px >= 400 || py < 0 || py >= 400) return false
      
      const idx = (py * 400 + px) * 4
      const r = maskData.data[idx]
      const g = maskData.data[idx + 1]
      const b = maskData.data[idx + 2]
      
      // White = in number (any RGB channel > 200)
      return r > 200 || g > 200 || b > 200
    }
    
    // Generate dots - MUCH MORE for better number definition
    const dots = []
    const centerX = 200
    const centerY = 200
    const radius = 190
    
    // Spatial grid for collision detection (smaller cells = faster)
    const cellSize = 10
    const gridSize = Math.ceil(400 / cellSize)
    const grid = Array(gridSize * gridSize).fill(null).map(() => [])
    
    const getCell = (x, y) => {
      const cx = Math.floor(x / cellSize)
      const cy = Math.floor(y / cellSize)
      return { cx, cy }
    }
    
    // ULTRA-DENSE packing - eliminate ALL whitespace
    // Multiple passes with decreasing dot sizes to fill every gap
    let attempt = 0
    const maxAttempts = 5000000  // 5 MILLION attempts
    
    while (attempt < maxAttempts && dots.length < 5000) {
      attempt++
      
      // Random position in circle
      const angle = Math.random() * 2 * Math.PI
      const r = Math.sqrt(Math.random()) * (radius - 0.5)
      const x = centerX + r * Math.cos(angle)
      const y = centerY + r * Math.sin(angle)
      
      // Check if in number area
      const inNumber = isInNumber(x, y)
      
      // Progressive sizing - start with bigger, add smaller to fill gaps
      // Based on how many dots already placed
      const progress = dots.length / 5000
      const roll = Math.random()
      
      let size
      if (progress < 0.5) {
        // First 50%: mix of sizes
        size = roll < 0.50 ? 5 + Math.random() * 3 :     // 5-8px (50%)
               roll < 0.80 ? 8 + Math.random() * 3 :     // 8-11px (30%)
                             3 + Math.random() * 2       // 3-5px (20% small fill)
      } else {
        // Last 50%: focus on tiny dots to fill remaining gaps
        size = roll < 0.80 ? 3 + Math.random() * 2 :     // 3-5px (80% tiny)
                             5 + Math.random() * 2       // 5-7px (20% small)
      }
      
      // MINIMAL gap - almost touching
      let overlap = false
      const { cx, cy } = getCell(x, y)
      for (let dy = -1; dy <= 1 && !overlap; dy++) {
        for (let dx = -1; dx <= 1 && !overlap; dx++) {
          const nx = cx + dx, ny = cy + dy
          if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
            for (const d of grid[ny * gridSize + nx]) {
              const dist = Math.sqrt((x - d.x) ** 2 + (y - d.y) ** 2)
              if (dist < size + d.size + 0.1) {  // 0.1px gap - almost touching
                overlap = true
                break
              }
            }
          }
        }
      }
      
      if (!overlap) {
        const dot = { x, y, size, inNumber, key: `d${dots.length}` }
        dots.push(dot)
        if (cx >= 0 && cx < gridSize && cy >= 0 && cy < gridSize) {
          grid[cy * gridSize + cx].push(dot)
        }
      }
    }
    
    // Apply colors
    const addJitter = (hex) => {
      const r = parseInt(hex.slice(1,3), 16)
      const g = parseInt(hex.slice(3,5), 16)
      const b = parseInt(hex.slice(5,7), 16)
      
      const jr = Math.max(0, Math.min(255, r + (Math.random()-0.5)*8))
      const jg = Math.max(0, Math.min(255, g + (Math.random()-0.5)*8))
      const jb = Math.max(0, Math.min(255, b + (Math.random()-0.5)*8))
      
      return `#${Math.round(jr).toString(16).padStart(2,'0')}${Math.round(jg).toString(16).padStart(2,'0')}${Math.round(jb).toString(16).padStart(2,'0')}`
    }
    
    // Render SVG
    const numberDotsCount = dots.filter(d => d.inNumber).length
    const bgDotsCount = dots.length - numberDotsCount
    
    console.log(` Plate "${plate.answer}": ${dots.length} total dots`)
    console.log(`   ${numberDotsCount} orange (number) | ${bgDotsCount} green (background)`)
    
    const svg = (
      <div className="relative w-full h-full min-h-[180px]">
        <svg viewBox="0 0 400 400" className="w-full h-full block" preserveAspectRatio="xMidYMid meet">
          <circle cx="200" cy="200" r="195" fill="#F5F5F5" />
          <g>
            {dots.map(dot => {
              const colors = dot.inNumber ? palette.number : palette.background
              const baseColor = colors[Math.floor(Math.random() * colors.length)]
              const color = addJitter(baseColor)
              return <circle key={dot.key} cx={dot.x} cy={dot.y} r={dot.size} fill={color} />
            })}
          </g>
        </svg>
      </div>
    )
    
    const endTime = performance.now()
    console.log(`⏱️ Generated in ${(endTime - startTime).toFixed(1)}ms`)
    
    return svg
  }
  
  // Get positions for number shapes (returns array of {x, y} coordinates)
  const getNumberPositions = (number) => {
    const positions = []
    const digits = number.toString().split('')
    
    // Much more detailed digit shapes with MANY intermediate points for clarity
    const digitShapes = {
      '1': [ // Vertical line with extra points
        {x: -3, y: -30}, {x: 0, y: -30}, {x: 3, y: -30},
        {x: 0, y: -25}, {x: 0, y: -20}, {x: 0, y: -15}, {x: 0, y: -10},
        {x: 0, y: -5}, {x: 0, y: 0}, {x: 0, y: 5}, {x: 0, y: 10},
        {x: 0, y: 15}, {x: 0, y: 20}, {x: 0, y: 25}, {x: 0, y: 30},
        {x: -3, y: 30}, {x: 3, y: 30}
      ],
      '2': [
        // Top curve
        {x: -15, y: -30}, {x: -10, y: -30}, {x: -5, y: -30}, {x: 0, y: -30},
        {x: 5, y: -30}, {x: 10, y: -30}, {x: 15, y: -30},
        {x: 18, y: -28}, {x: 20, y: -25}, {x: 20, y: -20}, {x: 20, y: -15},
        // Middle diagonal
        {x: 18, y: -10}, {x: 15, y: -5}, {x: 10, y: 0}, {x: 5, y: 5},
        {x: 0, y: 10}, {x: -5, y: 15}, {x: -10, y: 20},
        // Bottom straight
        {x: -15, y: 22}, {x: -20, y: 25}, {x: -20, y: 28}, {x: -20, y: 30},
        {x: -15, y: 30}, {x: -10, y: 30}, {x: -5, y: 30}, {x: 0, y: 30},
        {x: 5, y: 30}, {x: 10, y: 30}, {x: 15, y: 30}, {x: 20, y: 30}
      ],
      '4': [
        // Left vertical
        {x: -20, y: -30}, {x: -20, y: -25}, {x: -20, y: -20},
        {x: -20, y: -15}, {x: -20, y: -10}, {x: -20, y: -5}, {x: -20, y: 0},
        // Middle horizontal
        {x: -15, y: 0}, {x: -10, y: 0}, {x: -5, y: 0}, {x: 0, y: 0},
        {x: 5, y: 0}, {x: 10, y: 0}, {x: 15, y: 0}, {x: 18, y: 0},
        // Right vertical (full height)
        {x: 15, y: -30}, {x: 15, y: -25}, {x: 15, y: -20}, {x: 15, y: -15},
        {x: 15, y: -10}, {x: 15, y: -5}, {x: 15, y: 5}, {x: 15, y: 10},
        {x: 15, y: 15}, {x: 15, y: 20}, {x: 15, y: 25}, {x: 15, y: 30}
      ],
      '7': [
        // Top horizontal
        {x: -20, y: -30}, {x: -15, y: -30}, {x: -10, y: -30},
        {x: -5, y: -30}, {x: 0, y: -30}, {x: 5, y: -30},
        {x: 10, y: -30}, {x: 15, y: -30}, {x: 20, y: -30},
        // Diagonal down
        {x: 18, y: -25}, {x: 15, y: -20}, {x: 12, y: -15}, {x: 10, y: -10},
        {x: 7, y: -5}, {x: 5, y: 0}, {x: 2, y: 5}, {x: 0, y: 10},
        {x: -2, y: 15}, {x: -5, y: 20}, {x: -7, y: 25}, {x: -10, y: 30}
      ]
    }
    
    return digitShapes[digits[0]] || []
  }

  // Render Difficulty Transition Screen
  // Render Testing
  const renderTesting = () => {
    if (!currentPlate) return null

    const numberChoices = ['2', '3', '5', '6', '7', '8', '9', '12', '15', '16', '26', '29', '35', '42', '45', '57', '73', '74', '83', '96', 'Nothing']
    const timerPercent = (timeRemaining / FIXED_TIME_LIMIT) * 100
    const isLowTime = timeRemaining <= 1
    const last = responses[responses.length - 1]

    return (
      <div className="test-active">
        <TestActiveBar
          left={`Plate ${currentPlateIndex + 1}/${testPlates.length}`}
          center={(
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${isLowTime ? 'bg-red-500' : 'bg-accent-600'}`}
                style={{ width: `${timerPercent}%` }}
              />
            </div>
          )}
          right={`${timeRemaining.toFixed(0)}s`}
        />

        {voiceNotice && (
          <div className="text-xs text-center bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-900">
            {voiceNotice}
          </div>
        )}

        <div className="test-stimulus-wrap">
          {generatedPlateSVG || (
            <div className="flex flex-col items-center justify-center text-gray-400 text-sm gap-3">
              <div className="spinner w-10 h-10" />
              <span>Loading plate…</span>
            </div>
          )}
        </div>

        {showFeedback && last && (
          <div className={`text-center text-sm font-semibold py-2 rounded-lg ${
            last.errorType === 'timeout' ? 'bg-yellow-50 text-yellow-800' :
            last.correct ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {last.errorType === 'timeout' ? 'Time expired' : last.correct ? 'Correct' : 'Incorrect'}
          </div>
        )}

        {!showFeedback && (
          <>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {numberChoices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  disabled={timeRemaining <= 0}
                  onClick={() => {
                    setSelectedAnswer(choice)
                    setUserInput(choice)
                    submitAnswerWithValue(choice === 'Nothing' ? 'nothing' : choice)
                  }}
                  className={`test-answer-btn ${selectedAnswer === choice ? 'test-answer-btn-selected' : ''}`}
                >
                  {choice}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => submitAnswerWithValue('nothing')}
              disabled={timeRemaining <= 0}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
            >
              Can't see a number
            </button>
          </>
        )}
      </div>
    )
  }

  // Render Results
  const renderResults = () => {
    const analysis = analyzeResults()

    return (
      <div className="max-w-3xl mx-auto space-y-4 py-4">
        <div className="card">
          <h2 className="section-title mb-4">Test Results</h2>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-accent-50 rounded-2xl p-6">
              <h3 className="font-bold text-xl text-gray-900 mb-2">Accuracy</h3>
              <p className="text-4xl font-bold text-accent-600">{Math.round(analysis.accuracy)}%</p>
              <p className="text-gray-600 mt-2">{analysis.correctCount} of {analysis.totalPlates} correct</p>
            </div>

            <div className="bg-brand-soft rounded-2xl p-6">
              <h3 className="font-bold text-xl text-gray-900 mb-2">Result</h3>
              <p className="text-2xl font-bold text-accent-700">
                {analysis.deficiencyType === 'normal' ? 'Normal Color Vision' :
                 analysis.deficiencyType === 'protan' ? 'Some trouble seeing red' :
                 analysis.deficiencyType === 'deutan' ? 'Some trouble seeing green' :
                 'Some red-green color trouble'}
              </p>
              {analysis.severity !== 'none' && (
                <p className="text-gray-600 mt-2">Severity: {analysis.severity}</p>
              )}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => navigate('/vision-tests')}
              className="flex-1 btn-secondary min-h-[44px]"
            >
               Back to Tests
            </button>
            <button
              onClick={submitResults}
              className="flex-1 btn-primary min-h-[44px]"
            >
              Save Results 
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-2 pb-4">
      {testState === 'distance-gate' && renderDistanceGate()}
      {testState === 'instructions' && renderInstructions()}
      {testState === 'testing' && renderTesting()}
      {testState === 'results' && renderResults()}
    </div>
  )
}

export default ColorVisionTest
