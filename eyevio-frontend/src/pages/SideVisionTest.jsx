import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import SamdDisclaimer from '../components/SamdDisclaimer'
import { createQuest, paintBlob, logCSToContrast } from '../utils/psychophysics'
import {
  sideVisionReliability,
  quadrantAsymmetry,
  scoreSideVisionAsymmetry,
} from '../utils/visionTestScoring'

/**
 * Side Vision Test — four-quadrant relative comparison, one eye at a time.
 *
 * Fixation is enforced the way clinical perimeters do it, not by webcam gaze
 * estimation: a small number flashes at the centre together with the corner
 * target, and the user must report it. Missing it = fixation loss.
 *
 * Catch trials give perimetry-style reliability indices:
 *   - false-positive catch: no corner target shown
 *   - false-negative catch: a very strong corner target
 * Sessions that fail reliability are not scored.
 *
 * Output is relative inter-quadrant asymmetry only — never an absolute
 * sensitivity or dB value. Not a visual-field test; does not screen for glaucoma.
 */

const QUADRANTS = [
  { id: 'UL', label: 'Upper left', x: 20, y: 22 },
  { id: 'UR', label: 'Upper right', x: 80, y: 22 },
  { id: 'LL', label: 'Lower left', x: 20, y: 78 },
  { id: 'LR', label: 'Lower right', x: 80, y: 78 },
]

const CENTER_DIGITS = ['2', '3', '5', '7']
const THRESHOLD_TRIALS_PER_QUADRANT = 6
const FALSE_POSITIVE_CATCHES = 4
const FALSE_NEGATIVE_CATCHES = 4
const FALSE_NEGATIVE_LOGCS = 0.1 // ~80% contrast — should always be seen
const STIM_MS = 200
const FIXATE_MIN_MS = 700
const FIXATE_MAX_MS = 1200
const BLOB_PX = 120
const BACKGROUND = 128

const QUEST_SETTINGS = { min: 0, max: 2.0, priorMean: 1.0, priorSd: 0.6, guessRate: 0.05, lapseRate: 0.03 }

// Temporal field is on the same side as the tested eye.
function fieldLabel(quadrant, eye) {
  const vertical = quadrant.id.startsWith('U') ? 'Superior' : 'Inferior'
  const screenRight = quadrant.id.endsWith('R')
  const temporal = eye === 'right' ? screenRight : !screenRight
  return `${vertical}-${temporal ? 'temporal' : 'nasal'}`
}

function shuffle(list) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function buildEyeTrials() {
  const trials = []
  for (const q of QUADRANTS) {
    for (let i = 0; i < THRESHOLD_TRIALS_PER_QUADRANT; i++) trials.push({ kind: 'threshold', quadrant: q.id })
  }
  for (let i = 0; i < FALSE_POSITIVE_CATCHES; i++) trials.push({ kind: 'fp_catch', quadrant: null })
  for (let i = 0; i < FALSE_NEGATIVE_CATCHES; i++) {
    trials.push({ kind: 'fn_catch', quadrant: QUADRANTS[i % QUADRANTS.length].id })
  }
  return shuffle(trials)
}

function randomDigit() {
  return CENTER_DIGITS[Math.floor(Math.random() * CENTER_DIGITS.length)]
}

const SideVisionTest = () => {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('instructions') // instructions, cover, running, results
  const [eyePlan, setEyePlan] = useState(['right', 'left'])
  const [eyeIndex, setEyeIndex] = useState(0)
  const [trials, setTrials] = useState([])
  const [trialIdx, setTrialIdx] = useState(0)
  const [step, setStep] = useState('fixate') // fixate, stim, center, location
  const [stimulus, setStimulus] = useState(null)
  const [centerAnswer, setCenterAnswer] = useState(null)
  const [eyeResults, setEyeResults] = useState({})
  const [saveState, setSaveState] = useState(null) // saved | not_saved | error

  const blobCanvasRef = useRef(null)
  const questsRef = useRef({})
  const responsesRef = useRef([])
  const timerRef = useRef(null)
  const eyeResultsRef = useRef({})

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const currentEye = eyePlan[eyeIndex]

  const presentTrial = useCallback((idx, list) => {
    const trial = list[idx]
    let logCS = null
    if (trial.kind === 'threshold') logCS = questsRef.current[trial.quadrant].next()
    if (trial.kind === 'fn_catch') logCS = FALSE_NEGATIVE_LOGCS

    setStimulus({ ...trial, digit: randomDigit(), logCS })
    setCenterAnswer(null)
    setStep('fixate')
    timerRef.current = setTimeout(() => {
      setStep('stim')
      timerRef.current = setTimeout(() => setStep('center'), STIM_MS)
    }, FIXATE_MIN_MS + Math.random() * (FIXATE_MAX_MS - FIXATE_MIN_MS))
  }, [])

  useEffect(() => {
    if (step === 'stim' && stimulus?.quadrant && stimulus.logCS != null) {
      paintBlob(blobCanvasRef.current, logCSToContrast(stimulus.logCS), { background: BACKGROUND })
    }
  }, [step, stimulus])

  const startEye = () => {
    const list = buildEyeTrials()
    questsRef.current = Object.fromEntries(QUADRANTS.map((q) => [q.id, createQuest(QUEST_SETTINGS)]))
    responsesRef.current = []
    setTrials(list)
    setTrialIdx(0)
    setPhase('running')
    presentTrial(0, list)
  }

  const summarizeEye = (eye) => {
    const responses = responsesRef.current
    const fixationLosses = responses.filter((r) => r.fixationLoss).length
    const valid = responses.filter((r) => !r.fixationLoss)
    const falsePositives = valid.filter((r) => r.kind === 'fp_catch' && r.reported !== 'none').length
    const falseNegatives = valid.filter((r) => r.kind === 'fn_catch' && r.reported !== r.quadrant).length
    const reliability = sideVisionReliability({
      fixationLosses,
      totalTrials: responses.length,
      falsePositives,
      falseNegatives,
    })

    const estimates = Object.fromEntries(
      QUADRANTS.map((q) => [q.id, questsRef.current[q.id].estimate()])
    )
    const thresholds = Object.fromEntries(Object.entries(estimates).map(([id, e]) => [id, e.threshold]))
    const asymmetry = quadrantAsymmetry(thresholds)
    const lowConfidence = Object.values(estimates).some((e) => e.sd > 0.35)

    return {
      eye,
      reliability,
      relative: asymmetry.relative,
      maxAsymmetry: asymmetry.maxAsymmetry,
      weakest: asymmetry.weakest,
      lowConfidence,
      score: reliability.reliable ? scoreSideVisionAsymmetry(asymmetry.maxAsymmetry) : null,
      responses,
    }
  }

  const finishAll = async (results) => {
    setPhase('results')
    const scoredEyes = Object.values(results).filter((r) => r.score != null)
    if (scoredEyes.length === 0) {
      setSaveState('not_saved')
      return
    }
    const worst = Math.min(...scoredEyes.map((r) => r.score))
    try {
      await visionTestAPI.submit({
        test_type: 'side_vision',
        score: worst,
        response_time_ms: 0,
        errors: 0,
        right_eye_score: results.right?.score ?? null,
        left_eye_score: results.left?.score ?? null,
        test_details: {
          method: 'dual_task_quadrant_quest',
          method_version: 1,
          reporting: 'relative_inter_quadrant_asymmetry_only',
          eyes: Object.fromEntries(
            Object.entries(results).map(([eye, r]) => [
              eye,
              {
                reliability: r.reliability,
                scored: r.score != null,
                relative_log_units: r.relative,
                max_asymmetry: r.maxAsymmetry,
                weakest_quadrant: r.weakest,
                low_confidence: r.lowConfidence,
                responses: r.responses,
              },
            ])
          ),
          scoring_note:
            'Index per eye: asymmetry 0 → 100, ≥ 0.6 log units → 0; overall = worse scored eye. Unreliable eyes are not scored. Not a visual-field test.',
        },
      })
      setSaveState('saved')
    } catch (e) {
      console.error('submit failed:', e)
      setSaveState('error')
    }
  }

  const recordAndAdvance = (reported) => {
    const trial = stimulus
    const fixationLoss = centerAnswer !== trial.digit
    const correctLocation = trial.quadrant != null && reported === trial.quadrant

    if (trial.kind === 'threshold' && !fixationLoss) {
      questsRef.current[trial.quadrant].update(trial.logCS, correctLocation)
    }

    responsesRef.current = [
      ...responsesRef.current,
      {
        kind: trial.kind,
        quadrant: trial.quadrant,
        logCS: trial.logCS != null ? Number(trial.logCS.toFixed(3)) : null,
        reported,
        centerDigit: trial.digit,
        centerAnswer,
        fixationLoss,
        correct: trial.kind === 'fp_catch' ? reported === 'none' : correctLocation,
      },
    ]

    const next = trialIdx + 1
    if (next < trials.length) {
      setTrialIdx(next)
      presentTrial(next, trials)
      return
    }

    const summary = summarizeEye(currentEye)
    const merged = { ...eyeResultsRef.current, [currentEye]: summary }
    eyeResultsRef.current = merged
    setEyeResults(merged)

    if (eyeIndex + 1 < eyePlan.length) {
      setEyeIndex(eyeIndex + 1)
      setPhase('cover')
    } else {
      finishAll(merged)
    }
  }

  const resetAll = () => {
    clearTimeout(timerRef.current)
    eyeResultsRef.current = {}
    setEyeResults({})
    setEyeIndex(0)
    setSaveState(null)
    setPhase('instructions')
  }

  const eyeName = (eye) => (eye === 'right' ? 'right eye' : 'left eye')
  const otherEye = (eye) => (eye === 'right' ? 'left' : 'right')

  return (
    <div className="test-shell">
      <div className="max-w-3xl mx-auto">
        {phase === 'instructions' && (
          <div className="test-panel">
            <div className="text-center mb-8">
              <h1 className="page-title mb-1">Side Vision Test</h1>
              <p className="text-sm text-accent-600 font-medium">
                Compares the four corners of your side vision, one eye at a time
              </p>
            </div>

            <div className="bg-accent-50 border-l-4 border-accent-500 rounded-r-xl p-5 mb-6 text-sm text-accent-900 space-y-2">
              <p>
                This checks whether one corner of your side vision is <strong>weaker than the others</strong>.
                It reports only that relative difference — a home screen can&apos;t measure absolute
                sensitivity the way a clinic visual-field machine does.
              </p>
              <p>
                It is <strong>not</strong> a visual-field test and does not screen for or diagnose glaucoma.
              </p>
            </div>

            <div className="space-y-4 text-sm text-gray-700 mb-6">
              {[
                ['1', <>Cover one eye. Keep the other eye on the <strong>white dot in the centre</strong>.</>],
                ['2', <>A tiny <strong>number flashes in the centre</strong> at the same moment a faint dark spot may appear in a corner.</>],
                ['3', <>First tap the <strong>number</strong> you saw in the centre. This proves your eye stayed on the centre.</>],
                ['4', <>Then tap the <strong>corner where the spot appeared</strong>, or <strong>No spot</strong>. Some rounds have no spot on purpose.</>],
                ['5', <>{THRESHOLD_TRIALS_PER_QUADRANT * 4 + FALSE_POSITIVE_CATCHES + FALSE_NEGATIVE_CATCHES} rounds per eye, about 2–3 minutes each. Sit about 50 cm from the screen.</>],
              ].map(([n, text]) => (
                <div key={n} className="flex gap-3">
                  <span className="flex-shrink-0 w-7 h-7 bg-accent-50 text-accent-700 rounded-full flex items-center justify-center font-bold text-xs">{n}</span>
                  <p>{text}</p>
                </div>
              ))}
            </div>

            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">Which eyes?</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'both', label: 'Both (right, then left)', plan: ['right', 'left'] },
                  { id: 'right', label: 'Right eye only', plan: ['right'] },
                  { id: 'left', label: 'Left eye only', plan: ['left'] },
                ].map((opt) => {
                  const active = eyePlan.join() === opt.plan.join()
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEyePlan(opt.plan)}
                      className={`rounded-xl border-2 px-3 py-2 text-xs font-semibold ${
                        active ? 'border-accent-600 bg-accent-50 text-accent-900' : 'border-gray-200 text-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-xs text-amber-800">
              No camera or microphone needed. If too many centre numbers are missed or catch rounds fail,
              the session won&apos;t be scored — just retake it when you&apos;re rested.
            </div>

            <div className="flex gap-4">
              <button onClick={() => navigate('/vision-tests')} className="flex-1 px-5 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Back</button>
              <button onClick={() => setPhase('cover')} className="test-btn">Begin</button>
            </div>
          </div>
        )}

        {phase === 'cover' && (
          <div className="test-panel text-center py-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Test your {eyeName(currentEye)}</h2>
            <p className="text-gray-600 mb-8">
              Cover your <strong>{eyeName(otherEye(currentEye))}</strong> with your palm (don&apos;t press on it).
              Keep your glasses on if you wear them.
            </p>
            <button onClick={startEye} className="test-btn max-w-xs mx-auto">
              I&apos;m covering my {otherEye(currentEye)} eye — start
            </button>
          </div>
        )}

        {phase === 'running' && stimulus && (
          <div className="test-panel overflow-hidden p-0">
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span className="font-medium">Side Vision — {eyeName(currentEye)}</span>
              <span>{trialIdx + 1} / {trials.length}</span>
            </div>
            <div className="h-1.5 bg-gray-100">
              <div className="h-1.5 bg-accent-500 transition-all duration-300" style={{ width: `${(trialIdx / trials.length) * 100}%` }} />
            </div>

            <div className="relative select-none" style={{ backgroundColor: `rgb(${BACKGROUND},${BACKGROUND},${BACKGROUND})`, height: '480px' }}>
              {(step === 'fixate' || step === 'stim') && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                  {step === 'stim' ? (
                    <span className="block text-white font-bold leading-none" style={{ fontSize: 15 }}>{stimulus.digit}</span>
                  ) : (
                    <span className="block w-2.5 h-2.5 rounded-full bg-white" />
                  )}
                </div>
              )}

              {step === 'stim' && stimulus.quadrant && (() => {
                const q = QUADRANTS.find((qq) => qq.id === stimulus.quadrant)
                return (
                  <canvas
                    ref={blobCanvasRef}
                    width={BLOB_PX}
                    height={BLOB_PX}
                    className="absolute pointer-events-none"
                    style={{ left: `${q.x}%`, top: `${q.y}%`, width: BLOB_PX, height: BLOB_PX, transform: 'translate(-50%,-50%)' }}
                  />
                )
              })()}

              {step === 'center' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/20">
                  <p className="text-white font-semibold text-sm">Which number flashed in the centre?</p>
                  <div className="flex gap-2">
                    {CENTER_DIGITS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => { setCenterAnswer(d); setStep('location') }}
                        className="w-12 h-12 rounded-xl bg-white text-gray-900 text-lg font-bold hover:bg-accent-50"
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setCenterAnswer('missed'); setStep('location') }}
                    className="text-xs text-white/90 underline"
                  >
                    I missed it
                  </button>
                </div>
              )}

              {step === 'location' && (
                <>
                  <p className="absolute top-3 inset-x-0 text-center text-white font-semibold text-sm pointer-events-none">
                    Where was the dark spot?
                  </p>
                  {QUADRANTS.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => recordAndAdvance(q.id)}
                      className="absolute w-28 h-20 rounded-xl border-2 border-white/70 bg-white/10 hover:bg-white/30 text-white text-xs font-semibold"
                      style={{ left: `${q.x}%`, top: `${q.y}%`, transform: 'translate(-50%,-50%)' }}
                    >
                      {q.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => recordAndAdvance('none')}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-5 py-3 rounded-xl bg-white text-gray-900 text-sm font-semibold hover:bg-accent-50"
                  >
                    No spot
                  </button>
                </>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-center text-xs text-gray-600">
              Keep your eye on the centre dot. Not sure about the spot? Choose <strong>No spot</strong> rather than guessing.
            </div>
          </div>
        )}

        {phase === 'results' && (
          <div className="test-panel">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-gray-900 mb-1">Test Complete</h2>
              <p className="text-gray-500 text-sm">Relative comparison of your four corners — home check only</p>
            </div>

            {saveState === 'not_saved' && (
              <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 mb-6 text-sm text-amber-900">
                This session did not pass the reliability checks, so it was <strong>not scored or saved</strong>.
                Retake it when rested, keeping your eye on the centre dot.
              </div>
            )}
            {saveState === 'error' && (
              <div className="border border-red-300 bg-red-50 rounded-xl p-4 mb-6 text-sm text-red-800">
                Results could not be saved. Check your connection and retake.
              </div>
            )}

            {eyePlan.map((eye) => {
              const r = eyeResults[eye]
              if (!r) return null
              const rel = r.reliability
              const tone = !rel.reliable
                ? 'border-gray-300 bg-gray-50'
                : r.maxAsymmetry >= 0.5
                  ? 'border-red-300 bg-red-50'
                  : r.maxAsymmetry >= 0.3
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-green-300 bg-green-50'
              return (
                <div key={eye} className={`rounded-2xl border p-5 mb-6 ${tone}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-gray-900 capitalize">{eyeName(eye)}</h3>
                    <span className="text-xs font-semibold text-gray-600">
                      {rel.reliable ? `Asymmetry ${r.maxAsymmetry.toFixed(2)} log units` : 'Not scored'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                    <div className="rounded-lg bg-white/70 p-2 text-center">
                      <div className="font-bold text-gray-900">{Math.round(rel.fixationLossRate * 100)}%</div>
                      <div className="text-gray-500">Fixation losses</div>
                    </div>
                    <div className="rounded-lg bg-white/70 p-2 text-center">
                      <div className="font-bold text-gray-900">{rel.falsePositives}/{FALSE_POSITIVE_CATCHES}</div>
                      <div className="text-gray-500">False positives</div>
                    </div>
                    <div className="rounded-lg bg-white/70 p-2 text-center">
                      <div className="font-bold text-gray-900">{rel.falseNegatives}/{FALSE_NEGATIVE_CATCHES}</div>
                      <div className="text-gray-500">False negatives</div>
                    </div>
                  </div>

                  {!rel.reliable ? (
                    <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
                      {rel.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {QUADRANTS.map((q) => {
                          const v = r.relative[q.id]
                          const weak = v <= -0.3
                          return (
                            <div key={q.id} className={`rounded-lg p-3 bg-white/80 border ${weak ? 'border-red-300' : 'border-transparent'}`}>
                              <div className="text-xs text-gray-500">{q.label} · {fieldLabel(q, eye)}</div>
                              <div className="font-semibold text-gray-900">
                                {v === 0 ? 'Best corner' : `${v.toFixed(2)} vs best`}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <p className="text-sm text-gray-700">
                        {r.maxAsymmetry < 0.3
                          ? 'Your four corners responded similarly on this run. That is not a medical all-clear.'
                          : `The ${QUADRANTS.find((q) => q.id === r.weakest).label.toLowerCase()} corner needed noticeably stronger spots than your best corner. Fatigue and screen setup can cause this — if it repeats on a retake, mention it at an eye exam and ask about a visual-field test.`}
                      </p>
                      {r.lowConfidence && (
                        <p className="text-xs text-amber-800 mt-2">Some corners had inconsistent answers — treat these numbers as rough.</p>
                      )}
                    </>
                  )}
                </div>
              )
            })}

            <p className="text-xs text-gray-500 mb-6">
              Numbers are log-unit differences from your best corner (0.3 ≈ needing twice the contrast). No absolute
              sensitivity is reported because a home screen can&apos;t hold a calibrated background brightness.
            </p>

            <SamdDisclaimer testType="side_vision" className="mb-8" />

            <div className="flex gap-4">
              <button onClick={() => navigate('/vision-tests')} className="flex-1 px-5 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Back to Tests</button>
              <button onClick={resetAll} className="flex-1 px-5 py-3 bg-accent-600 hover:bg-accent-700 text-white rounded-full font-semibold transition-colors">Retake Test</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SideVisionTest
