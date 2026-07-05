import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'

/**
 * PERIPHERAL FIELD SCREEN — 4-Quadrant Paracentral Test
 *
 * Clinical basis: Digital Goldmann Perimetry
 * ─────────────────────────────────────────────────────
 * • Fixation Monitor: pulsing central "+" + occasional gaze-trap letter
 * • Stimulus: 15° eccentricity (paracentral), 200–400 ms flash, M-scaled 4×
 * • Contrast: 0.3 LogCS easier than the user's central threshold (from Test 1)
 *             Falls back to LogCS 1.0 (10% contrast) if no prior result
 * • Staircase: 1-up/1-down per quadrant (4 quadrants × 6 rounds = ~24 trials)
 * • Scoring: Relative Scotoma per quadrant vs. central reference
 * • Quadrants: Superior-Temporal, Superior-Nasal, Inferior-Temporal, Inferior-Nasal
 */

const SLOAN = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z']

const WORD_MAP = {
  'C':'C','SEE':'C','SEA':'C','CEE':'C','SI':'C','CY':'C','CHARLIE':'C',
  'D':'D','DEE':'D','DELTA':'D',
  'H':'H','AITCH':'H','HAITCH':'H','ACHE':'H','HOTEL':'H',
  'K':'K','KAY':'K','KEY':'K','KILO':'K','CAKE':'K',
  'N':'N','EN':'N','AND':'N','IN':'N','NOVEMBER':'N',
  'O':'O','OH':'O','OWE':'O','OHH':'O','OSCAR':'O',
  'R':'R','ARE':'R','AR':'R','OUR':'R','HOUR':'R','ROMEO':'R',
  'S':'S','ESS':'S','ES':'S','SIERRA':'S',
  'V':'V','VEE':'V','VICTOR':'V','VI':'V',
  'Z':'Z','ZEE':'Z','ZED':'Z','ZULU':'Z',
}

const parseSpokenLetter = (raw) => {
  if (!raw) return null
  const upper = raw.trim().toUpperCase()
  if (upper.length === 1 && SLOAN.includes(upper)) return upper
  if (WORD_MAP[upper]) return WORD_MAP[upper]
  const words = upper.split(/[\s,.\-!?]+/).filter(Boolean)
  for (const w of words) {
    if (SLOAN.includes(w)) return w
    if (WORD_MAP[w]) return WORD_MAP[w]
  }
  for (const w of words) {
    const a = w.replace(/[^A-Z]/g, '')
    if (a.length === 1 && SLOAN.includes(a)) return a
  }
  const stripped = upper.replace(/[^A-Z]/g, '')
  for (const ch of stripped) { if (SLOAN.includes(ch)) return ch }
  return null
}

// contrast = 10^(-logCS)  → rgb = round(255*(1-contrast))
const logCStoRGB = (logCS) => Math.round(255 * (1 - Math.pow(10, -logCS)))

const QUADRANTS = [
  { id: 'ST', label: 'Superior-Temporal', x: 72, y: 22 },
  { id: 'SN', label: 'Superior-Nasal',    x: 28, y: 22 },
  { id: 'IT', label: 'Inferior-Temporal', x: 72, y: 78 },
  { id: 'IN', label: 'Inferior-Nasal',    x: 28, y: 78 },
]

const TRIALS_PER_QUADRANT = 6
const FLASH_MIN_MS = 200
const FLASH_MAX_MS = 400
const GAZE_TRAP_EVERY = 4
const STAIRCASE_STEP = 0.15

const buildTrials = (centralLogCS) => {
  const startLogCS = Math.max(0.3, centralLogCS - 0.3)
  const trials = []
  let counter = 0
  for (let round = 0; round < TRIALS_PER_QUADRANT; round++) {
    const shuffled = [...QUADRANTS].sort(() => Math.random() - 0.5)
    for (const q of shuffled) {
      counter++
      if (counter % GAZE_TRAP_EVERY === 0) {
        trials.push({
          type: 'gaze_trap', quadrant: null,
          letter: SLOAN[Math.floor(Math.random() * SLOAN.length)],
          logCS: 0.0, round,
        })
      }
      trials.push({
        type: 'peripheral', quadrant: q,
        letter: SLOAN[Math.floor(Math.random() * SLOAN.length)],
        logCS: startLogCS, round,
      })
    }
  }
  return trials
}

const GlaucomaTest = () => {
  const navigate = useNavigate()

  const [phase, setPhase] = useState('instructions')
  const [trials, setTrials] = useState([])
  const [trialIdx, setTrialIdx] = useState(0)
  const [responses, setResponses] = useState([])

  const [stimVisible, setStimVisible] = useState(false)
  const [stimLetter, setStimLetter] = useState('')
  const [stimPos, setStimPos] = useState({ x: 50, y: 50 })
  const [stimRGB, setStimRGB] = useState(0)
  const [stimSizePx, setStimSizePx] = useState(80)

  const [fixPulse, setFixPulse] = useState(false)
  const [gazeTrapWarning, setGazeTrapWarning] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [hearBubble, setHearBubble] = useState('')

  const staircaseRef = useRef({})
  const currentTrialRef = useRef(null)
  const trialIdxRef = useRef(0)
  const trialsRef = useRef([])
  const responsesRef = useRef([])
  const phaseRef = useRef('instructions')
  const frameRef = useRef(null)
  const recognitionRef = useRef(null)
  const recognitionBusyRef = useRef(false)
  const handleVoiceResultRef = useRef(null)
  const flashTimerRef = useRef(null)
  const waitTimerRef = useRef(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { trialIdxRef.current = trialIdx }, [trialIdx])

  const getCentralLogCS = () => {
    try { const s = localStorage.getItem('cs_last_logCS'); if (s) return parseFloat(s) } catch (e) {}
    return 1.0
  }

  const getPeriphSize = () => {
    const base = frameRef.current ? Math.min(frameRef.current.offsetWidth, frameRef.current.offsetHeight) * 0.07 : 40
    return Math.round(base * 4)
  }
  const getTrapSize = () => {
    const base = frameRef.current ? Math.min(frameRef.current.offsetWidth, frameRef.current.offsetHeight) * 0.07 : 40
    return Math.round(base * 1)
  }

  // Voice recognition setup
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const createRec = () => {
      const r = new SR()
      r.continuous = true; r.interimResults = false; r.lang = 'en-US'; r.maxAlternatives = 5
      r.onstart = () => { recognitionBusyRef.current = true; setIsListening(true) }
      r.onresult = (event) => {
        const alts = []
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i]; if (!res.isFinal) continue
          for (let a = 0; a < res.length; a++) { const t = res[a].transcript.trim().toUpperCase(); if (t) alts.push(t) }
          if (alts.length > 0 && handleVoiceResultRef.current) { handleVoiceResultRef.current(alts); return }
        }
      }
      r.onerror = (e) => { recognitionBusyRef.current = false }
      r.onend = () => {
        recognitionBusyRef.current = false; setIsListening(false)
        if (phaseRef.current === 'testing') {
          setTimeout(() => {
            if (phaseRef.current === 'testing' && !recognitionBusyRef.current) {
              try { recognitionRef.current = createRec(); recognitionRef.current.start() } catch (e) {}
            }
          }, 200)
        }
      }
      return r
    }
    recognitionRef.current = createRec()
    return () => { try { recognitionRef.current?.stop() } catch (e) {} }
  }, [])

  // Fixation pulse
  useEffect(() => {
    if (phase !== 'testing') return
    const id = setInterval(() => setFixPulse(p => !p), 750)
    return () => clearInterval(id)
  }, [phase])

  const runTrial = useCallback((idx, trialList) => {
    if (idx >= trialList.length) return
    const trial = { ...trialList[idx] }
    if (trial.type === 'peripheral') {
      const qid = trial.quadrant.id
      if (staircaseRef.current[qid] !== undefined) trial.logCS = staircaseRef.current[qid]
      else staircaseRef.current[qid] = trial.logCS
    }
    currentTrialRef.current = trial
    const isGT = trial.type === 'gaze_trap'
    setStimRGB(isGT ? 0 : logCStoRGB(trial.logCS))
    setStimPos(isGT ? { x: 50, y: 50 } : trial.quadrant)
    setStimSizePx(isGT ? getTrapSize() : getPeriphSize())
    setStimLetter(trial.letter)
    setFeedback(null); setVoiceTranscript(''); setHearBubble('')
    const flashDur = FLASH_MIN_MS + Math.random() * (FLASH_MAX_MS - FLASH_MIN_MS)
    setStimVisible(true)
    flashTimerRef.current = setTimeout(() => {
      setStimVisible(false)
      waitTimerRef.current = setTimeout(() => {
        if (handleVoiceResultRef.current) handleVoiceResultRef.current(['NOTHING'])
      }, 3000)
    }, flashDur)
  }, [])

  const advanceTrial = useCallback((isGazeTrapTrial) => {
    const nextIdx = trialIdxRef.current + 1
    setTrialIdx(nextIdx)
    if (nextIdx >= trialsRef.current.length) { setTimeout(() => finishTest(), 600); return }
    setTimeout(() => { setFeedback(null); runTrial(nextIdx, trialsRef.current) }, isGazeTrapTrial ? 200 : 700)
  }, [runTrial])

  const handleVoiceResult = useCallback((alts) => {
    if (phaseRef.current !== 'testing') return
    clearTimeout(waitTimerRef.current)
    const trial = currentTrialRef.current; if (!trial) return
    let spokenLetter = null, usedAlt = alts[0]
    for (const t of alts) { const p = parseSpokenLetter(t); if (p) { spokenLetter = p; usedAlt = t; break } }
    setHearBubble(usedAlt); setVoiceTranscript(spokenLetter || '?')
    const saw = spokenLetter !== null; const correct = spokenLetter === trial.letter
    if (trial.type === 'gaze_trap') {
      if (!correct) { setGazeTrapWarning(true); setTimeout(() => setGazeTrapWarning(false), 2500) }
      advanceTrial(true); return
    }
    const qid = trial.quadrant.id
    const cur = staircaseRef.current[qid] ?? trial.logCS
    staircaseRef.current[qid] = correct
      ? Math.min(2.3, cur + STAIRCASE_STEP)
      : Math.max(0.1, cur - STAIRCASE_STEP)
    setFeedback({ text: correct ? `Correct — "${spokenLetter}"` : `It was "${trial.letter}"`, color: correct ? '#22c55e' : '#f97316' })
    const resp = {
      type: 'peripheral', quadrant: qid, quadrantLabel: trial.quadrant.label,
      letter: trial.letter, answer: spokenLetter, correct, saw, logCS: trial.logCS, round: trial.round,
    }
    responsesRef.current = [...responsesRef.current, resp]
    setResponses([...responsesRef.current])
    advanceTrial(false)
  }, [advanceTrial])

  useEffect(() => { handleVoiceResultRef.current = handleVoiceResult }, [handleVoiceResult])

  const startTest = () => {
    const cl = getCentralLogCS(); const tl = buildTrials(cl)
    trialsRef.current = tl; responsesRef.current = []; staircaseRef.current = {}
    setTrials(tl); setResponses([]); setTrialIdx(0); trialIdxRef.current = 0; setPhase('testing')
    setTimeout(() => { try { recognitionRef.current?.start() } catch (e) {} }, 400)
    setTimeout(() => runTrial(0, tl), 800)
  }

  const finishTest = async () => {
    setPhase('results'); try { recognitionRef.current?.stop() } catch (e) {}
    const cl = getCentralLogCS()
    const periphR = responsesRef.current.filter(r => r.type === 'peripheral')
    const qd = {}; for (const q of QUADRANTS) {
      const qr = periphR.filter(r => r.quadrant === q.id)
      const correct = qr.filter(r => r.correct).length; const total = qr.length
      const finalLogCS = staircaseRef.current[q.id] ?? cl
      qd[q.id] = { label: q.label, accuracy: total > 0 ? correct / total : null, correct, total, finalLogCS, deficit: cl - finalLogCS }
    }
    const totalC = periphR.filter(r => r.correct).length; const totalT = periphR.length
    const oa = totalT > 0 ? totalC / totalT : 0
    const maxD = Math.max(...Object.values(qd).map(d => d.deficit))
    const scotoma = Object.entries(qd).filter(([,d]) => d.deficit > 0.3)
    try {
      await visionTestAPI.submit({ test_type: 'glaucoma_neural', score: Math.round(oa * 100), response_time_ms: 0, errors: totalT - totalC,
        test_details: { central_logCS_reference: cl, quadrant_data: qd, overall_accuracy: oa, max_deficit: maxD, relative_scotoma_quadrants: scotoma.map(([id]) => id), responses: responsesRef.current }
      })
    } catch (e) { console.error('submit failed:', e) }
  }

  const computeResults = () => {
    const cl = getCentralLogCS()
    const periphR = responses.filter(r => r.type === 'peripheral')
    const totalC = periphR.filter(r => r.correct).length; const totalT = periphR.length
    const oa = totalT > 0 ? totalC / totalT : 0
    const qd = {}; for (const q of QUADRANTS) {
      const qr = periphR.filter(r => r.quadrant === q.id)
      const correct = qr.filter(r => r.correct).length; const total = qr.length
      const fl = staircaseRef.current[q.id] ?? cl
      qd[q.id] = { label: q.label, accuracy: total > 0 ? correct / total : null, correct, total, finalLogCS: fl, deficit: cl - fl }
    }
    const maxD = Math.max(...Object.values(qd).map(d => d.deficit))
    const scotomaPairs = Object.entries(qd).filter(([,d]) => d.deficit > 0.3)
    let riskLevel, riskLabel, riskColor, riskMessage
    if (maxD <= 0.15 && oa >= 0.75) {
      riskLevel='low'; riskLabel='Within Normal Limits'; riskColor='#22c55e'
      riskMessage='Your peripheral contrast sensitivity is symmetrical and within expected range. No relative scotomas detected.'
    } else if (maxD <= 0.3 || (scotomaPairs.length === 0 && oa >= 0.6)) {
      riskLevel='moderate'; riskLabel='Borderline'; riskColor='#f59e0b'
      riskMessage='Mild asymmetry detected between quadrants. This may reflect normal variation or early neural change. Recommend re-testing in 3 months and consulting an eye care professional.'
    } else {
      riskLevel='high'; riskLabel='Relative Scotoma Detected'; riskColor='#ef4444'
      riskMessage=`Significant contrast sensitivity deficit in: ${scotomaPairs.map(([id]) => qd[id].label).join(', ')}. This pattern is consistent with early paracentral field loss. Please consult an eye care professional for a Humphrey Visual Field test and optic nerve OCT.`
    }
    return { qd, oa, maxD, scotomaPairs, riskLevel, riskLabel, riskColor, riskMessage, cl }
  }

  const progress = trials.length > 0 ? Math.round((trialIdx / trials.length) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 px-4">
      <div className="max-w-3xl mx-auto">

        {/* INSTRUCTIONS */}
        {phase === 'instructions' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-9 h-9 text-violet-700 dark:text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Peripheral Field Screen</h1>
              <p className="text-sm text-violet-600 dark:text-violet-400 font-medium">4-Quadrant Paracentral Sensitivity — Digital Goldmann Perimetry</p>
            </div>

            <div className="bg-violet-50 dark:bg-violet-900/30 border-l-4 border-violet-500 rounded-r-xl p-5 mb-6">
              <h3 className="font-semibold text-violet-900 dark:text-violet-200 mb-2">What This Test Measures</h3>
              <p className="text-sm text-violet-800 dark:text-violet-300">
                Your <strong>peripheral contrast sensitivity</strong> — the ability of your paracentral retina to detect faint letters 15° off-centre.
                Glaucoma kills the <em>Magnocellular neurons</em> that handle this task, often <strong>5–10 years before tunnel vision</strong> is noticed.
              </p>
            </div>

            <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300 mb-6">
              {[
                ['1', <><strong>Fix your gaze on the "+" in the centre</strong> — do <em>not</em> move your eyes toward the letter.</>],
                ['2', <>A faint letter will <strong>flash briefly (200–400 ms)</strong> in one of the four corners. Use peripheral vision only.</>],
                ['3', <><strong>Say the letter out loud</strong>. If you saw nothing, say <strong>"nothing"</strong>.</>],
                ['4', <>Occasionally a <strong>bright letter appears at the centre</strong> — say it. This checks you aren't looking at the corners.</>],
                ['5', <>~24 trials, about <strong>4–5 minutes</strong>. Sit ~50 cm from your screen in a quiet, well-lit room.</>],
              ].map(([n, text]) => (
                <div key={n} className="flex gap-3">
                  <span className="flex-shrink-0 w-7 h-7 bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 rounded-full flex items-center justify-center font-bold text-xs">{n}</span>
                  <p>{text}</p>
                </div>
              ))}
            </div>

            <div className="bg-gray-100 dark:bg-gray-700 rounded-xl p-4 mb-6 flex items-center justify-center gap-8 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">+</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Stare here</div>
              </div>
              <div className="text-gray-400">→</div>
              <div className="text-center">
                <div className="text-2xl font-bold opacity-25 text-gray-700 dark:text-gray-300 mb-1">H</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Corner flash</div>
              </div>
              <div className="text-gray-400">→</div>
              <div className="text-center">
                <div className="text-sm font-semibold text-violet-600 dark:text-violet-400 mb-1">"H"</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Voice answer</div>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 mb-8 text-xs text-amber-800 dark:text-amber-300">
              <strong>Allow microphone access</strong> when prompted — voice input lets you answer without breaking fixation.
            </div>

            <div className="flex gap-4">
              <button onClick={() => navigate('/vision-tests')} className="flex-1 px-5 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-full font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Back</button>
              <button onClick={startTest} className="flex-1 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-full font-semibold transition-colors">Begin Test</button>
            </div>
          </div>
        )}

        {/* TESTING */}
        {phase === 'testing' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Peripheral Field Screen</span>
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${isListening ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  {isListening ? 'Listening' : 'Mic'}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{Math.min(trialIdx + 1, trials.length)} / {trials.length}</span>
              </div>
            </div>

            <div className="h-1.5 bg-gray-100 dark:bg-gray-700">
              <div className="h-1.5 bg-violet-500 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>

            {gazeTrapWarning && (
              <div className="bg-orange-500 text-white text-center text-sm font-semibold py-2 px-4 animate-pulse">
                Keep your eyes on the centre "+" — don't look at the corners!
              </div>
            )}

            <div ref={frameRef} className="relative select-none" style={{ backgroundColor: '#f7f7f7', height: '480px' }}>
              {/* Fixation cross */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-bold pointer-events-none"
                style={{ fontSize: '32px', color: fixPulse ? '#7c3aed' : '#a78bfa', transition: 'color 0.35s ease', lineHeight: 1, userSelect: 'none' }}>
                +
              </div>

              {/* Peripheral / gaze-trap letter */}
              {stimVisible && (
                <div className="absolute pointer-events-none"
                  style={{ left: `${stimPos.x}%`, top: `${stimPos.y}%`, transform: 'translate(-50%,-50%)', fontSize: `${stimSizePx}px`, fontFamily: 'monospace', fontWeight: 'bold', color: `rgb(${stimRGB},${stimRGB},${stimRGB})`, lineHeight: 1, userSelect: 'none' }}>
                  {stimLetter}
                </div>
              )}

              {/* Quadrant ID labels */}
              {QUADRANTS.map(q => (
                <div key={q.id} className="absolute text-xs font-medium text-gray-300 dark:text-gray-600 pointer-events-none"
                  style={{ left: `${q.x}%`, top: `${q.y}%`, transform: 'translate(-50%,-50%)' }}>
                  {q.id}
                </div>
              ))}

              {feedback && (
                <div className="absolute left-1/2 bottom-10 -translate-x-1/2 px-4 py-2 rounded-full text-white text-sm font-semibold shadow" style={{ backgroundColor: feedback.color }}>
                  {feedback.text}
                </div>
              )}
              {hearBubble && !feedback && (
                <div className="absolute left-1/2 bottom-10 -translate-x-1/2 px-4 py-2 rounded-full bg-gray-700 text-white text-sm font-semibold opacity-70">
                  Heard: "{hearBubble}"
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Keep eyes on "+"</strong> — say the letter you saw in the corner, or say <strong>"nothing"</strong>
              </p>
              {voiceTranscript && (
                <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">Last answer: <strong>{voiceTranscript}</strong></p>
              )}
            </div>
          </div>
        )}

        {/* RESULTS */}
        {phase === 'results' && (() => {
          const { qd, oa, maxD, scotomaPairs, riskLevel, riskLabel, riskColor, riskMessage, cl } = computeResults()
          return (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
              <div className="text-center mb-8">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-white text-3xl font-bold" style={{ backgroundColor: riskColor }}>
                  {riskLevel === 'low' ? '✓' : riskLevel === 'moderate' ? '~' : '!'}
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Test Complete</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Peripheral Field Screen Results</p>
              </div>

              <div className="rounded-2xl p-6 mb-6 border" style={{ borderColor: riskColor, backgroundColor: `${riskColor}22` }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: riskColor }} />
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">{riskLabel}</h3>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">{riskMessage}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(oa * 100)}%</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Overall Accuracy</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{cl.toFixed(2)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Central LogCS (ref)</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold" style={{ color: maxD > 0.3 ? '#ef4444' : maxD > 0.15 ? '#f59e0b' : '#22c55e' }}>
                    {maxD > 0 ? `−${maxD.toFixed(2)}` : `+${Math.abs(maxD).toFixed(2)}`}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Max Deficit (LogCS)</div>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">4-Quadrant Analysis</h3>
              <div className="grid grid-cols-2 gap-3 mb-8">
                {QUADRANTS.map(q => {
                  const d = qd[q.id]
                  const accPct = d.accuracy !== null ? Math.round(d.accuracy * 100) : null
                  const bc = d.deficit > 0.3 ? '#ef4444' : d.deficit > 0.15 ? '#f59e0b' : '#22c55e'
                  return (
                    <div key={q.id} className="rounded-xl p-4 border-2" style={{ borderColor: bc }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{q.id}</span>
                        {d.deficit > 0.3 && <span className="text-xs font-bold text-red-600 dark:text-red-400">SCOTOMA</span>}
                      </div>
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">{q.label}</div>
                      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>Accuracy: <strong>{accPct !== null ? `${accPct}%` : 'N/A'}</strong></span>
                        <span>Threshold: <strong>LogCS {d.finalLogCS.toFixed(2)}</strong></span>
                      </div>
                      <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, accPct ?? 0))}%`, backgroundColor: bc }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 mb-8 text-xs text-amber-800 dark:text-amber-300">
                <strong>Clinical Note:</strong> This test checks the paracentral field (inner ~20°). It does not replace a full 180° clinical visual
                field exam (Humphrey perimetry). Use this as an early-warning tool only. If abnormalities are found, consult an eye care professional
                for IOP measurement, optic nerve OCT, and a formal visual field test.
              </div>

              <div className="flex gap-4">
                <button onClick={() => navigate('/vision-tests')} className="flex-1 px-5 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-full font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Back to Tests</button>
                <button onClick={() => { setPhase('instructions'); setTrials([]); setTrialIdx(0); setResponses([]); setFeedback(null); setGazeTrapWarning(false); staircaseRef.current={}; responsesRef.current=[] }} className="flex-1 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-full font-semibold transition-colors">Retake Test</button>
              </div>
            </div>
          )
        })()}

      </div>
    </div>
  )
}

export default GlaucomaTest
