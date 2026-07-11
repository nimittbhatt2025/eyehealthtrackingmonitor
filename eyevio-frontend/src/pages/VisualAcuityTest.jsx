import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCalibration } from '../context/CalibrationContext'
import { visionTestAPI } from '../services/api'
import voiceRecognition from '../utils/voiceRecognition'
import EyeCoverageDetector from '../utils/eyeCoverageDetector'
import GlassesContactsCheck from '../components/GlassesContactsCheck'
import EyeCoverageVerification from '../components/EyeCoverageVerification'
import VoiceControl from '../components/VoiceControl'
import InlineDistanceCalibration from '../components/InlineDistanceCalibration'

/**
 * Visual Acuity Test (Snellen/LogMAR)
 * Professional-grade visual acuity assessment with:
 * - LogMAR scoring (clinical standard)
 * - Snellen conversion for familiarity
 * - Randomized optotypes (E, F, L, O, P, T, Z)
 * - Monocular testing (left eye then right eye)
 * - Adaptive progression (starts large, gets smaller)
 * - Distance validation (1000mm / 40" standard)
 */

const VisualAcuityTest = () => {
  const navigate = useNavigate()
  const { isCalibrated, needsRecalibration, getConfidence } = useCalibration()
  
  const [testState, setTestState] = useState('distance-gate') // distance-gate, instructions, glasses-check, eye-coverage-setup, testing, switch-eyes, results
  const [distanceValid, setDistanceValid] = useState(false)
  const [currentEye, setCurrentEye] = useState('left') // left, right
  const [currentLine, setCurrentLine] = useState(0)
  const [currentLetter, setCurrentLetter] = useState(0)
  const [responses, setResponses] = useState([])
  const [lineResults, setLineResults] = useState({
    left: { correctLines: 0, smallestLine: 0, letters: [] },
    right: { correctLines: 0, smallestLine: 0, letters: [] }
  })
  
  // Voice recognition state
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceSupported] = useState(voiceRecognition.isSupported())
  
  // Eye coverage detection state
  const [eyeDetector, setEyeDetector] = useState(null)
  const [eyeCoverageStatus, setEyeCoverageStatus] = useState(null)
  
  // Glasses/contacts check state
  const [correctionInfo, setCorrectionInfo] = useState(null)
  
  const videoRef = useRef(null)
  const eyeCheckIntervalRef = useRef(null)
  
  // Optotypes (letters that are commonly used - avoid similar shapes)
  const OPTOTYPES = ['E', 'F', 'L', 'O', 'P', 'T', 'Z']
  
  // Snellen lines (20/200 down to 20/10)
  // Each line has a LogMAR value and Snellen equivalent
  const SNELLEN_LINES = [
    { snellen: '20/200', logMAR: 1.0, size: 200, letters: 1, label: '20/200 (1.0)' },
    { snellen: '20/160', logMAR: 0.9, size: 160, letters: 2, label: '20/160 (0.9)' },
    { snellen: '20/125', logMAR: 0.8, size: 125, letters: 2, label: '20/125 (0.8)' },
    { snellen: '20/100', logMAR: 0.7, size: 100, letters: 3, label: '20/100 (0.7)' },
    { snellen: '20/80', logMAR: 0.6, size: 80, letters: 3, label: '20/80 (0.6)' },
    { snellen: '20/63', logMAR: 0.5, size: 63, letters: 4, label: '20/63 (0.5)' },
    { snellen: '20/50', logMAR: 0.4, size: 50, letters: 4, label: '20/50 (0.4)' },
    { snellen: '20/40', logMAR: 0.3, size: 40, letters: 5, label: '20/40 (0.3)' },
    { snellen: '20/32', logMAR: 0.2, size: 32, letters: 5, label: '20/32 (0.2)' },
    { snellen: '20/25', logMAR: 0.1, size: 25, letters: 5, label: '20/25 (0.1)' },
    { snellen: '20/20', logMAR: 0.0, size: 20, letters: 5, label: '20/20 (0.0)' },
    { snellen: '20/16', logMAR: -0.1, size: 16, letters: 5, label: '20/16 (-0.1)' },
    { snellen: '20/12', logMAR: -0.2, size: 12, letters: 5, label: '20/12 (-0.2)' },
    { snellen: '20/10', logMAR: -0.3, size: 10, letters: 5, label: '20/10 (-0.3)' }
  ]

  const [currentLetters, setCurrentLetters] = useState([])
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showFeedback, setShowFeedback] = useState(false)

  // Generate random letters for current line
  const generateLetters = useCallback((numLetters) => {
    const letters = []
    const used = new Set()
    
    while (letters.length < numLetters) {
      const letter = OPTOTYPES[Math.floor(Math.random() * OPTOTYPES.length)]
      if (!used.has(letter)) {
        letters.push(letter)
        used.add(letter)
      }
    }
    
    return letters
  }, [])

  // Start test for current eye
  const startEyeTest = useCallback(() => {
    setCurrentLine(0)
    setCurrentLetter(0)
    const letters = generateLetters(SNELLEN_LINES[0].letters)
    setCurrentLetters(letters)
    setSelectedAnswer(null)
    setShowFeedback(false)
  }, [generateLetters])

  // Handle letter selection
  const handleLetterSelect = (letter) => {
    if (showFeedback) return // Prevent double-selection
    
    const correctLetter = currentLetters[currentLetter]
    const isCorrect = letter === correctLetter
    
    console.log(`Letter selected: ${letter}, Correct: ${correctLetter}, Match: ${isCorrect}`)
    
    setSelectedAnswer(letter)
    setShowFeedback(true)
    
    // Stop voice recognition temporarily
    if (voiceEnabled && isListening) {
      voiceRecognition.stop()
      setIsListening(false)
    }
    
    // Record response
    const response = {
      eye: currentEye,
      line: currentLine,
      snellen: SNELLEN_LINES[currentLine].snellen,
      logMAR: SNELLEN_LINES[currentLine].logMAR,
      letter: correctLetter,
      userAnswer: letter,
      correct: isCorrect,
      timestamp: Date.now()
    }
    
    setResponses(prev => [...prev, response])
    
    // Update line results
    setLineResults(prev => {
      const updated = { ...prev }
      updated[currentEye].letters.push(response)
      
      if (isCorrect) {
        updated[currentEye].smallestLine = currentLine
      }
      
      return updated
    })
    
    // Move to next letter or line after short delay
    setTimeout(() => {
      if (currentLetter < currentLetters.length - 1) {
        // More letters in this line
        setCurrentLetter(prev => prev + 1)
        setSelectedAnswer(null)
        setShowFeedback(false)
        
        // Restart voice recognition
        if (voiceEnabled) {
          startVoiceRecognition()
        }
      } else {
        // Line complete - check if we should continue
        advanceToNextLine(isCorrect)
      }
    }, 800)
  }

  // Start voice recognition
  const startVoiceRecognition = () => {
    if (!voiceEnabled || !voiceSupported) return
    if (isListening) return // Already listening, don't start again
    
    console.log('Starting voice recognition...')
    setIsListening(true)
    voiceRecognition.start(
      (result) => {
        console.log('Voice heard:', result)
        // Parse the spoken letter
        const parsed = voiceRecognition.parseResponse(result, OPTOTYPES)
        if (parsed && OPTOTYPES.includes(parsed)) {
          console.log('Parsed letter:', parsed)
          handleLetterSelect(parsed)
        } else {
          console.log('Could not parse letter from:', result)
        }
      },
      (error) => {
        console.error('Voice recognition error:', error)
        setIsListening(false)
      }
    )
  }

  // Start eye test and voice recognition
  useEffect(() => {
    if (testState === 'testing' && voiceEnabled && !isListening) {
      startVoiceRecognition()
    }
    
    return () => {
      if (voiceEnabled && isListening) {
        voiceRecognition.stop()
        setIsListening(false)
      }
    }
  }, [testState, currentLetter, currentEye, voiceEnabled])

  // Advance to next line or finish eye
  const advanceToNextLine = (lastLetterCorrect) => {
    const line = SNELLEN_LINES[currentLine]
    const eyeLetters = lineResults[currentEye].letters.filter(r => r.line === currentLine)
    const correctCount = eyeLetters.filter(r => r.correct).length
    const accuracy = correctCount / line.letters
    
    console.log(`Line ${currentLine} complete:`, {
      correctCount,
      totalLetters: line.letters,
      accuracy: (accuracy * 100).toFixed(0) + '%',
      threshold: '60%'
    })
    
    // If got < 60% correct on this line, stop (threshold reached)
    if (accuracy < 0.6) {
      console.log('Accuracy below threshold - finishing eye test')
      finishEyeTest()
      return
    }
    
    // If this was the last line, finish
    if (currentLine >= SNELLEN_LINES.length - 1) {
      console.log('Last line reached - finishing eye test')
      finishEyeTest()
      return
    }
    
    // Move to next line
    console.log(`Moving to line ${currentLine + 1}`)
    setCurrentLine(prev => prev + 1)
    setCurrentLetter(0)
    const letters = generateLetters(SNELLEN_LINES[currentLine + 1].letters)
    setCurrentLetters(letters)
    setSelectedAnswer(null)
    setShowFeedback(false)
  }

  // Finish testing current eye
  const finishEyeTest = () => {
    const eyeData = lineResults[currentEye]
    
    // Calculate final LogMAR score for this eye
    // LogMAR = LogMAR of smallest line read + 0.02 * letters missed
    const smallestLineData = SNELLEN_LINES[eyeData.smallestLine]
    const lettersMissed = eyeData.letters.filter(r => !r.correct).length
    const finalLogMAR = smallestLineData.logMAR + (0.02 * lettersMissed)
    
    setLineResults(prev => ({
      ...prev,
      [currentEye]: {
        ...prev[currentEye],
        correctLines: eyeData.smallestLine + 1,
        finalLogMAR: finalLogMAR,
        snellen: smallestLineData.snellen
      }
    }))
    
    if (currentEye === 'left') {
      // Switch to right eye
      setCurrentEye('right')
      setTestState('switch-eyes')
    } else {
      // Both eyes complete
      setTestState('results')
    }
  }

  // Submit results to backend
  const submitResults = async () => {
    try {
      const confidence = getConfidence()
      
      await visionTestAPI.submit({
        test_type: 'visual_acuity',
        score: Math.round((2.0 - lineResults.left.finalLogMAR - lineResults.right.finalLogMAR) * 50), // 0-100 scale
        test_details: {
          left_eye: {
            snellen: lineResults.left.snellen,
            logMAR: lineResults.left.finalLogMAR,
            lines_read: lineResults.left.correctLines,
            responses: lineResults.left.letters
          },
          right_eye: {
            snellen: lineResults.right.snellen,
            logMAR: lineResults.right.finalLogMAR,
            lines_read: lineResults.right.correctLines,
            responses: lineResults.right.letters
          },
          calibration_confidence: confidence,
          test_duration_seconds: Math.round((Date.now() - responses[0]?.timestamp) / 1000),
          timestamp: new Date().toISOString()
        }
      })
      
      navigate('/vision-tests')
    } catch (error) {
      console.error('Failed to submit results:', error)
      alert('Failed to save results. Please try again.')
    }
  }

  // Render Instructions
  const renderInstructions = () => (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <div className="icon-tile bg-accent-50 text-accent-600 w-16 h-16 mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </div>
        <h1 className="page-title mb-3">
          Visual Acuity Test
        </h1>
        <p className="page-subtitle">
          Professional eye chart test to measure how clearly you can see
        </p>
      </div>

      <div className="card">
        <h2 className="section-title mb-6">How This Test Works:</h2>
        
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <span className="w-10 h-10 bg-accent-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">1</span>
            <div>
              <h3 className="font-bold text-lg text-gray-900">Cover One Eye</h3>
              <p className="text-gray-700">We'll test each eye separately. Use your palm to gently cover one eye.</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <span className="w-10 h-10 bg-accent-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">2</span>
            <div>
              <h3 className="font-bold text-lg text-gray-900">Read the Letters</h3>
              <p className="text-gray-700">Letters will appear on screen, getting progressively smaller. Select the letter you see.</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <span className="w-10 h-10 bg-accent-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">3</span>
            <div>
              <h3 className="font-bold text-lg text-gray-900">Test Stops Automatically</h3>
              <p className="text-gray-700">When letters become too small to read accurately, the test moves to your other eye.</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <span className="w-10 h-10 bg-accent-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">4</span>
            <div>
              <h3 className="font-bold text-lg text-gray-900">Get Your Results</h3>
              <p className="text-gray-700">See a simple score for each eye — like the familiar "20/20" from the eye doctor.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-6">
        <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Important Requirements:
        </h3>
        <ul className="space-y-2 text-amber-900">
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Ensure good lighting (not too bright or too dark)</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Cover your eye completely but don't press on it</span>
          </li>
        </ul>
      </div>

      <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6">
        <h3 className="font-bold text-green-900 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
          </svg>
          Glasses/Contacts: Test BOTH Ways
        </h3>
        <p className="text-green-900 mb-3">
          For most accurate results, you should take this test <strong>twice</strong>:
        </p>
        <div className="space-y-3">
          <div className="bg-white rounded-lg p-4 border border-green-200">
            <h4 className="font-bold text-green-900 mb-1">1. Without Correction (First)</h4>
            <p className="text-sm text-green-800">Remove glasses/contacts to see your <strong>natural vision baseline</strong></p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-green-200">
            <h4 className="font-bold text-green-900 mb-1">2. With Correction (Second)</h4>
            <p className="text-sm text-green-800">Wear your prescription glasses/contacts to verify your <strong>corrected vision quality</strong></p>
          </div>
        </div>
        <p className="text-xs text-green-800 mt-3 italic">
          💡 Comparing both results helps detect if your prescription needs updating
        </p>
      </div>

      {voiceSupported && (
        <div className="card bg-brand-soft">
          <div className="flex items-start gap-4">
            <svg className="w-8 h-8 text-accent-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 mb-2">Voice Control Available</h3>
              <p className="text-gray-600 text-sm mb-3">
                Since you'll be at a distance from the screen, you can use your voice to answer instead of clicking. 
                Just say the letter you see (e.g., "E" or "P").
              </p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={voiceEnabled}
                  onChange={(e) => setVoiceEnabled(e.target.checked)}
                  className="w-5 h-5 text-accent-600 rounded focus:ring-accent-500"
                />
                <span className="font-semibold text-gray-900">Enable voice control during test</span>
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="font-bold text-gray-900 mb-3">What your score means:</h3>
        <ul className="space-y-2 text-gray-700">
          <li><strong>20/20:</strong> Normal, healthy sharpness.</li>
          <li><strong>20/40:</strong> A bit blurry — you might need glasses.</li>
          <li><strong>20/200:</strong> Very blurry — worth seeing an eye doctor.</li>
          <li className="text-gray-600">The smaller the second number, the sharper you see. Doctors also use a matching score called <span className="font-medium">LogMAR</span>, which we show next to your result.</li>
        </ul>
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => navigate('/vision-tests')}
          className="flex-1 btn-secondary min-h-[44px]"
        >
           Back to Tests
        </button>
        <button
          onClick={() => setTestState('glasses-check')}
          className="flex-1 btn-primary min-h-[44px]"
        >
          Start Test 
        </button>
      </div>

      <p className="text-center text-sm text-gray-500 italic flex items-center justify-center gap-2">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        This is a screening tool, not a diagnostic device. Results should be discussed with an eye care professional.
      </p>
    </div>
  )

  // Render Glasses/Contacts Check
  const renderGlassesCheck = () => (
    <GlassesContactsCheck
      onConfirm={(info) => {
        setCorrectionInfo(info)
        setTestState('eye-coverage-setup')
      }}
    />
  )

  // Render Eye Coverage Setup
  const renderEyeCoverageSetup = () => (
    <EyeCoverageVerification
      expectedEye={currentEye === 'left' ? 'right' : 'left'}
      onVerified={() => {
        setTestState('testing')
        startEyeTest()
      }}
      onSkip={() => {
        setTestState('testing')
        startEyeTest()
      }}
    />
  )

  // Render Calibration Check
  // Render Testing Screen
  const renderTesting = () => {
    const line = SNELLEN_LINES[currentLine]
    const letter = currentLetters[currentLetter]
    
    // Calculate font size based on line size (scaled for 40cm viewing distance)
    // Snellen size at 40cm ≈ size * 0.5 pixels (simplified)
    const fontSize = line.size * 2 // Larger for digital display
    
    return (
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-4 bg-gray-100 rounded-full px-6 py-3 mb-4">
            <span className={`flex items-center gap-2 ${currentEye === 'left' ? 'opacity-100 font-bold' : 'opacity-30'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Left
            </span>
            <span className="text-gray-400">|</span>
            <span className={`flex items-center gap-2 ${currentEye === 'right' ? 'opacity-100 font-bold' : 'opacity-30'}`}>
              Right
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Cover your {currentEye === 'left' ? 'RIGHT' : 'LEFT'} eye
          </h2>
          <p className="text-gray-600">
            Line {currentLine + 1} of {SNELLEN_LINES.length} • {line.snellen}
          </p>
        </div>

        {/* Letter Display */}
        <div className="bg-white rounded-3xl p-16 border-4 border-gray-200 min-h-[400px] flex items-center justify-center">
          <div 
            className="font-mono font-bold text-gray-900 transition-all duration-300"
            style={{ fontSize: `${fontSize}px` }}
          >
            {letter}
          </div>
        </div>

        {/* Answer Options */}
        <div>
          <p className="text-center text-gray-600 mb-4">
            {voiceEnabled ? 'Say the letter you see, or click:' : 'Select the letter you see:'}
          </p>
          <div className="grid grid-cols-4 gap-4 max-w-2xl mx-auto">
            {OPTOTYPES.map(opt => (
              <button
                key={opt}
                onClick={() => handleLetterSelect(opt)}
                disabled={showFeedback}
                className={`
                  p-6 rounded-xl font-mono font-bold text-3xl transition-all
                  ${selectedAnswer === opt 
                    ? showFeedback && opt === letter
                      ? 'bg-green-600 text-white'
                      : showFeedback
                        ? 'bg-red-600 text-white'
                        : 'bg-accent-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                  }
                  ${showFeedback ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-105'}
                `}
              >
                {opt}
              </button>
            ))}
          </div>
          
          {showFeedback && (
            <div className={`text-center mt-4 font-semibold flex items-center justify-center gap-2 ${selectedAnswer === letter ? 'text-green-600' : 'text-red-600'}`}>
              {selectedAnswer === letter ? (
                <>
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Correct!
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  Incorrect - Was {letter}
                </>
              )}
            </div>
          )}
        </div>

        {/* Voice Control Widget */}
        {voiceEnabled && (
          <VoiceControl
            options={OPTOTYPES}
            onAnswer={handleLetterSelect}
            enabled={!showFeedback}
          />
        )}

        {/* Progress */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-sm text-gray-500">
            <span>Letter {currentLetter + 1} of {line.letters}</span>
            <span>•</span>
            <span>{lineResults[currentEye].letters.filter(r => r.correct).length} correct</span>
          </div>
        </div>
      </div>
    )
  }

  // Render Switch Eyes Screen
  const renderSwitchEyes = () => (
    <div className="max-w-2xl mx-auto text-center space-y-6">
      <div className="mb-4">
        <svg className="w-16 h-16 mx-auto text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      </div>
      <h2 className="text-3xl font-bold text-gray-900">Left Eye Complete!</h2>
      <p className="text-xl text-gray-600">
        Great job! Now let's test your right eye.
      </p>
      
      <div className="bg-accent-50 border border-accent-100 rounded-xl p-8">
        <h3 className="font-bold text-lg mb-3">Your Left Eye Result:</h3>
        <div className="text-4xl font-bold text-accent-600 mb-2">
          {lineResults.left.snellen}
        </div>
        <p className="text-gray-600">LogMAR: {lineResults.left.finalLogMAR?.toFixed(2)}</p>
      </div>

      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-6">
        <p className="text-amber-900 flex items-start gap-3">
          <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span><strong>Remember:</strong> Now cover your LEFT eye with your palm and use only your right eye.</span>
        </p>
      </div>

      <button
        onClick={() => {
          setTestState('eye-coverage-setup')
          setCurrentEye('right')
        }}
        className="btn-primary px-12 min-h-[44px]"
      >
        Test Right Eye 
      </button>
    </div>
  )

  // Render Results
  const renderResults = () => {
    const leftSnellen = lineResults.left.snellen
    const rightSnellen = lineResults.right.snellen
    const leftLogMAR = lineResults.left.finalLogMAR
    const rightLogMAR = lineResults.right.finalLogMAR
    const asymmetry = Math.abs(leftLogMAR - rightLogMAR)
    
    const confidence = getConfidence()
    
    const getInterpretation = (logMAR) => {
      if (logMAR <= 0.0) return { 
        label: 'Excellent', 
        bgColor: 'bg-green-50', 
        borderColor: 'border-green-200',
        textColor: 'text-green-900',
        description: '20/20 or better - Normal sharp vision' 
      }
      if (logMAR <= 0.2) return { 
        label: 'Good', 
        bgColor: 'bg-accent-50', 
        borderColor: 'border-accent-100',
        textColor: 'text-accent-800',
        description: 'Slight blur - Monitor for changes' 
      }
      if (logMAR <= 0.3) return { 
        label: 'Fair', 
        bgColor: 'bg-yellow-50', 
        borderColor: 'border-yellow-200',
        textColor: 'text-yellow-900',
        description: 'May benefit from glasses' 
      }
      if (logMAR <= 0.5) return { 
        label: 'Reduced', 
        bgColor: 'bg-orange-50', 
        borderColor: 'border-orange-200',
        textColor: 'text-orange-900',
        description: 'Glasses likely needed' 
      }
      return { 
        label: 'Poor', 
        bgColor: 'bg-red-50', 
        borderColor: 'border-red-200',
        textColor: 'text-red-900',
        description: 'Significant vision impairment' 
      }
    }
    
    const leftInterp = getInterpretation(leftLogMAR)
    const rightInterp = getInterpretation(rightLogMAR)
    
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="page-title mb-3">
            Test Complete!
          </h1>
          <p className="page-subtitle">
            Here are your visual acuity results
          </p>
        </div>

        <CalibrationBadge showDetails={true} className="w-full justify-center" />

        {/* Eye Results */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Eye */}
          <div className="card">
            <div className="text-center mb-6">
              <svg className="w-12 h-12 mx-auto text-gray-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <h3 className="text-2xl font-bold text-gray-900">Left Eye</h3>
            </div>
            
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-sm text-gray-600 mb-1">Snellen</div>
                <div className="text-3xl font-bold text-gray-900">{leftSnellen}</div>
              </div>
              
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-sm text-gray-600 mb-1">LogMAR</div>
                <div className="text-2xl font-bold text-gray-900">{leftLogMAR.toFixed(2)}</div>
              </div>
              
              <div className={`${leftInterp.bgColor} ${leftInterp.borderColor} border-2 rounded-xl p-4`}>
                <div className={`font-bold text-lg ${leftInterp.textColor}`}>{leftInterp.label}</div>
                <div className={`text-sm mt-1 ${leftInterp.textColor}`}>{leftInterp.description}</div>
              </div>
            </div>
          </div>

          {/* Right Eye */}
          <div className="card">
            <div className="text-center mb-6">
              <svg className="w-12 h-12 mx-auto text-gray-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <h3 className="text-2xl font-bold text-gray-900">Right Eye</h3>
            </div>
            
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-sm text-gray-600 mb-1">Snellen</div>
                <div className="text-3xl font-bold text-gray-900">{rightSnellen}</div>
              </div>
              
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-sm text-gray-600 mb-1">LogMAR</div>
                <div className="text-2xl font-bold text-gray-900">{rightLogMAR.toFixed(2)}</div>
              </div>
              
              <div className={`${rightInterp.bgColor} ${rightInterp.borderColor} border-2 rounded-xl p-4`}>
                <div className={`font-bold text-lg ${rightInterp.textColor}`}>{rightInterp.label}</div>
                <div className={`text-sm mt-1 ${rightInterp.textColor}`}>{rightInterp.description}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Asymmetry Alert */}
        {asymmetry > 0.2 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
            <h4 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Asymmetry Detected
            </h4>
            <p className="text-amber-900">
              Your eyes show a difference of {asymmetry.toFixed(2)} LogMAR units (more than 2 lines on a chart). 
              This asymmetry should be evaluated by an eye care professional.
            </p>
          </div>
        )}

        {/* Recommendations */}
        <div className="bg-accent-50 border border-accent-100 rounded-xl p-6">
          <h3 className="font-bold text-lg text-accent-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
            Recommendations:
          </h3>
          <ul className="space-y-2 text-gray-700">
            {(leftLogMAR > 0.3 || rightLogMAR > 0.3) && (
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Schedule a comprehensive eye exam for prescription evaluation</span>
              </li>
            )}
            {asymmetry > 0.2 && (
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>Discuss the asymmetry between your eyes with your eye doctor</span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <span>•</span>
              <span>Retest in 3-6 months to monitor for changes</span>
            </li>
            <li className="flex items-start gap-2">
              <span>•</span>
              <span>Keep track of your results in the Trends section</span>
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => {
              setTestState('instructions')
              setCurrentEye('left')
              setCurrentLine(0)
              setResponses([])
              setLineResults({
                left: { correctLines: 0, smallestLine: 0, letters: [] },
                right: { correctLines: 0, smallestLine: 0, letters: [] }
              })
              setCorrectionInfo(null)
            }}
            className="flex-1 btn-secondary min-h-[44px]"
          >
            Retry Test
          </button>
          <button
            onClick={submitResults}
            className="flex-1 btn-primary min-h-[44px]"
          >
            Save Results 
          </button>
        </div>

        <p className="text-center text-xs text-gray-500 italic flex items-center justify-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>This is a screening tool, not a diagnostic device. Results should be discussed with an eye care professional. Not FDA approved for medical diagnosis.</span>
        </p>
      </div>
    )
  }

  return (
    <div className="test-shell">
      <div className="max-w-7xl mx-auto">
        {testState === 'distance-gate' && (
          <div className="max-w-4xl mx-auto">
            <InlineDistanceCalibration
              testType="visual_acuity"
              optimalDistanceMM={1000} // 40 inches (1 meter) for 20/20 simulation
              toleranceMM={100} // ±10cm tolerance
              onDistanceValid={() => {
                setDistanceValid(true)
                setTestState('instructions')
              }}
              onDistanceInvalid={() => setDistanceValid(false)}
              testName="Visual Acuity Test"
            />
          </div>
        )}
        {testState === 'instructions' && renderInstructions()}
        {testState === 'glasses-check' && renderGlassesCheck()}
        {testState === 'eye-coverage-setup' && renderEyeCoverageSetup()}
        {testState === 'testing' && renderTesting()}
        {testState === 'switch-eyes' && renderSwitchEyes()}
        {testState === 'results' && renderResults()}
      </div>
    </div>
  )
}

export default VisualAcuityTest
