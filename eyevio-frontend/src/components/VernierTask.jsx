import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createVernierPsi, paintVernier, pxPerArcmin, summarizeVernier } from '../utils/vernier'

const LOCATIONS = {
  center: { dx: 0, dy: 0, trials: 12, label: 'centre' },
  up: { dx: 0, dy: -120, trials: 8, label: 'above centre' },
  right: { dx: 120, dy: 0, trials: 8, label: 'right of centre' },
  down: { dx: 0, dy: 120, trials: 8, label: 'below centre' },
  left: { dx: -120, dy: 0, trials: 8, label: 'left of centre' },
}
// Practice shifts are large enough to see clearly (8′ ≈ several pixels); one is off to the side of the dot.
const PRACTICE = [
  { offset: 480, location: 'center' },
  { offset: -480, location: 'center' },
  { offset: 360, location: 'left' },
]
const FIELD_ARCMIN = 330
const SEGMENT_ARCMIN = 30
const GAP_ARCMIN = 4
const SIGMA_ARCMIN = 0.8
const FIXATE_MS = 500
const STIM_MS = 300
const FEEDBACK_MS = 2000
// Later pairs look identical, so each answer needs a visible acknowledgement before the next flash.
const ACK_MS = 600
const ANSWER_LABELS = { left: 'Lower line is left', aligned: 'Looks aligned', right: 'Lower line is right' }
const answerKey = (right) => (right == null ? 'aligned' : right ? 'right' : 'left')

/** Exaggerated picture of the two lines; `shift` is -1 (lower left), 0 or 1 (lower right). */
function LinePairIcon({ shift, size = 36, color = 'currentColor' }) {
  const x = 12
  const d = 4 * shift
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <line x1={x} y1="2" x2={x} y2="10.5" stroke={color} strokeWidth="2" />
      <line x1={x + d} y1="13.5" x2={x + d} y2="22" stroke={color} strokeWidth="2" />
    </svg>
  )
}

function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Vernier alignment task at the fovea and four parafoveal spots (2°).
 * Distortion of the retina shows up as a shifted "looks aligned" point (bias).
 */
export default function VernierTask({ eye, distanceMm, pxPerMm, onDone, onSkip }) {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const ppa = pxPerArcmin(distanceMm, pxPerMm, dpr)
  const sizeDevice = Math.round(FIELD_ARCMIN * ppa)
  const sizeCss = Math.round(sizeDevice / dpr)

  const [stage, setStage] = useState('intro') // intro, running
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState('fixate') // fixate, stim, respond, feedback, ack
  const [feedback, setFeedback] = useState(null)
  const [lastAnswer, setLastAnswer] = useState(null)

  const canvasRef = useRef(null)
  const trialRef = useRef(null)
  const timerRef = useRef(null)
  const psiRef = useRef(null)
  const responsesRef = useRef([])
  const schedule = useMemo(
    () => shuffle(Object.entries(LOCATIONS).flatMap(([loc, v]) => Array.from({ length: v.trials }, () => loc))),
    []
  )
  const total = PRACTICE.length + schedule.length

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const draw = useCallback(
    (showStim) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const c = sizeDevice / 2
      const t = trialRef.current
      const fixation = { x: c, y: c, r: Math.max(2, 2.5 * dpr) }
      if (!showStim || !t) {
        paintVernier(canvas, { cx: c, cy: c, offsetPx: 0, lengthPx: 0, gapPx: 0, sigmaPx: 1, fixation })
        return
      }
      const loc = LOCATIONS[t.location]
      paintVernier(canvas, {
        cx: c + loc.dx * ppa,
        cy: c + loc.dy * ppa,
        offsetPx: (t.offset / 60) * ppa,
        lengthPx: SEGMENT_ARCMIN * ppa,
        gapPx: GAP_ARCMIN * ppa,
        sigmaPx: Math.max(0.6, SIGMA_ARCMIN * ppa),
        fixation: t.location === 'center' ? null : fixation,
      })
    },
    [sizeDevice, ppa, dpr]
  )

  const present = useCallback(
    (i) => {
      const practice = i < PRACTICE.length
      const location = practice ? PRACTICE[i].location : schedule[i - PRACTICE.length]
      trialRef.current = {
        practice,
        location,
        offset: practice ? PRACTICE[i].offset : psiRef.current[location].next(),
      }
      setFeedback(null)
      setLastAnswer(null)
      setStep('fixate')
      draw(false)
      timerRef.current = setTimeout(() => {
        setStep('stim')
        draw(true)
        timerRef.current = setTimeout(() => {
          draw(false)
          setStep('respond')
        }, STIM_MS)
      }, FIXATE_MS)
    },
    [schedule, draw]
  )

  const start = () => {
    psiRef.current = Object.fromEntries(Object.keys(LOCATIONS).map((loc) => [loc, createVernierPsi()]))
    responsesRef.current = []
    setIndex(0)
    setStage('running')
  }

  useEffect(() => {
    if (stage === 'running' && index === 0 && psiRef.current) present(0)
  }, [stage, index, present])

  const finish = () => {
    const locations = Object.fromEntries(
      Object.keys(LOCATIONS).map((loc) => {
        const e = psiRef.current[loc].estimate()
        return [
          loc,
          {
            bias: Math.round(e.bias),
            biasSd: Math.round(e.biasSd),
            threshold: Math.round(e.threshold),
            thresholdLogSd: Number(e.thresholdLogSd.toFixed(2)),
            trials: e.trials,
          },
        ]
      })
    )
    onDone({
      eye,
      locations,
      ...summarizeVernier(locations),
      pxPerArcmin: Number(ppa.toFixed(3)),
      arcsecPerDevicePx: Math.round(60 / ppa),
      responses: responsesRef.current,
    })
  }

  /** `right`: true, false, or null for "looks aligned". */
  const respond = (right) => {
    if (step !== 'respond' && step !== 'stim') return
    const t = trialRef.current
    clearTimeout(timerRef.current)
    const correct = right != null && right === t.offset > 0
    setLastAnswer(answerKey(right))
    if (t.practice) {
      // Hold the lines on screen so the user can see what the answer looked like.
      draw(true)
      setFeedback({ correct, answer: t.offset > 0 ? 'right' : 'left' })
      setStep('feedback')
      timerRef.current = setTimeout(() => {
        setIndex(index + 1)
        present(index + 1)
      }, FEEDBACK_MS)
      return
    }
    draw(false)
    psiRef.current[t.location].update(t.offset, right)
    responsesRef.current = [
      ...responsesRef.current,
      { location: t.location, offset_arcsec: t.offset, answer: answerKey(right) },
    ]
    if (index + 1 >= total) {
      finish()
      return
    }
    setStep('ack')
    timerRef.current = setTimeout(() => {
      setIndex(index + 1)
      present(index + 1)
    }, ACK_MS)
  }

  const respondRef = useRef(respond)
  respondRef.current = respond

  useEffect(() => {
    if (stage !== 'running') return undefined
    const onKey = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        respondRef.current(e.key === 'ArrowRight')
      } else if (e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        respondRef.current(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage])

  if (stage === 'intro') {
    return (
      <div className="test-panel max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Line alignment — {eye} eye</h2>
        <p className="text-sm text-gray-600 text-center mb-5">Keep the other eye covered and stay at the same distance.</p>
        <div className="bg-accent-50 border-l-4 border-accent-500 rounded-r-xl p-4 mb-5 text-sm text-accent-900 space-y-2">
          <p>
            Two short <strong>vertical</strong> lines flash briefly, one above the other. Compare the{' '}
            <strong>lower line with the upper line</strong>: is it shifted a little to the left, or to the right?
          </p>
          <p>
            The pair sometimes appears to the side of, above or below the red dot. <strong>Where they appear doesn&apos;t
            matter</strong> — keep looking at the dot and only compare the two lines with each other.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { shift: -1, label: 'Lower line is left' },
            { shift: 1, label: 'Lower line is right' },
          ].map((ex) => (
            <div key={ex.label} className="border border-gray-200 rounded-xl p-3 flex flex-col items-center text-sm text-gray-700">
              <LinePairIcon shift={ex.shift} size={64} color="#111" />
              <span className="mt-1 font-semibold">{ex.label}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-600 mb-5">
          These examples are exaggerated. The first {PRACTICE.length} flashes are practice with big, easy shifts and show you the answer.
          After that the shifts get tiny, and the two lines will often look perfectly lined up. That&apos;s expected.
          If you have even a slight impression of a shift, pick that side; if they truly look lined up, choose{' '}
          <strong>Looks aligned</strong>. This measures hyperacuity, which picks up small distortions of the retina better than a grid does.
        </p>
        <p className="text-xs text-gray-500 mb-5">
          {total} flashes, about 2 minutes. Answer with the buttons, or ← / → and ↓ (or the space bar) for &quot;Looks aligned&quot;.
        </p>
        <div className="flex gap-4">
          <button type="button" onClick={onSkip} className="flex-1 px-5 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50">
            Skip this part
          </button>
          <button type="button" onClick={start} className="test-btn">Start</button>
        </div>
      </div>
    )
  }

  return (
    <div className="test-panel overflow-hidden p-0 max-w-2xl mx-auto">
      <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span className="font-medium">Line alignment — {eye} eye</span>
        <span className="flex items-center gap-4">
          <span>{index < PRACTICE.length ? `Practice ${index + 1}/${PRACTICE.length}` : `${index - PRACTICE.length + 1} / ${schedule.length}`}</span>
          <button
            type="button"
            onClick={() => {
              clearTimeout(timerRef.current)
              onSkip()
            }}
            className="underline hover:text-gray-700"
          >
            Skip this part
          </button>
        </span>
      </div>
      <div className="h-1 bg-gray-100">
        <div className="h-full bg-accent-500 transition-all duration-300" style={{ width: `${(index / total) * 100}%` }} />
      </div>
      <div className="relative bg-white flex items-center justify-center" style={{ minHeight: Math.max(280, sizeCss + 60) }}>
        <canvas ref={canvasRef} width={sizeDevice} height={sizeDevice} style={{ width: sizeCss, height: sizeCss }} />
        {feedback && (
          <div className={`absolute bottom-3 px-4 py-2 rounded-full text-sm font-semibold text-white ${feedback.correct ? 'bg-green-600' : 'bg-amber-500'}`}>
            {feedback.correct ? 'Correct' : 'Not quite'} — the lower line was shifted {feedback.answer}
          </div>
        )}
        {step === 'ack' && lastAnswer && (
          <div className="absolute bottom-3 px-4 py-2 rounded-full text-sm font-semibold text-white bg-gray-800">
            ✓ Answer recorded: {ANSWER_LABELS[lastAnswer]}
          </div>
        )}
      </div>
      <p className="px-4 pt-3 text-center text-sm text-gray-600 border-t border-gray-100">
        {step === 'feedback'
          ? 'Practice: here is the pair you just saw.'
          : step === 'fixate' || step === 'ack'
            ? 'Look at the red dot — the next pair is coming.'
            : 'Which way was the lower line shifted, compared with the upper line? Ignore where the pair was relative to the dot.'}
      </p>
      <div className="p-4 grid grid-cols-3 gap-3">
        {[
          { right: false, shift: -1, label: '← Lower line is left' },
          { right: null, shift: 0, label: '↓ Looks aligned' },
          { right: true, shift: 1, label: 'Lower line is right →' },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => respond(b.right)}
            disabled={step === 'fixate' || step === 'feedback' || step === 'ack'}
            className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold text-gray-800 hover:border-accent-500 disabled:opacity-50 flex flex-col items-center gap-1 ${
              (step === 'ack' || step === 'feedback') && lastAnswer === answerKey(b.right)
                ? 'border-accent-500 bg-accent-50 disabled:opacity-100'
                : 'border-gray-200'
            }`}
          >
            <LinePairIcon shift={b.shift} size={32} />
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )
}
