import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import cameraManager from '../utils/cameraManager.js'
import { visionTestAPI } from '../services/api'
import SamdDisclaimer from '../components/SamdDisclaimer'
import { PupilRegionTracker } from '../utils/pupilRegionDetector'
import { estimateDistanceCmFromPixelIpd } from '../utils/distanceCalibration'
import {
  detectConvergenceBreak,
  scoreNearPointConvergence,
  interpretNearPointConvergence,
} from '../utils/visionTestScoring'

/**
 * Near Point of Convergence (NPC), camera-assisted.
 *
 * The user fixates a small target just under the camera and slowly brings
 * their face toward it. Distance comes from the outer-canthal span (scaled
 * from an arm's-length baseline); convergence from pupil separation divided by
 * that span. The break is whichever comes first: the user reports doubling,
 * or one eye visibly stops converging.
 */

const TRIALS = 2
const BASELINE_MS = 1200
const MAX_APPROACH_MS = 40000
const SUBJECTIVE_WINDOW_MS = 400
const MIN_TRACKED_SAMPLES = 20
const FATIGUE_RECESSION_CM = 2

const TONE_CLASSES = {
  green: 'border-green-300 bg-green-50',
  amber: 'border-amber-300 bg-amber-50',
  red: 'border-red-300 bg-red-50',
  gray: 'border-gray-300 bg-gray-50',
}

function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : null
}

function measure(regions) {
  if (!regions?.nasalPosition || !regions.canthalSpanPx) return null
  const { anatomicalLeft: l, anatomicalRight: r } = regions
  const pupilSep = Math.hypot(l.x - r.x, l.y - r.y)
  return {
    pupilSep,
    span: regions.canthalSpanPx,
    ratio: pupilSep / regions.canthalSpanPx,
    right: regions.nasalPosition.right,
    left: regions.nasalPosition.left,
  }
}

const NearPointConvergenceTest = () => {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const trackerRef = useRef(null)
  const loopRef = useRef({ running: false })
  const samplesRef = useRef([])
  const baselineRef = useRef(null)
  const trialsRef = useRef([])

  const [phase, setPhase] = useState('instructions') // instructions, setup, baseline, approach, between, results
  const [cameraError, setCameraError] = useState(null)
  const [faceLocked, setFaceLocked] = useState(false)
  const [liveDistance, setLiveDistance] = useState(null)
  const [trialNumber, setTrialNumber] = useState(1)
  const [trials, setTrials] = useState([])
  const [summary, setSummary] = useState(null)
  const [saveState, setSaveState] = useState(null)

  const stopLoop = () => {
    loopRef.current.running = false
  }

  const stopCamera = useCallback(() => {
    stopLoop()
    try { cameraManager.release() } catch { /* already released */ }
    trackerRef.current?.stop()
    trackerRef.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const startCamera = useCallback(async () => {
    stopLoop()
    setCameraError(null)
    try {
      const stream = await cameraManager.acquire({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      trackerRef.current = new PupilRegionTracker()
      await trackerRef.current.init()
      const video = videoRef.current
      video.srcObject = stream
      await video.play()

      loopRef.current = { running: true }
      const loop = loopRef.current
      const run = async () => {
        while (loop.running) {
          const regions = await trackerRef.current?.track(videoRef.current)
          const m = measure(regions)
          setFaceLocked(Boolean(m))
          if (m) {
            const baseline = baselineRef.current
            if (baseline?.collecting) {
              baseline.samples.push(m)
            } else if (baseline?.span) {
              const distanceCm = baseline.distanceCm * (baseline.span / m.span)
              samplesRef.current.push({ t: performance.now(), distanceCm, ...m })
              setLiveDistance(distanceCm)
            }
          }
          await new Promise((r) => setTimeout(r, 40))
        }
      }
      run()
    } catch (err) {
      console.error('Camera start failed:', err)
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera access denied. Allow the camera in your browser, then retry.'
          : 'Could not start the camera or face tracker. Check permissions and retry.'
      )
    }
  }, [])

  useEffect(() => {
    if (phase === 'setup') startCamera()
  }, [phase, startCamera])

  const beginTrial = () => {
    samplesRef.current = []
    setLiveDistance(null)
    baselineRef.current = { collecting: true, samples: [] }
    setPhase('baseline')
    setTimeout(() => {
      const b = baselineRef.current
      const span = median(b.samples.map((s) => s.span))
      const pupilSep = median(b.samples.map((s) => s.pupilSep))
      const width = videoRef.current?.videoWidth
      const distanceCm = pupilSep ? estimateDistanceCmFromPixelIpd(pupilSep, width) : null
      if (!span || !distanceCm) {
        baselineRef.current = null
        setCameraError('Could not see both eyes clearly. Face the camera in good light and try again.')
        setPhase('setup')
        return
      }
      baselineRef.current = { collecting: false, span, distanceCm }
      setPhase('approach')
    }, BASELINE_MS)
  }

  const endTrial = useCallback((reportedDouble) => {
    const endedAt = performance.now()
    const samples = samplesRef.current
    baselineRef.current = null

    const objective = detectConvergenceBreak(samples)
    const subjectiveCm = reportedDouble
      ? median(samples.filter((s) => endedAt - s.t <= SUBJECTIVE_WINDOW_MS).map((s) => s.distanceCm)) ??
        samples[samples.length - 1]?.distanceCm ?? null
      : null

    const breaks = [subjectiveCm, objective.breakDistanceCm].filter(Number.isFinite)
    const breakDetected = breaks.length > 0
    const npcCm = breakDetected ? Math.max(...breaks) : objective.closestDistanceCm
    const lowConfidence =
      samples.length < MIN_TRACKED_SAMPLES ||
      (objective.closestDistanceCm != null && objective.closestDistanceCm < 25 && (objective.convergenceRange ?? 0) < 0.01)

    const trial = {
      trial: trialsRef.current.length + 1,
      npcCm: Number.isFinite(npcCm) ? Number(npcCm.toFixed(1)) : null,
      breakDetected,
      breakSource: !breakDetected
        ? 'none'
        : subjectiveCm != null && objective.breakDistanceCm != null
          ? 'reported_and_camera'
          : subjectiveCm != null ? 'reported' : 'camera',
      subjectiveCm: subjectiveCm != null ? Number(subjectiveCm.toFixed(1)) : null,
      objective,
      lowConfidence,
      samples: samples.length,
    }

    trialsRef.current = [...trialsRef.current, trial]
    setTrials(trialsRef.current)

    if (trialsRef.current.length < TRIALS) {
      setTrialNumber(trialsRef.current.length + 1)
      setPhase('between')
    } else {
      finish(trialsRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase !== 'approach') return undefined
    const onKey = (e) => {
      if (e.code === 'Space') { e.preventDefault(); endTrial(true) }
      if (e.code === 'Enter') { e.preventDefault(); endTrial(false) }
    }
    window.addEventListener('keydown', onKey)
    const timeout = setTimeout(() => endTrial(false), MAX_APPROACH_MS)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(timeout)
    }
  }, [phase, endTrial])

  const finish = async (allTrials) => {
    stopCamera()
    const measured = allTrials.filter((t) => Number.isFinite(t.npcCm))
    const npcMean = measured.length ? measured.reduce((a, t) => a + t.npcCm, 0) / measured.length : null
    const anyBreak = measured.some((t) => t.breakDetected)
    const receded =
      measured.length === TRIALS && measured[1].npcCm - measured[0].npcCm >= FATIGUE_RECESSION_CM
    const result = {
      npcMean: npcMean != null ? Number(npcMean.toFixed(1)) : null,
      anyBreak,
      receded,
      lowConfidence: allTrials.some((t) => t.lowConfidence),
      score: scoreNearPointConvergence(npcMean),
    }
    setSummary(result)
    setPhase('results')

    if (result.score == null) {
      setSaveState('not_saved')
      return
    }
    try {
      await visionTestAPI.submit({
        test_type: 'near_point_convergence',
        score: result.score,
        response_time_ms: 0,
        errors: 0,
        test_details: {
          method: 'camera_npc_face_approach',
          method_version: 1,
          npc_cm: result.npcMean,
          break_detected: anyBreak,
          receded_on_repeat: receded,
          low_confidence: result.lowConfidence,
          trials: allTrials,
          scoring_note: 'NPC index: ≤ 6 cm → 100, ≥ 20 cm → 0. Break = first of reported doubling or camera-detected loss of convergence.',
        },
      })
      setSaveState('saved')
    } catch (e) {
      console.error('submit failed:', e)
      setSaveState('error')
    }
  }

  const reset = () => {
    trialsRef.current = []
    setTrials([])
    setSummary(null)
    setSaveState(null)
    setTrialNumber(1)
    setPhase('instructions')
  }

  const interpretation = summary ? interpretNearPointConvergence(summary.npcMean, { breakDetected: summary.anyBreak }) : null
  const showVideo = phase === 'setup'

  return (
    <>
      <div className={showVideo ? 'max-w-md mx-auto mt-6' : 'fixed top-0 left-0 w-px h-px opacity-0 overflow-hidden pointer-events-none'}>
        <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-2xl" style={{ transform: 'scaleX(-1)' }} />
      </div>

      {phase === 'instructions' && (
        <div className="test-shell">
          <div className="max-w-3xl mx-auto test-panel">
            <h1 className="page-title mb-1 text-center">Convergence Near Point</h1>
            <p className="text-sm text-accent-600 font-medium text-center mb-6">
              How close both eyes can team up on a near target
            </p>

            <div className="bg-accent-50 border-l-4 border-accent-500 rounded-r-xl p-5 mb-6 text-sm text-accent-900">
              When something comes close, both eyes turn inward to keep it single. The distance where one eye
              gives up (you see double) is the <strong>near point of convergence</strong>. It is typically under
              6–10 cm; a farther point is linked to eye strain and headaches with near work.
            </div>

            <ol className="space-y-3 text-sm text-gray-700 mb-6 list-decimal pl-5">
              <li>Start at arm&apos;s length, facing the camera, in good light. Glasses on if you wear them for reading.</li>
              <li>Look at the small letters at the <strong>top of the screen, just under the camera</strong>.</li>
              <li>Slowly bring your face toward them — about the speed of counting to five from arm&apos;s length.</li>
              <li>The moment the letters <strong>split into two</strong>, press <kbd className="px-1 border rounded">Space</kbd> (or tap <em>They doubled</em>).</li>
              <li>If you get as close as you can and they never double, press <kbd className="px-1 border rounded">Enter</kbd> (or tap <em>As close as I can get</em>).</li>
            </ol>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-xs text-amber-800">
              {TRIALS} approaches, under 2 minutes. Laptop cameras often lose your face closer than 15–20 cm; a phone
              held at eye level works better. The camera also watches for one eye drifting outward.
            </div>

            <div className="flex gap-4">
              <button onClick={() => navigate('/vision-tests')} className="flex-1 px-5 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50">Back</button>
              <button onClick={() => setPhase('setup')} className="test-btn">Start camera</button>
            </div>
          </div>
        </div>
      )}

      {phase === 'setup' && (
        <div className="max-w-md mx-auto text-center mt-4 px-4">
          {cameraError && <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{cameraError}</p>}
          <p className={`mb-4 text-sm ${faceLocked ? 'text-green-700' : 'text-gray-500'}`}>
            {faceLocked ? 'Both eyes found. Sit at arm’s length and look at the camera.' : 'Looking for both eyes…'}
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { stopCamera(); setPhase('instructions') }} className="px-5 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700">Cancel</button>
            {cameraError && (
              <button onClick={startCamera} className="px-5 py-3 bg-amber-600 text-white rounded-full font-semibold">Retry camera</button>
            )}
            <button
              onClick={beginTrial}
              disabled={!faceLocked}
              className={`px-6 py-3 rounded-full font-semibold text-white ${faceLocked ? 'bg-accent-600 hover:bg-accent-700' : 'bg-gray-400 cursor-not-allowed'}`}
            >
              I&apos;m at arm&apos;s length — start
            </button>
          </div>
        </div>
      )}

      {(phase === 'baseline' || phase === 'approach') && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col items-center">
          <div className="mt-2 px-3 py-2 border border-gray-300 rounded-md bg-white">
            <span className="block font-bold text-gray-900 tracking-widest" style={{ fontSize: 13, fontFamily: 'monospace' }}>
              H O T V
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            {phase === 'baseline' ? (
              <p className="text-gray-600">Hold still at arm&apos;s length, looking at the letters at the top…</p>
            ) : (
              <>
                <p className="text-gray-800 font-semibold mb-1">
                  Approach {trialNumber} of {TRIALS}: move slowly toward the letters at the top
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  {faceLocked && liveDistance ? `About ${Math.round(liveDistance)} cm` : 'Face not tracked — keep going if the letters are still single'}
                </p>
              </>
            )}
          </div>

          {phase === 'approach' && (
            <div className="w-full grid grid-cols-2 gap-3 p-4">
              <button onClick={() => endTrial(true)} className="py-5 rounded-2xl bg-accent-600 text-white text-lg font-bold">
                They doubled <span className="text-xs font-normal opacity-80">(Space)</span>
              </button>
              <button onClick={() => endTrial(false)} className="py-5 rounded-2xl border-2 border-gray-300 text-gray-700 text-lg font-semibold">
                As close as I can get <span className="text-xs font-normal opacity-80">(Enter)</span>
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'between' && (
        <div className="test-shell">
          <div className="max-w-md mx-auto test-panel text-center">
            <p className="text-sm text-gray-500 mb-2">
              Approach {trials.length}: {trials[trials.length - 1]?.npcCm != null ? `${trials[trials.length - 1].npcCm} cm` : 'not measured'}
            </p>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Blink a few times, then move back to arm&apos;s length</h2>
            <button onClick={beginTrial} disabled={!faceLocked} className="test-btn max-w-xs mx-auto">
              {faceLocked ? `Start approach ${trialNumber}` : 'Looking for both eyes…'}
            </button>
          </div>
        </div>
      )}

      {phase === 'results' && summary && (
        <div className="test-shell">
          <div className="max-w-3xl mx-auto test-panel">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-6">Convergence Near Point</h2>

            <div className={`rounded-2xl border p-6 mb-6 text-center ${TONE_CLASSES[interpretation.tone]}`}>
              <div className="text-4xl font-bold text-gray-900 mb-1">
                {summary.npcMean != null ? `${Math.round(summary.npcMean)} cm` : '—'}
              </div>
              <div className="font-semibold text-gray-800 mb-2">{interpretation.title}</div>
              <p className="text-sm text-gray-700">{interpretation.detail}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {trials.map((t) => (
                <div key={t.trial} className="rounded-xl bg-gray-50 p-3 text-sm">
                  <div className="text-gray-500 text-xs">Approach {t.trial}</div>
                  <div className="font-semibold text-gray-900">{t.npcCm != null ? `${t.npcCm} cm` : 'Not measured'}</div>
                  <div className="text-xs text-gray-500">
                    {t.breakSource === 'reported_and_camera' && 'You reported doubling; camera saw an eye drift'}
                    {t.breakSource === 'reported' && 'You reported doubling'}
                    {t.breakSource === 'camera' && `Camera saw the ${t.objective.divergingEye ?? ''} eye drift`}
                    {t.breakSource === 'none' && 'No break — closest tracked distance'}
                  </div>
                </div>
              ))}
            </div>

            {summary.receded && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                Your near point moved farther away on the second approach — a sign your eyes tire with repeated near effort.
              </p>
            )}
            {summary.lowConfidence && (
              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4">
                Tracking was patchy on at least one approach, so the camera cross-check is rough. Brighter, even light helps.
              </p>
            )}
            {saveState === 'error' && <p className="text-sm text-red-700 mb-4">Results could not be saved.</p>}
            {saveState === 'not_saved' && <p className="text-sm text-gray-600 mb-4">Nothing measurable was recorded, so this run was not saved.</p>}

            <p className="text-xs text-gray-500 mb-6">
              Distances are camera estimates (about ±2–3 cm) and are most accurate after the distance calibration.
            </p>

            <SamdDisclaimer testType="near_point_convergence" className="mb-8" />

            <div className="flex gap-4">
              <button onClick={() => navigate('/vision-tests')} className="flex-1 px-5 py-3 border-2 border-gray-300 rounded-full font-semibold text-gray-700 hover:bg-gray-50">Back to Tests</button>
              <button onClick={reset} className="flex-1 px-5 py-3 bg-accent-600 hover:bg-accent-700 text-white rounded-full font-semibold">Retake</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default NearPointConvergenceTest
