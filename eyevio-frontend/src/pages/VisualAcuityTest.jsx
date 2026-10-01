import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCalibration } from '../context/CalibrationContext'
import { visionTestAPI } from '../services/api'
import voiceRecognition from '../utils/voiceRecognition'
import GlassesContactsCheck from '../components/GlassesContactsCheck'
import EyeCoverageVerification from '../components/EyeCoverageVerification'
import InlineDistanceCalibration from '../components/InlineDistanceCalibration'
import { VisionTestShell } from '../components/TestPrepLayout'
import SamdDisclaimer from '../components/SamdDisclaimer'
import CalibrationBadge from '../components/CalibrationBadge'
import ScreenSizeCalibration from '../components/ScreenSizeCalibration'
import SloanLetter, { E_DIRECTIONS, HOTV_LETTERS, SLOAN_LETTERS, TumblingE } from '../components/SloanLetter'
import useDistanceMonitor from '../hooks/useDistanceMonitor'
import { getScreenScale, optotypeHeightPx, smallestRenderableLogMAR } from '../utils/screenScale'
import { AVG_IPD_MM } from '../utils/distanceCalibration'
import { createRowGenerator, loadRecentRows, newChartSeed, saveRecentRows } from '../utils/acuityChart'
import {
  ACUITY_CHART_RULES,
  ETDRS_LETTERS_PER_LINE,
  ETDRS_LINES_TENTHS,
  etdrsNextLine,
  etdrsScore,
  logMARToSnellen,
  logMARToScore,
} from '../utils/visionTestScoring'

/**
 * Visual Acuity Test — ETDRS-style home chart.
 * - Sloan letters (C D H K N O R S V Z), 5 per line, 0.1 logMAR steps
 * - Children's charts: HOTV letters or tumbling E (4 choices, guess-corrected)
 * - Letter-by-letter scoring (0.02 logMAR per letter), forced choice
 * - Crowding bars around each line
 * - Letters sized physically from a card-matched screen scale at 1 m
 * - Continuous camera distance check; the chart pauses on > 10% drift
 */

const TEST_DISTANCE_MM = 1000
const DISTANCE_TOLERANCE = 0.1
const START_TENTHS = 6

const CHARTS = {
  sloan: {
    label: 'Letters',
    audience: 'Adults and children who know the alphabet',
    options: SLOAN_LETTERS,
    method: 'etdrs_sloan_letter_by_letter',
    symbol: 'letter',
  },
  hotv: {
    label: 'HOTV',
    audience: 'Children about 3–7 — name or point to H, O, T or V',
    options: HOTV_LETTERS,
    method: 'etdrs_hotv_letter_by_letter',
    symbol: 'letter',
  },
  tumbling_e: {
    label: 'Tumbling E',
    audience: 'Young children or anyone who can’t read letters — show which way the E points',
    options: E_DIRECTIONS,
    method: 'etdrs_tumbling_e',
    symbol: 'E',
  },
}

// Population median interpupillary distance by age (MacLachlan & Howland 2002; adults ≈ 63 mm).
// An estimate for the age group, not this person's measurement.
const CHILD_AGE_BANDS = [
  { id: '3-5', label: '3–5 years', ipdMm: 50 },
  { id: '6-8', label: '6–8 years', ipdMm: 53 },
  { id: '9-12', label: '9–12 years', ipdMm: 56 },
  { id: '13+', label: '13 or older', ipdMm: AVG_IPD_MM },
]

const DIRECTION_LABEL = { up: 'Up', right: 'Right', down: 'Down', left: 'Left' }

const MANUAL_DISTANCE_METHODS = [
  { id: 'tape_measure', label: 'Tape measure', hint: 'Measure 1 m from the screen to where your eyes will be.' },
  { id: 'string', label: '1 m of string', hint: 'Cut or mark 1 m of string; hold one end at the screen and the other at your cheekbone.' },
  { id: 'floor_marker', label: 'Floor marker', hint: 'Measure 1 m from the screen once and mark the spot on the floor with tape.' },
  { id: 'helper', label: 'Helper checks', hint: 'A helper measures 1 m and checks you stay there during the test.' },
]

const emptyEye = () => ({
  tested: {}, responses: [], logMAR: null, logMARRaw: null, snellen: null,
  lettersCorrect: 0, lettersCredited: null, baseTenths: null, beyondChartTop: false, atFloor: false,
})

const VisualAcuityTest = () => {
  const navigate = useNavigate()
  const { isCalibrated, needsRecalibration, getConfidence } = useCalibration()
  
  // screen-size, distance-gate, manual-distance, instructions, voice-setup, glasses-check, eye-coverage-setup, testing, switch-eyes, results
  const [testState, setTestState] = useState(() => (getScreenScale().source === 'default' ? 'screen-size' : 'distance-gate'))
  const [distanceValid, setDistanceValid] = useState(false)
  const [currentEye, setCurrentEye] = useState('left') // left, right
  const [currentTenths, setCurrentTenths] = useState(START_TENTHS)
  const [currentLetter, setCurrentLetter] = useState(0)
  const [responses, setResponses] = useState([])
  const [lineResults, setLineResults] = useState({ left: emptyEye(), right: emptyEye() })
  const [screenScale, setScreenScale] = useState(getScreenScale)
  const [pauseCount, setPauseCount] = useState(0)
  const [chartType, setChartType] = useState('sloan')
  const [childAge, setChildAge] = useState('13+')
  const [distanceMode, setDistanceMode] = useState('camera')
  const [manualMethod, setManualMethod] = useState('tape_measure')
  const [manualConfirmed, setManualConfirmed] = useState(false)
  const rowGenRef = useRef(null)
  const chartSeedRef = useRef(null)
  const chart = CHARTS[chartType]
  const chartRules = ACUITY_CHART_RULES[chartType]
  const ipdMm = chartType === 'sloan' ? AVG_IPD_MM : CHILD_AGE_BANDS.find((b) => b.id === childAge).ipdMm
  const floorTenths = Math.round(
    smallestRenderableLogMAR(ETDRS_LINES_TENTHS.map((t) => t / 10), TEST_DISTANCE_MM, screenScale.pxPerMm) * 10
  )
  
  // Voice recognition state — default on for far-distance testing
  const [voiceSupported] = useState(voiceRecognition.isSupported())
  const [voiceEnabled, setVoiceEnabled] = useState(voiceRecognition.isSupported())
  const [isListening, setIsListening] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState('')
  const [voiceSetupPassed, setVoiceSetupPassed] = useState(false)
  const [voiceSetupHeard, setVoiceSetupHeard] = useState('')
  const [voiceMicFailed, setVoiceMicFailed] = useState(false)
  const [lastHeardRaw, setLastHeardRaw] = useState('')
  const voiceFatalErrorRef = useRef(false)
  const handleLetterSelectRef = useRef(null)
  const advanceToNextLineRef = useRef(null)
  const finishEyeTestRef = useRef(null)
  const recognitionRef = useRef(null)
  const voiceSessionActiveRef = useRef(false)
  const showFeedbackRef = useRef(false)
  const voiceSetupCompleteRef = useRef(false)
  const setupRecognitionRef = useRef(null)
  
  // Eye coverage detection state
  const [eyeDetector, setEyeDetector] = useState(null)
  const [eyeCoverageStatus, setEyeCoverageStatus] = useState(null)
  
  // Glasses/contacts check state
  const [correctionInfo, setCorrectionInfo] = useState(null)
  
  const videoRef = useRef(null)
  const eyeCheckIntervalRef = useRef(null)
  
  const [currentLetters, setCurrentLetters] = useState([])
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showFeedback, setShowFeedback] = useState(false)

  const monitorActive = distanceMode === 'camera' && ['glasses-check', 'eye-coverage-setup', 'testing', 'switch-eyes'].includes(testState)
  const distanceMonitor = useDistanceMonitor({ active: monitorActive, targetMm: TEST_DISTANCE_MM, tolerance: DISTANCE_TOLERANCE, ipdMm })
  const chartPaused = testState === 'testing' && distanceMonitor.paused
  const chartPausedRef = useRef(false)
  useEffect(() => {
    if (chartPaused && !chartPausedRef.current) setPauseCount((n) => n + 1)
    chartPausedRef.current = chartPaused
  }, [chartPaused])

  useEffect(() => {
    showFeedbackRef.current = showFeedback
  }, [showFeedback])

  const collectTranscripts = (event) => {
    const transcripts = []
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (!result.isFinal) continue
      for (let alt = 0; alt < result.length; alt++) {
        const text = result[alt].transcript?.trim()
        if (text) transcripts.push(text)
      }
    }
    return transcripts
  }

  const parseSpokenLetter = useCallback((transcripts) => {
    return chartType === 'tumbling_e'
      ? voiceRecognition.parseDirection(transcripts)
      : voiceRecognition.parseOptotypeLetter(transcripts, CHARTS[chartType].options)
  }, [chartType])
  const voiceChoicesText = chartType === 'tumbling_e' ? 'up, down, left or right' : chart.options.join(', ')

  const stopSetupRecognition = useCallback(() => {
    try {
      setupRecognitionRef.current?.stop()
    } catch {
      // ignore
    }
    setupRecognitionRef.current = null
    setIsListening(false)
  }, [])

  const stopVoiceSession = useCallback(() => {
    voiceSessionActiveRef.current = false
    try {
      recognitionRef.current?.stop()
    } catch {
      // ignore
    }
    setIsListening(false)
  }, [])

  const safeStartRecognition = useCallback(() => {
    if (!recognitionRef.current || voiceFatalErrorRef.current || showFeedbackRef.current) return
    try {
      recognitionRef.current.start()
      setIsListening(true)
    } catch {
      // already started
    }
  }, [])

  const handleVoiceError = useCallback((error, { duringSetup = false } = {}) => {
    if (duringSetup && voiceSetupCompleteRef.current) return
    if (error === 'aborted' || error === 'no-speech') return
    // Edge/Chrome often emit transient "network" after a successful stop — not a mic block.
    if (error === 'network') {
      if (duringSetup || voiceSetupCompleteRef.current) return
      setVoiceNotice('Voice service unreachable — check internet, or use the on-screen buttons.')
      return
    }

    setIsListening(false)
    if (['not-allowed', 'service-not-allowed'].includes(error)) {
      voiceFatalErrorRef.current = true
      voiceSessionActiveRef.current = false
      setVoiceNotice('Microphone blocked — allow mic access in Edge site settings, or use the letter buttons.')
      if (duringSetup) setVoiceMicFailed(true)
    } else if (error === 'audio-capture') {
      setVoiceNotice('Microphone busy — close Zoom/Teams, then tap the button to try again.')
    }
  }, [])

  const attachRecognitionHandlers = useCallback((recognition) => {
    recognition.onstart = () => setIsListening(true)
    recognition.onresult = (event) => {
      const transcripts = collectTranscripts(event)
      if (!transcripts.length) return

      setLastHeardRaw(transcripts[0])
      const parsed = parseSpokenLetter(transcripts)
      if (parsed) {
        setVoiceNotice(`Heard: ${parsed}`)
        handleLetterSelectRef.current?.(parsed)
      } else {
        setVoiceNotice(`Heard "${transcripts[0]}" — say one of: ${voiceChoicesText}`)
      }
    }
    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        handleVoiceError(event.error)
      }
    }
    recognition.onend = () => {
      setIsListening(false)
      if (voiceSessionActiveRef.current && !voiceFatalErrorRef.current && !showFeedbackRef.current) {
        window.setTimeout(() => safeStartRecognition(), 150)
      }
    }
  }, [handleVoiceError, parseSpokenLetter, safeStartRecognition, voiceChoicesText])

  const startVoiceSession = useCallback(async () => {
    if (!voiceEnabled || !voiceSupported || showFeedbackRef.current) return

    await voiceRecognition.primeMicrophone(true)

    if (!recognitionRef.current) {
      recognitionRef.current = voiceRecognition.createRecognitionInstance()
      if (!recognitionRef.current) {
        setVoiceNotice('Voice not supported in this browser — use the letter buttons.')
        return
      }
      attachRecognitionHandlers(recognitionRef.current)
    }

    voiceFatalErrorRef.current = false
    voiceSessionActiveRef.current = true
    setVoiceNotice('Say the letter you see on screen.')
    safeStartRecognition()
  }, [attachRecognitionHandlers, safeStartRecognition, voiceEnabled, voiceSupported])

  const startSetupListening = useCallback(async () => {
    if (!voiceSupported) return

    stopSetupRecognition()
    setVoiceNotice('Starting microphone…')
    setLastHeardRaw('')

    await voiceRecognition.primeMicrophone(true)

    const recognition = voiceRecognition.createRecognitionInstance()
    if (!recognition) {
      setVoiceNotice('Voice not supported in this browser.')
      setVoiceMicFailed(true)
      return
    }

    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 5
    setupRecognitionRef.current = recognition

    recognition.onstart = () => {
      setIsListening(true)
      setVoiceNotice(`Listening — say one now (${voiceChoicesText})`)
    }

    recognition.onresult = (event) => {
      const transcripts = collectTranscripts(event)
      if (!transcripts.length) return

      setLastHeardRaw(transcripts[0])
      const parsed = parseSpokenLetter(transcripts)
      if (parsed) {
        voiceSetupCompleteRef.current = true
        setVoiceSetupHeard(parsed)
        setVoiceSetupPassed(true)
        setVoiceMicFailed(false)
        voiceFatalErrorRef.current = false
        setVoiceNotice('')
      } else {
        setVoiceNotice(`Heard "${transcripts[0]}" — try one of: ${voiceChoicesText}`)
      }
    }

    recognition.onerror = (event) => {
      handleVoiceError(event.error, { duringSetup: true })
    }

    recognition.onend = () => setIsListening(false)

    try {
      recognition.start()
    } catch {
      setVoiceNotice('Could not start microphone — tap the button to try again.')
    }
  }, [handleVoiceError, parseSpokenLetter, stopSetupRecognition, voiceSupported, voiceChoicesText])

  // Auto-start mic check when landing on voice-setup (e.g. after clicking distance confirm).
  useEffect(() => {
    if (testState !== 'voice-setup') return undefined
    if (voiceSetupPassed || voiceMicFailed || isListening) return undefined
    const t = window.setTimeout(() => {
      startSetupListening()
    }, 250)
    return () => window.clearTimeout(t)
  }, [testState, voiceSetupPassed, voiceMicFailed, isListening, startSetupListening])

  // After a successful letter check, advance without requiring another click.
  useEffect(() => {
    if (testState !== 'voice-setup' || !voiceSetupPassed) return undefined
    const t = window.setTimeout(() => {
      stopSetupRecognition()
      setTestState('glasses-check')
    }, 900)
    return () => window.clearTimeout(t)
  }, [testState, voiceSetupPassed, stopSetupRecognition])

  // One seeded sequence per session, shared by both eyes, so no row repeats within the session
  const generateLetters = useCallback(() => {
    if (!rowGenRef.current) {
      chartSeedRef.current = newChartSeed()
      rowGenRef.current = createRowGenerator({
        options: CHARTS[chartType].options,
        count: ETDRS_LETTERS_PER_LINE,
        seed: chartSeedRef.current,
        recent: loadRecentRows(window.localStorage, chartType),
      })
    }
    return rowGenRef.current.next()
  }, [chartType])

  useEffect(() => {
    if (testState === 'results' && rowGenRef.current) saveRecentRows(window.localStorage, chartType, rowGenRef.current.shown)
  }, [testState, chartType])

  // Start test for current eye
  const startEyeTest = useCallback(() => {
    setCurrentTenths(Math.max(START_TENTHS, floorTenths))
    setCurrentLetter(0)
    setCurrentLetters(generateLetters())
    setSelectedAnswer(null)
    setShowFeedback(false)
  }, [generateLetters, floorTenths])

  // Handle letter selection (forced choice — no "can't see"; answers are not revealed)
  const handleLetterSelect = useCallback((letter) => {
    if (showFeedback || chartPausedRef.current) return

    const correctLetter = currentLetters[currentLetter]
    const isCorrect = letter === correctLetter

    setSelectedAnswer(letter)
    setShowFeedback(true)

    voiceSessionActiveRef.current = false
    try {
      recognitionRef.current?.stop()
    } catch {
      // ignore
    }
    setIsListening(false)

    const response = {
      eye: currentEye,
      lineTenths: currentTenths,
      logMAR: currentTenths / 10,
      position: currentLetter,
      letter: correctLetter,
      userAnswer: letter,
      correct: isCorrect,
      distanceMm: distanceMonitor.distanceMm,
      timestamp: Date.now()
    }

    setResponses(prev => [...prev, response])
    setLineResults(prev => ({
      ...prev,
      [currentEye]: { ...prev[currentEye], responses: [...prev[currentEye].responses, response] },
    }))

    setTimeout(() => {
      if (currentLetter < currentLetters.length - 1) {
        setCurrentLetter(prev => prev + 1)
        setSelectedAnswer(null)
        setShowFeedback(false)
      } else {
        advanceToNextLineRef.current?.(response)
      }
    }, 350)
  }, [showFeedback, currentLetters, currentLetter, currentEye, currentTenths, distanceMonitor.distanceMm])

  handleLetterSelectRef.current = handleLetterSelect

  useEffect(() => {
    if (testState !== 'testing' || chartType !== 'tumbling_e') return undefined
    const keyDir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
    const onKey = (e) => {
      const dir = keyDir[e.key]
      if (!dir) return
      e.preventDefault()
      handleLetterSelectRef.current?.(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [testState, chartType])

  // Keep voice listening during the test; pause only while feedback is shown
  useEffect(() => {
    if (testState !== 'testing' || !voiceEnabled) {
      stopVoiceSession()
      return undefined
    }

    if (showFeedback) {
      voiceSessionActiveRef.current = false
      try {
        recognitionRef.current?.stop()
      } catch {
        // ignore
      }
      setIsListening(false)
      return undefined
    }

    // Fresh recognition after camera-based eye coverage step
    recognitionRef.current = null
    voiceFatalErrorRef.current = false
    startVoiceSession()

    return () => {
      stopVoiceSession()
    }
  }, [testState, voiceEnabled, showFeedback, startVoiceSession, stopVoiceSession])

  // Line finished: record letters correct and pick the next line (ETDRS stepping)
  const advanceToNextLine = useCallback((lastResponse) => {
    const lineResponses = [
      ...lineResults[currentEye].responses.filter((r) => r.lineTenths === currentTenths),
      lastResponse,
    ].filter((r, i, arr) => arr.findIndex((x) => x.timestamp === r.timestamp) === i)
    const correct = lineResponses.filter((r) => r.correct).length
    const tested = { ...lineResults[currentEye].tested, [currentTenths]: correct }

    setLineResults(prev => ({ ...prev, [currentEye]: { ...prev[currentEye], tested } }))

    const next = etdrsNextLine(tested, {
      startTenths: Math.max(START_TENTHS, floorTenths),
      floorTenths,
      passCorrect: chartRules.passCorrect,
      stopCorrect: chartRules.stopCorrect,
    })
    if (next == null) {
      finishEyeTestRef.current?.(tested)
      return
    }
    setCurrentTenths(next)
    setCurrentLetter(0)
    setCurrentLetters(generateLetters())
    setSelectedAnswer(null)
    setShowFeedback(false)
  }, [currentTenths, lineResults, currentEye, generateLetters, floorTenths, chartRules])

  advanceToNextLineRef.current = advanceToNextLine

  // Finish testing current eye
  const finishEyeTest = useCallback((tested) => {
    const score = etdrsScore(tested, { passCorrect: chartRules.passCorrect, guessRate: chartRules.guessRate })
    const atFloor = (tested[floorTenths] ?? 0) >= chartRules.passCorrect

    setLineResults(prev => ({
      ...prev,
      [currentEye]: {
        ...prev[currentEye],
        tested,
        logMAR: score.logMAR,
        logMARRaw: score.logMARRaw,
        snellen: logMARToSnellen(score.logMAR),
        lettersCorrect: score.lettersCorrect,
        lettersCredited: score.lettersCredited,
        baseTenths: score.baseTenths,
        beyondChartTop: score.beyondChartTop,
        atFloor,
      }
    }))

    if (currentEye === 'left') {
      setCurrentEye('right')
      setTestState('switch-eyes')
    } else {
      setTestState('results')
    }
  }, [currentEye, floorTenths, chartRules])

  finishEyeTestRef.current = finishEyeTest

  // Voice microphone check — push-to-talk (more reliable than always-on in React/Edge)
  useEffect(() => {
    if (testState !== 'voice-setup' || !voiceSupported) return undefined

    voiceSetupCompleteRef.current = false
    setVoiceSetupHeard('')
    setVoiceSetupPassed(false)
    setVoiceMicFailed(false)
    voiceFatalErrorRef.current = false
    setLastHeardRaw('')
    setVoiceNotice(`Tap the button below, then say one ${chartType === 'tumbling_e' ? 'direction' : 'letter'} out loud.`)

    return () => {
      stopSetupRecognition()
    }
  }, [testState, voiceSupported, stopSetupRecognition, chartType])

  // Submit results to backend
  const submitResults = async () => {
    try {
      const confidence = getConfidence()
      
      const eyeDetails = (eye) => ({
        snellen: lineResults[eye].snellen,
        logMAR: lineResults[eye].logMAR,
        logMAR_raw: lineResults[eye].logMARRaw,
        logMAR_guess_adjusted: chartRules.guessRate > 0 ? lineResults[eye].logMAR : null,
        letters_correct: lineResults[eye].lettersCorrect,
        letters_credited: lineResults[eye].lettersCredited,
        letters_correct_by_line: lineResults[eye].tested,
        base_line_logmar: lineResults[eye].baseTenths != null ? lineResults[eye].baseTenths / 10 : null,
        beyond_chart_top: lineResults[eye].beyondChartTop,
        at_chart_floor: lineResults[eye].atFloor,
        responses: lineResults[eye].responses,
      })
      await visionTestAPI.submit({
        test_type: 'visual_acuity',
        score: logMARToScore(lineResults.left.logMAR, lineResults.right.logMAR),
        left_eye_score: lineResults.left.logMAR != null ? Math.round((1 - lineResults.left.logMAR) * 100) : null,
        right_eye_score: lineResults.right.logMAR != null ? Math.round((1 - lineResults.right.logMAR) * 100) : null,
        test_details: {
          method: chart.method,
          method_version: 2,
          chart_type: chartType,
          chart_rules: chartRules,
          child_age_band: chartType === 'sloan' ? null : childAge,
          assumed_ipd_mm: distanceMode === 'camera' ? ipdMm : null,
          ipd_source: distanceMode !== 'camera'
            ? null
            : chartType === 'sloan' || childAge === '13+' ? 'adult_population_mean_estimate' : 'age_band_median_estimate',
          distance_method: distanceMode === 'camera' ? 'camera_pupil_distance_estimate' : `manual_${manualMethod}`,
          chart_seed: chartSeedRef.current,
          scoring_note: chartRules.guessRate > 0
            ? 'Four-choice chart: logMAR (guess-adjusted) credits each line as (c − 1.25) / 0.75 before 0.02 logMAR per symbol; logMAR_raw credits raw counts. Base line = largest line with ≥ 4/5 raw correct; eye stops when the smallest line shown has ≤ 2/5 or is the chart floor.'
            : 'Ten-choice Sloan chart: 0.02 logMAR per letter read. Base line = largest line with ≥ 4/5 correct; eye stops when the smallest line shown has ≤ 1/5 or is the chart floor.',
          left_eye: eyeDetails('left'),
          right_eye: eyeDetails('right'),
          test_distance_mm: TEST_DISTANCE_MM,
          screen_px_per_mm: Number(screenScale.pxPerMm.toFixed(3)),
          screen_scale_source: screenScale.source,
          chart_floor_logmar: floorTenths / 10,
          distance_pauses: pauseCount,
          distance_baseline_source: distanceMonitor.baselineSource,
          correction: correctionInfo,
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
          An ETDRS-style chart, read one symbol at a time from 1 metre
        </p>
      </div>

      <div className="card">
        <h2 className="section-title mb-4">Choose a chart</h2>
        <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Chart type">
          {Object.entries(CHARTS).map(([id, c]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={chartType === id}
              onClick={() => {
                setChartType(id)
                if (id !== 'sloan' && childAge === '13+') setChildAge('6-8')
              }}
              className={`text-left rounded-xl border-2 p-4 min-h-[44px] transition-colors ${
                chartType === id ? 'border-accent-600 bg-accent-50' : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-2" aria-hidden="true">
                {id === 'tumbling_e'
                  ? ['right', 'up', 'left'].map((d) => <TumblingE key={d} direction={d} size={18} />)
                  : c.options.slice(0, 4).map((l) => <SloanLetter key={l} letter={l} size={18} />)}
              </div>
              <div className="font-bold text-gray-900">{c.label}</div>
              <div className="text-sm text-gray-600">{c.audience}</div>
            </button>
          ))}
        </div>

        {chartType !== 'sloan' && (
          <div className="mt-4">
            <label htmlFor="child-age" className="block text-sm font-semibold text-gray-900 mb-1">Age of the person being tested</label>
            <select
              id="child-age"
              value={childAge}
              onChange={(e) => setChildAge(e.target.value)}
              className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-2 min-h-[44px]"
            >
              {CHILD_AGE_BANDS.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
            <p className="text-sm text-gray-600 mt-2">
              Children&apos;s eyes are closer together, so the camera&apos;s 1 m check uses the typical eye spacing for this age.
              That is an estimate, not this child&apos;s own measurement, so the distance shown is approximate; for a more
              reliable distance, measure 1 m by hand (tape, string or a floor marker).
              A helper should sit beside the screen, hold the child&apos;s hand over one eye, and tap the answer the child names or points to.
              Practise the {chartType === 'hotv' ? 'four letters' : 'four directions'} together at close range first.
            </p>
          </div>
        )}
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
              <h3 className="font-bold text-lg text-gray-900">Read Each Row of 5 {chartType === 'tumbling_e' ? 'E’s' : 'Letters'}</h3>
              <p className="text-gray-700">
                {chartType === 'tumbling_e'
                  ? 'Each row shows 5 E’s inside a frame. Say or show which way the marked E’s bars point, left to right.'
                  : 'Each row shows 5 letters inside a frame. Name the marked letter, left to right.'} If you are unsure, <strong>always guess</strong> — guesses make the score more accurate. We won&apos;t tell you which answers were right.</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <span className="w-10 h-10 bg-accent-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">3</span>
            <div>
              <h3 className="font-bold text-lg text-gray-900">Stay at 1 Metre</h3>
              <p className="text-gray-700">
                {distanceMode === 'manual'
                  ? 'You measured 1 m by hand, so stay exactly where you measured.'
                  : 'The camera keeps estimating your distance. If you drift more than 10% closer or farther, the chart pauses until you move back.'}{' '}
                Every symbol you get right counts toward your score. The test ends when the smallest row so far has {chartRules.stopCorrect} or fewer of 5 right, or the screen can&apos;t draw a smaller row.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <span className="w-10 h-10 bg-accent-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">4</span>
            <div>
              <h3 className="font-bold text-lg text-gray-900">Get Your Results</h3>
              <p className="text-gray-700">See a logMAR and Snellen (&quot;20/20&quot;) score for each eye. A home result is not the same as a clinic chart result.</p>
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
            <span>Keep the camera able to see your face so the distance check can work</span>
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
        <div className="card bg-brand-soft border-2 border-accent-200">
          <div className="flex items-start gap-4">
            <svg className="w-8 h-8 text-accent-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 mb-2">Voice control required</h3>
              <p className="text-gray-600 text-sm mb-3">
                This test is taken about <strong>1 meter (40″)</strong> from the screen. You will answer by
                {chartType === 'tumbling_e'
                  ? <>saying the direction aloud — &quot;up&quot;, &quot;down&quot;, &quot;left&quot; or &quot;right&quot; — or a helper can tap for you.</>
                  : <>saying letters aloud — for example &quot;{chart.options[0]}&quot; or &quot;{chart.options[1]}&quot; — so you do not need to walk back to click.</>}
              </p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={voiceEnabled}
                  onChange={(e) => setVoiceEnabled(e.target.checked)}
                  className="w-5 h-5 text-accent-600 rounded focus:ring-accent-500"
                />
                <span className="font-semibold text-gray-900">Enable voice control (recommended)</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {!voiceSupported && (
        <div className="card bg-amber-50 border-2 border-amber-200">
          <p className="text-sm text-amber-900">
            Your browser does not support voice input. You will need to stay close enough to use the on-screen buttons.
          </p>
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
          onClick={() => {
            if (voiceSupported && !voiceEnabled) {
              setVoiceNotice('Please enable voice control to take this test from a distance.')
              return
            }
            voiceFatalErrorRef.current = false
            setVoiceMicFailed(false)
            setVoiceSetupPassed(false)
            setTestState(voiceSupported ? 'voice-setup' : 'glasses-check')
          }}
          className="flex-1 btn-primary min-h-[44px]"
        >
          Start Test 
        </button>
      </div>

      <SamdDisclaimer testType="visual_acuity" variant="compact" className="text-center" />
    </div>
  )

  const renderVoiceSetup = () => (
    <div className="max-w-xl mx-auto">
      <div className="card text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-indigo-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Enable your microphone</h2>
        <p className="text-gray-600 text-sm">
          You will stand about 1 meter from the screen. Say one {chartType === 'tumbling_e' ? 'direction' : 'letter'} out loud to verify the mic.
        </p>

        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-left text-sm text-indigo-900">
          <p className="font-semibold mb-2">Try saying:</p>
          <p className="text-lg font-mono font-bold">
            {chartType === 'tumbling_e' ? 'up · down · left · right' : chart.options.join(' · ')}
          </p>
        </div>

        <button
          type="button"
          onClick={startSetupListening}
          disabled={isListening || voiceSetupPassed}
          className="w-full min-h-[48px] btn-primary disabled:opacity-50"
        >
          {voiceSetupPassed
            ? 'Microphone verified'
            : `${isListening ? 'Listening… say' : 'Tap — say'} a ${chartType === 'tumbling_e' ? 'direction' : 'letter'}`}
        </button>

        {lastHeardRaw && !voiceSetupPassed && (
          <p className="text-xs text-gray-500">Last heard: &quot;{lastHeardRaw}&quot;</p>
        )}

        {voiceNotice && !voiceSetupPassed && (
          <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-900">{voiceNotice}</p>
        )}

        {isListening && !voiceSetupPassed && (
          <p className="text-sm text-indigo-700 flex items-center justify-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Microphone is listening…
          </p>
        )}

        {voiceSetupPassed && voiceSetupHeard && (
          <p className="text-sm font-semibold text-green-700">
            Microphone ready — heard &quot;{voiceSetupHeard}&quot;
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => setTestState('instructions')} className="flex-1 btn-secondary min-h-[44px]">
            Back
          </button>
          <button
            type="button"
            disabled={!voiceSetupPassed && !voiceMicFailed}
            onClick={() => {
              if (voiceMicFailed) setVoiceEnabled(false)
              if (voiceSetupPassed) {
                voiceFatalErrorRef.current = false
              }
              stopSetupRecognition()
              setTestState('glasses-check')
            }}
            className="flex-1 btn-primary min-h-[44px] disabled:opacity-50"
          >
            {voiceSetupPassed ? 'Continue' : voiceMicFailed ? 'Continue without voice' : 'Waiting for voice…'}
          </button>
        </div>
      </div>
    </div>
  )

  const renderManualDistance = () => {
    const method = MANUAL_DISTANCE_METHODS.find((m) => m.id === manualMethod)
    return (
      <div className="max-w-2xl mx-auto card space-y-5">
        <div>
          <h1 className="page-title mb-2">Measure 1 metre by hand</h1>
          <p className="text-gray-700">
            Use this if the camera can&apos;t estimate your distance, or for a child, where the camera&apos;s estimate is less reliable.
            The camera will not check your distance during the test, so stay where you measured.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="How you will measure 1 metre">
          {MANUAL_DISTANCE_METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={manualMethod === m.id}
              onClick={() => setManualMethod(m.id)}
              className={`text-left rounded-xl border-2 p-3 min-h-[44px] ${manualMethod === m.id ? 'border-accent-600 bg-accent-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="font-semibold text-gray-900">{m.label}</div>
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{method?.hint} Measure to the eyes, not the chair or the desk edge.</p>
        <label className="flex items-start gap-3 text-sm text-gray-800">
          <input type="checkbox" className="mt-1" checked={manualConfirmed} onChange={(e) => setManualConfirmed(e.target.checked)} />
          <span>My eyes are 1 m from the screen and I will stay there for the whole test.</span>
        </label>
        <div className="flex gap-3">
          <button type="button" className="flex-1 btn-secondary min-h-[44px]" onClick={() => { setDistanceMode('camera'); setTestState('distance-gate') }}>
            Use the camera instead
          </button>
          <button
            type="button"
            disabled={!manualConfirmed}
            className="flex-1 btn-primary min-h-[44px] disabled:opacity-50"
            onClick={() => {
              setDistanceMode('manual')
              setDistanceValid(true)
              setTestState(voiceSupported ? 'voice-setup' : 'glasses-check')
            }}
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

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
    const logMAR = currentTenths / 10
    const h = optotypeHeightPx(logMAR, TEST_DISTANCE_MM, screenScale.pxPerMm)
    const bar = Math.max(1, h / 5)
    const distanceCm = distanceMonitor.distanceMm != null ? Math.round(distanceMonitor.distanceMm / 10) : null

    return (
      <VisionTestShell
        title={`${currentEye === 'left' ? 'Left' : 'Right'} eye — cover the other eye`}
        subtitle={`${logMARToSnellen(logMAR)} line (logMAR ${logMAR.toFixed(1)})`}
        statusBar={(
          <span className="text-xs text-gray-500">
            {chartType === 'tumbling_e' ? 'E' : 'Letter'} {currentLetter + 1}/{ETDRS_LETTERS_PER_LINE}
            {distanceCm != null && ` · ${distanceCm} cm`}
          </span>
        )}
        stimulus={(
          <div className="relative flex items-center justify-center w-full h-full min-h-[240px] bg-white rounded-xl overflow-hidden">
            <div className={chartPaused ? 'invisible' : ''}>
              {/* Crowding bars sit one letter-width outside the row; spacing between letters is one letter-width. */}
              <div style={{ border: `${bar}px solid #111`, padding: h }}>
                <div className="flex" style={{ gap: h }}>
                  {currentLetters.map((l, i) => (
                    chartType === 'tumbling_e'
                      ? <TumblingE key={`${currentTenths}-${i}`} direction={l} size={h} />
                      : <SloanLetter key={`${currentTenths}-${i}`} letter={l} size={h} />
                  ))}
                </div>
              </div>
              <div className="flex justify-start mt-3" style={{ paddingLeft: bar + h }}>
                <div
                  className="h-1.5 rounded-full bg-accent-500 transition-transform duration-200"
                  style={{ width: h, transform: `translateX(${currentLetter * 2 * h}px)` }}
                />
              </div>
            </div>
            {chartPaused && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white text-center px-6">
                <p className="text-xl font-bold text-gray-900 mb-1">Paused — check your distance</p>
                <p className="text-gray-600">
                  {distanceMonitor.reason === 'no_face'
                    ? 'The camera can’t see your face. Face the screen from about 1 m.'
                    : distanceMonitor.reason === 'too_close'
                      ? `You’re at about ${distanceCm} cm — step back to 1 m.`
                      : `You’re at about ${distanceCm} cm — come closer to 1 m.`}
                </p>
                <p className="text-xs text-gray-400 mt-2">The chart resumes automatically.</p>
              </div>
            )}
          </div>
        )}
        controls={(
          <>
            {voiceEnabled && (
              <div className={`text-sm rounded-lg px-3 py-2 border ${
                isListening ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}>
                {isListening ? (
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    {chartType === 'tumbling_e' ? 'Listening — say which way the E points' : 'Listening — say the letter you see'}
                  </span>
                ) : voiceNotice || 'Voice paused — tap Mic to listen'}
              </div>
            )}

            {voiceEnabled && lastHeardRaw && (
              <p className="text-xs text-gray-500">Last heard: &quot;{lastHeardRaw}&quot;</p>
            )}

            {voiceEnabled && (
              <button
                type="button"
                onClick={() => {
                  voiceFatalErrorRef.current = false
                  recognitionRef.current = null
                  startVoiceSession()
                }}
                disabled={isListening || showFeedback}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-indigo-200 text-sm font-medium text-indigo-700 bg-white hover:bg-indigo-50 disabled:opacity-50"
              >
                {isListening ? 'Listening…' : 'Mic — listen again'}
              </button>
            )}

            <p className="text-sm text-gray-600">
              {chartType === 'tumbling_e'
                ? (voiceEnabled
                  ? 'Say which way the underlined E points (up, down, left, right), point, or tap it below.'
                  : 'Tap the way the underlined E points — or the child points and a helper taps. Arrow keys work too.')
                : chartType === 'hotv'
                  ? (voiceEnabled
                    ? 'Say the underlined letter, or point to it below and a helper taps it.'
                    : 'Tap the underlined letter — a child can point to the matching letter and a helper taps it.')
                  : (voiceEnabled ? 'Say the underlined letter, or tap it below.' : 'Tap the underlined letter.')}{' '}
              <strong>Not sure? Take your best guess</strong> — guesses are part of how the score works.
            </p>

            <div className={`grid gap-2 ${chart.options.length === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
              {chart.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleLetterSelect(opt)}
                  disabled={showFeedback || chartPaused}
                  aria-label={chartType === 'tumbling_e' ? `E points ${opt}` : opt}
                  className={`
                    rounded-xl font-mono font-bold transition-all flex flex-col items-center justify-center gap-1
                    ${chart.options.length === 4 ? 'min-h-[72px] text-3xl' : 'min-h-[44px] text-xl'}
                    ${selectedAnswer === opt ? 'bg-accent-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'}
                    ${showFeedback || chartPaused ? 'cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  {chartType === 'tumbling_e' ? (
                    <>
                      <TumblingE direction={opt} size={28} color={selectedAnswer === opt ? '#fff' : '#111'} />
                      <span className="font-sans text-xs font-semibold">{DIRECTION_LABEL[opt]}</span>
                    </>
                  ) : opt}
                </button>
              ))}
            </div>

            {screenScale.source === 'default' && (
              <p className="text-xs text-amber-700">Screen not measured — letter sizes are approximate.</p>
            )}
          </>
        )}
      />
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
        <p className="text-gray-600">LogMAR: {lineResults.left.logMAR?.toFixed(2)}</p>
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
    const leftLogMAR = lineResults.left.logMAR
    const rightLogMAR = lineResults.right.logMAR
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

        <div className="card bg-gray-50 text-sm text-gray-700 space-y-1">
          <p>
            {chartRules.guessRate > 0 ? (
              <>
                {chart.label} chart. {chartType === 'tumbling_e' ? 'E’s' : 'Letters'} read: left {lineResults.left.lettersCorrect}, right {lineResults.right.lettersCorrect}.
                With only four choices some answers are lucky guesses, so each row is adjusted for chance before scoring.
              </>
            ) : (
              <>Letters read: left {lineResults.left.lettersCorrect}, right {lineResults.right.lettersCorrect} (each letter = 0.02 logMAR).</>
            )}
            {(lineResults.left.atFloor || lineResults.right.atFloor) && (
              <> Your screen can’t draw letters smaller than logMAR {(floorTenths / 10).toFixed(1)} at 1 m, so an eye marked at that limit may see even better.</>
            )}
          </p>
          <p>
            Studies of standardised home ETDRS charts found reasonable agreement with clinic charts, with home results
            often a little worse; how much depends on the protocol and the people tested. EyeVio does not apply a
            correction for this — compare your results over time rather than with a clinic number.
          </p>
          {chartRules.guessRate > 0 && (
            <p>
              Without the chance adjustment: left {lineResults.left.logMARRaw?.toFixed(2) ?? '—'}, right {lineResults.right.logMARRaw?.toFixed(2) ?? '—'} logMAR. Both are saved.
            </p>
          )}
          {(lineResults.left.beyondChartTop || lineResults.right.beyondChartTop) && (
            <p>No row reached 4 of 5 correct for an eye marked as beyond the chart; its true acuity may be worse than shown.</p>
          )}
          {distanceMode === 'manual' ? (
            <p>Distance was measured by hand ({MANUAL_DISTANCE_METHODS.find((m) => m.id === manualMethod)?.label.toLowerCase()}), so the camera did not check it during the test.</p>
          ) : (
            <p>The camera distance is an estimate from typical eye spacing{chartType !== 'sloan' ? ' for this age group' : ''}, not a measurement of your own.</p>
          )}
          {screenScale.source === 'default' && (
            <p className="text-amber-800">Your screen size wasn’t measured, so these values may be off by about a line.</p>
          )}
          {pauseCount > 0 && <p>The chart paused {pauseCount} time{pauseCount > 1 ? 's' : ''} to correct your distance.</p>}
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
              setCurrentTenths(START_TENTHS)
              setResponses([])
              setPauseCount(0)
              setLineResults({ left: emptyEye(), right: emptyEye() })
              setCorrectionInfo(null)
              rowGenRef.current = null
              chartSeedRef.current = null
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

        <SamdDisclaimer testType="visual_acuity" />
      </div>
    )
  }

  return (
    <div className="test-shell">
      <div className="max-w-7xl mx-auto">
        {testState === 'distance-gate' && (
          <InlineDistanceCalibration
            testType="visual_acuity"
            optimalDistanceMM={1000}
            toleranceMM={100}
            splitLayout
            voiceConfirm
            onDistanceValid={(_ok, meta = {}) => {
              setDistanceValid(true)
              setVoiceEnabled(true)
              const nextState = (() => {
                // Voice confirm already proved the mic works — skip click-heavy setup.
                if (meta?.viaVoice) {
                  setVoiceSetupPassed(true)
                  setVoiceSetupHeard('ready')
                  voiceFatalErrorRef.current = false
                  return 'glasses-check'
                }
                return voiceSupported ? 'voice-setup' : 'glasses-check'
              })()
              setTestState(nextState)
            }}
            onDistanceInvalid={() => setDistanceValid(false)}
            testName="Visual Acuity Test"
          />
        )}
        {testState === 'distance-gate' && (
          <div className="text-center mt-4">
            <button type="button" className="text-sm font-semibold text-accent-700 underline min-h-[44px]" onClick={() => setTestState('manual-distance')}>
              Can&apos;t use the camera? Measure 1 m with a tape, string or floor marker
            </button>
          </div>
        )}
        {testState === 'manual-distance' && renderManualDistance()}
        {testState === 'screen-size' && (
          <ScreenSizeCalibration
            onDone={() => {
              setScreenScale(getScreenScale())
              setTestState('distance-gate')
            }}
            onSkip={() => setTestState('distance-gate')}
          />
        )}
        {monitorActive && (
          <video ref={distanceMonitor.videoRef} autoPlay playsInline muted className="fixed top-0 left-0 w-px h-px opacity-0 pointer-events-none" aria-hidden />
        )}
        {testState === 'instructions' && renderInstructions()}
        {testState === 'voice-setup' && renderVoiceSetup()}
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
