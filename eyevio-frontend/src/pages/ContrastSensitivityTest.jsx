import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import SamdDisclaimer from '../components/SamdDisclaimer'
import ScreenSizeCalibration from '../components/ScreenSizeCalibration'
import GratingSwatch from '../components/GratingSwatch'
import useDistanceMonitor from '../hooks/useDistanceMonitor'
import { getScreenScale } from '../utils/screenScale'
import { paintGrating, logCSToContrast, GRATING_ORIENTATIONS } from '../utils/psychophysics'
import {
  createQcsf,
  csfLogSensitivity,
  maxRenderableFrequency,
  aulcsfPercentOfReference,
  REFERENCE_CSF,
  QCSF_FREQUENCIES,
} from '../utils/qcsf'

/**
 * Faint Shapes Test — contrast sensitivity function by qCSF.
 *
 * Soft-edged sine gratings (5° across at 1 m) are shown at different spatial
 * frequencies and contrasts; the user picks the stripe direction (4 choices).
 * A Bayesian qCSF posterior picks each next stimulus and yields the full CSF
 * curve and its area (AULCSF) in about 25 trials per eye.
 *
 * Contrast is rendered in luminance units assuming an sRGB display, with
 * random dithering for sub-8-bit steps. Home check only.
 */

const TEST_DISTANCE_MM = 1000
const DISTANCE_TOLERANCE = 0.1
const TRIALS_PER_EYE = 25
const PRACTICE_TRIALS = 2
const PRACTICE = { frequency: 2, logCS: 0.3 }
const PATCH_DEG = 5
const SOFT_EDGE_DEG = 0.6
const FIXATE_MS = 450
const PRACTICE_FEEDBACK_MS = 800
const ORIENTATIONS = GRATING_ORIENTATIONS
const REPORT_FREQUENCIES = [1, 3, 6, 12]

const eyeName = (eye) => (eye === 'right' ? 'right eye' : 'left eye')
const otherEye = (eye) => (eye === 'right' ? 'left' : 'right')
const refLogCS = (f) => csfLogSensitivity(Math.log10(f), REFERENCE_CSF)

function patchCssPx(pxPerMm) {
  return 2 * TEST_DISTANCE_MM * Math.tan(((PATCH_DEG / 2) * Math.PI) / 180) * pxPerMm
}

function nearestIndex(list, value) {
  let best = 0
  list.forEach((v, i) => {
    if (Math.abs(Math.log(v / value)) < Math.abs(Math.log(list[best] / value))) best = i
  })
  return best
}

function describeEye(summary) {
  const { percent, curve, range } = summary
  const tested = curve.filter((c) => c.frequency >= range.minFrequency && c.frequency <= range.maxFrequency)
  const points = tested.length >= 2 ? tested : curve
  const low = points[0]
  const high = points[points.length - 1]
  const deficit = (c) => Math.max(0, refLogCS(c.frequency) - Math.max(0, c.logCS))
  const lowDeficit = deficit(low)
  const highDeficit = deficit(high)
  const overall =
    percent >= 80
      ? 'Your contrast sensitivity was in the typical range for this setup.'
      : percent >= 60
        ? 'Your contrast sensitivity was somewhat below the typical range.'
        : 'Your contrast sensitivity was clearly below the typical range.'
  let pattern = ''
  if (percent < 80) {
    if (Math.max(0, high.logCS) < 0.05 && Math.max(0, low.logCS) < 0.3) {
      pattern = ' Even high-contrast stripes were hard to see at every size. Check that the screen is bright, glare-free and viewed from 1 m, then retake; if it repeats, see an eye-care professional.'
    } else if (highDeficit > lowDeficit + 0.3) {
      pattern = ` The loss was mainly for fine stripes (around ${Math.round(high.frequency)} cycles/degree and up), which is typical of blur — for example out-of-date glasses.`
    } else if (lowDeficit > 0.3) {
      pattern = ' The loss included large, coarse stripes too. Haze in the eye (such as early cataract), screen glare, or fatigue can do this; if it repeats, mention it at an eye exam.'
    }
  }
  return `${overall}${pattern} Tested range: ${range.minFrequency}–${range.maxFrequency} cycles/degree.`
}

function CsfChart({ summary }) {
  const W = 320
  const H = 190
  const pad = { l: 36, r: 10, t: 10, b: 30 }
  const xMin = Math.log10(0.4)
  const xMax = Math.log10(32)
  const yMax = 2.6
  const x = (f) => pad.l + ((Math.log10(f) - xMin) / (xMax - xMin)) * (W - pad.l - pad.r)
  const y = (s) => pad.t + (1 - Math.max(0, Math.min(yMax, s)) / yMax) * (H - pad.t - pad.b)
  const fine = Array.from({ length: 60 }, (_, i) => 10 ** (xMin + ((xMax - xMin) * i) / 59))
  const refPath = fine.map((f, i) => `${i ? 'L' : 'M'}${x(f).toFixed(1)},${y(refLogCS(f)).toFixed(1)}`).join('')
  const pts = summary.curve
  const userPath = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.frequency).toFixed(1)},${y(p.logCS).toFixed(1)}`).join('')
  const band =
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.frequency).toFixed(1)},${y(p.logCS + p.sd).toFixed(1)}`).join('') +
    [...pts].reverse().map((p) => `L${x(p.frequency).toFixed(1)},${y(p.logCS - p.sd).toFixed(1)}`).join('') +
    'Z'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Contrast sensitivity curve">
      {[0, 0.5, 1, 1.5, 2, 2.5].map((s) => (
        <g key={s}>
          <line x1={pad.l} x2={W - pad.r} y1={y(s)} y2={y(s)} stroke="#eee" />
          <text x={pad.l - 4} y={y(s) + 3} fontSize="8" textAnchor="end" fill="#888">{s}</text>
        </g>
      ))}
      {[0.5, 1, 2, 4, 8, 16, 32].map((f) => (
        <text key={f} x={x(f)} y={H - pad.b + 12} fontSize="8" textAnchor="middle" fill="#888">{f}</text>
      ))}
      <text x={(W + pad.l) / 2} y={H - 4} fontSize="8" textAnchor="middle" fill="#666">Stripe fineness (cycles per degree)</text>
      <text x={9} y={H / 2} fontSize="8" textAnchor="middle" fill="#666" transform={`rotate(-90 9 ${H / 2})`}>Sensitivity (log)</text>
      <path d={refPath} fill="none" stroke="#9ca3af" strokeDasharray="4 3" strokeWidth="1.5" />
      <path d={band} fill="rgba(13,148,136,0.15)" />
      <path d={userPath} fill="none" stroke="#0d9488" strokeWidth="2" />
      {pts.map((p) => <circle key={p.frequency} cx={x(p.frequency)} cy={y(p.logCS)} r="2" fill="#0d9488" />)}
    </svg>
  )
}

const ContrastSensitivityTest = () => {
  const navigate = useNavigate()
  const [screenScale, setScreenScale] = useState(getScreenScale)
  const [phase, setPhase] = useState(() => (getScreenScale().source === 'default' ? 'screen-size' : 'instructions'))
  const [eyePlan, setEyePlan] = useState(['right', 'left'])
  const [eyeIndex, setEyeIndex] = useState(0)
  const [trialIndex, setTrialIndex] = useState(0)
  const [step, setStep] = useState('fixate') // fixate, stim, feedback
  const [trial, setTrial] = useState(null)
  const [practiceFeedback, setPracticeFeedback] = useState(null)
  const [eyeResults, setEyeResults] = useState({})
  const [saveState, setSaveState] = useState(null)
  const [pauseCount, setPauseCount] = useState(0)

  const canvasRef = useRef(null)
  const qcsfRef = useRef(null)
  const responsesRef = useRef([])
  const timerRef = useRef(null)
  const eyeResultsRef = useRef({})

  const monitorActive = phase === 'cover' || phase === 'running'
  const distance = useDistanceMonitor({ active: monitorActive, targetMm: TEST_DISTANCE_MM, tolerance: DISTANCE_TOLERANCE })
  const paused = phase === 'running' && distance.paused

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const maxFrequency = maxRenderableFrequency(TEST_DISTANCE_MM, screenScale.pxPerMm, dpr)
  const frequencies = useMemo(() => QCSF_FREQUENCIES.filter((f) => f <= maxFrequency), [maxFrequency])
  const patchCss = Math.round(patchCssPx(screenScale.pxPerMm))
  const patchDevice = Math.round(patchCss * dpr)

  const currentEye = eyePlan[eyeIndex]
  const totalTrials = PRACTICE_TRIALS + TRIALS_PER_EYE

  useEffect(() => () => clearTimeout(timerRef.current), [])

  useEffect(() => {
    if (paused) setPauseCount((n) => n + 1)
  }, [paused])

  const present = useCallback(
    (idx) => {
      setStep('fixate')
      setPracticeFeedback(null)
      timerRef.current = setTimeout(() => {
        const practice = idx < PRACTICE_TRIALS
        const stim = practice
          ? { freqIndex: nearestIndex(frequencies, PRACTICE.frequency), logCS: PRACTICE.logCS }
          : qcsfRef.current.next()
        setTrial({
          ...stim,
          frequency: frequencies[stim.freqIndex],
          practice,
          angle: ORIENTATIONS[Math.floor(Math.random() * ORIENTATIONS.length)].angle,
          phase: Math.random() * 2 * Math.PI,
        })
        setStep('stim')
      }, FIXATE_MS)
    },
    [frequencies]
  )

  useEffect(() => {
    if (step !== 'stim' || !trial || !canvasRef.current) return
    paintGrating(canvasRef.current, trial.angle, trial.frequency * PATCH_DEG, logCSToContrast(trial.logCS), {
      apertureRadius: patchDevice / 2,
      softEdge: (SOFT_EDGE_DEG / PATCH_DEG) * patchDevice,
      linearize: true,
      phase: trial.phase,
    })
  }, [step, trial, patchDevice])

  const startEye = () => {
    qcsfRef.current = createQcsf({ frequencies, guessRate: 1 / ORIENTATIONS.length })
    responsesRef.current = []
    setTrialIndex(0)
    setPhase('running')
    present(0)
  }

  const summarizeEye = (eye) => {
    const est = qcsfRef.current.estimate()
    const range = {
      minFrequency: frequencies[0],
      maxFrequency: frequencies[frequencies.length - 1],
    }
    const round = (v, d = 2) => Number(v.toFixed(d))
    return {
      eye,
      percent: aulcsfPercentOfReference(est.aulcsf, range.minFrequency, range.maxFrequency),
      aulcsf: round(est.aulcsf, 3),
      aulcsfSd: round(est.aulcsfSd, 3),
      peakLogCS: round(est.params.peakGain),
      peakFrequency: round(10 ** est.params.peakFreq, 1),
      bandwidth: round(est.params.bandwidth, 1),
      truncation: round(est.params.truncation),
      cutoffFrequency: round(est.cutoffFrequency, 1),
      curve: est.curve.map((c) => ({ frequency: c.frequency, logCS: round(c.logCS), sd: round(c.sd) })),
      at: Object.fromEntries(
        est.curve.filter((c) => REPORT_FREQUENCIES.includes(c.frequency)).map((c) => [c.frequency, round(c.logCS)])
      ),
      range,
      responses: responsesRef.current,
    }
  }

  const finishAll = async (results) => {
    setPhase('results')
    const eyes = Object.values(results)
    const score = Math.round(eyes.reduce((a, r) => a + r.percent, 0) / eyes.length)
    try {
      await visionTestAPI.submit({
        test_type: 'contrast_sensitivity',
        score,
        right_eye_score: results.right?.percent ?? null,
        left_eye_score: results.left?.percent ?? null,
        test_details: {
          method: 'qcsf_4afc_grating',
          method_version: 2,
          eyes: Object.fromEntries(
            Object.entries(results).map(([eye, r]) => [
              eye,
              {
                percent_of_reference: r.percent,
                aulcsf: r.aulcsf,
                aulcsf_sd: r.aulcsfSd,
                peak_log_cs: r.peakLogCS,
                peak_frequency_cpd: r.peakFrequency,
                bandwidth_octaves: r.bandwidth,
                truncation_log: r.truncation,
                cutoff_frequency_cpd: r.cutoffFrequency,
                log_cs_at_cpd: r.at,
                curve: r.curve,
                responses: r.responses,
              },
            ])
          ),
          frequencies_tested_cpd: frequencies,
          max_renderable_cpd: Number(maxFrequency.toFixed(1)),
          trials_per_eye: TRIALS_PER_EYE,
          patch_deg: PATCH_DEG,
          test_distance_mm: TEST_DISTANCE_MM,
          distance_pauses: pauseCount,
          distance_baseline_source: distance.baselineSource,
          screen_px_per_mm: Number(screenScale.pxPerMm.toFixed(3)),
          screen_scale_source: screenScale.source,
          luminance_model: 'sRGB assumed, dithered',
          scoring_note:
            'Score = AULCSF over the tested frequency range as a percentage of an approximate healthy young-adult CSF (peak logCS 2.1 at 3 cpd, 3-octave bandwidth), capped at 100; mean of tested eyes. Not a clinical CSF test.',
          timestamp: new Date().toISOString(),
        },
      })
      setSaveState('saved')
    } catch (e) {
      console.error('submit failed:', e)
      setSaveState('error')
    }
  }

  const answer = (angle) => {
    if (step !== 'stim' || paused || !trial) return
    const correct = angle === trial.angle
    if (trial.practice) {
      setPracticeFeedback(correct ? 'correct' : 'wrong')
      setStep('feedback')
      timerRef.current = setTimeout(() => {
        setTrialIndex(trialIndex + 1)
        present(trialIndex + 1)
      }, PRACTICE_FEEDBACK_MS)
      return
    }

    qcsfRef.current.update(trial, correct)
    responsesRef.current = [
      ...responsesRef.current,
      { frequency: trial.frequency, logCS: Number(trial.logCS.toFixed(2)), angle: trial.angle, answer: angle, correct },
    ]

    const next = trialIndex + 1
    if (next < totalTrials) {
      setTrialIndex(next)
      present(next)
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

  const answerRef = useRef(answer)
  answerRef.current = answer

  useEffect(() => {
    if (phase !== 'running') return undefined
    const onKey = (e) => {
      const i = Number(e.key) - 1
      if (i >= 0 && i < ORIENTATIONS.length) answerRef.current(ORIENTATIONS[i].angle)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  const resetAll = () => {
    clearTimeout(timerRef.current)
    eyeResultsRef.current = {}
    setEyeResults({})
    setEyeIndex(0)
    setSaveState(null)
    setPauseCount(0)
    setPhase('instructions')
  }

  return (
    <div className="test-shell">
      {monitorActive && (
        <video ref={distance.videoRef} autoPlay playsInline muted className="fixed top-0 left-0 w-px h-px opacity-0 pointer-events-none" aria-hidden />
      )}
      <div className="max-w-4xl mx-auto">
        {phase === 'screen-size' && (
          <ScreenSizeCalibration
            onDone={() => {
              setScreenScale(getScreenScale())
              setPhase('instructions')
            }}
            onSkip={() => setPhase('instructions')}
          />
        )}

        {phase === 'instructions' && (
          <div className="test-panel max-w-3xl mx-auto">
            <div className="text-center mb-6">
              <h1 className="page-title mb-1">Faint Shapes Test</h1>
              <p className="text-sm text-accent-600 font-medium">Your contrast sensitivity curve, one eye at a time</p>
            </div>

            <div className="bg-accent-50 border-l-4 border-accent-500 rounded-r-xl p-5 mb-6 text-sm text-accent-900 space-y-2">
              <p>
                Faint striped patches appear in the centre. Some stripes are wide, some fine; some are clear, some
                barely visible. You pick the <strong>direction of the stripes</strong>. The test adapts after every
                answer and maps how much contrast you need at each stripe size — your contrast sensitivity curve.
              </p>
              <p>Many patches will be very faint. That&apos;s the point — <strong>always make your best guess</strong>.</p>
            </div>

            <ul className="space-y-2 text-sm text-gray-700 mb-6 list-disc pl-5">
              <li>Sit <strong>1 metre</strong> from the screen. The camera checks your distance and pauses the test if you drift.</li>
              <li>Turn off Night Shift, True Tone and auto-brightness, set brightness to about 75%, and avoid glare on the screen.</li>
              <li>Answer with the four buttons or the keys <strong>1–4</strong>. {TRIALS_PER_EYE} patches per eye, about 2 minutes each.</li>
              <li>Wear your usual distance glasses.</li>
            </ul>

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

            <div className="text-xs text-gray-500 mb-6 space-y-1">
              <p>
                This screen can draw stripes up to about {maxFrequency.toFixed(0)} cycles/degree at 1 m
                ({frequencies.length} stripe sizes).
                {screenScale.source === 'default' && ' Screen size was not measured, so stripe sizes are approximate.'}
              </p>
              {screenScale.source === 'default' && (
                <button type="button" onClick={() => setPhase('screen-size')} className="text-accent-700 underline">
                  Measure screen with a card
                </button>
              )}
            </div>

            <div className="flex gap-4">
              <button onClick={() => navigate('/vision-tests')} className="flex-1 px-5 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50">Back</button>
              <button onClick={() => setPhase('cover')} className="test-btn" disabled={frequencies.length < 4}>Begin</button>
            </div>
          </div>
        )}

        {phase === 'cover' && (
          <div className="test-panel text-center py-10 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Test your {eyeName(currentEye)}</h2>
            <p className="text-gray-600 mb-4">
              Sit 1 m from the screen and cover your <strong>{eyeName(otherEye(currentEye))}</strong> with your palm.
            </p>
            <p className="text-sm text-gray-500 mb-8">
              {distance.distanceMm ? `Camera distance: about ${Math.round(distance.distanceMm / 10)} cm` : 'Starting the distance check…'}
            </p>
            <button onClick={startEye} className="test-btn max-w-xs mx-auto">
              I&apos;m covering my {otherEye(currentEye)} eye — start
            </button>
          </div>
        )}

        {phase === 'running' && (
          <div className="test-panel overflow-hidden p-0">
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span className="font-medium">Faint Shapes — {eyeName(currentEye)}</span>
              <span>
                {trialIndex < PRACTICE_TRIALS ? `Practice ${trialIndex + 1}/${PRACTICE_TRIALS}` : `${trialIndex - PRACTICE_TRIALS + 1} / ${TRIALS_PER_EYE}`}
              </span>
            </div>
            <div className="h-1.5 bg-gray-100">
              <div className="h-1.5 bg-accent-500 transition-all duration-300" style={{ width: `${(trialIndex / totalTrials) * 100}%` }} />
            </div>

            <div className="grid md:grid-cols-[1fr_220px]">
              <div className="relative flex items-center justify-center select-none" style={{ backgroundColor: 'rgb(128,128,128)', minHeight: Math.max(360, patchCss + 60) }}>
                {step === 'fixate' && <span className="block w-2 h-2 rounded-full bg-black/60" />}
                {(step === 'stim' || step === 'feedback') && (
                  <canvas ref={canvasRef} width={patchDevice} height={patchDevice} style={{ width: patchCss, height: patchCss }} />
                )}
                {practiceFeedback && (
                  <div className={`absolute bottom-4 px-4 py-2 rounded-full text-sm font-semibold ${practiceFeedback === 'correct' ? 'bg-green-600 text-white' : 'bg-amber-500 text-white'}`}>
                    {practiceFeedback === 'correct' ? 'Correct' : 'Not quite — the real test has no feedback'}
                  </div>
                )}
                {paused && (
                  <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-white text-center p-6">
                    <p className="text-lg font-semibold mb-1">Paused</p>
                    <p className="text-sm">
                      {distance.reason === 'no_face'
                        ? 'The camera can’t see your face. Face the screen from about 1 m.'
                        : distance.reason === 'too_close'
                          ? 'You’re too close — move back to about 1 m.'
                          : 'You’re too far — move closer to about 1 m.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="p-4 border-t md:border-t-0 md:border-l border-gray-100 space-y-2">
                <p className="text-xs font-semibold text-gray-700 mb-1">Which way do the stripes run?</p>
                {ORIENTATIONS.map((o, i) => (
                  <button
                    key={o.angle}
                    type="button"
                    onClick={() => answer(o.angle)}
                    disabled={step !== 'stim' || paused}
                    className="w-full flex items-center gap-3 rounded-xl border-2 border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 hover:border-accent-500 disabled:opacity-50"
                  >
                    <GratingSwatch angle={o.angle} size={36} />
                    <span className="flex-1 text-left">{o.name}</span>
                    <kbd className="text-xs text-gray-400">{i + 1}</kbd>
                  </button>
                ))}
                <p className="text-xs text-gray-500 pt-2">Can&apos;t see it? Guess — every answer helps.</p>
              </div>
            </div>
          </div>
        )}

        {phase === 'results' && (
          <div className="test-panel max-w-3xl mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-gray-900 mb-1">Your Contrast Sensitivity</h2>
              <p className="text-gray-500 text-sm">Solid line: your estimated curve (shaded ± 1 SD). Dashed: typical young adult.</p>
            </div>

            {saveState === 'error' && (
              <div className="border border-red-300 bg-red-50 rounded-xl p-4 mb-6 text-sm text-red-800">Results could not be saved. Check your connection and retake.</div>
            )}

            {eyePlan.map((eye) => {
              const r = eyeResults[eye]
              if (!r) return null
              const tone = r.percent >= 80 ? 'border-green-300 bg-green-50' : r.percent >= 60 ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50'
              return (
                <div key={eye} className={`rounded-2xl border p-5 mb-6 ${tone}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-gray-900 capitalize">{eyeName(eye)}</h3>
                    <span className="text-sm font-semibold text-gray-800">{r.percent}% of typical area</span>
                  </div>
                  <div className="bg-white rounded-xl p-3 mb-3">
                    <CsfChart summary={r} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
                    {Object.entries(r.at).map(([f, s]) => (
                      <div key={f} className="rounded-lg bg-white/80 p-2 text-center">
                        {s > 0 ? (
                          <>
                            <div className="font-bold text-gray-900">{(100 * 10 ** -s).toFixed(s > 1.5 ? 1 : 0)}%</div>
                            <div className="text-gray-500">contrast needed at {f} c/deg</div>
                          </>
                        ) : (
                          <>
                            <div className="font-bold text-gray-900">Not seen</div>
                            <div className="text-gray-500">even at full contrast, {f} c/deg</div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-gray-700">{describeEye(r)}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Peak {r.peakLogCS} log units at {r.peakFrequency} c/deg · AULCSF {r.aulcsf} ± {r.aulcsfSd}
                  </p>
                </div>
              )
            })}

            <div className="text-xs text-gray-500 mb-6 space-y-1">
              <p>
                Contrast is drawn assuming a standard (sRGB) screen. Screen brightness, Night Shift and room glare all change
                the result, so compare results taken on the same screen and setup.
              </p>
              <p>The &quot;typical&quot; curve is an approximation from published qCSF studies, not a calibrated norm for your screen.</p>
              {pauseCount > 0 && <p>The test paused {pauseCount} time{pauseCount === 1 ? '' : 's'} for distance.</p>}
              {screenScale.source === 'default' && <p>Screen size wasn&apos;t measured, so stripe sizes are approximate.</p>}
            </div>

            <SamdDisclaimer testType="contrast_sensitivity" className="mb-8" />

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

export default ContrastSensitivityTest
