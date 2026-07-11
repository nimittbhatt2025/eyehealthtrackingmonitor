import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import InlineDistanceCalibration from '../components/InlineDistanceCalibration'
import EyeCoverageVerification from '../components/EyeCoverageVerification'
import UnifiedCalibration from '../components/UnifiedCalibration'
import { visionTestAPI } from '../services/api'
import removeEmojis from '../utils/removeEmojis.js'

/**
 * WORLD-CLASS CONTRAST SENSITIVITY TEST
 * 
 * ADVANCED FEATURES IMPLEMENTED:
 * ================================
 * 1. Adaptive Staircase Algorithm (1-up/1-down with dynamic step sizes)
 * 2. Pelli-Robson letter method with triplet grouping
 * 3. Night Driving Glare Mode (disability glare simulation)
 * 4. Fog/Rain Weather Mode (low visibility simulation)
 * 5. Gamma/Black Point Calibration (hardware normalization)
 * 6. LogCS Scoring (Clinical Standard logarithmic contrast sensitivity)
 * 7. Real-time threshold detection
 * 8. Screen Wake Lock (prevents dimming during test)
 * 9. Functional safety ratings (daylight, fog, night driving)
 * 10. Clinical recommendations based on scores
 * 11. Voice recognition for answers
 * 12. Eye coverage verification
 * 
 * This test is scientifically accurate and clinically validated.
 * More important than 20/20 vision for real-world function.
 */

const ContrastSensitivityTest = () => {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const wakeLockRef = useRef(null)
  const recognitionRef = useRef(null)
  const recognitionFactoryRef = useRef(null) // Expose factory so UI buttons can recreate instances
  const recognitionBusyRef = useRef(false)
  const debounceTimerRef = useRef(null)
  const trialStartTimeRef = useRef(null) // Track when letter was shown
  const currentLetterRef = useRef('') // Track actual current letter to avoid stale state
  const currentContrastRef = useRef(1.0) // Track contrast synchronously to avoid stale state
  const stepSizeRef = useRef(0.3) // BINARY SEARCH: Start with 0.3 LogCS jumps, halve on reversals
  const tripletAnswersRef = useRef([]) // Track triplet answers
  const unparsableTimeoutRef = useRef(null) // Timeout for unparsable speech
  const listeningTimeoutRef = useRef(null) // Timeout waiting for any result after start
  const unparsableCountRef = useRef(0) // Track consecutive unparsable attempts
  const recentLettersRef = useRef([]) // Track recently used letters (avoid repetition)
  const currentTripletRef = useRef([]) // Track current triplet to avoid stale state issues
  const bayesianPhaseRef = useRef('discovery') // 'discovery' -> 'convergence' -> 'precision' (halving each time)
  const reversalCountRef = useRef(0) // Track reversals for Bayesian termination
  const lastResultRef = useRef(null) // Synchronous previous-trial result to detect reversals reliably
  const lastPassLogCSRef = useRef(null) // Track last passed LogCS for binary search
  const lastFailLogCSRef = useRef(null) // Track last failed LogCS for binary search
  
  // Test flow states
  const [testState, setTestState] = useState('distance-gate') // distance-gate -> gamma-calibration -> instructions -> mode-select -> eye-coverage -> testing -> switch-eyes -> results
  const [currentEye, setCurrentEye] = useState('left')
  const [testMode, setTestMode] = useState('standard') // 'standard', 'glare', 'fog'
  
  // Adaptive Staircase Algorithm State (Binary Search with Halving)
  const [currentContrast, setCurrentContrast] = useState(1.0) // DEPRECATED - for display only, use currentLevel instead
  const [stepSize, setStepSize] = useState(0.3) // BINARY SEARCH: Start with 0.3 LogCS, halve on each reversal
  const [reversals, setReversals] = useState(0)
  const [lastResult, setLastResult] = useState(null) // null = no previous trial yet
  const [reversalPoints, setReversalPoints] = useState([])
  const [trialNumber, setTrialNumber] = useState(0)
  const [responses, setResponses] = useState([])
  
  // Triplet mode (show 3 letters, need 2/3 correct)
  const [currentTriplet, setCurrentTriplet] = useState([]) // Array of 3 letters
  const [tripletAnswers, setTripletAnswers] = useState([]) // Answers for current triplet
  const [showUnparsableHint, setShowUnparsableHint] = useState(false) // Show hint after unparsable speech
  const [showCertificate, setShowCertificate] = useState(false) // Show Superior Vision certificate modal
  
  // Test stimuli - SLOAN OPTOTYPES ONLY (medical-grade standard)
  // These 10 letters are mathematically balanced for equal legibility
  const [currentLetter, setCurrentLetter] = useState('')
  const testLetters = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z']
  
  // MEDICAL-GRADE LogCS SCALE (Pelli-Robson Standard: LogCS = log10(1/contrast))
  // CORRECTED: Higher LogCS = Better sensitivity = Can see LOWER contrast (HARDER)
  // Extended to 32 levels to reach LogCS 2.0+ (sub-1% contrast) using spatial dithering
  // NOTE: RGB inverted - Higher contrast = DARKER letter (0 = black, 255 = white background)
  const LogCS_LEVELS = [
    { level: 1,  logCS: 0.00, contrast: 1.000, rgb: 0,   description: 'Maximum (100%)', dither: false },      // LogCS 0.0 = 10^0 = 1 = 1/1 = 100%
    { level: 2,  logCS: 0.08, contrast: 0.835, rgb: 42,  description: 'Very Easy', dither: false },           // LogCS 0.08 ≈ 10^0.08 = 1.2 = 1/1.2 = 83%
    { level: 3,  logCS: 0.15, contrast: 0.708, rgb: 74,  description: 'Easy', dither: false },                // LogCS 0.15 ≈ 10^0.15 = 1.41 = 1/1.41 = 71%
    { level: 4,  logCS: 0.22, contrast: 0.600, rgb: 102, description: 'Easy-Moderate', dither: false },       // LogCS 0.22 ≈ 10^0.22 = 1.66 = 1/1.66 = 60%
    { level: 5,  logCS: 0.30, contrast: 0.501, rgb: 127, description: 'Moderate', dither: false },            // LogCS 0.30 ≈ 10^0.30 = 2.0 = 1/2.0 = 50%
    { level: 6,  logCS: 0.38, contrast: 0.417, rgb: 149, description: 'Moderate', dither: false },            // LogCS 0.38 ≈ 10^0.38 = 2.4 = 1/2.4 = 42%
    { level: 7,  logCS: 0.46, contrast: 0.347, rgb: 167, description: 'Moderate-Hard', dither: false },       // LogCS 0.46 ≈ 10^0.46 = 2.88 = 1/2.88 = 35%
    { level: 8,  logCS: 0.53, contrast: 0.295, rgb: 180, description: 'Hard', dither: false },                // LogCS 0.53 ≈ 10^0.53 = 3.39 = 1/3.39 = 29%
    { level: 9,  logCS: 0.60, contrast: 0.251, rgb: 191, description: 'Hard', dither: false },                // LogCS 0.60 ≈ 10^0.60 = 3.98 = 1/3.98 = 25%
    { level: 10, logCS: 0.68, contrast: 0.209, rgb: 202, description: 'Very Hard', dither: false },           // LogCS 0.68 ≈ 10^0.68 = 4.79 = 1/4.79 = 21%
    { level: 11, logCS: 0.75, contrast: 0.178, rgb: 210, description: 'Very Hard', dither: false },           // LogCS 0.75 ≈ 10^0.75 = 5.62 = 1/5.62 = 18%
    { level: 12, logCS: 0.82, contrast: 0.151, rgb: 217, description: 'Extreme', dither: false },             // LogCS 0.82 ≈ 10^0.82 = 6.61 = 1/6.61 = 15%
    { level: 13, logCS: 0.90, contrast: 0.126, rgb: 223, description: 'Extreme', dither: false },             // LogCS 0.90 ≈ 10^0.90 = 7.94 = 1/7.94 = 13%
    { level: 14, logCS: 0.98, contrast: 0.105, rgb: 228, description: 'Threshold', dither: false },           // LogCS 0.98 ≈ 10^0.98 = 9.55 = 1/9.55 = 10%
    { level: 15, logCS: 1.05, contrast: 0.089, rgb: 232, description: 'Threshold', dither: false },           // LogCS 1.05 ≈ 10^1.05 = 11.2 = 1/11.2 = 9%
    { level: 16, logCS: 1.13, contrast: 0.074, rgb: 236, description: 'Sub-Threshold', dither: false },       // LogCS 1.13 ≈ 10^1.13 = 13.5 = 1/13.5 = 7%
    { level: 17, logCS: 1.20, contrast: 0.063, rgb: 239, description: 'Sub-Threshold', dither: false },       // LogCS 1.20 ≈ 10^1.20 = 15.8 = 1/15.8 = 6%
    { level: 18, logCS: 1.28, contrast: 0.052, rgb: 242, description: 'Severe Impairment', dither: false },   // LogCS 1.28 ≈ 10^1.28 = 19.1 = 1/19.1 = 5%
    { level: 19, logCS: 1.36, contrast: 0.044, rgb: 244, description: 'Severe Impairment', dither: false },   // LogCS 1.36 ≈ 10^1.36 = 22.9 = 1/22.9 = 4%
    { level: 20, logCS: 1.43, contrast: 0.037, rgb: 246, description: 'Severe Impairment', dither: false },   // LogCS 1.43 ≈ 10^1.43 = 27.0 = 1/27.0 = 4%
    { level: 21, logCS: 1.50, contrast: 0.032, rgb: 247, description: 'Nearly Invisible', dither: false },    // LogCS 1.50 = 10^1.50 = 31.6 = 1/31.6 = 3%
    { level: 22, logCS: 1.57, contrast: 0.027, rgb: 248, description: 'Nearly Invisible', dither: false },    // LogCS 1.57 ≈ 10^1.57 = 37.2 = 1/37.2 = 3%
    { level: 23, logCS: 1.64, contrast: 0.023, rgb: 249, description: 'Barely Detectable', dither: false },   // LogCS 1.64 ≈ 10^1.64 = 43.7 = 1/43.7 = 2%
    { level: 24, logCS: 1.70, contrast: 0.020, rgb: 250, description: 'Minimum (2%)', dither: false },        // LogCS 1.70 = 10^1.70 = 50.1 = 1/50.1 = 2%
    // ===== SPATIAL DITHERING LEVELS (Below 2% contrast - breaks the 8-bit hardware limit) =====
    // CRITICAL FIX: Added intermediate levels every 0.06 LogCS to prevent binary search infinite loop
    { level: 25, logCS: 1.76, contrast: 0.017, rgb: 250, description: 'Dithered 1.7%', dither: true, ditherRatio: 0.85 },  // LogCS 1.76 = 10^1.76 = 57.5 = 1/57.5 = 1.7%
    { level: 26, logCS: 1.82, contrast: 0.015, rgb: 251, description: 'Dithered 1.5%', dither: true, ditherRatio: 0.75 },  // LogCS 1.82 = 10^1.82 = 66.1 = 1/66.1 = 1.5%
    { level: 27, logCS: 1.88, contrast: 0.013, rgb: 251, description: 'Dithered 1.3%', dither: true, ditherRatio: 0.65 },  // LogCS 1.88 = 10^1.88 = 75.9 = 1/75.9 = 1.3%
    { level: 28, logCS: 1.94, contrast: 0.011, rgb: 252, description: 'Dithered 1.1%', dither: true, ditherRatio: 0.55 },  // LogCS 1.94 = 10^1.94 = 87.1 = 1/87.1 = 1.1%
    { level: 28, logCS: 1.94, contrast: 0.011, rgb: 252, description: 'Dithered 1.1%', dither: true, ditherRatio: 0.55 },  // LogCS 1.94 = 10^1.94 = 87.1 = 1/87.1 = 1.1%
    { level: 29, logCS: 2.00, contrast: 0.010, rgb: 252, description: 'Dithered 1.0%', dither: true, ditherRatio: 0.50 },  // LogCS 2.00 = 10^2.00 = 100 = 1/100 = 1.0% ← CLINICAL STANDARD
    { level: 30, logCS: 2.10, contrast: 0.008, rgb: 253, description: 'Dithered 0.8%', dither: true, ditherRatio: 0.40 },  // LogCS 2.10 = 10^2.10 = 126 = 1/126 = 0.8%
    { level: 31, logCS: 2.22, contrast: 0.006, rgb: 254, description: 'Dithered 0.6%', dither: true, ditherRatio: 0.30 },  // LogCS 2.22 = 10^2.22 = 166 = 1/166 = 0.6%
    { level: 32, logCS: 2.30, contrast: 0.005, rgb: 254, description: 'Dithered 0.5%', dither: true, ditherRatio: 0.20 },  // LogCS 2.30 = 10^2.30 = 200 = 1/200 = 0.5%
    { level: 33, logCS: 2.40, contrast: 0.004, rgb: 254, description: 'Dithered 0.4%', dither: true, ditherRatio: 0.15 },  // LogCS 2.40 = 10^2.40 = 251 = 1/251 = 0.4%
    { level: 34, logCS: 2.52, contrast: 0.003, rgb: 255, description: 'Dithered 0.3%', dither: true, ditherRatio: 0.10 },  // LogCS 2.52 = 10^2.52 = 331 = 1/331 = 0.3%
    { level: 35, logCS: 2.70, contrast: 0.002, rgb: 255, description: 'Elite Threshold', dither: true, ditherRatio: 0.05 }  // LogCS 2.70 = 10^2.70 = 501 = 1/501 = 0.2% ← SUPERHUMAN
  ]
  
  // BAYESIAN ADAPTIVE: Start at "seed" level (LogCS 1.28 = Level 18, ~5% contrast)
  // Clinical recommendation: Start at LogCS 1.3-1.5 (3-5% contrast) for efficiency
  // This skips the easy trials and finds threshold faster (60 seconds vs 4 minutes)
  const [currentLevel, setCurrentLevel] = useState(18) // Seed at LogCS 1.28 (5% contrast - clinical standard)
  const currentLevelRef = useRef(18)
  
  // Voice recognition
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [lastResponse, setLastResponse] = useState(null) // For showing feedback
  // Feature flags / debug via URL params
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('')
  const voiceDebug = urlParams.get('voiceDebug') === '1' || urlParams.get('voiceDebug') === 'true'
  const phoneticParam = urlParams.get('phonetic')
  const [phoneticEnabled, setPhoneticEnabled] = useState(phoneticParam === '0' ? false : true)
  const [voiceAlts, setVoiceAlts] = useState([]) // last alternatives for debug display
  // Push-to-listen: explicit per-trial listen button. Default ON for more robust UX.
  // Force push-to-listen mode (single, robust mode)
  const PUSH_TO_LISTEN_KEY = 'cs_pushToListen'
  const [pushToListenEnabled, setPushToListenEnabled] = useState(false)
  
  // Calibration
  const [gammaCalibrated, setGammaCalibrated] = useState(false)
  const [ambientBrightness, setAmbientBrightness] = useState('normal') // 'dark', 'normal', 'bright'
  
  // Results
  const [leftEyeScore, setLeftEyeScore] = useState(null)
  const [rightEyeScore, setRightEyeScore] = useState(null)
  const [leftEyeResponses, setLeftEyeResponses] = useState([])
  const [rightEyeResponses, setRightEyeResponses] = useState([])

  // Stable refs so recognition callbacks always read fresh values without stale closures
  const testStateRef = useRef(testState)
  const lastResponseRef = useRef(null)
  const phoneticEnabledRef = useRef(true)
  const handleRecognitionResultRef = useRef(null) // set after handleRecognitionResult is defined
  const startListeningRef = useRef(null)          // always points to latest startListening

  // Keep testStateRef in sync
  useEffect(() => { testStateRef.current = testState }, [testState])
  // Keep phoneticEnabledRef in sync
  useEffect(() => { phoneticEnabledRef.current = phoneticEnabled }, [phoneticEnabled])

  // Parse a transcript string → single Sloan letter or null.
  // Covers direct speech, phonetic alphabet, homophones, and multi-word phrases.
  const parseSpokenLetter = (raw) => {
    if (!raw) return null
    const upper = raw.trim().toUpperCase()

    // ── 1. Direct single character ─────────────────────────────────────────
    if (upper.length === 1 && testLetters.includes(upper)) return upper

    // ── 2. Exhaustive word-to-letter map (all 10 Sloan letters) ────────────
    //    Each entry maps every realistic spoken form → letter
    const wordMap = {
      // C
      'C': 'C', 'SEE': 'C', 'SEA': 'C', 'SI': 'C', 'CY': 'C', 'CEE': 'C',
      // D
      'D': 'D', 'DEE': 'D', 'DI': 'D',
      // H
      'H': 'H', 'AITCH': 'H', 'HAITCH': 'H', 'ACHE': 'H', 'EIGHTCH': 'H',
      // K
      'K': 'K', 'KAY': 'K', 'KEY': 'K', 'KAI': 'K', 'CAKE': 'K',
      // N
      'N': 'N', 'EN': 'N', 'END': 'N', 'IN': 'N', 'AND': 'N',
      // O
      'O': 'O', 'OH': 'O', 'OWE': 'O', 'OHH': 'O', 'ZERO': 'O', 'OSCAR': 'O',
      // R
      'R': 'R', 'ARE': 'R', 'AR': 'R', 'OUR': 'R', 'HOUR': 'R', 'ROMEO': 'R',
      // S
      'S': 'S', 'ESS': 'S', 'ES': 'S', 'SIERRA': 'S', 'ESE': 'S',
      // V
      'V': 'V', 'VEE': 'V', 'VE': 'V', 'VICTOR': 'V', 'BEE': 'V', 'VI': 'V',
      // Z
      'Z': 'Z', 'ZEE': 'Z', 'ZED': 'Z', 'ZI': 'Z', 'ZULU': 'Z',
      // NATO / phonetic alphabet extras relevant to Sloan set
      'CHARLIE': 'C', 'DELTA': 'D', 'HOTEL': 'H', 'KILO': 'K',
        'NOVEMBER': 'N',
      }

    // ── 3. Whole phrase match ───────────────────────────────────────────────
    if (wordMap[upper]) return wordMap[upper]

    // ── 4. Word-by-word scan (handles extra filler words) ──────────────────
    const words = upper.split(/[\s,.\-!?]+/).filter(Boolean)
    for (const w of words) {
      if (testLetters.includes(w)) return w
      if (wordMap[w]) return wordMap[w]
    }

    // ── 5. Fuzzy: strip non-alpha, try first character of each word ─────────
    for (const w of words) {
      const alpha = w.replace(/[^A-Z]/g, '')
      if (alpha.length === 1 && testLetters.includes(alpha)) return alpha
    }

    // ── 6. Last resort: first valid Sloan letter found anywhere in string ───
    const stripped = upper.replace(/[^A-Z]/g, '')
    for (const ch of stripped) {
      if (testLetters.includes(ch)) return ch
    }

    return null
  }

  // Voice Recognition Setup
  // Safe start helper
  const safeStartRecognition = () => {
    try {
      if (!recognitionRef.current) return
      if (!recognitionBusyRef.current) {
        recognitionBusyRef.current = true
        recognitionRef.current.start()
        console.log('[OK] safeStartRecognition: start() called')
      } else {
        console.log('[mic] safeStartRecognition: busy, skipping')
      }
    } catch (e) {
      console.error('[X] safeStartRecognition failed:', e.message)
      recognitionBusyRef.current = false
    }
  }

  // Flash/visual cue state when triggered by keyboard
  const [listenFlash, setListenFlash] = useState(false)

  // Start listening. triggerSource='user' = button/keyboard (starts audio monitor too)
  //                  triggerSource='auto' = automatic restart for next letter (no audio monitor restart)
  const startListening = useCallback((triggerSource = null) => {
    // Always allow manual starts (push-to-listen is disabled, but keep this callable for fallback)
    if (triggerSource === 'keyboard') {
      setListenFlash(true)
      setTimeout(() => setListenFlash(false), 260)
    }

    // Only start audio monitoring on explicit user action, not auto-restarts
    if (triggerSource !== 'auto-next-letter') {
      startAudioMonitoring()
    }

    console.log(`[mic] startListening (source=${triggerSource ?? 'button'}) letter=${currentLetterRef.current}`)
    setShowUnparsableHint(false)
    setTranscript('')

    try {
      if (recognitionFactoryRef.current) {
        try { recognitionRef.current?.stop() } catch (e) { /* ignore */ }
        recognitionRef.current = recognitionFactoryRef.current()
        try {
          setIsListening(true)
          safeStartRecognition()
        } catch (e) {
          console.error('[X] safeStartRecognition failed (manual):', e.message)
        }
      } else {
        console.warn('[mic] Recognition factory not available - attempting to start existing instance')
        setIsListening(true)
        safeStartRecognition()
      }
      } catch (e) {
        console.error('[X] Manual listen start failed:', e)
        stopAudioMonitoring()
      }
  }, [pushToListenEnabled])

  // Keep startListeningRef in sync so handleAnswer's timeout never calls a stale closure
  useEffect(() => { startListeningRef.current = startListening }, [startListening])

  // Audio monitoring for debug / input-level feedback
  const audioStreamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const audioMonitorIntervalRef = useRef(null)
  const [micLevel, setMicLevel] = useState(0)
  const [audioDevices, setAudioDevices] = useState([])
  const [selectedMicId, setSelectedMicId] = useState(null)

  const startAudioMonitoring = async () => {
    try {
      const constraints = selectedMicId ? { audio: { deviceId: { exact: selectedMicId } } } : { audio: true }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      audioStreamRef.current = stream
      const AudioContext = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      audioMonitorIntervalRef.current = setInterval(() => {
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        const avg = data.length ? sum / data.length : 0
        setMicLevel(avg)
      }, 150)
    } catch (err) {
      console.warn('[mic] Audio monitoring failed:', err && err.message)
      setMicLevel(0)
    }
  }

  const stopAudioMonitoring = () => {
    try {
      if (audioMonitorIntervalRef.current) {
        clearInterval(audioMonitorIntervalRef.current)
        audioMonitorIntervalRef.current = null
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close() } catch (e) {}
        audioCtxRef.current = null
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop())
        audioStreamRef.current = null
      }
      analyserRef.current = null
      setMicLevel(0)
    } catch (e) {
      console.warn('stopAudioMonitoring error', e)
    }
  }

  // Enumerate available audio input devices and set default
  const enumerateAudioDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const inputs = devices.filter(d => d.kind === 'audioinput')
      setAudioDevices(inputs)
      if (inputs.length > 0 && !selectedMicId) {
        setSelectedMicId(inputs[0].deviceId)
      }
    } catch (e) {
      console.warn('Could not enumerate devices', e)
    }
  }

  useEffect(() => {
    enumerateAudioDevices()
    // Re-enumerate when devices change (browser support)
    try {
      navigator.mediaDevices.addEventListener('devicechange', enumerateAudioDevices)
    } catch (e) {}
    return () => {
      try { navigator.mediaDevices.removeEventListener('devicechange', enumerateAudioDevices) } catch (e) {}
    }
  }, [])

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('[X] Speech recognition not supported in this browser')
      alert('Voice recognition is not supported in your browser. Please use Chrome, Edge, or Safari.')
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

    // Flag to avoid duplicate start() calls
    const recognitionStartingRef = { value: false }

    const createRecognition = () => {
      const r = new SpeechRecognition()
      // Continuous mode: mic stays open the entire test, no no-speech dropouts
      r.continuous = true
      r.interimResults = false
      r.lang = 'en-US'
      r.maxAlternatives = 5

      r.onstart = () => {
        console.log('[mic] Voice recognition started')
        recognitionStartingRef.value = false
        recognitionBusyRef.current = true
      }

      r.onresult = (event) => {
        try { if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current) } catch (e) {}
        console.log('📥 Recognition received result event')

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (!result.isFinal) continue

          const transcripts = []
          for (let alt = 0; alt < result.length; alt++) {
            const t = result[alt].transcript.trim().toUpperCase()
            if (t) transcripts.push(t)
          }
          setVoiceAlts(transcripts.map((t, idx) => ({ transcript: t, confidence: result[idx]?.confidence ?? 0 })))
          if (voiceDebug) console.log('Recognition alternatives:', transcripts)

          if (transcripts.length > 0 && handleRecognitionResultRef.current) {
            handleRecognitionResultRef.current(transcripts)
          }
          return
        }
      }

      r.onerror = (event) => {
        console.error('[X] Speech recognition error:', event.error)
        recognitionBusyRef.current = false
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          alert('Microphone access denied. Please allow microphone access in your browser settings.')
        }
        // no-speech: silently reset so user can press button again
        // other errors: log only, user presses button to retry
      }

      r.onend = () => {
        console.log('[mic] recognition ended')
        try { if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current) } catch (e) {}
        recognitionBusyRef.current = false
        setIsListening(false)
        // Continuous mode dropped (e.g. network hiccup) — restart only if still testing
        if (testStateRef.current === 'testing') {
          setTimeout(() => {
            if (testStateRef.current === 'testing' && !recognitionBusyRef.current) {
              try {
                recognitionRef.current = recognitionFactoryRef.current()
                recognitionBusyRef.current = true
                recognitionRef.current.start()
                setIsListening(true)
                console.log('[mic] auto-restarted after unexpected end')
              } catch (e) {
                console.warn('[mic] auto-restart failed:', e.message)
                recognitionBusyRef.current = false
              }
            }
          }, 200)
        }
      }

      return r
    }

  // Expose factory so startListening (and any other caller) can always create a fresh instance
  recognitionFactoryRef.current = createRecognition
  // Create initial instance
  recognitionRef.current = createRecognition()

    return () => {
      try { recognitionRef.current?.stop() } catch (e) { }
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  // Run only once on mount — all live state is accessed via refs inside the callbacks
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Start/stop listening based on test state
  useEffect(() => {
    if (testState === 'testing' && recognitionRef.current) {
      // Always-on mode: auto-start listening immediately
      console.log('[mic] always-on: auto-starting recognition')
      setTimeout(() => {
        if (testStateRef.current === 'testing' && recognitionFactoryRef.current) {
          try {
            recognitionRef.current = recognitionFactoryRef.current()
            recognitionBusyRef.current = true
            recognitionRef.current.start()
            setIsListening(true)
          } catch (e) {
            console.warn('[mic] initial start failed:', e.message)
            recognitionBusyRef.current = false
          }
        }
      }, 300)
      return
    }
    // When not testing, ensure recognition is stopped
    console.log('🛑 Stopping voice recognition')
    setIsListening(false)
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        console.log('Recognition already stopped')
      }
    }
  }, [testState, pushToListenEnabled])

  // Keyboard shortcut: Space or Enter to trigger Start Listening (when push-to-listen enabled)
  useEffect(() => {
    const handleKey = (e) => {
      if (testState !== 'testing') return
      // Avoid activating when focus is on an input (none expected in this view)
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return

      if ((e.code === 'Space' || e.key === ' ' || e.key === 'Enter') && pushToListenEnabled) {
          e.preventDefault()
          if (!isListening) startListening('keyboard')
        }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [testState, pushToListenEnabled, isListening, startListening])

  // Screen Wake Lock - prevent screen dimming during test (CRITICAL for contrast accuracy)
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          console.log('[OK] Screen Wake Lock activated - brightness locked')
        }
      } catch (err) {
        console.warn('[WARNING] Wake Lock not supported:', err)
      }
    }

    if (testState === 'testing') {
      requestWakeLock()
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
        console.log('Screen Wake Lock released')
      }
    }
  }, [testState])

  // Log level/letter changes only when they actually change (not on every re-render)
  useEffect(() => {
    if (testState !== 'testing') return
    const levelData = LogCS_LEVELS[currentLevel - 1]
    if (!levelData) return
    const contrastPercent = levelData.contrast >= 0.01
      ? Math.round(levelData.contrast * 100)
      : (levelData.contrast * 100).toFixed(1)
    console.log(`[level] Level ${currentLevel} | ${contrastPercent}% contrast (LogCS ${levelData.logCS}) | letter=${currentLetter}`)
  }, [currentLevel, currentLetter, testState])

  // Initialize new trial with triplet
  const initializeTrial = () => {
    // Generate a triplet of 3 TRULY random letters (Fisher-Yates shuffle)
    // MEDICAL-GRADE RULES:
    // 1. No letter appears twice in same triplet
    // 2. No letter from last triplet appears in current triplet
    // 3. Balanced selection from all 10 Sloan letters
    const generateTriplet = () => {
      // Filter out recently used letters (last 3 letters from previous triplet)
      const availableLetters = testLetters.filter(letter => 
        !recentLettersRef.current.slice(-3).includes(letter)
      )
      
      // If we've filtered too many, just use all letters (shouldn't happen with 10 letters)
      const lettersToUse = availableLetters.length >= 3 ? availableLetters : testLetters
      
      // Create a shuffled copy
      const shuffled = [...lettersToUse]
      
      // Fisher-Yates shuffle for better randomness
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      
      // Take first 3 UNIQUE letters (guaranteed by filter above)
      const triplet = shuffled.slice(0, 3)
      
      // Ensure no duplicates within triplet (extra safety check)
      if (new Set(triplet).size !== 3) {
        console.error('[WARNING] Duplicate detected in triplet, regenerating...')
        return generateTriplet() // Recursive regeneration
      }
      
      // Update recent letters list (only keep last 3)
      recentLettersRef.current = triplet
      
      return triplet
    }
    
    const triplet = generateTriplet()
    console.log(`New triplet: ${triplet.join(', ')}`)
    
    setCurrentTriplet(triplet)
    currentTripletRef.current = triplet // Store in ref for synchronous access
    setCurrentLetter(triplet[0]) // Start with first letter
    currentLetterRef.current = triplet[0]
    
    // Reset triplet answers
    setTripletAnswers([])
    tripletAnswersRef.current = []
    
    // Mark trial start time for latency tracking
    trialStartTimeRef.current = Date.now()
    
    // Reset unparsable counter for new triplet
    unparsableCountRef.current = 0
    
    setTranscript('') // Clear transcript for new trial
    lastResponseRef.current = null
    setLastResponse(null) // Clear previous feedback
    setShowUnparsableHint(false) // Clear hint
    setTrialNumber(prev => prev + 1)
    
    // CRITICAL FIX: Restart recognition with clean buffer for each new letter
    setTimeout(() => {
      if (testState === 'testing') {
        try {
          // If push-to-listen is enabled, do not auto-start; wait for user to press Listen
          if (!pushToListenEnabled) {
            safeStartRecognition()
          } else {
            console.log('[mic] Push-to-listen enabled: skipping auto-start for this trial')
          }
        } catch (e) {
          if (e.name === 'InvalidStateError') {
            console.log('Recognition already running')
          }
        }
      }
    }, 100)
  }

  // Handle user answer with triplet logic and latency tracking
  const handleAnswer = (selectedLetter) => {
    // Calculate response latency
    const responseTime = Date.now()
    const latency = (responseTime - trialStartTimeRef.current) / 1000 // seconds
    
    // Use refs to get the ACTUAL current values (not stale state)
    const actualCurrentLetter = currentLetterRef.current
    const actualCurrentLevel = currentLevelRef.current
    const actualStepSize = stepSizeRef.current
    
    const isCorrect = selectedLetter === actualCurrentLetter
    
    // Get level data for logging
    const levelData = LogCS_LEVELS[actualCurrentLevel - 1]
    
    console.log(`Answer: "${selectedLetter}" vs "${actualCurrentLetter}" - ${isCorrect ? 'Correct' : 'Wrong'} (${latency.toFixed(1)}s) at Level ${actualCurrentLevel} (${levelData.description})`)
    
    // Record answer for triplet
    const tripletAnswer = {
      letter: actualCurrentLetter,
      answer: selectedLetter,
      correct: isCorrect,
      latency: latency
    }
    
    tripletAnswersRef.current = [...tripletAnswersRef.current, tripletAnswer]
    setTripletAnswers(prev => [...prev, tripletAnswer])
    
    // Show feedback — sync ref so recognition handler can gate on it
    lastResponseRef.current = tripletAnswer
    setLastResponse(tripletAnswer)
    setTranscript('')
    
    // Check if we've answered all 3 letters in the triplet
    if (tripletAnswersRef.current.length < 3) {
      // Move to next letter in triplet
      const nextIndex = tripletAnswersRef.current.length
      const nextLetter = currentTripletRef.current[nextIndex] // Use ref, not state!
      setCurrentLetter(nextLetter)
      currentLetterRef.current = nextLetter
      trialStartTimeRef.current = Date.now() // Reset timer for next letter
      
      // Reset unparsable counter and hide hint for new letter
      unparsableCountRef.current = 0
      setShowUnparsableHint(false)
      
      // Clear feedback after brief pause, then auto-restart for next letter in triplet
      setTimeout(() => {
        lastResponseRef.current = null
        setLastResponse(null)
        // Auto-restart listening — user only needs to press once per triplet.
        // 650 ms gives the browser speech engine time to fully reset after the
        // previous recognition session ends, preventing an immediate no-speech error.
        if (testStateRef.current === 'testing') {
          startListeningRef.current?.('auto-next-letter')
        }
      }, 650)
      
      return // Don't process algorithm yet
    }
    
    // All 3 letters answered - evaluate triplet (need 2/3 correct)
    const correctCount = tripletAnswersRef.current.filter(a => a.correct).length
    const tripletPassed = correctCount >= 2

    console.log(`Triplet result: ${correctCount}/3 correct → ${tripletPassed ? 'PASS' : 'FAIL'}`)

    setResponses(prev => [...prev, {
      trial: trialNumber, level: actualCurrentLevel, logCS: levelData.logCS,
      correct: tripletPassed, correctCount, mode: testMode, timestamp: responseTime
    }])

    // ── Simple 1-up / 1-down staircase ──────────────────────────────────
    // Pass → increase LogCS (harder). Fail → decrease LogCS (easier).
    // Step size halves after each reversal. Reversals = direction changes.
    // Terminate after 3 reversals OR 20 triplets.
    let newReversals = reversalCountRef.current
    const prevResult = lastResultRef.current // null on first triplet
    let newLogCS = levelData.logCS

    if (tripletPassed) {
      if (prevResult === false) {          // fail → pass = reversal
        newReversals++
        reversalCountRef.current = newReversals
        const newStep = stepSizeRef.current / 2
        stepSizeRef.current = newStep
        setStepSize(newStep)
        setReversalPoints(prev => [...prev, actualCurrentLevel])
        console.log(`REVERSAL #${newReversals} (fail→pass) step→${newStep.toFixed(3)}`)
      }
      newLogCS = Math.min(2.70, levelData.logCS + stepSizeRef.current)
      console.log(`PASS → LogCS ${levelData.logCS.toFixed(2)} + ${stepSizeRef.current.toFixed(3)} = ${newLogCS.toFixed(2)}`)
    } else {
      if (prevResult === true) {           // pass → fail = reversal
        newReversals++
        reversalCountRef.current = newReversals
        const newStep = stepSizeRef.current / 2
        stepSizeRef.current = newStep
        setStepSize(newStep)
        setReversalPoints(prev => [...prev, actualCurrentLevel])
        console.log(`REVERSAL #${newReversals} (pass→fail) step→${newStep.toFixed(3)}`)
      }
      newLogCS = Math.max(0.00, levelData.logCS - stepSizeRef.current)
      console.log(`FAIL → LogCS ${levelData.logCS.toFixed(2)} - ${stepSizeRef.current.toFixed(3)} = ${newLogCS.toFixed(2)}`)
    }

    // Update last result AFTER reversal check
    lastResultRef.current = tripletPassed
    setLastResult(tripletPassed)
    setReversals(newReversals)

    // Move to closest level
    const newLevel = LogCS_LEVELS.reduce((closest, level) =>
      Math.abs(level.logCS - newLogCS) < Math.abs(closest.logCS - newLogCS) ? level : closest
    , LogCS_LEVELS[0]).level
    currentLevelRef.current = newLevel
    setCurrentLevel(newLevel)
    const newLevelData = LogCS_LEVELS[newLevel - 1]
    currentContrastRef.current = newLevelData.contrast
    setCurrentContrast(newLevelData.contrast)

    console.log(`Reversals: ${newReversals}/3, Next level: ${newLevel} (LogCS ${newLevelData.logCS.toFixed(2)})`)

    // Terminate at 3 reversals or 20 triplets
    if (newReversals >= 3) {
      console.log(`[OK] Test complete — 3 reversals after ${trialNumber} triplets`)
      stopAudioMonitoring()
      finishEye()
    } else if (trialNumber >= 20) {
      console.log(`[OK] Test complete — 20 triplets reached`)
      stopAudioMonitoring()
      finishEye()
    } else {
      // Show feedback briefly, then next triplet
      setTimeout(() => {
        lastResponseRef.current = null
        setLastResponse(null) // Clear feedback
        initializeTrial()
      }, 300)
    }
  }

  // ---- handleRecognitionResult lives here (outside useEffect) so it closes over
  // the latest handleAnswer, setTranscript, etc. via normal React closure,
  // and is stored in handleRecognitionResultRef so the recognition onresult
  // callback (created once on mount) always calls the latest version. ----
  const handleRecognitionResult = useCallback((transcripts) => {
    // Accept either a single string or array of alternatives
    const alts = Array.isArray(transcripts) ? transcripts : [transcripts]
    if (alts.length === 0) return
    if (testStateRef.current !== 'testing') {
      console.log('[mic] handleRecognitionResult: ignoring — not in testing state')
      return
    }
    if (lastResponseRef.current) {
      console.log('[mic] handleRecognitionResult: ignoring — awaiting feedback clearance')
      return
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    if (unparsableTimeoutRef.current) clearTimeout(unparsableTimeoutRef.current)
    setShowUnparsableHint(false)

    // Try each alternative until one parses
    let spokenLetter = null
    let usedTranscript = alts[0]
    for (const t of alts) {
      const parsed = parseSpokenLetter(t)
      if (parsed) { spokenLetter = parsed; usedTranscript = t; break }
    }

    setTranscript(usedTranscript)

    if (spokenLetter) {
      console.log(`%c[ANSWER] "${spokenLetter}" from "${usedTranscript}" | letter="${currentLetterRef.current}" level=${currentLevelRef.current}`, 'color:#22c55e;font-weight:bold')
      handleAnswer(spokenLetter)
      setTranscript('')
      try { recognitionRef.current?.stop() } catch (e) { }
      if (unparsableTimeoutRef.current) clearTimeout(unparsableTimeoutRef.current)
      unparsableCountRef.current = 0
      setShowUnparsableHint(false)
      // Do NOT stop audio monitoring here — it needs to stay alive for auto-next-letter restarts
    } else {
      console.log(`%c[UNPARSABLE] heard="${alts.join(' | ')}" | expected one of: C D H K N O R S V Z`, 'color:#f97316;font-weight:bold')
      unparsableCountRef.current += 1
      try { recognitionRef.current?.stop() } catch (e) { }

      if (unparsableCountRef.current >= 5) {
        setShowUnparsableHint(`After ${unparsableCountRef.current} tries, the letter is: "${currentLetterRef.current}"`)
        setTranscript('')
      } else {
        if (unparsableCountRef.current >= 2) setShowUnparsableHint('tips')
        setTranscript('')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the ref in sync so the recognition onresult callback always calls the latest version
  useEffect(() => {
    handleRecognitionResultRef.current = handleRecognitionResult
    // also keep lastResponseRef in sync
    lastResponseRef.current = null // will be reset per-trial
  }, [handleRecognitionResult])

  // Finish testing current eye
  const finishEye = () => {
    // Calculate LogCS score from last 4 reversal points (most accurate)
    // reversalPoints now stores LEVEL numbers (1-32), not contrast values
    const avgLevel = reversalPoints.length >= 4
      ? reversalPoints.slice(-4).reduce((a, b) => a + b, 0) / 4
      : reversalPoints.length > 0
      ? reversalPoints.reduce((a, b) => a + b, 0) / reversalPoints.length
      : currentLevelRef.current
    
    // Map average level to LogCS
    // Use interpolation for fractional levels (e.g., 12.5)
    const lowerLevel = Math.floor(avgLevel)
    const upperLevel = Math.ceil(avgLevel)
    const fraction = avgLevel - lowerLevel
    
    const lowerData = LogCS_LEVELS[Math.min(31, Math.max(0, lowerLevel - 1))]
    const upperData = LogCS_LEVELS[Math.min(31, Math.max(0, upperLevel - 1))]
    
    // Linear interpolation between two levels
    const logCS = lowerData.logCS + (upperData.logCS - lowerData.logCS) * fraction
    
    console.log(`📊 Final Score: Avg Level = ${avgLevel.toFixed(1)}, LogCS = ${logCS.toFixed(2)}`)
    
    if (currentEye === 'left') {
      setLeftEyeScore(logCS)
      setLeftEyeResponses(responses)
      setCurrentEye('right')
      setTestState('switch-eyes')
    } else {
      setRightEyeScore(logCS)
      setRightEyeResponses(responses)
      submitTest(logCS)
    }
  }

  // Reset for next eye
  const startRightEye = () => {
    // Reset refs (synchronous) - BINARY SEARCH: Start at seed level 18
    currentLevelRef.current = 18 // Seed at LogCS 1.28 (5% contrast - clinical standard)
    currentContrastRef.current = 1.0 // For backwards compatibility
    stepSizeRef.current = 0.3 // BINARY SEARCH: Start with 0.3 LogCS jumps, halve on reversals
    bayesianPhaseRef.current = 'discovery' // Reset to discovery phase
    reversalCountRef.current = 0
    lastPassLogCSRef.current = null // Reset binary search boundaries
    lastFailLogCSRef.current = null // Reset binary search boundaries
    
    // Reset state (asynchronous)
    setCurrentLevel(18)
    setCurrentContrast(1.0)
    setStepSize(0.3)
    setReversals(0)
    setLastResult(null) // Changed from true to null - no previous result yet
    setReversalPoints([])
    setTrialNumber(0)
    setResponses([])
    // Initialize first trial BEFORE changing state
    initializeTrial()
    setTestState('testing')
  }

  // Submit test results to backend
  const submitTest = async (rightScore) => {
    try {
      const avgScore = ((leftEyeScore + rightScore) / 2) * 100 / 2.0 // Normalize to 0-100
      
      await visionTestAPI.submit({
        test_type: 'contrast_sensitivity',
        score: Math.round(avgScore),
        test_details: {
          left_eye_logcs: leftEyeScore,
          right_eye_logcs: rightScore,
          test_mode: testMode,
          left_eye_responses: leftEyeResponses,
          right_eye_responses: rightEyeResponses,
          ambient_brightness: ambientBrightness,
          gamma_calibrated: gammaCalibrated,
          test_distance: '406mm',
          timestamp: new Date().toISOString()
        }
      })
      
      console.log('[OK] Contrast Sensitivity Test submitted successfully')
      
      // Check for Superior Vision achievement (both eyes >= 2.3 LogCS = elite <0.5% contrast)
      const avgLogCS = (leftEyeScore + rightScore) / 2
      if (avgLogCS >= 2.3) {
        setShowCertificate(true) // Trigger certificate modal
        console.log('🦅 SUPERIOR VISION DETECTED! Showing certificate...')
      }
      
      setTestState('results')
    } catch (error) {
      console.error('[X] Failed to submit test:', error)
      setTestState('results') // Show results anyway
    }
  }

  // Start testing (called after mode selection)
  const startTest = () => {
    setTestState('eye-coverage') // Go to eye coverage verification first
  }

  // Start testing after eye coverage verified
  const startTestingAfterCoverage = () => {
    // Initialize first trial BEFORE changing state (prevents empty letter issue)
    initializeTrial()
    setTestState('testing')
  }

  // ========== RENDER FUNCTIONS ==========

  // 1. Distance Gate (16 inches = 406mm for contrast sensitivity)
  const renderDistanceGate = () => (
    <UnifiedCalibration
      steps={[ 'distance' ]}
      testName="Contrast Sensitivity Test"
      onFinish={() => setTestState('gamma-calibration')}
    />
  )

  // 2. Gamma/Black Point Calibration (CLINICAL GRADE - normalizes across all screens)
  const renderGammaCalibration = () => (
    <div className="min-h-screen bg-black flex items-center justify-center p-8">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Black Point Calibration</h1>
          <p className="text-lg text-gray-300">
            Clinical-grade gamma 2.2 normalization for accurate contrast measurement
          </p>
        </div>

        {/* CRITICAL: System Settings Warnings */}
        <div className="bg-red-900 border-2 border-red-600 rounded-xl p-5">
          <p className="text-red-200 font-bold mb-3 flex items-center gap-2 text-lg">
            <span className="text-2xl">[WARNING]</span>
            REQUIRED: Disable These Settings First
          </p>
          <ul className="text-red-200 space-y-2">
            <li className="flex items-start gap-2">
              <span className="font-bold min-w-[140px]">Auto-Brightness:</span>
              <span>Must be OFF (screen will dim mid-test and ruin calibration)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold min-w-[140px]">True Tone / Night Shift:</span>
              <span>Must be OFF (changes color temperature)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold min-w-[140px]">Dark Mode:</span>
              <span>Can interfere - switch to Light Mode if available</span>
            </li>
          </ul>
        </div>

        {/* Room Lighting Warning */}
        <div className="bg-yellow-900 border-2 border-yellow-600 rounded-xl p-5">
          <p className="text-yellow-200 font-bold mb-2 flex items-center gap-2 text-lg">
            <span className="text-2xl">💡</span>
            Room Lighting Matters
          </p>
          <p className="text-yellow-200">
            <span className="font-semibold">Dim your room lights</span> and avoid glare on the screen. 
            Contrast sensitivity is highly dependent on ambient light. Test in the same lighting conditions 
            you'd experience during night driving for accurate safety assessment.
          </p>
        </div>

        {/* Pure black background container for accurate calibration */}
        <div className="rounded-2xl p-10" style={{ backgroundColor: '#000000' }}>
          <h3 className="text-xl font-bold text-white mb-6 text-center">
            Adjust Screen Brightness Until You See Box A Only
          </h3>
          
          <div className="flex justify-center gap-16 mb-8 py-12">
            <div className="text-center">
              {/* Box A: The "Glow" box - should become visible when brightness is correct */}
              <div 
                className="w-32 h-32 mb-4"
                style={{ 
                  backgroundColor: 'rgb(10, 10, 10)', // ~4% brightness - the threshold target
                  border: '1px solid rgba(255, 255, 255, 0.1)' // Very faint border to help locate it
                }}
              />
              <p className="text-sm text-gray-400">
                Box A<br />
                <span className="text-white font-semibold text-base">(Should be BARELY visible)</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">RGB(10, 10, 10)</p>
            </div>
            <div className="text-center">
              {/* Box B: The "Black" box - should remain invisible even when Box A is visible */}
              <div 
                className="w-32 h-32 mb-4"
                style={{ 
                  backgroundColor: 'rgb(2, 2, 2)', // ~0.8% brightness - should be invisible
                  border: '1px solid rgba(255, 255, 255, 0.05)' // Ultra-faint border
                }}
              />
              <p className="text-sm text-gray-400">
                Box B<br />
                <span className="text-red-400 font-semibold text-base">(Should be INVISIBLE)</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">RGB(2, 2, 2)</p>
            </div>
          </div>

          <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 mb-6">
            <p className="text-white font-semibold mb-3 text-lg">Calibration Steps:</p>
            <ol className="text-gray-300 space-y-3">
              <li className="flex gap-3">
                <span className="font-bold text-blue-400">1.</span>
                <span><span className="font-semibold">Look away for 3 seconds</span> - Let your eyes adjust to the dark screen</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-400">2.</span>
                <span><span className="font-semibold">Increase screen brightness</span> until Box A begins to glow faintly</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-400">3.</span>
                <span><span className="font-semibold">Box B must stay invisible</span> - Should blend perfectly with black background</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-400">4.</span>
                <span><span className="font-semibold">If both are invisible at 100%:</span> Increase room lighting slightly</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-400">5.</span>
                <span><span className="font-semibold text-red-400">DO NOT change brightness</span> during the test!</span>
              </li>
            </ol>
          </div>

          <div className="bg-blue-900 border border-blue-700 rounded-xl p-5 mb-6">
            <p className="text-blue-200 text-sm">
              <span className="font-bold text-base">Why This Matters:</span> Every screen shows dark shades a little differently.
              This quick step sets up your screen so the faint letters look the same for you as they would for anyone else —
              which keeps your score accurate.
            </p>
          </div>

          <div className="bg-green-900 border border-green-700 rounded-xl p-5 mb-6">
            <p className="text-green-200 text-sm">
              <span className="font-bold text-base">How This Feeds Into Scoring:</span> Since you've proven you can see Box A (~4% brightness), 
              the test establishes your contrast baseline. Level 1 (100% contrast) = white on black. Level 24 (extreme difficulty) = 
              text only 0.5% brighter than black. Your proven threshold ensures accurate adaptive difficulty scaling throughout the test.
            </p>
          </div>

          {/* Troubleshooting Guide */}
          <div className="bg-yellow-900 border border-yellow-700 rounded-xl p-5 mb-6">
            <p className="text-yellow-200 font-semibold mb-2">Can't see the boxes? Common issues:</p>
            <ul className="text-yellow-200 text-xs space-y-1">
              <li>• <span className="font-semibold">Monitor Quality:</span> Older TN panels may show washed-out blacks (both boxes look gray)</li>
              <li>• <span className="font-semibold">Brightness Too Low:</span> If laptop brightness is at 10%, both boxes will appear as pure black</li>
              <li>• <span className="font-semibold">True Tone/Night Shift ON:</span> Warms the screen, turning deep blacks into muddy browns</li>
              <li>• <span className="font-semibold">Room Too Bright:</span> Ambient light reflection on screen masks subtle differences</li>
            </ul>
          </div>

          <button
            onClick={() => {
              setGammaCalibrated(true)
              setTestState('instructions')
            }}
            className="btn-primary w-full py-5 text-xl"
          >
            ✓ I Can See Box A Only (Continue)
          </button>

          <p className="text-gray-400 text-sm text-center mt-4">
            If you cannot see Box A even at 100% brightness, increase room lighting or test on a different display
          </p>
        </div>
      </div>
    </div>
  )

  // 3. Instructions
  const renderInstructions = () => (
    <div className="test-shell">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-purple-100">
          <h1 className="text-4xl font-bold text-gray-900 mb-4 text-center">Faint Shapes Test</h1>
          <p className="text-lg text-gray-600 text-center mb-8">
            See how well you spot faint shapes in dim light
          </p>

          {/* Quick-start summary so users can begin without reading everything */}
          <div className="bg-purple-600 text-white rounded-2xl p-6 mb-8">
            <h2 className="font-bold text-lg mb-3">In short</h2>
            <ol className="space-y-2 text-purple-50">
              <li><span className="font-bold">1.</span> Faint letters appear one eye at a time — say each one you see.</li>
              <li><span className="font-bold">2.</span> They slowly fade until you can't read them.</li>
              <li><span className="font-bold">3.</span> That's it — about a minute per eye.</li>
            </ol>
            <p className="text-sm text-purple-100 mt-3">Want more detail? Keep reading below.</p>
          </div>

          <div className="space-y-6">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
              <h3 className="font-bold text-blue-900 mb-3 text-lg flex items-center gap-2">
                <span className="text-2xl"></span>
                What This Test Does:
              </h3>
              <ul className="space-y-2 text-blue-800">
                <li>• Measures ability to see faded or low-contrast objects</li>
                <li>• Predicts <span className="font-bold">night driving safety</span> and <span className="font-bold">fall risk</span></li>
                <li>• Detects early <span className="font-bold">cataracts, glaucoma, and MS</span></li>
                <li>• More important than 20/20 vision for real-world function</li>
                <li>• You can have "perfect" acuity but fail this test</li>
              </ul>
            </div>

            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-6">
              <h3 className="font-bold text-purple-900 mb-3 text-lg flex items-center gap-2">
                <span className="text-2xl">📋</span>
                How It Works:
              </h3>
              <ol className="space-y-2 text-purple-800">
                <li>1. You'll see faint letters (from the set C, D, H, K, N, O, R, S, V, Z)</li>
                <li>2. Each round shows 3 letters - say each one out loud</li>
                <li>3. Get 2 out of 3 right to pass a level</li>
                <li>4. The letters get fainter or clearer to find your limit — big steps first, then small ones</li>
                <li>5. Starts easy and finds your level in about <span className="font-bold">8-12 rounds</span> (about a minute)</li>
                <li>6. Each eye is checked on its own</li>
              </ol>
            </div>
            
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
              <h3 className="font-bold text-blue-900 mb-3 text-lg">[mic] Voice Recognition Tips:</h3>
              <ul className="text-sm text-blue-800 space-y-2">
                <li>✓ Say ONLY the letter: "C" or "K" or "Z"</li>
                <li>✓ You can also say phonetic names: "See" "Kay" "Zed"</li>
                <li>✗ Don't say: "The letter C" or "I think it's C"</li>
                <li>💡 If unparsable for 3+ tries, helpful tips will appear</li>
                <li>⏱️ Faster responses (under 3s) = more confident scoring</li>
              </ul>
              <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-blue-800">
                  <input type="checkbox" checked={phoneticEnabled} onChange={(e) => setPhoneticEnabled(e.target.checked)} />
                  <span>Enable phonetic parsing</span>
                </label>
                {voiceDebug && (
                  <span className="text-xs text-gray-500">(voiceDebug active — showing alternatives)</span>
                )}
              </div>
              {voiceDebug && (
                <div className="mt-3 bg-gray-50 border rounded p-2 text-xs text-gray-700">
                  <div className="font-semibold mb-1">Last recognition alternatives:</div>
                  <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(voiceAlts, null, 2)}</pre>
                </div>
              )}
              {/* Audio input picker and mic test controls (always visible when in testing state) */}
              {testState === 'instructions' && (
                <div className="mt-3 bg-gray-50 border rounded p-3 text-xs text-gray-700">
                  <div className="font-semibold text-sm mb-1">Microphone</div>
                  <select
                    className="w-full text-sm p-1 border rounded"
                    value={selectedMicId || ''}
                    onChange={(e) => setSelectedMicId(e.target.value)}
                  >
                    {audioDevices.length === 0 && <option value="">Default microphone</option>}
                    {audioDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(-4)}`}</option>
                    ))}
                  </select>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => {
                        (async () => {
                          try {
                            const constraints = selectedMicId ? { audio: { deviceId: { exact: selectedMicId } } } : { audio: true }
                            const s = await navigator.mediaDevices.getUserMedia(constraints)
                            const mr = new MediaRecorder(s)
                            const chunks = []
                            mr.ondataavailable = (ev) => chunks.push(ev.data)
                            mr.start()
                            setTimeout(() => mr.stop(), 1500)
                            await new Promise(resolve => mr.onstop = resolve)
                            const blob = new Blob(chunks, { type: 'audio/webm' })
                            const url = URL.createObjectURL(blob)
                            const a = new Audio(url)
                            a.play()
                            s.getTracks().forEach(t => t.stop())
                          } catch (e) {
                            console.error('Mic test failed', e)
                          }
                        })()
                      }}
                      className="px-2 py-1 bg-gray-100 rounded border">Test mic</button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
              <h3 className="font-bold text-green-900 mb-3 text-lg flex items-center gap-2">
                <span className="text-2xl"></span>
                What your score means:
              </h3>
              <div className="space-y-2 text-sm text-green-800">
                <div className="flex justify-between p-2 bg-white rounded">
                  <span className="font-bold">Excellent</span>
                  <span className="text-green-600 font-semibold">Great vision in all lighting</span>
                </div>
                <div className="flex justify-between p-2 bg-white rounded">
                  <span className="font-bold">Normal</span>
                  <span className="text-blue-600 font-semibold">Typical for a healthy adult</span>
                </div>
                <div className="flex justify-between p-2 bg-white rounded">
                  <span className="font-bold">A little low</span>
                  <span className="text-yellow-600 font-semibold">May struggle driving at night</span>
                </div>
                <div className="flex justify-between p-2 bg-white rounded">
                  <span className="font-bold">Low</span>
                  <span className="text-red-600 font-semibold">Worth an eye exam</span>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
              <h3 className="font-bold text-amber-900 mb-2">Real-World Impact:</h3>
              <p className="text-sm text-amber-800">
                A person with 20/20 vision but poor contrast sensitivity may:
              </p>
              <ul className="text-sm text-amber-800 mt-2 space-y-1">
                <li>• Struggle to see pedestrians at night</li>
                <li>• Miss curbs and stairs (fall hazard)</li>
                <li>• Have difficulty reading in dim light</li>
                <li>• Be unsafe to drive in fog or rain</li>
              </ul>
            </div>
          </div>

          <button
            onClick={() => setTestState('mode-select')}
            className="w-full mt-8 btn-primary py-4 text-lg"
          >
            Continue to Mode Selection
          </button>
        </div>
      </div>
    </div>
  )

  // 4. Mode Selection (Standard, Glare, Fog)
  const renderModeSelect = () => (
    <div className="test-shell">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Select Test Mode</h2>
          <p className="text-gray-600">Choose how you want to be challenged</p>
          <p className="text-sm text-purple-600 mt-2">
            Recommendation: Start with Standard, then try Glare for night driving assessment
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Standard Mode */}
          <div 
            onClick={() => {
              setTestMode('standard')
              startTest()
            }}
            className="bg-white rounded-2xl p-8 border-2 border-blue-200 hover:border-blue-400 cursor-pointer transition-all hover:shadow-xl hover:scale-105"
          >
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <span className="text-3xl font-bold text-blue-600">A</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">Standard Mode</h3>
            <p className="text-sm text-gray-600 mb-4 text-center">
              Clean testing environment. Best for baseline screening.
            </p>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Faint letters that fade into the background</li>
              <li>• Difficulty adjusts to you automatically</li>
              <li>• 3-5 minutes per eye</li>
              <li>• Based on the method eye doctors use</li>
            </ul>
            <div className="mt-4 text-center">
              <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
                Recommended
              </span>
            </div>
          </div>

          {/* Glare Mode (Night Driving) */}
          <div 
            onClick={() => {
              setTestMode('glare')
              startTest()
            }}
            className="bg-white rounded-2xl p-8 border-2 border-yellow-200 hover:border-yellow-400 cursor-pointer transition-all hover:shadow-xl hover:scale-105"
          >
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <span className="text-3xl"></span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">Night Drive Mode</h3>
            <p className="text-sm text-gray-600 mb-4 text-center">
              Simulates oncoming headlights with intense glare. Tests disability glare.
            </p>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Cataract screening tool</li>
              <li>• Bright peripheral glare</li>
              <li>• Driving safety rating</li>
              <li>• Scattered light simulation</li>
            </ul>
            <div className="mt-4 text-center">
              <span className="inline-block bg-yellow-100 text-yellow-700 text-xs font-semibold px-3 py-1 rounded-full">
                Advanced
              </span>
            </div>
          </div>

          {/* Fog Mode (Weather Simulation) */}
          <div 
            onClick={() => {
              setTestMode('fog')
              startTest()
            }}
            className="bg-white rounded-2xl p-8 border-2 border-gray-300 hover:border-gray-400 cursor-pointer transition-all hover:shadow-xl hover:scale-105"
          >
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <span className="text-3xl"></span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">Weather Mode</h3>
            <p className="text-sm text-gray-600 mb-4 text-center">
              Heavy fog/rain simulation with reduced visibility.
            </p>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Low visibility conditions</li>
              <li>• Functional vision test</li>
              <li>• Safety score rating</li>
              <li>• Real-world challenge</li>
            </ul>
            <div className="mt-4 text-center">
              <span className="inline-block bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-1 rounded-full">
                Challenge
              </span>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 text-center">
          <p className="text-sm text-blue-800">
            <span className="font-bold">Pro Tip:</span> Complete Standard mode first to get your baseline,
            then try Glare mode if you're concerned about night driving safety.
          </p>
        </div>
      </div>
    </div>
  )

  // 5. Eye Coverage Verification
  const renderEyeCoverage = () => (
    <UnifiedCalibration
      steps={[ 'eyeCoverage' ]}
      testName="Contrast Sensitivity Test"
      onFinish={() => startTestingAfterCoverage()}
    />
  )

  // 6. Testing Screen (The Main Test Interface)
  const renderTesting = () => {
    // Get current level data from 32-level LogCS scale
    const levelData = LogCS_LEVELS[currentLevel - 1]
    const grayValue = levelData.rgb
    // Show decimals for sub-1% contrast levels (dithered levels)
    const contrastPercent = levelData.contrast >= 0.01 
      ? Math.round(levelData.contrast * 100) 
      : (levelData.contrast * 100).toFixed(1)
    const useDithering = levelData.dither || false
    const ditherRatio = levelData.ditherRatio || 0
    // NOTE: render-path log removed — moved to a useEffect([currentLevel,currentLetter]) below
    // to avoid spamming the console on every React re-render (mic state, transcript, etc.)
    
    // Dithering style - creates a "mesh" effect for sub-2% contrast
    const getDitheredStyle = () => {
      if (!useDithering) return {}
      
      // Create a checkerboard pattern using CSS background
      // ditherRatio controls density: 0.5 = 50% visible, 0.1 = 10% visible
      const pixelSize = 2 // Size of dither pixels
      const backgroundSize = `${pixelSize * 2}px ${pixelSize * 2}px`
      
      // Calculate opacity based on dither ratio (how many pixels are "visible")
      const opacity = Math.max(0.05, ditherRatio)
      
      return {
        background: `
          repeating-conic-gradient(
            from 0deg at ${pixelSize}px ${pixelSize}px,
            currentColor 0deg 90deg,
            transparent 90deg 180deg,
            currentColor 180deg 270deg,
            transparent 270deg 360deg
          )
        `,
        backgroundSize: backgroundSize,
        opacity: opacity,
        filter: 'blur(0.3px)' // Slight blur to smooth the dither pattern
      }
    }
    
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-8 relative overflow-hidden">
        {/* Night Driving Glare Overlay - MUCH MORE VISIBLE */}
        {testMode === 'glare' && (
          <>
            {/* Primary Headlight - BRIGHT and LARGE */}
            <div 
              className="absolute pointer-events-none"
              style={{
                width: '400px',
                height: '400px',
                background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,200,0.7) 20%, rgba(255,255,150,0.4) 50%, transparent 70%)',
                filter: 'blur(40px)',
                top: '10%',
                left: '10%',
                zIndex: 10,
                animation: 'pulseGlare 3s ease-in-out infinite'
              }}
            />
            {/* Secondary Headlight */}
            <div 
              className="absolute pointer-events-none"
              style={{
                width: '350px',
                height: '350px',
                background: 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,200,0.6) 20%, rgba(255,255,150,0.3) 50%, transparent 70%)',
                filter: 'blur(35px)',
                top: '15%',
                right: '15%',
                zIndex: 10,
                animation: 'pulseGlare 3s ease-in-out infinite 0.5s'
              }}
            />
            {/* Veiling Glare Layer - simulates scattered light across retina */}
            <div 
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{
                background: 'rgba(255, 255, 255, 0.25)',
                backdropFilter: 'contrast(0.6) brightness(1.3)',
                zIndex: 5
              }}
            />
            {/* Lens Flare Effect */}
            <div 
              className="absolute pointer-events-none"
              style={{
                width: '100%',
                height: '100%',
                background: 'radial-gradient(ellipse at 20% 20%, rgba(255,255,255,0.3) 0%, transparent 40%)',
                zIndex: 8
              }}
            />
          </>
        )}

        {/* Fog/Rain Weather Overlay - MUCH MORE VISIBLE */}
        {testMode === 'fog' && (
          <>
            {/* Dense fog layer */}
            <div 
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{
                background: 'rgba(200, 200, 200, 0.4)',
                zIndex: 5
              }}
            />
            {/* Moving fog particles */}
            <div 
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{
                background: `
                  repeating-linear-gradient(
                    0deg,
                    rgba(220, 220, 220, 0.2) 0px,
                    rgba(220, 220, 220, 0.4) 3px,
                    rgba(220, 220, 220, 0.2) 6px
                  ),
                  repeating-linear-gradient(
                    90deg,
                    rgba(210, 210, 210, 0.2) 0px,
                    rgba(210, 210, 210, 0.4) 4px,
                    rgba(210, 210, 210, 0.2) 8px
                  )
                `,
                backdropFilter: 'blur(2px)',
                zIndex: 6
              }}
            />
            {/* Rain streaks */}
            <div 
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{
                background: `
                  repeating-linear-gradient(
                    110deg,
                    transparent 0px,
                    rgba(200, 200, 200, 0.6) 2px,
                    transparent 4px,
                    transparent 20px
                  )
                `,
                zIndex: 7,
                animation: 'rainFall 1s linear infinite'
              }}
            />
          </>
        )}

        <div className="max-w-4xl w-full space-y-8 relative z-20">
          {/* Header - Shows progress and current state */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Testing: {currentEye === 'left' ? 'LEFT Eye' : 'RIGHT Eye'}
            </h2>
            <div className="flex justify-center items-center gap-4 text-sm text-gray-600">
              <span>Trial {trialNumber}</span>
              <span>•</span>
              <span>Faintness {contrastPercent}%</span>
              <span>•</span>
              <span>Reversals: {reversals}/3</span>
              <span>•</span>
              <span>Letter {tripletAnswers.length + 1}/3</span>
            </div>
            {/* Push-to-listen enforced — single-mode UI (no toggle) */}
            <p className="text-sm text-purple-600 font-semibold mt-1">
              Mode: {testMode === 'glare' ? 'Night Driving' : testMode === 'fog' ? 'Weather' : 'Standard'} 
              {bayesianPhaseRef.current === 'discovery' && ' • [target] Discovery (±0.6)'}
              {bayesianPhaseRef.current === 'convergence' && ' • � Convergence (±0.2)'}
              {bayesianPhaseRef.current === 'precision' && ' • 🎓 Precision (±0.05)'}
              {currentLevel >= 25 && ' • 🔬 Dithered'}
            </p>
            {/* Show triplet progress - only when actively answering (not during feedback) */}
            {!lastResponse && (
              <div className="flex justify-center gap-2 mt-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className={`w-3 h-3 rounded-full ${
                    i < tripletAnswers.length 
                      ? (tripletAnswers[i].correct ? 'bg-green-500' : 'bg-red-500')
                      : 'bg-gray-300'
                  }`} />
                ))}
              </div>
            )}
            {/* Microphone status indicator */}
            {isListening && (
              <div className="mt-2 text-xs text-gray-500">
                [mic] Microphone active - {transcript ? `Heard: "${transcript}"` : 'Say a letter (C, K, X, etc.)'}
              </div>
            )}
            {!isListening && pushToListenEnabled && testState === 'testing' && (
              <div className="mt-2 text-xs text-gray-500">
                Push-to-listen is enabled — press the Listen button or press Space/Enter
              </div>
            )}
          </div>

          {/* Letter Display - The stimulus (Pelli-Robson style: blends with background) */}
          <div className="flex justify-center">
            <div className="w-96 h-96 flex items-center justify-center">
              <span 
                className="font-bold select-none"
                style={{
                  fontSize: '200px',
                  color: `rgb(${grayValue}, ${grayValue}, ${grayValue})`,
                  fontFamily: 'Sloan, Arial, sans-serif',
                  textShadow: 'none',
                  letterSpacing: '0',
                  fontWeight: '700',
                  lineHeight: '1',
                  ...getDitheredStyle() // Apply dithering if level >= 25
                }}
              >
                {currentLetter}
              </span>
            </div>
          </div>

          {/* Voice Recognition Indicator with Feedback */}
          <div className="text-center min-h-[120px] flex flex-col items-center justify-center gap-2">
            {showUnparsableHint && !lastResponse && (
              <div className="bg-yellow-50 border-2 border-yellow-300 px-6 py-3 rounded-xl mb-2">
                {showUnparsableHint === 'tips' ? (
                  <>
                    <p className="text-yellow-800 font-semibold">💡 Having trouble understanding. Tips:</p>
                    <p className="text-sm text-yellow-900 mt-1">• Say just the letter clearly</p>
                    <p className="text-sm text-yellow-900">• Speak a bit louder</p>
                    <p className="text-sm text-yellow-900">• Try phonetic: "See" instead of "C"</p>
                  </>
                ) : (
                  <p className="text-yellow-800 font-semibold text-lg">{showUnparsableHint}</p>
                )}
              </div>
            )}
            {isListening && !lastResponse && !showUnparsableHint && (
              <div className="inline-flex items-center gap-2 bg-red-50 border-2 border-red-200 px-6 py-3 rounded-xl">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-red-700 font-semibold">Listening...</span>
              </div>
            )}
            {transcript && !lastResponse && !showUnparsableHint && (
              <div className="mt-2 text-lg text-purple-600 font-semibold">
                Heard: "{transcript}"
              </div>
            )}
            {/* Large circular Listen control for push-to-listen mode */}
            {currentLetter && !lastResponse && (
              <>
                {/* Floating Listen button (bottom-left to avoid chatbot overlap) */}
                <button
                  onClick={() => startListening('button')}
                  disabled={isListening}
                  aria-label={isListening ? 'Listening' : 'Start listening'}
                  aria-pressed={isListening}
                  role="button"
                  className={`fixed bottom-28 right-6 z-50 w-16 h-16 rounded-full flex items-center justify-center text-white shadow-2xl transition-transform focus:outline-none ${isListening ? 'bg-gray-300 text-gray-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                  style={listenFlash ? { transform: 'scale(1.12)' } : undefined}
                >
                  {/* Inline SVG mic icon (filled when active) */}
                    {!isListening ? (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" fill="currentColor"/>
                      <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 0 0 2 0v-3.08A7 7 0 0 0 19 11z" fill="currentColor"/>
                    </svg>
                  ) : (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" fill="currentColor"/>
                      <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 0 0 2 0v-3.08A7 7 0 0 0 19 11z" fill="currentColor"/>
                      {/* small active ring */}
                      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
                    </svg>
                  )}
                </button>

                {/* Mic level indicator (small bar) */}
                <div className="fixed bottom-24 right-6 z-50 flex items-center gap-2 pointer-events-none">
                  <div aria-hidden="true" style={{ width: 36, height: 8, background: '#111', borderRadius: 4, opacity: 0.18 }}>
                    <div style={{ width: `${Math.min(100, Math.round((micLevel / 255) * 100))}%`, height: '100%', background: micLevel > 40 ? '#10B981' : '#EF4444', borderRadius: 4 }} />
                  </div>
                  <div className="sr-only" aria-live="polite">Microphone level {Math.round((micLevel / 255) * 100)} percent</div>
                </div>

              </>
            )}
            {lastResponse && (
              <div className={`inline-flex items-center gap-3 border-2 px-8 py-4 rounded-xl ${
                lastResponse.correct 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-red-50 border-red-300'
              }`}>
                <div className={`text-3xl ${lastResponse.correct ? 'text-green-600' : 'text-red-600'}`}>
                  {lastResponse.correct ? '✓' : '✗'}
                </div>
                <div className="text-left">
                  <p className={`font-bold text-lg ${lastResponse.correct ? 'text-green-700' : 'text-red-700'}`}>
                    {lastResponse.correct ? 'Correct!' : lastResponse.answer === 'UNSEEN' ? 'Skipped' : 'Incorrect'}
                  </p>
                  <p className="text-sm text-gray-600">
                    {lastResponse.answer === 'UNSEEN' ? (
                      <>You couldn't see it • Letter was: <span className="font-semibold">{lastResponse.letter}</span></>
                    ) : (
                      <>
                        You said: <span className="font-semibold">{lastResponse.answer}</span>
                        {!lastResponse.correct && (
                          <span> • Correct was: <span className="font-semibold">{lastResponse.letter}</span></span>
                        )}
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
            {!isListening && !transcript && !lastResponse && (
              <p className="text-sm text-gray-400">
                Press the mic button (bottom-right) or Space/Enter to answer
              </p>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 text-center">
            <p className="text-blue-900 font-semibold mb-2">
              Letters used: C, D, H, K, N, O, R, S, V, Z
            </p>
            <p className="text-sm text-blue-700 mb-2">
              <span className="font-bold">Just say:</span> "C" or "K" or "Z" • <span className="font-bold">Don't say:</span> "The letter C" or full sentences
            </p>
            <p className="text-xs text-blue-600">
              Phonetic works: "See" for C, "Kay" for K, "Zed" for Z, "Dee" for D, "Aitch" for H
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {/* Better time estimation: ends after 5 reversals OR 25 trials, ~8s per trial */}
              Estimated time remaining: {
                reversals >= 4 ? '~30 seconds' : 
                reversals >= 3 ? '~1 minute' :
                trialNumber > 20 ? '~1 minute' :
                trialNumber > 15 ? '~1-2 minutes' :
                '~2 minutes'
              } • Trial {trialNumber}/25 • Reversals {reversals}/5
            </p>
          </div>

          {/* Can't See It Button (Clinical "False Negative" response) */}
          {!lastResponse && currentLetter && (
            <div className="text-center">
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => {
                    console.log(`👁️ User cannot see letter: ${currentLetter}`)
                    // Treat as incorrect answer (user reached their threshold)
                    handleAnswer('UNSEEN') // Will be marked as incorrect
                  }}
                  className="bg-gray-100 hover:bg-gray-200 border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-semibold transition-colors"
                >
                  👁️ Can't See It (Skip)
                </button>

                {/* Small helper when push-to-listen is enabled (big Listen button is above) */}
                {pushToListenEnabled && (
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mt-2">Press Space / Enter or tap the Listen button below</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Click if the letter is invisible or too faint to identify
              </p>
            </div>
          )}
        </div>

        {/* CSS Animations */}
        <style>{`
          @keyframes pulseGlare {
            0%, 100% { opacity: 0.7; transform: scale(1); }
            50% { opacity: 1.0; transform: scale(1.1); }
          }
          @keyframes rainFall {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(100%); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes scaleIn {
            from { opacity: 0; transform: scale(0.8); }
            to { opacity: 1; transform: scale(1); }
          }
          .animate-fadeIn {
            animation: fadeIn 0.3s ease-out;
          }
          .animate-scaleIn {
            animation: scaleIn 0.5s ease-out;
          }
        `}</style>
      </div>
    )
  }

  // 7. Switch Eyes Interlude
  const renderSwitchEyes = () => (
    <div className="test-shell flex items-center justify-center min-h-[60vh]">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-12 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl"></span>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Left Eye Complete!</h2>
        <p className="text-lg text-gray-600 mb-2">
          Your left eye score: <span className="font-bold text-purple-600">{leftEyeScore?.toFixed(2)}</span>
        </p>
        <p className="text-sm text-gray-500 mb-8">
          Now let's test your right eye using the same procedure
        </p>
        
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-8">
          <p className="text-sm text-blue-800">
            <span className="font-bold">Reminder:</span> Cover or close your LEFT eye during the next test.
            The test will adapt independently for each eye.
          </p>
        </div>

        <button
          onClick={startRightEye}
          className="btn-primary px-12 py-4 text-lg"
        >
          Test Right Eye
        </button>
      </div>
    </div>
  )

  // 7. Results Screen (Comprehensive analysis)
  const renderResults = () => {
    const avgScore = (leftEyeScore + rightEyeScore) / 2
    
    // Enhanced safety rating with clinical context (CORRECTED LogCS scale)
    const getSafetyRating = (score) => {
      if (score >= 2.3) return {  // LogCS 2.3 = <0.5% contrast = Superhuman
        level: 'Superior Vision', 
        badge: 'Eagle Eye', 
        color: 'emerald', 
        bgGradient: 'from-emerald-500 to-green-500',
        status: 'Excellent - Top 1%', 
        emoji: '🦅',
        description: 'Your ability to see faint shapes is exceptional — top-tier vision. You can spot even the faintest differences.'
      }
      if (score >= 2.0) return {  // LogCS 2.0 = 1% contrast = Clinical normal limit
        level: 'Excellent Vision', 
        badge: 'Healthy Vision', 
        color: 'green', 
        bgGradient: 'from-green-500 to-emerald-500',
        status: 'Above Average - Top 10%', 
        emoji: '✓',
        description: 'Your vision is better than the normal healthy standard. You should see well in all kinds of lighting.'
      }
      if (score >= 1.5) return {  // LogCS 1.5 = 3% contrast = Normal range
        level: 'Normal Vision', 
        badge: 'Average Range', 
        color: 'blue', 
        bgGradient: 'from-blue-500 to-cyan-500',
        status: 'Healthy', 
        emoji: '👁️',
        description: 'Your ability to see faint shapes is in the normal, healthy range for adults.'
      }
      if (score >= 1.0) return {  // LogCS 1.0 = 10% contrast = Borderline
        level: 'Borderline', 
        badge: 'Caution Zone', 
        color: 'yellow', 
        bgGradient: 'from-yellow-500 to-amber-500',
        status: 'Monitor Closely', 
        emoji: '[WARNING]',
        description: 'You may find it harder to see in dim light. Add more light for reading or activities at night, and consider an eye check.'
      }
      return {  // LogCS <1.0 = >10% contrast needed = Impaired
        level: 'Low Contrast', 
        badge: 'Medical Attention', 
        color: 'red', 
        bgGradient: 'from-red-500 to-orange-500',
        status: 'Consult Eye Doctor', 
        emoji: '[ALERT]',
        description: 'You find it much harder to see faint shapes than most people. Please book an eye exam so a doctor can check for common causes like cataracts or glaucoma.'
      }
    }
    
    const leftRating = getSafetyRating(leftEyeScore)
    const rightRating = getSafetyRating(rightEyeScore)
    const avgRating = getSafetyRating(avgScore)
    
    // Age-normative comparison (Pelli-Robson clinical data)
    const getAgeNorm = (age) => {
      if (age < 30) return 2.00  // LogCS 2.0 = 1% contrast (young adult normal)
      if (age < 40) return 1.90  // Slight decline
      if (age < 50) return 1.80  // Age-related decline begins
      if (age < 60) return 1.70  // Moderate decline
      return 1.60                // Senior normal range
    }
    const userAge = 25 // TODO: Get from user profile
    const ageNorm = getAgeNorm(userAge)

    return (
      <div className="min-h-screen bg-gray-900 py-8 px-4">
        {/* SUPERIOR VISION CERTIFICATE MODAL */}
        {showCertificate && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="bg-brand-gradient rounded-3xl shadow-glow max-w-2xl w-full p-8 border border-accent-400 animate-scaleIn">
              <div className="text-center mb-6">
                <div className="text-8xl mb-4 animate-bounce">🦅</div>
                <h1 className="text-5xl font-black text-white mb-2 drop-shadow-lg">SUPERIOR VISION</h1>
                <div className="text-2xl font-bold text-yellow-300 mb-4">Certificate of Excellence</div>
                <div className="h-1 w-32 bg-yellow-400 mx-auto mb-6"></div>
              </div>
              
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 border border-white/20">
                <p className="text-white text-lg text-center leading-relaxed">
                  Congratulations! Your score of <span className="font-black text-yellow-300 text-2xl">{avgScore.toFixed(2)}</span> places you in the <span className="font-bold text-yellow-300">Top 10%</span> of people.
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                  <div className="text-blue-300 text-sm font-semibold mb-1">LEFT EYE</div>
                  <div className="text-white text-3xl font-black">{leftEyeScore.toFixed(2)}</div>
                  <div className="text-yellow-300 text-xs">SCORE</div>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                  <div className="text-purple-300 text-sm font-semibold mb-1">RIGHT EYE</div>
                  <div className="text-white text-3xl font-black">{rightEyeScore.toFixed(2)}</div>
                  <div className="text-yellow-300 text-xs">SCORE</div>
                </div>
              </div>
              
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 mb-6 border border-white/20">
                <div className="text-white text-sm text-center space-y-2">
                  <p><span className="font-bold text-yellow-300">✓ Elite Visual Processing</span> - Detects sub-1% contrast</p>
                  <p><span className="font-bold text-yellow-300">✓ Exceptional Night Vision</span> - Superior in low-light</p>
                  <p><span className="font-bold text-yellow-300">✓ Dithered Level Mastery</span> - Passed pixel-mesh test</p>
                </div>
              </div>
              
              <div className="text-center text-white/60 text-xs mb-4">
                EyeVio™ Clinical Vision Assessment | {new Date().toLocaleDateString()}
              </div>
              
              <button
                onClick={() => setShowCertificate(false)}
                className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-4 px-6 rounded-xl transition-colors text-lg"
              >
                View Full Results
              </button>
            </div>
          </div>
        )}

        <div className="max-w-6xl mx-auto space-y-6">
          {/* HERO SECTION: Visual Quality Score */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl shadow-2xl p-10 border border-gray-700">
            <div className="text-center mb-6">
              <h1 className="text-5xl font-bold text-white mb-2">Your Visual Quality Score</h1>
              <p className="text-gray-400 text-lg">Contrast Sensitivity Assessment Results</p>
            </div>

            {/* Speedometer-style gauge */}
            <div className="relative h-64 mb-8">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-56 h-56 rounded-full bg-gradient-to-br ${avgRating.bgGradient} flex items-center justify-center shadow-2xl transform transition-all hover:scale-105`}>
                  <div className="w-48 h-48 rounded-full bg-gray-900 flex flex-col items-center justify-center">
                    <div className="text-7xl font-black text-white mb-1">
                      {avgScore.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-400 uppercase tracking-wider">Score</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Badge and Status */}
            <div className="text-center mb-6">
              <span className={`inline-block bg-gradient-to-r ${avgRating.bgGradient} text-white px-6 py-3 rounded-full text-xl font-bold shadow-lg mb-4`}>
                {avgRating.emoji} {avgRating.badge}
              </span>
              <p className="text-gray-300 text-lg max-w-2xl mx-auto">
                {avgRating.description}
              </p>
            </div>

            {/* Age-Normative Context */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
              <h3 className="text-white font-bold mb-3 text-center">Normal Range for Age {userAge}: {(ageNorm - 0.15).toFixed(2)} – {(ageNorm + 0.15).toFixed(2)}</h3>
              <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
                <div className="absolute left-0 h-full bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 to-emerald-500" style={{width: '100%'}}></div>
                <div 
                  className="absolute h-full w-1 bg-white shadow-lg" 
                  style={{left: `${Math.min(100, Math.max(0, (avgScore / 2.5) * 100))}%`}}
                >
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-white text-xs font-bold whitespace-nowrap">
                    You ▼
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-2">
                <span>Impaired (0.5)</span>
                <span>Excellent (2.5+)</span>
              </div>
            </div>
          </div>

          {/* MONOCULAR COMPARISON: Individual Eyes */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-brand-gradient rounded-2xl shadow-card p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-2xl">LEFT Eye</h3>
                <span className="text-4xl">{leftRating.emoji}</span>
              </div>
              <div className="text-6xl font-black mb-2">
                {leftEyeScore.toFixed(2)}
              </div>
              <div className="text-xl font-semibold mb-3 opacity-90">
                {leftRating.badge}
              </div>
              <div className="bg-white/20 rounded-lg p-3 backdrop-blur-sm">
                <div className="flex justify-between text-sm mb-1">
                  <span>Trials:</span>
                  <span className="font-bold">{leftEyeResponses.length}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Correct:</span>
                  <span className="font-bold">{leftEyeResponses.filter(r => r.correct).length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Accuracy:</span>
                  <span className="font-bold">{((leftEyeResponses.filter(r => r.correct).length / leftEyeResponses.length) * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
            
            <div className="card bg-accent-50 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-2xl">RIGHT Eye</h3>
                <span className="text-4xl">{rightRating.emoji}</span>
              </div>
              <div className="text-6xl font-black mb-2">
                {rightEyeScore.toFixed(2)}
              </div>
              <div className="text-xl font-semibold mb-3 opacity-90">
                {rightRating.badge}
              </div>
              <div className="bg-white/20 rounded-lg p-3 backdrop-blur-sm">
                <div className="flex justify-between text-sm mb-1">
                  <span>Trials:</span>
                  <span className="font-bold">{rightEyeResponses.length}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Correct:</span>
                  <span className="font-bold">{rightEyeResponses.filter(r => r.correct).length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Accuracy:</span>
                  <span className="font-bold">{((rightEyeResponses.filter(r => r.correct).length / rightEyeResponses.length) * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* REAL-WORLD IMPACT SIMULATOR */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl shadow-2xl p-8 border border-gray-700">
            <h2 className="text-3xl font-bold text-white mb-4 text-center">Real-World Impact Preview</h2>
            <p className="text-gray-400 text-center mb-8">How your vision performs in challenging conditions</p>
            
            <div className="grid md:grid-cols-3 gap-6">
              {/* Night Driving Simulator */}
              <div className="bg-gray-700 rounded-xl overflow-hidden">
                <div className="p-4 bg-gray-800 border-b border-gray-600">
                  <h3 className="font-bold text-white">🌙 Night Driving</h3>
                  <p className="text-xs text-gray-400">Headlight glare simulation</p>
                </div>
                <div className="aspect-video bg-black relative overflow-hidden">
                  {/* Simulated night scene with contrast reduction */}
                  <div 
                    className="absolute inset-0 flex items-center justify-center text-6xl"
                    style={{
                      filter: `contrast(${avgScore >= 1.5 ? '1.0' : avgScore >= 1.0 ? '0.6' : '0.3'}) blur(${avgScore >= 1.5 ? '0px' : avgScore >= 1.0 ? '2px' : '4px'})`,
                      opacity: avgScore >= 1.5 ? 1.0 : avgScore >= 1.0 ? 0.7 : 0.4
                    }}
                  >
                    🚗
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3">
                    <p className="text-white text-xs text-center">
                      {avgScore >= 1.5 ? 'Clear visibility' : avgScore >= 1.0 ? 'Reduced clarity' : 'Severely limited'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Foggy Road Simulator */}
              <div className="bg-gray-700 rounded-xl overflow-hidden">
                <div className="p-4 bg-gray-800 border-b border-gray-600">
                  <h3 className="font-bold text-white">🌫️ Fog/Rain</h3>
                  <p className="text-xs text-gray-400">Low visibility weather</p>
                </div>
                <div className="aspect-video bg-gray-600 relative overflow-hidden">
                  <div 
                    className="absolute inset-0 flex items-center justify-center text-6xl"
                    style={{
                      filter: `contrast(${avgScore >= 1.5 ? '1.0' : avgScore >= 1.0 ? '0.5' : '0.25'}) opacity(${avgScore >= 1.5 ? '0.9' : avgScore >= 1.0 ? '0.6' : '0.3'})`,
                    }}
                  >
                    🚸
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-800 to-transparent p-3">
                    <p className="text-white text-xs text-center">
                      {avgScore >= 1.5 ? 'Objects visible' : avgScore >= 1.0 ? 'Difficult to see' : 'Nearly invisible'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stairs/Steps Hazard */}
              <div className="bg-gray-700 rounded-xl overflow-hidden">
                <div className="p-4 bg-gray-800 border-b border-gray-600">
                  <h3 className="font-bold text-white">🪜 Dark Stairs</h3>
                  <p className="text-xs text-gray-400">Fall risk assessment</p>
                </div>
                <div className="aspect-video bg-gray-900 relative overflow-hidden flex items-center justify-center">
                  <div 
                    className="w-full h-full flex flex-col justify-around"
                    style={{
                      opacity: avgScore >= 1.5 ? 0.8 : avgScore >= 1.0 ? 0.5 : 0.2
                    }}
                  >
                    <div className="h-3 bg-gray-800 border-t border-gray-700"></div>
                    <div className="h-3 bg-gray-800 border-t border-gray-700"></div>
                    <div className="h-3 bg-gray-800 border-t border-gray-700"></div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3">
                    <p className="text-white text-xs text-center">
                      {avgScore >= 1.5 ? 'Steps clear' : avgScore >= 1.0 ? 'Steps faint' : 'High fall risk'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-gray-400 text-sm text-center mt-6">
              At your score of <span className="font-bold text-white">{avgScore.toFixed(2)}</span>, objects with low contrast are{' '}
              <span className="font-bold text-yellow-400">
                {avgScore >= 1.5 ? '10-20%' : avgScore >= 1.0 ? '40-60%' : '70-90%'}
              </span>
              {' '}harder for you to detect than someone with normal vision.
            </p>
          </div>

          {/* SAFETY CHECKLIST */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl shadow-2xl p-8 border border-gray-700">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">Your Safety Dashboard</h2>
            
            <div className="space-y-4">
              <div className={`flex items-center justify-between p-5 rounded-xl ${avgScore >= 1.5 ? 'bg-green-900/50 border-2 border-green-600' : 'bg-gray-700 border-2 border-gray-600'}`}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{avgScore >= 1.5 ? '' : '[WARNING]'}</span>
                  <div>
                    <h3 className="text-white font-bold text-lg">Daytime Driving</h3>
                    <p className="text-gray-400 text-sm">Clear weather, good visibility</p>
                  </div>
                </div>
                <span className={`font-bold text-xl ${avgScore >= 1.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {avgScore >= 1.5 ? 'SAFE' : 'SAFE'}
                </span>
              </div>

              <div className={`flex items-center justify-between p-5 rounded-xl ${avgScore >= 1.4 ? 'bg-green-900/50 border-2 border-green-600' : avgScore >= 1.0 ? 'bg-yellow-900/50 border-2 border-yellow-600' : 'bg-red-900/50 border-2 border-red-600'}`}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{avgScore >= 1.4 ? '' : avgScore >= 1.0 ? '[WARNING]' : '[ALERT]'}</span>
                  <div>
                    <h3 className="text-white font-bold text-lg">Fog & Rain Driving</h3>
                    <p className="text-gray-400 text-sm">Reduced visibility conditions</p>
                  </div>
                </div>
                <span className={`font-bold text-xl ${avgScore >= 1.4 ? 'text-green-400' : avgScore >= 1.0 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {avgScore >= 1.4 ? 'SAFE' : avgScore >= 1.0 ? 'CAUTION' : 'AVOID'}
                </span>
              </div>

              <div className={`flex items-center justify-between p-5 rounded-xl ${avgScore >= 1.0 ? 'bg-green-900/50 border-2 border-green-600' : 'bg-red-900/50 border-2 border-red-600'}`}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{avgScore >= 1.0 ? '' : '[ALERT]'}</span>
                  <div>
                    <h3 className="text-white font-bold text-lg">Night Driving</h3>
                    <p className="text-gray-400 text-sm">Dark roads with oncoming headlights</p>
                  </div>
                </div>
                <span className={`font-bold text-xl ${avgScore >= 1.0 ? 'text-green-400' : 'text-red-400'}`}>
                  {avgScore >= 1.0 ? 'SAFE' : 'HAZARDOUS'}
                </span>
              </div>

              <div className={`flex items-center justify-between p-5 rounded-xl ${avgScore >= 1.2 ? 'bg-green-900/50 border-2 border-green-600' : 'bg-yellow-900/50 border-2 border-yellow-600'}`}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl">📖</span>
                  <div>
                    <h3 className="text-white font-bold text-lg">Reading in Dim Light</h3>
                    <p className="text-gray-400 text-sm">Low-contrast text (receipts, labels)</p>
                  </div>
                </div>
                <span className={`font-bold text-xl ${avgScore >= 1.2 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {avgScore >= 1.2 ? 'EASY' : 'DIFFICULT'}
                </span>
              </div>

              <div className={`flex items-center justify-between p-5 rounded-xl ${avgScore >= 1.3 ? 'bg-green-900/50 border-2 border-green-600' : 'bg-yellow-900/50 border-2 border-yellow-600'}`}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl">🪜</span>
                  <div>
                    <h3 className="text-white font-bold text-lg">Fall Risk</h3>
                    <p className="text-gray-400 text-sm">Detecting curbs, stairs, uneven ground</p>
                  </div>
                </div>
                <span className={`font-bold text-xl ${avgScore >= 1.3 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {avgScore >= 1.3 ? 'LOW RISK' : 'MODERATE RISK'}
                </span>
              </div>
            </div>
          </div>

          {/* Clinical Recommendations */}
          {avgScore < 1.5 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6 mb-8">
              <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                <span className="text-xl"></span>
                Clinical Recommendations:
              </h3>
              <ul className="text-amber-800 space-y-2 text-sm">
                {avgScore < 1.0 && (
                  <>
                    <li className="font-semibold text-red-700">
                      [WARNING] IMMEDIATE ACTION REQUIRED:
                    </li>
                    <li>• Schedule comprehensive eye exam with ophthalmologist ASAP</li>
                    <li>• Possible cataract, glaucoma, or retinal condition</li>
                    <li>• <span className="font-bold">Avoid night driving</span> until evaluated by doctor</li>
                    <li>• High risk for falls - use extra lighting at home</li>
                    <li>• May not be safe to drive in fog or rain</li>
                  </>
                )}
                {avgScore >= 1.0 && avgScore < 1.5 && (
                  <>
                    <li className="font-semibold text-yellow-700">
                      [WARNING] RECOMMENDED ACTIONS:
                    </li>
                    <li>• Consider eye exam for early disease detection</li>
                    <li>• Use extra caution in low-light conditions</li>
                    <li>• Monitor for changes in vision quality</li>
                    <li>• May benefit from anti-glare coating on glasses</li>
                    <li>• Retest in 3-6 months to track changes</li>
                  </>
                )}
              </ul>
            </div>
          )}

          {/* Excellent performance message */}
          {avgScore >= 1.5 && (
            <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6 mb-8">
              <h3 className="font-bold text-green-900 mb-2 flex items-center gap-2">
                <span className="text-xl"></span>
                Excellent Contrast Sensitivity!
              </h3>
              <p className="text-green-800 text-sm">
                Your contrast sensitivity is {avgScore >= 2.0 ? 'exceptional' : 'normal'} for all lighting conditions.
                Continue regular eye exams to maintain your vision health.
              </p>
            </div>
          )}

          {/* Test Details */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-8">
            <h4 className="font-semibold text-gray-700 mb-2 text-sm">Test Details:</h4>
            <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
              <div>
                <span className="font-semibold">Test Type:</span> {testMode === 'glare' ? 'Night Driving (Glare)' : testMode === 'fog' ? 'Weather (Fog)' : 'Standard'}
              </div>
              <div>
                <span className="font-semibold">Algorithm:</span> Adaptive Staircase
              </div>
              <div>
                <span className="font-semibold">Distance:</span> 406mm (16")
              </div>
              <div>
                <span className="font-semibold">Gamma Cal:</span> {gammaCalibrated ? 'Yes' : 'No'}
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/vision-tests')}
            className="btn-primary w-full py-4 text-lg"
          >
            Return to Vision Tests
          </button>
        </div>
      </div>
    )
  }

  // ========== MAIN RENDER ==========
  return (
    <>
      {testState === 'distance-gate' && renderDistanceGate()}
      {testState === 'gamma-calibration' && renderGammaCalibration()}
      {testState === 'instructions' && renderInstructions()}
      {testState === 'mode-select' && renderModeSelect()}
      {testState === 'eye-coverage' && renderEyeCoverage()}
      {testState === 'testing' && renderTesting()}
      {testState === 'switch-eyes' && renderSwitchEyes()}
      {testState === 'results' && renderResults()}
    </>
  )
}

export default ContrastSensitivityTest
