import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import { toast } from 'react-hot-toast'
import DistanceCalibration from '../components/DistanceCalibration'
import WebcamEyeTracker from '../components/WebcamEyeTracker'
import { useVoiceRecognition } from '../hooks/useVoiceRecognition'

function VisionTestRunner() {
  const { testType } = useParams()
  const navigate = useNavigate()
  
  const [isCalibrated, setIsCalibrated] = useState(false)
  const [calibrationData, setCalibrationData] = useState(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [testComplete, setTestComplete] = useState(false)
  const [finalScore, setFinalScore] = useState(null)
  const [useVoice, setUseVoice] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [useVoiceColor, setUseVoiceColor] = useState(false)
  const [voiceColorTranscript, setVoiceColorTranscript] = useState('')
  const [useVoiceContrast, setUseVoiceContrast] = useState(false)
  const [voiceContrastTranscript, setVoiceContrastTranscript] = useState('')
  const [currentContrastAnswer, setCurrentContrastAnswer] = useState(null)

  // Helper function to generate random letters
  const generateRandomLetters = (count) => {
    const letters = 'CDEFLOPTZ'.split('') // Common eye chart letters
    const shuffled = [...letters].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count).join(' ')
  }

  // Generate random test configurations on mount
  const [testConfigs] = useState(() => ({
    acuity: {
      title: 'Visual Acuity Test',
      description: 'Read the letters from top to bottom.',
      instructions: 'Click "Can Read" if you can clearly see all letters on the line. Click "Cannot Read" when the letters become blurry or difficult to read. Continue through all lines to measure your visual acuity.',
      questions: [
        // Snellen equivalent progression at 40cm viewing distance
        // Each line is approximately 1.26x smaller (log scale)
        { size: 96, letters: generateRandomLetters(1), line: 1, snellen: '20/200' },  // Largest
        { size: 76, letters: generateRandomLetters(2), line: 2, snellen: '20/160' },
        { size: 60, letters: generateRandomLetters(3), line: 3, snellen: '20/125' },
        { size: 48, letters: generateRandomLetters(4), line: 4, snellen: '20/100' },
        { size: 38, letters: generateRandomLetters(5), line: 5, snellen: '20/80' },
        { size: 30, letters: generateRandomLetters(5), line: 6, snellen: '20/63' },
        { size: 24, letters: generateRandomLetters(6), line: 7, snellen: '20/50' },  // Average
        { size: 19, letters: generateRandomLetters(7), line: 8, snellen: '20/40' },
        { size: 15, letters: generateRandomLetters(7), line: 9, snellen: '20/32' },
        { size: 12, letters: generateRandomLetters(8), line: 10, snellen: '20/25' },
        { size: 10, letters: generateRandomLetters(8), line: 11, snellen: '20/20' }  // Normal vision
      ]
    },
    contrast: {
      title: 'Contrast Sensitivity Test',
      description: 'Select the box that appears different.',
      instructions: 'Look carefully at the grid of boxes. One box will have a slightly different shade. Click on the box that looks different from the others. The contrast will become more subtle as you progress through the test.',
      questions: Array(6).fill(null).map((_, i) => ({
        contrast: 100 - (i * 15),
        position: Math.floor(Math.random() * 9), // Random position 0-8
        line: i + 1
      }))
    },
    color: {
      title: 'Color Vision Test',
      description: 'Identify the number hidden in the colored dots.',
      instructions: 'Look at each circle of colored dots. A number or shape is hidden within the pattern. If you can see the number clearly, click "Can See". If you cannot identify any number or pattern, click "Cannot See". This tests your ability to distinguish colors.',
      questions: Array(5).fill(null).map((_, i) => ({
        number: Math.floor(Math.random() * 90) + 10,
        line: i + 1
      }))
    },
    tracking: {
      title: 'Eye Tracking Analysis',
      description: 'Follow targets with your eyes to test eye movement control.',
      instructions: 'This test evaluates your eye movement patterns. You will complete three stages: following a moving target (smooth pursuit), looking between targets quickly (saccades), and maintaining focus on a stationary point (fixation stability). Keep your head still and only move your eyes.',
      questions: [
        { stage: 'smooth-pursuit', duration: 15, line: 1 },
        { stage: 'saccades', duration: 10, line: 2 },
        { stage: 'fixation', duration: 10, line: 3 }
      ]
    }
  }))

  const config = testConfigs[testType] || testConfigs.acuity

  // Get current question for voice recognition
  const currentQuestion = config?.questions?.[currentStep]
  const expectedLetters = currentQuestion?.letters?.split(' ').filter(l => l) || []
  const expectedNumber = currentQuestion?.number?.toString() || ''

  // Voice recognition for acuity test (letters)
  const {
    isListening,
    transcript,
    isSupported: voiceSupported,
    startListening,
    stopListening
  } = useVoiceRecognition({
    expectedWords: expectedLetters,
    onResult: (transcript, matches, confidence) => {
      console.log('Voice result:', { transcript, matches, confidence, expectedLetters })
      setVoiceTranscript(transcript)
      
      // Check if user said all the letters correctly
      const spokenLetters = transcript.replace(/\s+/g, '').split('')
      const correctCount = expectedLetters.filter(expected => 
        spokenLetters.some(spoken => spoken === expected.toUpperCase())
      ).length
      
      const allCorrect = correctCount === expectedLetters.length
      
      if (allCorrect) {
        toast.success(`✓ Correct! Heard: ${transcript}`)
        setTimeout(() => handleAnswer(true), 500)
      } else if (matches.length > 0) {
        toast.success(`Partial match (${matches.length}/${expectedLetters.length}). Try again or click button.`)
      } else {
        toast.error(`Didn't catch that. Expected: ${expectedLetters.join(' ')}`)
      }
    },
    onError: (error) => {
      console.error('Voice error:', error)
      toast.error('Voice recognition error. Please try again or use buttons.')
    }
  })

  // Voice recognition for color test (numbers)
  const {
    isListening: isListeningColor,
    transcript: transcriptColor,
    startListening: startListeningColor,
    stopListening: stopListeningColor
  } = useVoiceRecognition({
    expectedWords: [expectedNumber],
    onResult: (transcript, matches, confidence) => {
      console.log('Color voice result:', { transcript, expectedNumber })
      setVoiceColorTranscript(transcript)
      
      // Extract numbers from transcript
      const numbers = transcript.match(/\d+/g)
      if (numbers) {
        const spokenNumber = numbers[0]
        if (spokenNumber === expectedNumber) {
          toast.success(`✓ Correct! You said ${spokenNumber}`)
          setTimeout(() => handleAnswer(true), 500)
        } else {
          toast.error(`You said ${spokenNumber}. Try again or use buttons.`)
        }
      } else {
        toast.error('No number detected. Try again.')
      }
    },
    onError: (error) => {
      console.error('Voice error:', error)
      toast.error('Voice recognition error. Please try again or use buttons.')
    }
  })

  // Voice recognition for contrast test (positions)
  const {
    isListening: isListeningContrast,
    transcript: transcriptContrast,
    startListening: startListeningContrast,
    stopListening: stopListeningContrast
  } = useVoiceRecognition({
    expectedWords: ['top', 'bottom', 'left', 'right', 'one', 'two', 'three', 'four'],
    onResult: (transcript, matches, confidence) => {
      console.log('Contrast voice result:', { transcript, currentContrastAnswer })
      setVoiceContrastTranscript(transcript)
      
      const lowerTranscript = transcript.toLowerCase()
      let position = null
      
      // Map spoken words to grid positions (0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right)
      if (lowerTranscript.includes('top') && lowerTranscript.includes('left') || lowerTranscript.includes('one')) {
        position = 0
      } else if (lowerTranscript.includes('top') && lowerTranscript.includes('right') || lowerTranscript.includes('two')) {
        position = 1
      } else if (lowerTranscript.includes('bottom') && lowerTranscript.includes('left') || lowerTranscript.includes('three')) {
        position = 2
      } else if (lowerTranscript.includes('bottom') && lowerTranscript.includes('right') || lowerTranscript.includes('four')) {
        position = 3
      }
      
      if (position !== null && currentContrastAnswer !== null) {
        const isCorrect = position === currentContrastAnswer
        if (isCorrect) {
          toast.success(`✓ Correct!`)
          setTimeout(() => handleAnswer(true), 500)
        } else {
          toast.error(`Try again or click the box.`)
        }
      } else {
        toast.error('Say "top left", "top right", "bottom left", or "bottom right"')
      }
    },
    onError: (error) => {
      console.error('Voice error:', error)
    }
  })

  // Auto-start listening when voice mode is on for acuity test
  useEffect(() => {
    if (useVoice && !isListening && testType === 'acuity' && !testComplete) {
      const timer = setTimeout(() => {
        startListening()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [useVoice, currentStep, isListening, testType, testComplete])

  // Auto-start listening when voice mode is on for color test
  useEffect(() => {
    if (useVoiceColor && !isListeningColor && testType === 'color' && !testComplete) {
      const timer = setTimeout(() => {
        startListeningColor()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [useVoiceColor, currentStep, isListeningColor, testType, testComplete])

  // Auto-start listening when voice mode is on for contrast test
  useEffect(() => {
    if (useVoiceContrast && !isListeningContrast && testType === 'contrast' && !testComplete) {
      const timer = setTimeout(() => {
        startListeningContrast()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [useVoiceContrast, currentStep, isListeningContrast, testType, testComplete])

  const handleAnswer = (canRead) => {
    const newAnswers = [...answers, canRead]
    setAnswers(newAnswers)

    if (currentStep === config.questions.length - 1) {
      // Test complete - all questions answered
      submitTest(newAnswers)
    } else {
      // Continue to next question
      setCurrentStep(currentStep + 1)
    }
  }

  const submitTest = async (testAnswers) => {
    setIsSubmitting(true)
    
    // Calculate score based on test type
    let score
    if (testType === 'tracking') {
      // For tracking test, answers are numeric scores (0-100)
      // Calculate average of all stage scores
      const numericAnswers = testAnswers.filter(a => typeof a === 'number')
      score = numericAnswers.length > 0
        ? Math.round(numericAnswers.reduce((sum, s) => sum + s, 0) / numericAnswers.length)
        : 0
      console.log(' Tracking test scores:', testAnswers, '→ Average:', score)
    } else {
      // For other tests, answers are boolean (can read / cannot read)
      score = Math.round((testAnswers.filter(a => a).length / config.questions.length) * 100)
    }
    
    try {
      const testData = {
        test_type: 'tracking', // Explicitly set to 'tracking' for eye tracking tests
        score: score,
        left_eye_score: score, // For now, using same score
        right_eye_score: score,
        test_details: {
          answers: testAnswers,
          total_questions: config.questions.length,
          lines_read: testType === 'tracking' ? testAnswers.length : testAnswers.filter(a => a).length,
          calibration: calibrationData,
          ...(testType === 'tracking' && { stage_scores: testAnswers })
        },
        notes: testType === 'tracking' 
          ? `Eye tracking test completed. Stages: ${testAnswers.length}. Scores: ${testAnswers.join(', ')}%`
          : `Completed ${testAnswers.filter(a => a).length} of ${config.questions.length} lines. Distance: ${calibrationData?.distance || 50}cm`
      }
      
      console.log('Submitting test:', testData)
      const response = await visionTestAPI.submit(testData)
      console.log('Test submitted successfully:', response.data)
      
      // Check if response is successful
      if (response.status === 201 && response.data.test_id) {
        setFinalScore(score)
        setTestComplete(true)
        toast.success('Test completed successfully!')
      } else {
        console.warn('Unexpected response:', response)
        // Still mark as complete since we got a response
        setFinalScore(score)
        setTestComplete(true)
        toast.success('Test completed!')
      }
    } catch (error) {
      console.error('Failed to submit test:', error)
      console.error('Error response:', error.response)
      console.error('Error details:', error.response?.data)
      
      // Be more specific with error messages
      if (error.response) {
        const errorMsg = error.response.data?.error || error.response.data?.message || 'Failed to save test results'
        toast.error(`Error: ${errorMsg}`)
      } else if (error.request) {
        toast.error('Network error - unable to reach server')
      } else {
        toast.error('Failed to submit test')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCalibrated = (data) => {
    setCalibrationData(data)
    setIsCalibrated(true)
  }

  if (!isCalibrated) {
    return <DistanceCalibration testType={testType} onCalibrated={handleCalibrated} />
  }

  const renderAcuityTest = () => {
    const question = config.questions[currentStep]
    
    return (
      <div className="text-center py-12">
        {/* Voice Mode Toggle */}
        {voiceSupported && (
          <div className="mb-6">
            <button
              onClick={() => {
                setUseVoice(!useVoice)
                if (useVoice) {
                  stopListening()
                  toast.success('Voice mode disabled')
                } else {
                  toast.success('Voice mode enabled! Say the letters you see.')
                }
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                useVoice 
                  ? 'bg-green-600 text-white hover:bg-green-700' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              {useVoice ? '[mic] Voice Mode: ON' : 'Enable Voice Mode'}
            </button>
          </div>
        )}

        <div className="mb-8">
          <div className="text-gray-500 text-sm mb-1">Line {question.line} of {config.questions.length}</div>
          <div className="text-gray-600 text-sm mb-4">Snellen Equivalent: {question.snellen}</div>
          
          {/* Voice Status */}
          {useVoice && (
            <div className="mb-4">
              {isListening ? (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="text-red-700 font-medium">Listening... Say the letters</span>
                </div>
              ) : (
                <button
                  onClick={startListening}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.828-2.829" />
                  </svg>
                  Click to speak
                </button>
              )}
              {voiceTranscript && (
                <div className="mt-2 text-sm text-gray-600">
                  You said: <span className="font-semibold">{voiceTranscript}</span>
                </div>
              )}
            </div>
          )}
          
          <div 
            className="font-mono font-bold text-gray-900 tracking-wider"
            style={{ fontSize: `${question.size}px` }}
          >
            {question.letters}
          </div>
        </div>
        
        {!useVoice && (
          <div className="space-x-4">
            <button
              onClick={() => handleAnswer(true)}
              className="bg-green-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
            >
              ✓ I can read this
            </button>
            <button
              onClick={() => handleAnswer(false)}
              className="bg-red-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
            >
              ✗ I cannot read this
            </button>
          </div>
        )}

        {useVoice && (
          <p className="mt-6 text-sm text-gray-600">
            💡 Tip: Stand at your test distance and say the letters clearly. The test will automatically advance when it hears all letters correctly.
          </p>
        )}
      </div>
    )
  }

  const renderContrastTest = () => {
    const question = config.questions[currentStep]
    const differentBox = Math.floor(Math.random() * 4)
    
    // Store the correct answer for voice recognition
    useEffect(() => {
      setCurrentContrastAnswer(differentBox)
    }, [currentStep])
    
    return (
      <div className="py-12">
        {/* Voice Mode Toggle */}
        {voiceSupported && (
          <div className="text-center mb-6">
            <button
              onClick={() => {
                setUseVoiceContrast(!useVoiceContrast)
                if (useVoiceContrast) {
                  stopListeningContrast()
                  toast.success('Voice mode disabled')
                } else {
                  toast.success('Voice mode enabled! Say which box is different.')
                }
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                useVoiceContrast 
                  ? 'bg-green-600 text-white hover:bg-green-700' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              {useVoiceContrast ? '[mic] Voice Mode: ON' : 'Enable Voice Mode'}
            </button>
          </div>
        )}

        <div className="text-center mb-8">
          <div className="text-gray-600 mb-4">Question {currentStep + 1} of {config.questions.length}</div>
          <p className="text-gray-700">Click on the box that appears different</p>
          
          {/* Voice Status */}
          {useVoiceContrast && (
            <div className="mt-4">
              {isListeningContrast ? (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="text-red-700 font-medium">Listening...</span>
                </div>
              ) : (
                <button
                  onClick={startListeningContrast}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.828-2.829" />
                  </svg>
                  Click to speak
                </button>
              )}
              {voiceContrastTranscript && (
                <div className="mt-2 text-sm text-gray-600">
                  You said: <span className="font-semibold">{voiceContrastTranscript}</span>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-6 max-w-md mx-auto">
          {[0, 1, 2, 3].map(i => (
            <button
              key={i}
              onClick={() => handleAnswer(i === differentBox)}
              className="aspect-square rounded-lg border-4 border-gray-300 hover:border-blue-500 transition-colors"
              style={{
                backgroundColor: i === differentBox 
                  ? `rgb(${200 - question.contrast * 0.3}, ${200 - question.contrast * 0.3}, ${200 - question.contrast * 0.3})`
                  : 'rgb(200, 200, 200)'
              }}
            />
          ))}
        </div>

        {useVoiceContrast && (
          <p className="mt-6 text-center text-sm text-gray-600">
            💡 Say "top left", "top right", "bottom left", or "bottom right"
          </p>
        )}
      </div>
    )
  }

  const renderColorTest = () => {
    const question = config.questions[currentStep]
    
    return (
      <div className="py-12">
        {/* Voice Mode Toggle */}
        {voiceSupported && (
          <div className="text-center mb-6">
            <button
              onClick={() => {
                setUseVoiceColor(!useVoiceColor)
                if (useVoiceColor) {
                  stopListeningColor()
                  toast.success('Voice mode disabled')
                } else {
                  toast.success('Voice mode enabled! Say the number you see.')
                }
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                useVoiceColor 
                  ? 'bg-green-600 text-white hover:bg-green-700' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              {useVoiceColor ? '[mic] Voice Mode: ON' : 'Enable Voice Mode'}
            </button>
          </div>
        )}

        <div className="text-center mb-8">
          <div className="text-gray-600 mb-4">Question {currentStep + 1} of {config.questions.length}</div>
          <p className="text-gray-700">What number do you see?</p>
          
          {/* Voice Status */}
          {useVoiceColor && (
            <div className="mt-4">
              {isListeningColor ? (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="text-red-700 font-medium">Listening... Say the number</span>
                </div>
              ) : (
                <button
                  onClick={startListeningColor}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.828-2.829" />
                  </svg>
                  Click to speak
                </button>
              )}
              {voiceColorTranscript && (
                <div className="mt-2 text-sm text-gray-600">
                  You said: <span className="font-semibold">{voiceColorTranscript}</span>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="max-w-md mx-auto mb-8">
          <div className="aspect-square bg-gradient-to-br from-red-300 via-green-300 to-blue-300 rounded-lg flex items-center justify-center text-8xl font-bold text-gray-700 opacity-60">
            {question.number}
          </div>
        </div>
        
        {!useVoiceColor && (
          <div className="flex justify-center space-x-4">
            <input
              type="number"
              placeholder="Enter number"
              className="px-4 py-2 border border-gray-300 rounded-lg text-center text-2xl w-32"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  const value = parseInt(e.target.value)
                  handleAnswer(value === question.number)
                  e.target.value = ''
                }
              }}
            />
            <button
              onClick={(e) => {
                const input = e.target.previousSibling
                const value = parseInt(input.value)
                handleAnswer(value === question.number)
                input.value = ''
              }}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Submit
            </button>
          </div>
        )}

        {useVoiceColor && (
          <div className="text-center">
            <p className="text-sm text-gray-600">
              💡 Tip: Stand at your test distance and clearly say the number you see.
            </p>
            <button
              onClick={() => handleAnswer(false)}
              className="mt-4 bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
            >
              Cannot See Number
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderTrackingTest = () => {
    const stages = ['smooth-pursuit', 'saccades', 'fixation']
    const currentStage = stages[currentStep] || 'smooth-pursuit'
    
    return (
      <div className="py-8">
        <div className="text-center mb-6">
          <div className="text-gray-600 mb-2">Stage {currentStep + 1} of {stages.length}</div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">
            {currentStage === 'smooth-pursuit' && 'Smooth Pursuit Test'}
            {currentStage === 'saccades' && 'Saccade Test'}
            {currentStage === 'fixation' && 'Fixation Stability Test'}
          </h3>
          <p className="text-gray-600 max-w-xl mx-auto">
            {currentStage === 'smooth-pursuit' && 'Follow the moving dot smoothly with your eyes. Keep your head still and only move your eyes.'}
            {currentStage === 'saccades' && 'Quickly look at each dot as it appears. Move your eyes as fast as you can between targets.'}
            {currentStage === 'fixation' && 'Keep your eyes focused on the center dot. Try not to let your gaze drift.'}
          </p>
        </div>
        
        <div className="max-w-3xl mx-auto">
          <div className="bg-gray-50 rounded-xl border-2 border-gray-200 relative">
            {/* Webcam-based eye tracking */}
            <WebcamEyeTracker 
              stage={currentStage} 
              onComplete={(score) => {
                console.log(` Stage ${currentStep + 1} (${currentStage}) completed with score:`, score)
                handleAnswer(score) // Pass the actual numeric score
                if (currentStep < stages.length - 1) {
                  setCurrentStep(prev => prev + 1)
                }
              }}
            />
          </div>
          
          <div className="mt-6 bg-blue-50 rounded-lg p-4 border border-blue-100">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1 text-sm text-blue-800">
                <p className="font-semibold mb-1">Tips for accurate results:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li>Keep your head still and centered</li>
                  <li>Sit about 40cm (16 inches) from the screen</li>
                  <li>Only move your eyes, not your head</li>
                  <li>Maintain good lighting conditions</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderTest = () => {
    if (testType === 'acuity') return renderAcuityTest()
    if (testType === 'contrast') return renderContrastTest()
    if (testType === 'color') return renderColorTest()
    if (testType === 'tracking') return renderTrackingTest()
    
    return <div>Unknown test type</div>
  }

  if (testComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-teal-50 -m-6">
        <div className="bg-white rounded-2xl shadow-xl p-12 max-w-md text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Test Complete!</h2>
          
          <div className="mb-8">
            <div className="text-gray-600 mb-2">Your Score</div>
            <div className="text-6xl font-bold text-blue-600">{finalScore}</div>
            <div className="text-gray-500">out of 100</div>
          </div>

          <div className={`p-4 rounded-lg mb-8 ${
            finalScore >= 80 ? 'bg-green-100 text-green-800' :
            finalScore >= 60 ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {finalScore >= 80 ? 'Excellent vision health!' :
             finalScore >= 60 ? 'Your vision is fair. Consider regular monitoring.' :
             'Please consult with an eye care professional.'}
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate('/vision-tests')}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Back to Tests
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
            >
              View Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white -m-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-teal-500 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/vision-tests')}
            className="flex items-center text-white hover:text-gray-200 mb-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Tests
          </button>
          
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold">{config.title}</h1>
              <p className="text-blue-100 mt-1">{config.description}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-gray-100 h-2">
        <div
          className="bg-blue-600 h-2 transition-all duration-300"
          style={{ width: `${((currentStep + 1) / config.questions.length) * 100}%` }}
        />
      </div>

      {/* Test Content */}
      <div className="max-w-4xl mx-auto px-6">
        {isSubmitting ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600 mb-4"></div>
            <p className="text-gray-600">Submitting your results...</p>
          </div>
        ) : (
          renderTest()
        )}
      </div>
    </div>
  )
}

export default VisionTestRunner
