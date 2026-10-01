import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import SamdDisclaimer from '../components/SamdDisclaimer'
import { createQuest } from '../utils/psychophysics'
import { poissonDiskSampling } from '../utils/ishiharaColorScience'
import {
  COLOR_AXES,
  AXIS_LABELS,
  WHITE_UV,
  DOT_LUMINANCES,
  PROVISIONAL_REFERENCE,
  GAMUT_ADEQUACY_FACTOR,
  CATCH_TRIALS,
  CATCH_LUMINANCE_GAIN,
  MAX_AXIS_SD,
  displayId,
  NIGHT_MODE_HELP,
  axisPlan,
  displacedUv,
  dotRgb,
  distanceToLogSens,
  logSensToDistance,
  toUnits,
  summarizeColorThresholds,
  detectDisplayState,
  blockingDisplayIssues,
} from '../utils/colorThreshold'
import { C_ICON_PATH, LANDOLT_GAPS, inLandoltC } from '../utils/stimulusGeometry'

/**
 * Colour Threshold Test — discrimination thresholds along the protan, deutan
 * and tritan confusion axes (Cambridge Colour Test–style).
 *
 * A Landolt C of dots differs from the surrounding dots only in chromaticity;
 * dot luminance is randomised for both so brightness gives no clue. The user
 * reports the gap direction (4AFC). Three interleaved QUEST staircases, one per
 * axis, estimate the smallest u'v' displacement that can be seen.
 */

const TRIALS_PER_AXIS = { both: 12, each: 10 }
const PRACTICE_AXES = ['tritan', 'protan']
const FIXATE_MS = 400
const PRACTICE_FEEDBACK_MS = 900
const PANEL_BG = 'rgb(28,28,28)'
const GAPS = LANDOLT_GAPS
const QUEST_OPTS = { min: 0.5, max: 3.2, step: 0.02, priorMean: 2.2, priorSd: 0.7, beta: 3.5, guessRate: 0.25, lapseRate: 0.03 }

const BEYOND_GAMUT_MARGIN = 0.15

const eyeLabel = (eye) => (eye === 'both' ? 'Both eyes' : eye === 'right' ? 'Right eye' : 'Left eye')
const otherEye = (eye) => (eye === 'right' ? 'left' : 'right')

function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Catch trials define the ring by brightness instead of colour, so anyone attending can see them. */
function buildSchedule(perAxis) {
  const firsts = shuffle(COLOR_AXES).map((axis) => ({ axis, easy: true }))
  const catches = Array.from({ length: CATCH_TRIALS }, (_, i) => ({ axis: COLOR_AXES[i % COLOR_AXES.length], catch: true }))
  const rest = shuffle([
    ...COLOR_AXES.flatMap((axis) => Array.from({ length: perAxis - 1 }, () => ({ axis, easy: false }))),
    ...catches,
  ])
  return [...firsts, ...rest]
}

function paintColorStimulus(canvas, { dir, distance, gapAngle, isCatch = false }) {
  const size = canvas.width
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = PANEL_BG
  ctx.fillRect(0, 0, size, size)
  const R = size / 2 - 2
  const minDist = R * 0.085
  const target = displacedUv(dir, distance)
  for (const p of poissonDiskSampling(size, size, minDist)) {
    const x = p.x - size / 2
    const y = p.y - size / 2
    const radius = minDist * (0.3 + Math.random() * 0.17)
    if (Math.hypot(x, y) > R - radius) continue
    const Y = DOT_LUMINANCES[Math.floor(Math.random() * DOT_LUMINANCES.length)]
    const inRing = inLandoltC(x, y, R, gapAngle)
    const [r, g, b] = isCatch
      ? dotRgb(WHITE_UV, inRing ? Y * CATCH_LUMINANCE_GAIN : Y)
      : dotRgb(inRing ? target : WHITE_UV, Y)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI)
    ctx.fill()
  }
}

function CIcon({ angle, size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" aria-hidden>
      <g transform={`rotate(${angle})`}>
        <path d={C_ICON_PATH} fill="none" stroke="currentColor" strokeWidth="3" />
      </g>
    </svg>
  )
}

function AxisBars({ summary }) {
  const floor = 10
  return (
    <div className="space-y-3">
      {COLOR_AXES.map((axis) => {
        const a = summary.perAxis[axis]
        if (!a) return null
        const maxUnits = a.maxUnits
        const pos = (u) => `${Math.max(0, Math.min(100, (100 * Math.log10(u / floor)) / Math.log10(maxUnits / floor)))}%`
        return (
          <div key={axis}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold text-gray-800">{AXIS_LABELS[axis]}</span>
              <span className={a.aboveReference ? 'text-amber-800 font-semibold' : 'text-gray-700'}>
                {a.beyondGamut ? `≥ ${maxUnits}` : a.units} × 10⁻⁴ u′v′
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-gray-100">
              <div className="absolute -top-1 h-5 w-0.5 bg-gray-400" style={{ left: pos(a.referenceUnits) }} title="Provisional research reference value" />
              <div
                className={`absolute top-0 h-3 w-3 -ml-1.5 rounded-full ${a.aboveReference ? 'bg-amber-600' : 'bg-accent-600'}`}
                style={{ left: pos(a.beyondGamut ? maxUnits : a.units) }}
              />
            </div>
            <div className="relative flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>finer</span>
              <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pos(a.referenceUnits) }}>
                provisional ref. {a.referenceUnits}
              </span>
              <span>screen max {maxUnits}</span>
            </div>
            {!a.testable && (
              <p className="text-[11px] text-amber-800 mt-1">This screen can&apos;t show a large enough colour difference along this axis to test it, so it is not interpreted.</p>
            )}
            {a.testable && a.uncertain && (
              <p className="text-[11px] text-amber-800 mt-1">The estimate for this axis is too uncertain (± {a.sd.toFixed(2)} log units) to interpret.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function describePattern(summary) {
  const p = summary.perAxis
  const notInterpreted = COLOR_AXES.filter((axis) => p[axis] && (!p[axis].testable || p[axis].uncertain))
  const caveat = notInterpreted.length ? ` (${notInterpreted.map((axis) => axis).join(' and ')} not interpreted — see above)` : ''
  switch (summary.pattern) {
    case 'none':
      return `Compared with provisional research reference values, no axis was above the reference on this screen${caveat}. These values are not EyeVio norms and this is not a colour vision diagnosis.`
    case 'red_green': {
      const lead =
        summary.leadingAxis === 'protan'
          ? ' The protan (red) threshold was the higher of the two.'
          : summary.leadingAxis === 'deutan'
            ? ' The deutan (green) threshold was the higher of the two.'
            : ''
      return `Compared with provisional research reference values, thresholds were higher along the red–green confusion lines.${lead} This pattern is typical of an inherited red–green colour vision difference. A home screen can’t confirm the type — an eye-care professional can, with an anomaloscope or plate test.`
    }
    case 'tritan':
      return `Compared with provisional research reference values, the blue–yellow (tritan) threshold was higher (${p.tritan.beyondGamut ? 'beyond the screen range' : `${p.tritan.units}`}; provisional reference ${p.tritan.referenceUnits}). Inherited tritan differences are rare; this can come with age-related lens yellowing, some medicines, or eye conditions. Mention it at your next eye exam, especially if it is new.`
    case 'generalised':
      return 'Compared with provisional research reference values, thresholds were higher on red–green and blue–yellow axes. The most common cause is the screen: Night Shift, True Tone, blue-light filters, low brightness or tinted glasses. Check them and retake. If it persists, see an eye-care professional.'
    case 'unreliable':
      return summary.reliability?.catch_failed
        ? `Some check rings that anyone can see by brightness were missed (${summary.reliability.catch_correct} of ${summary.reliability.catch_total} right), so this run is unreliable and is not interpreted. Retake when you can give it your full attention.`
        : 'Even the strongest colour differences this screen can show were not picked out on any axis. This usually means a display setting (greyscale, colour filter) or a misunderstanding of the task — check and retake.'
    default:
      return ''
  }
}

function ColorVisionTest() {
  const navigate = useNavigate()
  const displayState = useMemo(() => detectDisplayState(), [])
  const blockers = useMemo(() => blockingDisplayIssues(displayState), [displayState])
  const plan = useMemo(() => axisPlan(), [])

  const [phase, setPhase] = useState('display-check') // display-check, instructions, cover, running, results
  const [checklist, setChecklist] = useState({ nightMode: false, autoColour: false, brightness: false })
  const [eyeMode, setEyeMode] = useState('both')
  const [eyeIndex, setEyeIndex] = useState(0)
  const [trialIndex, setTrialIndex] = useState(0)
  const [step, setStep] = useState('fixate')
  const [trial, setTrial] = useState(null)
  const [practiceFeedback, setPracticeFeedback] = useState(null)
  const [eyeResults, setEyeResults] = useState({})
  const [saveState, setSaveState] = useState(null)

  const canvasRef = useRef(null)
  const questsRef = useRef(null)
  const scheduleRef = useRef([])
  const responsesRef = useRef([])
  const trialStartRef = useRef(0)
  const timerRef = useRef(null)
  const eyeResultsRef = useRef({})
  const answeredRef = useRef(true)

  const eyePlan = eyeMode === 'both' ? ['both'] : ['right', 'left']
  const currentEye = eyePlan[eyeIndex]
  const perAxis = TRIALS_PER_AXIS[eyeMode]
  const totalTrials = PRACTICE_AXES.length + perAxis * COLOR_AXES.length + CATCH_TRIALS
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const stimCss = typeof window !== 'undefined' ? Math.min(440, window.innerWidth - 48) : 440
  const stimDevice = Math.round(stimCss * dpr)
  const checklistDone = Object.values(checklist).every(Boolean)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const present = useCallback(
    (idx) => {
      setStep('fixate')
      setPracticeFeedback(null)
      timerRef.current = setTimeout(() => {
        const practice = idx < PRACTICE_AXES.length
        const item = practice ? { axis: PRACTICE_AXES[idx], easy: true } : scheduleRef.current[idx - PRACTICE_AXES.length]
        const { dir, max } = plan[item.axis]
        const easiest = distanceToLogSens(max)
        const logSens = item.easy || item.catch ? easiest : Math.max(easiest, questsRef.current[item.axis].next())
        setTrial({
          axis: item.axis,
          practice,
          isCatch: !!item.catch,
          dir,
          logSens,
          distance: item.catch ? 0 : logSensToDistance(logSens),
          gap: GAPS[Math.floor(Math.random() * GAPS.length)],
        })
        setStep('stim')
        answeredRef.current = false
        trialStartRef.current = performance.now()
      }, FIXATE_MS)
    },
    [plan]
  )

  useEffect(() => {
    if (step !== 'stim' || !trial || !canvasRef.current) return
    paintColorStimulus(canvasRef.current, { dir: trial.dir, distance: trial.distance, gapAngle: trial.gap.angle, isCatch: trial.isCatch })
  }, [step, trial])

  const startEye = () => {
    questsRef.current = Object.fromEntries(COLOR_AXES.map((axis) => [axis, createQuest(QUEST_OPTS)]))
    scheduleRef.current = buildSchedule(perAxis)
    responsesRef.current = []
    setTrialIndex(0)
    setPhase('running')
    present(0)
  }

  const summarizeEye = () => {
    const axes = Object.fromEntries(
      COLOR_AXES.map((axis) => {
        const est = questsRef.current[axis].estimate()
        const maxDistance = plan[axis].max
        const beyondGamut = est.threshold < distanceToLogSens(maxDistance) + BEYOND_GAMUT_MARGIN
        return [
          axis,
          {
            threshold: beyondGamut ? maxDistance : logSensToDistance(est.threshold),
            sd: Number(est.sd.toFixed(3)),
            maxDistance,
            beyondGamut,
          },
        ]
      })
    )
    const catches = responsesRef.current.filter((r) => r.catch)
    return {
      ...summarizeColorThresholds(axes, {
        catchCorrect: catches.filter((r) => r.correct).length,
        catchTotal: catches.length,
        displayCoversSrgb: displayState.coversSrgb,
      }),
      responses: responsesRef.current,
    }
  }

  const finishAll = async (results) => {
    setPhase('results')
    try {
      await visionTestAPI.submit({
        test_type: 'color_vision',
        score: null,
        test_details: {
          method: 'confusion_axis_threshold_4afc',
          method_version: 2,
          eye_mode: eyeMode,
          display_index: null,
          eyes: Object.fromEntries(
            Object.entries(results).map(([eye, r]) => [
              eye,
              {
                pattern: r.pattern,
                leading_axis: r.leadingAxis,
                reliable: r.reliable,
                reliability: r.reliability,
                axes: Object.fromEntries(
                  Object.entries(r.perAxis).map(([axis, a]) => [
                    axis,
                    {
                      threshold_units: a.units,
                      threshold_uv: Number(a.threshold.toFixed(5)),
                      sd_log: a.sd,
                      uncertain: a.uncertain,
                      beyond_screen_gamut: a.beyondGamut,
                      screen_max_units: a.maxUnits,
                      screen_max_uv: Number(a.maxDistance.toFixed(5)),
                      gamut_adequate: a.testable,
                      provisional_reference_units: a.referenceUnits,
                      above_provisional_reference: a.aboveReference,
                    },
                  ])
                ),
                responses: r.responses,
                unseen_count: r.responses.filter((x) => x.unseen).length,
              },
            ])
          ),
          trials_per_axis: perAxis,
          catch_trials: CATCH_TRIALS,
          threshold_units: '1e-4 CIE 1976 u\'v\'',
          white_point_uv: WHITE_UV,
          dot_luminances_rel: DOT_LUMINANCES,
          axis_direction_sign: Object.fromEntries(COLOR_AXES.map((axis) => [axis, plan[axis].sign])),
          screen_gamut: {
            reported_color_gamut: displayState.colorGamut,
            reported_hdr: displayState.hdr,
            color_depth: displayState.colorDepth,
            max_displacement_units: Object.fromEntries(COLOR_AXES.map((axis) => [axis, Math.round(toUnits(plan[axis].max))])),
            max_displacement_basis: 'Computed for sRGB primaries (D65) at the dot luminances; the physical display gamut is not measured.',
            adequacy_rule: `axis testable when max displacement ≥ ${GAMUT_ADEQUACY_FACTOR} × provisional reference and the browser does not report a gamut below sRGB`,
          },
          display_id: displayId(displayState),
          comparison_scope: 'same_display_only',
          display_state: displayState,
          display_checklist_confirmed: checklistDone,
          luminance_model: 'sRGB (D65) assumed, stochastic rounding per dot, luminance noise',
          scoring_note:
            `Thresholds are compared with provisional research reference values (protan/deutan 100, tritan 150 × 10⁻⁴ u′v′, published young-adult Trivector limits; not EyeVio norms). No 0–100 score. Reliability: ≥ 3 of ${CATCH_TRIALS} brightness-defined catch trials correct; an axis with posterior SD > ${MAX_AXIS_SD} log units is uncertain. "Can't see it" answers are recorded as a random direction (unseen: true), keeping the 4AFC guess rate. Results are compared only with results from the same display. Not a diagnostic colour vision test.`,
          timestamp: new Date().toISOString(),
        },
      })
      setSaveState('saved')
    } catch (e) {
      console.error('submit failed:', e)
      setSaveState('error')
    }
  }

  const answer = (gapId, { unseen = false } = {}) => {
    if (step !== 'stim' || !trial || answeredRef.current) return
    answeredRef.current = true
    const correct = gapId === trial.gap.id
    if (trial.practice) {
      setPracticeFeedback(unseen ? 'unseen' : correct ? 'correct' : 'wrong')
      setStep('feedback')
      timerRef.current = setTimeout(() => {
        setTrialIndex(trialIndex + 1)
        present(trialIndex + 1)
      }, PRACTICE_FEEDBACK_MS)
      return
    }

    if (!trial.isCatch) questsRef.current[trial.axis].update(trial.logSens, correct)
    responsesRef.current = [
      ...responsesRef.current,
      {
        axis: trial.isCatch ? null : trial.axis,
        ...(trial.isCatch && { catch: true }),
        units: Math.round(toUnits(trial.distance)),
        gap: trial.gap.id,
        answer: gapId,
        correct,
        ...(unseen && { unseen: true }),
        rt_ms: Math.round(performance.now() - trialStartRef.current),
      },
    ]

    const next = trialIndex + 1
    if (next < totalTrials) {
      setTrialIndex(next)
      present(next)
      return
    }

    const merged = { ...eyeResultsRef.current, [currentEye]: summarizeEye() }
    eyeResultsRef.current = merged
    setEyeResults(merged)
    if (eyeIndex + 1 < eyePlan.length) {
      setEyeIndex(eyeIndex + 1)
      setPhase('cover')
    } else {
      finishAll(merged)
    }
  }

  // Forced choice: "can't see it" is a random guess, so the 25% guess rate the staircases assume still holds.
  const answerUnseen = () => answer(GAPS[Math.floor(Math.random() * GAPS.length)].id, { unseen: true })

  const answerRef = useRef(answer)
  answerRef.current = answer
  const answerUnseenRef = useRef(answerUnseen)
  answerUnseenRef.current = answerUnseen

  useEffect(() => {
    if (phase !== 'running') return undefined
    const onKey = (e) => {
      const g = GAPS.find((x) => x.key === e.key)
      if (g) {
        e.preventDefault()
        answerRef.current(g.id)
      } else if (e.key === ' ') {
        e.preventDefault()
        answerUnseenRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  const beginTest = () => {
    setEyeIndex(0)
    if (eyeMode === 'both') startEye()
    else setPhase('cover')
  }

  const resetAll = () => {
    clearTimeout(timerRef.current)
    eyeResultsRef.current = {}
    setEyeResults({})
    setEyeIndex(0)
    setSaveState(null)
    setPhase('instructions')
  }

  const checkItems = [
    { id: 'nightMode', label: 'Night Shift / Night Light / blue-light filter is off' },
    { id: 'autoColour', label: 'True Tone / adaptive colour / eye-comfort mode is off' },
    { id: 'brightness', label: 'Brightness is high (about 75% or more), no tinted glasses, no coloured light on the screen' },
  ]

  return (
    <div className="test-shell">
      <div className="max-w-4xl mx-auto">
        {phase === 'display-check' && (
          <div className="test-panel max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <h1 className="page-title mb-1">Screen check</h1>
              <p className="text-sm text-accent-600 font-medium">Colour settings change this test more than anything else</p>
            </div>

            {blockers.length > 0 && (
              <div className="border border-red-300 bg-red-50 rounded-xl p-4 mb-5 text-sm text-red-800 space-y-1">
                <p className="font-semibold">Your screen is in a mode that breaks this test:</p>
                {blockers.map((b) => (
                  <p key={b}>• {b}</p>
                ))}
                <p>Turn it off in your accessibility settings, then reload this page.</p>
              </div>
            )}

            <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-xl p-4 mb-5 text-sm text-amber-900 space-y-1">
              <p>
                Web pages can&apos;t see Night Shift, True Tone or blue-light filters, and they tint every colour on the screen.{' '}
                <strong>{NIGHT_MODE_HELP[displayState.platform]}</strong>
              </p>
              {displayState.evening && (
                <p>It&apos;s evening where you are — night modes often switch on automatically at this time.</p>
              )}
            </div>

            <div className="border border-gray-200 rounded-xl p-4 mb-5 text-sm text-gray-700 space-y-1">
              <p className="font-semibold text-gray-900">What your browser reports about this screen</p>
              <p>
                Colour range: <strong>{{ srgb: 'standard (sRGB)', p3: 'wide (Display P3)', rec2020: 'very wide (Rec. 2020)', below_srgb: 'narrower than sRGB', not_reported: 'not reported' }[displayState.colorGamut]}</strong>
                {' · '}HDR: <strong>{displayState.hdr ? 'on' : 'off'}</strong>
                {displayState.colorDepth ? <> · {displayState.colorDepth}-bit colour</> : null}
                {displayState.highContrast ? <> · increased contrast requested</> : null}
              </p>
              {displayState.colorGamut === 'below_srgb' && (
                <p className="text-amber-800">This screen reports less than the standard colour range, so no axis can be tested reliably here.</p>
              )}
              {(displayState.hdr || displayState.wideGamut) && (
                <p className="text-amber-800">Wide-gamut and HDR screens are colour-managed by the browser, which can still shift colours slightly. Results are only compared with earlier results on this same screen.</p>
              )}
              {displayState.highContrast && (
                <p className="text-amber-800">An increased-contrast setting is on; it can change on-screen colours.</p>
              )}
              <p className="text-xs text-gray-500">
                These values come from the browser and are not measured. Night modes, True Tone and brightness are invisible to web pages, so they are covered only by the checklist below.
              </p>
            </div>

            <div className="space-y-2 mb-6">
              {checkItems.map((item) => (
                <label key={item.id} className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 text-sm text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checklist[item.id]}
                    onChange={(e) => setChecklist({ ...checklist, [item.id]: e.target.checked })}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-4">
              <button onClick={() => navigate('/vision-tests')} className="flex-1 px-5 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50">Back</button>
              <button onClick={() => setPhase('instructions')} className="test-btn" disabled={!checklistDone || blockers.length > 0}>
                Continue
              </button>
            </div>
          </div>
        )}

        {phase === 'instructions' && (
          <div className="test-panel max-w-3xl mx-auto">
            <div className="text-center mb-6">
              <h1 className="page-title mb-1">Colour Threshold Test</h1>
              <p className="text-sm text-accent-600 font-medium">How small a colour difference you can see, on three colour axes</p>
            </div>

            <div className="bg-accent-50 border-l-4 border-accent-500 rounded-r-xl p-5 mb-6 text-sm text-accent-900 space-y-2">
              <p>
                A circle of dots appears. Some dots form a ring with a gap — like the letter <strong>C</strong> — and
                differ from the rest <strong>only in colour</strong>. Dot brightness is deliberately random, so ignore
                light and dark and look for colour. Pick where the <strong>gap</strong> is.
              </p>
              <p>
                The colour difference shrinks as you get answers right, separately for red, green and blue–yellow
                directions. <strong>There is always a ring</strong>, but after the first few it gets so faint that the
                circle looks like plain grey dots with no shape. That&apos;s normal — it means the test has found your
                limit. Take your best guess, or press <strong>I can&apos;t see it</strong> and a direction is picked
                at random for you.
              </p>
            </div>

            <ul className="space-y-2 text-sm text-gray-700 mb-6 list-disc pl-5">
              <li>Sit at a comfortable arm&apos;s length (about 60 cm), face-on to the screen, in normal room light.</li>
              <li>
                Answer with the four buttons or the <strong>arrow keys</strong>. {perAxis * COLOR_AXES.length} rings
                {eyeMode === 'each' ? ' per eye' : ''}, about {eyeMode === 'each' ? 5 : 3} minutes in total.
              </li>
              <li>Wear your usual glasses, but not tinted or blue-blocking lenses.</li>
            </ul>

            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">Which eyes?</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'both', label: 'Both eyes together (recommended)' },
                  { id: 'each', label: 'Each eye separately (spots one-sided changes)' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEyeMode(opt.id)}
                    className={`rounded-xl border-2 px-3 py-2 text-xs font-semibold ${
                      eyeMode === opt.id ? 'border-accent-600 bg-accent-50 text-accent-900' : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <button onClick={() => setPhase('display-check')} className="flex-1 px-5 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50">Back</button>
              <button onClick={beginTest} className="test-btn">Begin</button>
            </div>
          </div>
        )}

        {phase === 'cover' && (
          <div className="test-panel text-center py-10 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Test your {currentEye} eye</h2>
            <p className="text-gray-600 mb-8">
              Cover your <strong>{otherEye(currentEye)}</strong> eye with your palm (don&apos;t press on it).
            </p>
            <button onClick={startEye} className="test-btn max-w-xs mx-auto">
              I&apos;m covering my {otherEye(currentEye)} eye — start
            </button>
          </div>
        )}

        {phase === 'running' && (
          <div className="test-panel overflow-hidden p-0">
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span className="font-medium">Colour Threshold — {eyeLabel(currentEye).toLowerCase()}</span>
              <span>
                {trialIndex < PRACTICE_AXES.length
                  ? `Practice ${trialIndex + 1}/${PRACTICE_AXES.length}`
                  : `${trialIndex - PRACTICE_AXES.length + 1} / ${totalTrials - PRACTICE_AXES.length}`}
              </span>
            </div>
            <div className="h-1.5 bg-gray-100">
              <div className="h-1.5 bg-accent-500 transition-all duration-300" style={{ width: `${(trialIndex / totalTrials) * 100}%` }} />
            </div>

            <div className="grid md:grid-cols-[1fr_200px]">
              <div className="relative flex items-center justify-center select-none" style={{ backgroundColor: PANEL_BG, minHeight: stimCss + 40 }}>
                {step === 'fixate' && <span className="block w-2 h-2 rounded-full bg-white/60" />}
                {(step === 'stim' || step === 'feedback') && (
                  <canvas ref={canvasRef} width={stimDevice} height={stimDevice} style={{ width: stimCss, height: stimCss }} />
                )}
                {practiceFeedback && (
                  <div className={`absolute bottom-4 mx-4 px-4 py-2 rounded-full text-sm font-semibold text-center ${practiceFeedback === 'correct' ? 'bg-green-600 text-white' : 'bg-amber-500 text-white'}`}>
                    {practiceFeedback === 'correct'
                      ? 'Correct'
                      : `${practiceFeedback === 'unseen' ? 'This one was easy to see' : 'Not quite'} — the gap was ${trial?.gap.label.toLowerCase()}. The real test has no feedback`}
                  </div>
                )}
              </div>

              <div className="p-4 border-t md:border-t-0 md:border-l border-gray-100">
                <p className="text-xs font-semibold text-gray-700 mb-3">Where is the gap?</p>
                <div className="grid grid-cols-3 gap-2 max-w-[180px] mx-auto">
                  {[null, 'up', null, 'left', null, 'right', null, 'down', null].map((id, i) => {
                    if (!id) return <span key={i} />
                    const g = GAPS.find((x) => x.id === id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => answer(id)}
                        disabled={step !== 'stim'}
                        aria-label={`Gap ${g.label.toLowerCase()}`}
                        className="aspect-square flex items-center justify-center rounded-xl border-2 border-gray-200 text-gray-800 hover:border-accent-500 disabled:opacity-50"
                      >
                        <CIcon angle={g.angle} />
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={answerUnseen}
                  disabled={step !== 'stim'}
                  className="mt-4 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-accent-500 disabled:opacity-50"
                >
                  I can&apos;t see it
                </button>
                <p className="text-xs text-gray-500 pt-3">
                  There is always a ring. When the dots look like plain grey with no shape, that&apos;s expected — guess,
                  or press <strong>I can&apos;t see it</strong> (Space).
                </p>
              </div>
            </div>
          </div>
        )}

        {phase === 'results' && (
          <div className="test-panel max-w-3xl mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-gray-900 mb-1">Your Colour Thresholds</h2>
              <p className="text-gray-500 text-sm">Smallest colour difference you could see on each axis. Lower is better.</p>
            </div>

            {saveState === 'error' && (
              <div className="border border-red-300 bg-red-50 rounded-xl p-4 mb-6 text-sm text-red-800">Results could not be saved. Check your connection and retake.</div>
            )}

            {eyePlan.map((eye) => {
              const r = eyeResults[eye]
              if (!r) return null
              const tone = r.pattern === 'none' || r.pattern === 'unreliable' ? 'border-gray-300 bg-gray-50' : 'border-amber-300 bg-amber-50'
              return (
                <div key={eye} className={`rounded-2xl border p-5 mb-6 ${tone}`}>
                  <h3 className="font-bold text-gray-900 mb-4">{eyeLabel(eye)}</h3>
                  <div className="bg-white rounded-xl p-4 mb-3">
                    <AxisBars summary={r} />
                  </div>
                  <p className="text-sm text-gray-700">{describePattern(r)}</p>
                </div>
              )
            })}

            <div className="text-xs text-gray-500 mb-6 space-y-1">
              <p>
                Thresholds are distances in the CIE 1976 u′v′ colour space (× 10⁻⁴), the units of the Cambridge Colour
                Test. They are compared with provisional research reference values (protan and deutan {PROVISIONAL_REFERENCE.protan},
                tritan {PROVISIONAL_REFERENCE.tritan}) from published young-adult studies. EyeVio has no reference data of its
                own yet, so these are not norms; tritan thresholds also rise with age.
              </p>
              <p>
                Colours are computed for a standard sRGB screen; the screen&apos;s real colours are not measured. Night
                modes, brightness and the screen itself shift the result, so EyeVio only compares a colour result with
                earlier results from this same screen and browser, never across devices.
              </p>
            </div>

            <SamdDisclaimer testType="color_vision" className="mb-8" />

            <div className="flex gap-4">
              <button onClick={() => navigate('/vision-tests')} className="flex-1 px-5 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50">Back to Tests</button>
              <button onClick={resetAll} className="flex-1 px-5 py-3 bg-accent-600 hover:bg-accent-700 text-white rounded-full font-semibold">Retake Test</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ColorVisionTest
