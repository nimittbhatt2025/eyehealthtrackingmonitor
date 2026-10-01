import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import SamdDisclaimer from '../components/SamdDisclaimer'
import { VisionTestShell } from '../components/TestPrepLayout'
import { glareDeltaLogCS, scoreGlareDelta, interpretGlareDelta } from '../utils/visionTestScoring'
import { DISPLAY_INDEX_LABEL } from '../utils/displayIndex'
import { createQuest, paintGrating, logCSToContrast, GRATING_ORIENTATIONS } from '../utils/psychophysics'
import GratingSwatch from '../components/GratingSwatch'

/**
 * Glare test — contrast loss under veiling luminance.
 *
 * Two interleaved Bayesian (QUEST) staircases find the faintest grating the user
 * can orient with and without a glare source. The result is
 *   Δ logCS = logCS(no glare) − logCS(glare).
 *
 * Screen mode: a bright white ring around the grating scatters light inside the
 * eye (the grating's own physical contrast is unchanged).
 * Torch mode: a phone flashlight at a fixed off-axis angle and distance is the
 * glare source. Its luminance is not measured, so torch sessions are only
 * comparable with other torch sessions using the same phone and setup.
 *
 * Home screening only — not a cataract diagnosis.
 */

const TRIALS_PER_CONDITION = 10
const PRACTICE_TRIALS = 2
const PRACTICE_LOGCS = 0.3 // 50% contrast — easy
const GRATING_CYCLES = 12
const APERTURE_RADIUS = 120 // on a 400px canvas
// Torch in the plane of the screen, beside it: tan(30°) × 50 cm ≈ 29 cm lateral offset.
const TORCH_GEOMETRY = {
  viewingDistanceCm: 50,
  angleDeg: 30,
  lateralOffsetCm: 29,
  eyeToTorchCm: 58,
}
const TORCH_CHECKS = [
  { id: 'distance', label: `My eyes are ${TORCH_GEOMETRY.viewingDistanceCm} cm from the screen (measured with a tape or ruler).` },
  { id: 'placement', label: `The phone is upright at eye height, ${TORCH_GEOMETRY.lateralOffsetCm} cm to one side of the screen centre, level with the screen surface, with the torch facing my eyes.` },
  { id: 'brightness', label: 'The torch will be on its brightest setting, and the room lighting is the same as last time.' },
  { id: 'noStare', label: 'I will look at the stripes, not at the torch, and will stop if the light is uncomfortable.' },
]
const FEEDBACK_CORRECT_MS = 600
const FEEDBACK_WRONG_MS = 1100

// Identical priors: a lower glare prior would build a loss into Δ before any answers.
const QUEST_SETTINGS = {
  noGlare: { priorMean: 1.5, priorSd: 0.6 },
  glare: { priorMean: 1.5, priorSd: 0.6 },
}

const ORIENTATIONS = GRATING_ORIENTATIONS

function shuffle(list) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Screen mode interleaves conditions (reduces learning/fatigue bias).
 * Torch mode runs a no-glare block, then a torch-on block.
 */
function buildSchedule(mode) {
  const practice = Array.from({ length: PRACTICE_TRIALS }, () => ({ condition: 'noGlare', practice: true }))
  const noGlare = Array.from({ length: TRIALS_PER_CONDITION }, () => ({ condition: 'noGlare', practice: false }))
  const glare = Array.from({ length: TRIALS_PER_CONDITION }, () => ({ condition: 'glare', practice: false }))
  if (mode === 'torch') return [...practice, ...noGlare, ...glare]
  return [...practice, ...shuffle([...noGlare, ...glare])]
}

const CataractTest = () => {
  const navigate = useNavigate()
  const [testState, setTestState] = useState('instructions') // instructions, torch-setup, testing, torch-on, results
  const [glareMode, setGlareMode] = useState('screen') // screen | torch
  const [torchChecks, setTorchChecks] = useState({})
  const [torchSide, setTorchSide] = useState('right')
  const [torchPhone, setTorchPhone] = useState('')
  const [schedule, setSchedule] = useState([])
  const [currentTrial, setCurrentTrial] = useState(0)
  const [responses, setResponses] = useState([])
  const [startTime, setStartTime] = useState(null)
  const [testStartTime, setTestStartTime] = useState(null)
  const [currentStimulus, setCurrentStimulus] = useState(null)
  const [feedback, setFeedback] = useState(null)
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
  const lockedRef = useRef(false)
  const advanceTimeoutRef = useRef(null)
  const lastOrientationRef = useRef(null)
  const questsRef = useRef(null)

  useEffect(() => () => clearTimeout(advanceTimeoutRef.current), [])

  const makeStimulus = useCallback((trialIndex, plan) => {
    const slot = plan[trialIndex]
    // Never repeat the previous direction, so every new trial visibly changes.
    const choices = ORIENTATIONS.filter((o) => o.direction !== lastOrientationRef.current)
    const orientation = choices[Math.floor(Math.random() * choices.length)]
    lastOrientationRef.current = orientation.direction

    const logCS = slot.practice ? PRACTICE_LOGCS : questsRef.current[slot.condition].next()
    return {
      trial: trialIndex,
      condition: slot.condition,
      withGlare: slot.condition === 'glare',
      practice: slot.practice,
      orientation,
      logCS,
      contrast: logCSToContrast(logCS),
    }
  }, [])

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window === 'undefined') return
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognitionInstance = new SpeechRecognition()
    recognitionInstance.continuous = false
    recognitionInstance.interimResults = false
    recognitionInstance.lang = 'en-US'

    recognitionInstance.onresult = (event) => {
      const speechResult = event.results[0][0].transcript.toLowerCase()
      setTranscript(speechResult)

      const directionMap = {
        horizontal: 'horizontal',
        vertical: 'vertical',
        'diagonal right': 'diagonal-right',
        'diagonal left': 'diagonal-left',
        'diag right': 'diagonal-right',
        'diag left': 'diagonal-left',
      }

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
        setTranscript('Not recognized. Say: Horizontal, Vertical, Diagonal Right (/), or Diagonal Left (\\)')
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

      if (event.error === 'no-speech') return

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
  }, [])

  useEffect(() => {
    useVoiceRef.current = useVoice
  }, [useVoice])

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

  useEffect(() => {
    if (useVoice && testState === 'testing' && currentStimulus && !feedback && !isListening) {
      const timeout = setTimeout(() => {
        startListening()
      }, 800)
      return () => clearTimeout(timeout)
    }
  }, [currentStimulus, testState, feedback, isListening, startListening, useVoice])

  const beginTrials = () => {
    clearTimeout(advanceTimeoutRef.current)
    lockedRef.current = false
    lastOrientationRef.current = null
    questsRef.current = {
      noGlare: createQuest(QUEST_SETTINGS.noGlare),
      glare: createQuest(QUEST_SETTINGS.glare),
    }
    const plan = buildSchedule(glareMode)
    setSchedule(plan)
    setFeedback(null)
    setResponses([])
    setCurrentTrial(0)
    setTestStartTime(Date.now())
    setUseVoice(false)
    speechRetryCountRef.current = 0
    setCurrentStimulus(makeStimulus(0, plan))
    setStartTime(Date.now())
    setTestState('testing')
  }

  const startTest = () => {
    if (glareMode === 'torch') {
      setTestState('torch-setup')
      return
    }
    beginTrials()
  }

  useEffect(() => {
    if (testState === 'testing' && currentStimulus) {
      paintGrating(
        canvasRef.current,
        currentStimulus.orientation.angle,
        GRATING_CYCLES,
        currentStimulus.contrast,
        { apertureRadius: APERTURE_RADIUS }
      )
    }
  }, [currentStimulus, testState])

  const handleResponse = useCallback((direction) => {
    if (!currentStimulus || !startTime || lockedRef.current) return
    lockedRef.current = true

    if (recognition) {
      try {
        recognition.stop()
      } catch (e) {
        // Already stopped
      }
    }
    setIsListening(false)

    const isCorrect = direction === currentStimulus.orientation.direction
    if (!currentStimulus.practice) {
      questsRef.current[currentStimulus.condition].update(currentStimulus.logCS, isCorrect)
    }

    const response = {
      trial: currentTrial,
      condition: currentStimulus.condition,
      withGlare: currentStimulus.withGlare,
      practice: currentStimulus.practice,
      orientation: currentStimulus.orientation.direction,
      logCS: Number(currentStimulus.logCS.toFixed(3)),
      userAnswer: direction,
      correct: isCorrect,
      responseTime: Date.now() - startTime,
    }

    const newResponses = [...responses, response]
    setResponses(newResponses)
    setFeedback({
      correct: isCorrect,
      correctName: currentStimulus.orientation.name,
      practice: currentStimulus.practice,
    })

    advanceTimeoutRef.current = setTimeout(
      () => {
        setFeedback(null)
        lockedRef.current = false

        const nextTrial = currentTrial + 1
        if (nextTrial >= schedule.length) {
          finishTest(newResponses)
          return
        }

        setCurrentTrial(nextTrial)
        setCurrentStimulus(makeStimulus(nextTrial, schedule))
        setStartTime(Date.now())

        // Torch mode: pause before the first torch-on trial.
        const enteringGlareBlock =
          glareMode === 'torch' &&
          schedule[nextTrial].condition === 'glare' &&
          schedule[currentTrial].condition !== 'glare'
        if (enteringGlareBlock) setTestState('torch-on')
      },
      isCorrect ? FEEDBACK_CORRECT_MS : FEEDBACK_WRONG_MS
    )
  }, [currentStimulus, startTime, recognition, currentTrial, responses, schedule, glareMode, makeStimulus])

  useEffect(() => {
    handleResponseRef.current = handleResponse
  }, [handleResponse])

  const finishTest = async (finalResponses) => {
    const noGlareEst = questsRef.current.noGlare.estimate()
    const glareEst = questsRef.current.glare.estimate()
    const deltaLogCS = glareDeltaLogCS(noGlareEst.threshold, glareEst.threshold)
    const finalScore = scoreGlareDelta(deltaLogCS)
    const interpretation = interpretGlareDelta({
      logCSNoGlare: noGlareEst.threshold,
      logCSGlare: glareEst.threshold,
      deltaLogCS,
      sdNoGlare: noGlareEst.sd,
      sdGlare: glareEst.sd,
    })

    const scored = finalResponses.filter((r) => !r.practice)
    const avgResponseTime = scored.length
      ? Math.round(scored.reduce((sum, r) => sum + r.responseTime, 0) / scored.length)
      : 0

    setScore(finalScore)
    setResultSummary({
      ...interpretation,
      sdNoGlare: noGlareEst.sd,
      sdGlare: glareEst.sd,
      glareMode,
      trialsPerCondition: TRIALS_PER_CONDITION,
    })
    setTestState('results')

    try {
      await visionTestAPI.submit({
        test_type: 'cataract_glare',
        score: finalScore,
        response_time_ms: avgResponseTime,
        errors: scored.filter((r) => !r.correct).length,
        test_details: {
          method: 'quest_4afc_delta_logcs',
          method_version: 2,
          glare_mode: glareMode,
          glare_source_label: glareMode === 'torch' ? 'phone_torch' : 'simulated_veiling_luminance_screen_ring',
          torch_setup: glareMode === 'torch'
            ? {
                viewing_distance_cm: TORCH_GEOMETRY.viewingDistanceCm,
                angle_deg: TORCH_GEOMETRY.angleDeg,
                lateral_offset_cm: TORCH_GEOMETRY.lateralOffsetCm,
                eye_to_torch_cm: TORCH_GEOMETRY.eyeToTorchCm,
                side: torchSide,
                torch_level: 'brightest_setting_self_reported',
                phone_label: torchPhone.trim() || null,
                luminance_measured: false,
                confirmations: TORCH_CHECKS.map((c) => c.id),
              }
            : null,
          logcs_no_glare: interpretation.logCSNoGlare,
          logcs_glare: interpretation.logCSGlare,
          delta_logcs: deltaLogCS,
          sd_no_glare: Number(noGlareEst.sd.toFixed(3)),
          sd_glare: Number(glareEst.sd.toFixed(3)),
          low_confidence: interpretation.lowConfidence,
          ceiling_no_glare: interpretation.ceilingNoGlare,
          ceiling_glare: interpretation.ceilingGlare,
          trials_per_condition: TRIALS_PER_CONDITION,
          grating_cycles_per_canvas: GRATING_CYCLES,
          interpretation_band: interpretation.band,
          interpretation_status: interpretation.status,
          scoring_note:
            'Δ logCS = logCS(no glare) − logCS(glare) from two QUEST staircases (4-choice orientation). Display index (not clinically validated, not used for alerts): Δ 0 → 100, Δ ≥ 0.5 → 0. Screen mode is a simulated veiling luminance; torch mode uses a fixed 30° / 58 cm placement with unmeasured torch luminance. Screen and torch sessions are not compared with each other. Not a cataract diagnosis.',
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

  const stopTest = () => {
    clearTimeout(advanceTimeoutRef.current)
    lockedRef.current = false
    if (recognition) {
      try {
        recognition.stop()
      } catch {
        /* already stopped */
      }
    }
    setIsListening(false)
    setFeedback(null)
    setTestState('stopped')
  }

  const allTorchChecks = TORCH_CHECKS.every((c) => torchChecks[c.id])

  const torchPlacement = (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <svg viewBox="0 0 220 150" className="w-56 shrink-0" role="img" aria-label="Top-down placement guide">
          <rect x="50" y="10" width="80" height="8" rx="2" fill="#374151" />
          <text x="90" y="34" textAnchor="middle" fontSize="9" fill="#374151">screen</text>
          <rect x={torchSide === 'right' ? 166 : 6} y="6" width="14" height="16" rx="3" fill="#f59e0b" />
          <text x={torchSide === 'right' ? 173 : 13} y="34" textAnchor="middle" fontSize="9" fill="#92400e">torch</text>
          <circle cx="90" cy="135" r="7" fill="#2563eb" />
          <text x="90" y="149" textAnchor="middle" fontSize="9" fill="#1e3a8a">your eyes</text>
          <line x1="90" y1="128" x2="90" y2="18" stroke="#2563eb" strokeDasharray="3 3" />
          <line x1="90" y1="128" x2={torchSide === 'right' ? 173 : 13} y2="22" stroke="#f59e0b" strokeDasharray="3 3" />
          <text x="96" y="80" fontSize="9" fill="#1e3a8a">{TORCH_GEOMETRY.viewingDistanceCm} cm</text>
          <text x={torchSide === 'right' ? 130 : 22} y="100" fontSize="9" fill="#92400e">{TORCH_GEOMETRY.angleDeg}°</text>
          <text x={torchSide === 'right' ? 130 : 30} y="16" fontSize="8" fill="#92400e" textAnchor="middle">{TORCH_GEOMETRY.lateralOffsetCm} cm</text>
        </svg>
        <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">
          <li>Sit with your eyes <strong>{TORCH_GEOMETRY.viewingDistanceCm} cm</strong> from the screen. Measure it.</li>
          <li>
            Stand the phone upright at eye height, <strong>{TORCH_GEOMETRY.lateralOffsetCm} cm</strong> to the side of
            the screen centre and level with the screen surface. That puts the torch{' '}
            <strong>{TORCH_GEOMETRY.angleDeg}° off your line of sight</strong>, about {TORCH_GEOMETRY.eyeToTorchCm} cm from
            your eyes.
          </li>
          <li>Use the torch&apos;s <strong>brightest setting</strong>, the same phone, and the same room lighting every time.</li>
        </ul>
      </div>
      <div className="flex gap-2 text-xs">
        <span className="text-gray-600 self-center">Torch side:</span>
        {['left', 'right'].map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => setTorchSide(side)}
            className={`px-3 py-1 rounded-full border ${torchSide === side ? 'border-accent-600 bg-accent-50 text-accent-900' : 'border-gray-300 text-gray-600'}`}
          >
            {side === 'left' ? 'Left of screen' : 'Right of screen'}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Do not stare into the torch.</strong> Keep your eyes on the stripes. If the light becomes
        uncomfortable, press <strong>Stop</strong> at any time and switch the torch off.
      </div>
    </div>
  )

  if (testState === 'stopped') {
    return (
      <div className="test-shell">
        <div className="max-w-2xl mx-auto card p-8 space-y-4">
          <h1 className="page-title">Test stopped</h1>
          {glareMode === 'torch' && (
            <p className="text-gray-700"><strong>Switch the phone torch off now</strong> and look away from bright lights.</p>
          )}
          <p className="text-gray-700">
            Nothing was saved. Rest your eyes. If discomfort continues or you notice pain, redness, or changes in
            vision, contact an eye-care professional.
          </p>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => navigate('/vision-tests')}
              className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50"
            >
              Back to Tests
            </button>
            <button
              type="button"
              onClick={() => setTestState('instructions')}
              className="flex-1 px-6 py-3 bg-accent-600 hover:bg-accent-700 text-white rounded-full font-semibold"
            >
              Start over
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (testState === 'torch-setup' || testState === 'torch-on') {
    const isOn = testState === 'torch-on'
    return (
      <div className="test-shell">
        <div className="max-w-2xl mx-auto card p-8 space-y-6">
          <h1 className="page-title">{isOn ? 'Turn the torch ON' : 'Set up your phone torch'}</h1>
          {isOn ? (
            <>
              <p className="text-gray-700">
                First half done. Now switch your phone&apos;s flashlight <strong>on at its brightest setting</strong>,
                keep the phone exactly where it is, and continue. The next {TRIALS_PER_CONDITION} rounds are with the
                light on.
              </p>
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <strong>Do not stare into the torch.</strong> Look only at the stripes. Press Stop if it is uncomfortable.
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-700">
                Place your phone now with the flashlight <strong>off</strong>. You&apos;ll do{' '}
                {TRIALS_PER_CONDITION} rounds with the light off, then we&apos;ll ask you to switch it on.
              </p>
              {torchPlacement}
              <div className="space-y-2">
                {TORCH_CHECKS.map((c) => (
                  <label key={c.id} className="flex items-start gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!torchChecks[c.id]}
                      onChange={(e) => setTorchChecks((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
                <label className="block text-sm text-gray-700">
                  Phone used as the torch (optional, helps you keep it the same):
                  <input
                    type="text"
                    value={torchPhone}
                    maxLength={60}
                    onChange={(e) => setTorchPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. my work phone"
                  />
                </label>
              </div>
            </>
          )}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={isOn ? stopTest : () => setTestState('instructions')}
              className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50"
            >
              {isOn ? 'Stop' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={!isOn && !allTorchChecks}
              onClick={() => {
                if (isOn) {
                  setStartTime(Date.now())
                  setTestState('testing')
                } else {
                  beginTrials()
                }
              }}
              className="flex-1 px-6 py-3 bg-accent-600 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full font-semibold"
            >
              {isOn ? 'Torch is on — continue' : 'Phone is in place — start'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (testState === 'testing' && currentStimulus) {
    const scoredDone = responses.filter((r) => !r.practice).length
    const scoredTotal = TRIALS_PER_CONDITION * 2
    const showScreenGlare = glareMode === 'screen' && currentStimulus.withGlare && !feedback
    const subtitle = currentStimulus.practice
      ? 'Practice round — not scored'
      : currentStimulus.withGlare
        ? glareMode === 'torch' ? 'Torch on' : 'Simulated veiling luminance on'
        : glareMode === 'torch' ? 'Torch off' : 'No glare'

    return (
      <VisionTestShell
        title="Glare Test"
        subtitle={subtitle}
        statusBar={
          <div className="flex items-center gap-3 min-w-[140px]">
            <span className="text-xs font-medium whitespace-nowrap">
              {currentStimulus.practice ? 'Practice' : `${scoredDone + 1}/${scoredTotal}`}
            </span>
            <div className="w-24 bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-accent-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(scoredDone / scoredTotal) * 100}%` }}
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
                className="w-full h-full rounded-2xl"
                style={{ background: 'rgb(128,128,128)' }}
              />
              {showScreenGlare && (
                <div
                  className="absolute inset-0 pointer-events-none rounded-2xl"
                  style={{
                    background:
                      'radial-gradient(circle closest-side, transparent 0 74%, #ffffff 76% 100%, transparent 100%)',
                    boxShadow: '0 0 90px 40px rgba(255,255,255,0.9)',
                  }}
                />
              )}
              {feedback && (
                <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
                  <div
                    className={`px-4 py-2 rounded-xl text-center text-white shadow-lg ${
                      feedback.correct ? 'bg-green-600' : 'bg-gray-900/90'
                    }`}
                  >
                    <div className="text-sm font-semibold">
                      {feedback.correct ? '✓ Correct — recorded' : '✗ Not quite — recorded'}
                    </div>
                    {!feedback.correct && (
                      <div className="text-xs mt-0.5 opacity-90">
                        These stripes were {feedback.correctName}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        controls={(
          <>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Which picture matches the stripes?
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Stripes get fainter as you succeed. Not sure? Take your best guess — near your limit,
                missing some is expected and is how the test finds it.
              </p>
              {currentStimulus.withGlare && glareMode === 'screen' && (
                <p className="text-xs text-accent-700 font-medium mt-2 bg-accent-50 border border-accent-200 rounded-lg px-2 py-1.5">
                  Simulated veiling luminance: keep your eyes on the stripes, not the bright ring.
                </p>
              )}
              {currentStimulus.withGlare && glareMode === 'torch' && (
                <p className="text-xs text-amber-900 font-medium mt-2 bg-amber-50 border border-amber-300 rounded-lg px-2 py-1.5">
                  Torch on: look at the stripes. Do not stare into the light.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={stopTest}
              className="w-full px-3 py-2 border border-red-300 text-red-700 rounded-xl text-xs font-semibold hover:bg-red-50 min-h-[40px]"
            >
              Stop — uncomfortable or need a break
            </button>

            <div className="grid grid-cols-2 gap-2">
              {ORIENTATIONS.map((o) => (
                <button
                  key={o.direction}
                  type="button"
                  disabled={!!feedback}
                  onClick={() => handleResponse(o.direction)}
                  className="flex flex-col items-center gap-1.5 px-2 py-3 bg-accent-600 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold min-h-[80px] transition-colors"
                >
                  <GratingSwatch angle={o.angle} className="border border-white/40" />
                  <span>
                    {o.label} <span className="font-mono">{o.symbol}</span>
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
        {testState === 'instructions' && (
          <div className="card p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-accent-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-accent-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h1 className="page-title mb-2">Glare Test</h1>
              <p className="text-sm text-accent-600 font-medium mb-4">
                How much a nearby light source reduces the faintest detail you can see
              </p>
            </div>

            <div className="space-y-6 text-left">
              <div className="bg-accent-50 border-l-4 border-accent-500 p-6">
                <h3 className="font-semibold text-orange-900 mb-2">What this measures</h3>
                <div className="text-sm text-orange-900 space-y-2">
                  <p>
                    A bright light near what you&apos;re looking at scatters inside the eye and washes out
                    faint detail (like oncoming headlights). This test finds the faintest stripes you can
                    see <strong>with and without</strong> a glare source and reports the difference
                    (Δ logCS).
                  </p>
                  <p>
                    <strong>Important:</strong> a screen can&apos;t match real headlights, so the screen
                    version is a simulation. Glare trouble has many causes; this is not a cataract exam
                    and does not diagnose disease.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Choose a glare source</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    {
                      id: 'screen',
                      title: 'Simulated veiling luminance (default)',
                      body: 'A bright on-screen ring appears around the stripes on glare rounds. It simulates veiling glare; it is not a real light source. Nothing extra needed.',
                    },
                    {
                      id: 'torch',
                      title: 'Phone torch (more realistic)',
                      body: `Use a phone flashlight at a fixed ${TORCH_GEOMETRY.angleDeg}° placement as a real light source. Needs a tape measure and a minute to set up.`,
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setGlareMode(opt.id)}
                      className={`text-left rounded-xl border-2 p-4 transition-colors ${
                        glareMode === opt.id ? 'border-accent-600 bg-accent-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold text-gray-900 text-sm">{opt.title}</div>
                      <div className="text-xs text-gray-600 mt-1">{opt.body}</div>
                    </button>
                  ))}
                </div>
                {glareMode === 'torch' && <div className="mt-4">{torchPlacement}</div>}
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3">How it works</h3>
                <ol className="space-y-3 text-gray-700">
                  <li className="flex">
                    <span className="font-semibold mr-3">1.</span>
                    <span>A circle of stripes appears. The stripes run in one of four directions.</span>
                  </li>
                  <li className="flex">
                    <span className="font-semibold mr-3">2.</span>
                    <span>
                      <strong>Tap the button whose picture matches the stripes.</strong> You&apos;ll see
                      “recorded” before the next pattern.
                    </span>
                  </li>
                  <li className="flex">
                    <span className="font-semibold mr-3">3.</span>
                    <span>
                      The stripes get fainter when you&apos;re right and stronger when you miss, until the
                      test finds your limit. <strong>If unsure, guess</strong> — that&apos;s expected.
                    </span>
                  </li>
                  <li className="flex">
                    <span className="font-semibold mr-3">4.</span>
                    <span>
                      {PRACTICE_TRIALS} practice rounds, then {TRIALS_PER_CONDITION * 2} scored rounds
                      (about 2–3 minutes).
                    </span>
                  </li>
                </ol>

                <div className="mt-4 grid grid-cols-4 gap-3">
                  {ORIENTATIONS.map((o) => (
                    <div key={o.direction} className="flex flex-col items-center gap-1.5 text-xs text-gray-700">
                      <GratingSwatch angle={o.angle} size={56} className="border border-gray-300" />
                      <span className="font-medium">
                        {o.label} <span className="font-mono">{o.symbol}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-3">Before you start</h3>
                <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">
                  <li>Sit about 50 cm from your screen and wear your usual glasses.</li>
                  <li>Dim the room lights and turn screen brightness up.</li>
                  <li>Turn off Night Shift / True Tone / auto-brightness if you can.</li>
                  <li>Voice answers are available if your browser supports them.</li>
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
                    <h2 className="text-3xl font-serif font-bold text-gray-900 mb-2">Test Complete</h2>
                    <p className="text-gray-600">
                      Contrast loss under glare —{' '}
                      {resultSummary.glareMode === 'torch' ? 'phone torch' : 'simulated veiling luminance (screen ring)'} · home check
                      only
                    </p>
                  </div>

                  <div className="bg-amber-50 rounded-2xl p-8 mb-6">
                    <div className="text-center">
                      <div className="text-sm text-gray-600 mb-1">Contrast lost under glare</div>
                      <div className="text-6xl font-bold text-accent-700 mb-1">
                        Δ {Math.max(0, resultSummary.deltaLogCS).toFixed(2)}
                        <span className="text-2xl font-semibold text-gray-500"> logCS</span>
                      </div>
                      <div className="text-lg font-semibold text-gray-800 mb-1">
                        ×{Math.max(1, resultSummary.contrastFactor).toFixed(1)} contrast needed with glare
                      </div>
                      <p className="text-xs text-gray-500 mb-4 max-w-md mx-auto">
                        0 = no loss; each 0.3 logCS means twice the contrast was needed to see the stripes.
                      </p>
                      <div className={`inline-block px-4 py-2 rounded-full font-semibold ${tone.badge}`}>
                        {resultSummary.status}
                      </div>
                      <div className="text-xs text-gray-500 mt-4">
                        Index {score}/100 — {DISPLAY_INDEX_LABEL.toLowerCase()}.
                      </div>
                      {resultSummary.ceilingNote && (
                        <div className="text-xs text-gray-500 mt-2 max-w-md mx-auto">{resultSummary.ceilingNote}</div>
                      )}
                    </div>
                  </div>

                  {resultSummary.lowConfidence && (
                    <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 mb-6 text-sm text-amber-900">
                      Low confidence: your answers were inconsistent, so these numbers are rough. Retake when
                      rested, at a steady distance, in a dim room.
                    </div>
                  )}

                  <div className={`border rounded-xl p-6 mb-6 ${tone.panel}`}>
                    <h3 className={`font-semibold mb-2 ${tone.title}`}>What this means</h3>
                    <p className={`text-sm font-medium mb-2 ${tone.body}`}>{resultSummary.headline}</p>
                    <p className={`text-sm ${tone.body}`}>{resultSummary.detail}</p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4 mb-6">
                    {[
                      { label: 'Without glare', value: resultSummary.logCSNoGlare, sd: resultSummary.sdNoGlare, ceiling: resultSummary.ceilingNoGlare },
                      { label: 'With glare', value: resultSummary.logCSGlare, sd: resultSummary.sdGlare, ceiling: resultSummary.ceilingGlare },
                    ].map((row) => (
                      <div key={row.label} className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                        <div className="text-sm text-gray-600 mb-1">
                          {row.label}
                          {row.ceiling && <span className="ml-2 text-xs font-semibold text-green-700">at test limit</span>}
                        </div>
                        <div className="text-3xl font-bold text-gray-900">
                          {row.value.toFixed(2)} <span className="text-base font-semibold">logCS</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Faintest stripes seen ≈ {(logCSToContrast(row.value) * 100).toFixed(1)}% contrast ·
                          ±{row.sd.toFixed(2)} · {resultSummary.trialsPerCondition} rounds
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
                    <h3 className="font-semibold text-blue-900 mb-3">About glare (education only)</h3>
                    <div className="text-sm text-blue-800 space-y-2">
                      <p>
                        Night glare can come from many things — uncorrected prescription, dry eye, dirty
                        lenses, or a cloudy crystalline lens. Only an eye doctor can sort those out.
                      </p>
                      <p>
                        For comparable results over time, retake with the same glare source, distance, and
                        room lighting. Screen-ring and torch results are tracked separately and never compared
                        with each other.
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
