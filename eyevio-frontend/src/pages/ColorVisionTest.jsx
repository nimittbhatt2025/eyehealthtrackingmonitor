import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCalibration } from '../context/CalibrationContext'
import { visionTestAPI } from '../services/api'
import voiceRecognition from '../utils/voiceRecognition'
import VoiceControl from '../components/VoiceControl'
import InlineDistanceCalibration from '../components/InlineDistanceCalibration'
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
  const [voiceEnabled, setVoiceEnabled] = useState(true) // Default to voice enabled
  const [isListening, setIsListening] = useState(false)
  const [voiceSupported] = useState(voiceRecognition.isSupported())
  const [userInput, setUserInput] = useState('')
  const [inputMethod, setInputMethod] = useState('voice') // 'voice' or 'type' - set in instructions
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

  // Voice recognition for current plate
  useEffect(() => {
    if (testState === 'testing' && voiceEnabled && currentPlate && !showFeedback) {
      // Small delay before starting to ensure plate is ready
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
      // Stop listening when not in testing state
      if (isListening) {
        voiceRecognition.stop()
        setIsListening(false)
      }
    }
  }, [testState, voiceEnabled, currentPlate, showFeedback])

  // Start voice recognition
  const startVoiceRecognition = () => {
    // Don't start if already listening or if we just submitted
    if (!voiceSupported || isListening || showFeedback) {
      console.log('⏸️ Cannot start voice - already listening:', isListening, 'or showing feedback:', showFeedback)
      return
    }
    
    console.log('[mic] Starting voice recognition...')
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
    })
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
        setCurrentPlateIndex(currentPlateIndex + 1)
        setUserInput('')
        setShowFeedback(false)
        setLastResult(null)
        setResponseStartTime(Date.now())
        
        // Restart voice recognition for next plate
        setTimeout(() => {
            startVoiceRecognition()
        }, 500)
      } else {
        // Test complete
        completeTest([...responses, response])
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
    setTestState('testing')
  }

  // Render Distance Gate - blocks until user is at correct distance
  const renderDistanceGate = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-6 px-4">
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        
        {/* Header Section */}
        <div className="text-center mb-6">
          <div className="mb-4">
            <div className="w-16 h-16 mx-auto bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            Color Vision Test
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Screen for red-green color deficiencies using Ishihara-inspired plates
          </p>
        </div>

        {/* MEDICAL DISCLAIMER */}
        <div className="bg-white rounded-xl shadow-lg border-l-4 border-red-500 p-5 mb-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Medical Disclaimer: Screening Tool Only</h3>
              <p className="text-gray-700 mb-3 text-sm font-medium">This is a SCREENING tool for casual home monitoring, NOT a clinical diagnosis.</p>
              
              <div className="grid md:grid-cols-2 gap-3 mb-3">
                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                  <p className="font-semibold text-green-900 mb-1 text-sm">Good for:</p>
                  <p className="text-xs text-green-800">Early warning screening at home, detecting major red-green issues</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                  <p className="font-semibold text-red-900 mb-1 text-sm">NOT suitable for:</p>
                  <p className="text-xs text-red-800">Clinical diagnosis, job requirements, legal purposes</p>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 mb-3">
                <p className="font-semibold text-gray-900 mb-1 text-sm">Why this is NOT a clinical test:</p>
                <ul className="space-y-1 text-xs text-gray-700">
                  <li className="flex gap-2"><span className="text-red-500">•</span><span><strong>Screen inconsistency:</strong> Monitor brightness and color settings alter results</span></li>
                  <li className="flex gap-2"><span className="text-red-500">•</span><span><strong>Lighting variation:</strong> Clinical tests use standardized daylight in controlled environments</span></li>
                  <li className="flex gap-2"><span className="text-red-500">•</span><span><strong>Limited scope:</strong> Cannot detect blue-yellow (Tritan) deficiencies</span></li>
                  <li className="flex gap-2"><span className="text-red-500">•</span><span><strong>No severity measurement:</strong> Cannot determine mild vs severe accurately</span></li>
                </ul>
              </div>
              
              <p className="text-xs text-gray-700 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                <strong>For clinical diagnosis or job requirements:</strong> You MUST be tested with a physical Ishihara booklet by a licensed eye care professional.
              </p>
            </div>
          </div>
        </div>

        {/* How This Test Works */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">How This Test Works</h2>
          
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl font-bold text-blue-600">1</span>
              </div>
              <h3 className="font-bold text-base text-gray-900 mb-1">View Each Plate</h3>
              <p className="text-sm text-gray-600">You'll see 10 colored dot patterns, each containing a hidden number.</p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl font-bold text-blue-600">2</span>
              </div>
              <h3 className="font-bold text-base text-gray-900 mb-1">Identify the Number</h3>
              <p className="text-sm text-gray-600">Select the number you see, or choose "Nothing" if you can't see any.</p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl font-bold text-blue-600">3</span>
              </div>
              <h3 className="font-bold text-base text-gray-900 mb-1">Get Results</h3>
              <p className="text-sm text-gray-600">Receive screening results for red and green deficiencies.</p>
            </div>
          </div>
        </div>

        {/* Best Practices */}
        <div className="bg-white rounded-xl shadow-lg p-5">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Best Practices for Reliable Results</h3>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-amber-600 font-bold text-sm">1</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Consistent Device</p>
                <p className="text-sm text-gray-600">Use the same device and screen every time</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-amber-600 font-bold text-sm">2</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Standardized Lighting</p>
                <p className="text-sm text-gray-600">Test in natural daylight or bright white light</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-amber-600 font-bold text-sm">3</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Screen Brightness</p>
                <p className="text-sm text-gray-600">Set to 70-80% (same level each time)</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-amber-600 font-bold text-sm">4</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Disable Filters</p>
                <p className="text-sm text-gray-600">Turn OFF Night Shift and blue light filters</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-amber-600 font-bold text-sm">5</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Fixed Timing</p>
                <p className="text-sm text-gray-600">8 seconds per plate for all tests</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-amber-600 font-bold text-sm">6</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Track Baseline</p>
                <p className="text-sm text-gray-600">Test monthly to detect changes over time</p>
              </div>
            </div>
          </div>
        </div>

        {/* Glasses/Contacts Guidance */}
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6">
          <h3 className="font-bold text-green-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
            Glasses/Contacts: CLEAR LENSES ONLY
          </h3>
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-4 border border-green-200">
              <p className="text-green-900 font-semibold mb-2"> Safe to wear:</p>
              <ul className="text-sm text-green-800 space-y-1 ml-4">
                <li>• Standard prescription glasses (nearsighted/farsighted correction)</li>
                <li>• Clear contact lenses</li>
                <li>• Reading glasses with clear lenses</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg p-4 border border-red-300">
              <p className="text-red-900 font-semibold mb-2">[X] REMOVE these:</p>
              <ul className="text-sm text-red-800 space-y-1 ml-4">
                <li>• Sunglasses or tinted lenses (any color)</li>
                <li>• Blue-light blocking glasses</li>
                <li>• "Color blind correction" glasses (EnChroma, etc.)</li>
                <li>• Red-tinted contact lenses (X-Chrome)</li>
                <li>• Photochromic/transition lenses (if darkened)</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-green-800 mt-3 italic">
            💡 Tinted lenses filter specific wavelengths and will cause false results
          </p>
        </div>

        {/* Input Method Selection */}
        <div className="bg-white rounded-xl shadow-lg p-5">
          <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">Choose Your Input Method</h3>
          
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <button
              onClick={() => setInputMethod('voice')}
              className={`relative overflow-hidden rounded-xl p-4 transition-all duration-200 ${
                inputMethod === 'voice'
                  ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg scale-105'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-2 border-gray-200'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  inputMethod === 'voice' ? 'bg-white bg-opacity-20' : 'bg-blue-100'
                }`}>
                  <svg className={`w-6 h-6 ${inputMethod === 'voice' ? 'text-white' : 'text-blue-600'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold mb-0.5">Voice Input</p>
                  <p className="text-xs opacity-90 mb-1">Speak numbers aloud</p>
                  <p className="text-xs opacity-75 px-2 py-0.5 rounded-full bg-black bg-opacity-10">
                    Stays active throughout test
                  </p>
                </div>
              </div>
              {inputMethod === 'voice' && (
                <div className="absolute top-2 right-2">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>

            <button
              onClick={() => setInputMethod('type')}
              className={`relative overflow-hidden rounded-xl p-4 transition-all duration-200 ${
                inputMethod === 'type'
                  ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg scale-105'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-2 border-gray-200'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  inputMethod === 'type' ? 'bg-white bg-opacity-20' : 'bg-blue-100'
                }`}>
                  <svg className={`w-6 h-6 ${inputMethod === 'type' ? 'text-white' : 'text-blue-600'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold mb-0.5">Click/Type</p>
                  <p className="text-xs opacity-90 mb-1">Select from buttons</p>
                  <p className="text-xs opacity-75 px-2 py-0.5 rounded-full bg-black bg-opacity-10">
                    Manual selection
                  </p>
                </div>
              </div>
              {inputMethod === 'type' && (
                <div className="absolute top-2 right-2">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          </div>

          {inputMethod === 'voice' && voiceSupported && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-blue-900">
                <strong>Voice recognition will stay active</strong> throughout the entire test. Speak clearly when you see a number.
              </p>
            </div>
          )}

          {inputMethod === 'voice' && !voiceSupported && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-900">
                <strong>Voice not supported:</strong> Your browser doesn't support voice recognition. Please use Click/Type mode.
              </p>
            </div>
          )}
        </div>

        {/* What This Test Can/Cannot Detect */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">What This Test Detects</h3>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <h4 className="font-bold text-lg text-green-900">CAN Detect</h4>
              </div>
              <ul className="space-y-2 text-sm text-green-800">
                <li className="flex gap-2">
                  <span className="font-bold"></span>
                  <span>Red-green color deficiencies</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold"></span>
                  <span>Late-stage eye health issues</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold"></span>
                  <span>Macular degeneration signs</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold"></span>
                  <span>Optic nerve disorders</span>
                </li>
              </ul>
            </div>

            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
                <h4 className="font-bold text-lg text-red-900">CANNOT Detect</h4>
              </div>
              <ul className="space-y-2 text-sm text-red-800">
                <li className="flex gap-2">
                  <span className="font-bold">✗</span>
                  <span>Blue-yellow deficiencies (Tritan)</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">✗</span>
                  <span>Early vision problems</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">✗</span>
                  <span>Precise severity measurement</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">✗</span>
                  <span>Clinical-grade accuracy</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Important Requirements */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Important Requirements</h3>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-gray-700">Remove sunglasses or tinted lenses</p>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-gray-700">Trust your first impression</p>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-gray-700">View from arm's length (20-24 inches)</p>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-gray-700">Avoid eye strain before testing</p>
            </div>
          </div>
        </div>

        {/* What We Test For */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <svg className="w-7 h-7 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            What We Test For
          </h3>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <circle cx="10" cy="10" r="7" />
                  </svg>
                </div>
                <h4 className="font-bold text-xl text-red-900">Protan</h4>
              </div>
              <p className="text-gray-700 mb-2">Red deficiency - difficulty distinguishing red from green</p>
              <p className="text-sm text-gray-600">Affects ~1% of males</p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <circle cx="10" cy="10" r="7" />
                  </svg>
                </div>
                <h4 className="font-bold text-xl text-green-900">Deutan</h4>
              </div>
              <p className="text-gray-700 mb-2">Green deficiency - difficulty distinguishing green from red</p>
              <p className="text-sm text-gray-600">Affects ~5% of males</p>
            </div>
          </div>

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <strong>Note:</strong> This test screens for red-green deficiencies, the most common type. 
              Blue-yellow deficiencies (Tritan) are rare and require specialized testing.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-4">
          <button
            onClick={() => navigate('/vision-tests')}
            className="flex-1 bg-gray-100 text-gray-700 px-8 py-4 rounded-xl font-semibold hover:bg-gray-200 transition-all shadow-md hover:shadow-lg"
          >
             Back to Tests
          </button>
          <button
            onClick={() => startTest()}
            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-4 rounded-xl font-bold hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl"
          >
            Start Test 
          </button>
        </div>
      </div>

      <p className="max-w-5xl mx-auto text-center text-sm text-gray-500 italic mt-6">
         This is a screening tool, not a diagnostic device. Results should be discussed with an eye care professional.
      </p>
    </div>
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
      <div className="relative w-full h-full">
        <svg viewBox="0 0 400 400" className="w-full h-full">
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
    
    // Timer progress percentage (fixed 5 seconds)
    const timerPercent = (timeRemaining / FIXED_TIME_LIMIT) * 100
    const isLowTime = timeRemaining <= 1

    return (
      <div className="max-w-4xl mx-auto space-y-4 py-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Plate {currentPlateIndex + 1} of {testPlates.length}
          </h2>
        </div>
        
        {/* Simple Timer Display - 8 seconds for all plates */}
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">
              Time Remaining: <span className={isLowTime ? 'text-red-600' : 'text-blue-600'}>{timeRemaining.toFixed(1)}s</span>
            </span>
            <span className="text-xs text-gray-500">
              8 seconds per plate
            </span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-100 ${
                isLowTime ? 'bg-red-500' : 'bg-blue-600'
              }`}
              style={{ width: `${timerPercent}%` }}
            />
          </div>
        </div>

        {/* Plate Display */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex justify-center mb-4">
            {generatedPlateSVG}
          </div>

          {/* Answer Input - DO NOT show input method toggle during test */}
          <div className="space-y-4">
            {inputMethod === 'voice' && voiceSupported && (
              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  {isListening ? 'Listening... Say the number you see' : 'Voice recognition active'}
                </p>
                {userInput && (
                  <p className="mt-4 text-lg text-gray-900">
                    You said: <strong>{userInput}</strong>
                  </p>
                )}
              </div>
            )}

            {inputMethod === 'type' && (
              <div className="grid grid-cols-7 gap-3">
                {numberChoices.map((choice) => (
                  <button
                    key={choice}
                    disabled={showFeedback || timeRemaining <= 0}
                    onClick={() => {
                      setSelectedAnswer(choice)
                      setUserInput(choice)
                    }}
                    className={`py-4 rounded-xl font-bold text-lg transition-all ${
                      selectedAnswer === choice
                        ? 'bg-blue-600 text-white ring-4 ring-blue-300'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button - appears immediately when answer detected */}
          {(selectedAnswer || userInput) && !showFeedback && timeRemaining > 0 && (
            <button
              onClick={handleAnswerSubmit}
              data-submit-answer
              className="w-full mt-6 bg-gradient-to-r from-green-500 to-green-600 text-white py-5 rounded-xl font-bold text-lg hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-[1.02] shadow-lg flex items-center justify-center gap-3 animate-pulse"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {voiceEnabled ? (
                <>Submit Answer: <span className="font-black text-xl">{userInput}</span> (auto-submitting...)</>
              ) : (
                <>Submit Answer</>
              )}
            </button>
          )}
          
          {/* Timeout message */}
          {timeRemaining <= 0 && !showFeedback && (
            <div className="mt-6 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-2xl text-center">
              <p className="text-yellow-800 font-semibold">Time expired. Moving to next plate...</p>
            </div>
          )}

          {/* Feedback */}
          {showFeedback && (
            <div className={`mt-6 p-6 rounded-2xl ${
              responses[responses.length - 1]?.errorType === 'timeout' 
                ? 'bg-yellow-50 border-2 border-yellow-400' 
                : responses[responses.length - 1]?.correct
                  ? 'bg-green-50 border-2 border-green-400'
                  : 'bg-red-50 border-2 border-red-400'
            }`}>
              <p className="text-center text-lg font-semibold mb-2">
                {responses[responses.length - 1]?.errorType === 'timeout' ? 'Time Expired' :
                 responses[responses.length - 1]?.correct ? 'Correct!' : 'Incorrect'}
              </p>
              {responses[responses.length - 1]?.responseTime && (
                <p className="text-center text-sm text-gray-600">
                  Response time: {responses[responses.length - 1].responseTime.toFixed(1)}s
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Render Results
  const renderResults = () => {
    const analysis = analyzeResults()

    return (
      <div className="max-w-3xl mx-auto space-y-4 py-4">
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Test Results</h2>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-blue-50 rounded-2xl p-6">
              <h3 className="font-bold text-xl text-gray-900 mb-2">Accuracy</h3>
              <p className="text-4xl font-bold text-blue-600">{Math.round(analysis.accuracy)}%</p>
              <p className="text-gray-600 mt-2">{analysis.correctCount} of {analysis.totalPlates} correct</p>
            </div>

            <div className="bg-purple-50 rounded-2xl p-6">
              <h3 className="font-bold text-xl text-gray-900 mb-2">Result</h3>
              <p className="text-2xl font-bold text-purple-600">
                {analysis.deficiencyType === 'normal' ? 'Normal Color Vision' :
                 analysis.deficiencyType === 'protan' ? 'Protan (Red) Deficiency' :
                 analysis.deficiencyType === 'deutan' ? 'Deutan (Green) Deficiency' :
                 'Red-Green Deficiency'}
              </p>
              {analysis.severity !== 'none' && (
                <p className="text-gray-600 mt-2">Severity: {analysis.severity}</p>
              )}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => navigate('/vision-tests')}
              className="flex-1 bg-gray-200 text-gray-700 px-8 py-4 rounded-full font-semibold hover:bg-gray-300 transition-colors"
            >
               Back to Tests
            </button>
            <button
              onClick={submitResults}
              className="flex-1 bg-blue-600 text-white px-8 py-4 rounded-full font-bold hover:bg-blue-700 transition-colors"
            >
              Save Results 
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {testState === 'distance-gate' && renderDistanceGate()}
        {testState === 'instructions' && renderInstructions()}
        {testState === 'testing' && renderTesting()}
        {testState === 'results' && renderResults()}
      </div>
    </div>
  )
}

export default ColorVisionTest
