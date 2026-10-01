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
  assessNpcCamera,
  combineNpcApproach,
  yawProxy,
  NPC_CAMERA_LIMITS,
} from '../utils/visionTestScoring'

/**
 * Near Point of Convergence (NPC), camera-assisted.
 *
 * The user fixates a small target just under the camera and slowly brings
 * their face toward it. Distance comes from the outer-canthal span (scaled
 * from an arm's-length baseline); convergence from pupil separation divided by
 * that span. Two break estimates are kept per approach: the distance where the
 * user reported doubling, and the camera-estimated vergence break. The camera
 * value only counts when it passes assessNpcCamera; the recorded NPC follows
 * the clinical rule of whichever break comes first on the approach.
 */

const TRIALS = 2
const BASELINE_MS = 1200
const MAX_APPROACH_MS = 40000
const SUBJECTIVE_WINDOW_MS = 400
const REPORT_MAX_GAP_MS = 1500
const FATIGUE_RECESSION_CM = 2

const CAMERA_REASON_TEXT = {
  pupils_not_located: 'pupils not located in enough frames',
  eye_corner_span_too_small: 'face too small in the frame',
  eye_corner_span_unstable: 'eye-corner span unstable at the start',
  face_angle_unstable: 'head turned or tilting',
}

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
  if (!regions?.canthalSpanPx) return null
  const located = Boolean(regions.nasalPosition)
  const { anatomicalLeft: l, anatomicalRight: r } = regions
  const pupilSep = located ? Math.hypot(l.x - r.x, l.y - r.y) : null
  return {
    located,
    pupilSep,
    span: regions.canthalSpanPx,
    ratio: located ? pupilSep / regions.canthalSpanPx : null,
    right: located ? regions.nasalPosition.right : null,
    left: located ? regions.nasalPosition.left : null,
    yaw: yawProxy(regions.eyeWidthsPx),
    rollDeg: Number.isFinite(regions.rollDeg) ? regions.rollDeg : null,
  }
}

const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null)
const round1 = (v) => (v != null ? Number(v.toFixed(1)) : null)

const NearPointConvergenceTest = () => {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const trackerRef = useRef(null)
  const loopRef = useRef({ running: false })
  const samplesRef = useRef([])
  const framesRef = useRef(0)
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
          setFaceLocked(Boolean(m?.located))
          const baseline = baselineRef.current
          if (baseline?.span) framesRef.current += 1
          if (m) {
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
    framesRef.current = 0
    setLiveDistance(null)
    baselineRef.current = { collecting: true, samples: [] }
    setPhase('baseline')
    setTimeout(() => {
      const b = baselineRef.current
      const located = b.samples.filter((s) => s.located)
      const spans = located.map((s) => s.span)
      const span = median(spans)
      const pupilSep = median(located.map((s) => s.pupilSep))
      const width = videoRef.current?.videoWidth
      const distanceCm = pupilSep ? estimateDistanceCmFromPixelIpd(pupilSep, width) : null
      if (!span || !distanceCm) {
        baselineRef.current = null
        setCameraError('Could not see both eyes clearly. Face the camera in good light and try again.')
        setPhase('setup')
        return
      }
      baselineRef.current = { collecting: false, span, spans, distanceCm }
      setPhase('approach')
    }, BASELINE_MS)
  }

  const endTrial = useCallback((reportedDouble) => {
    const endedAt = performance.now()
    const samples = samplesRef.current
    const baselineSpans = baselineRef.current?.spans ?? []
    baselineRef.current = null

    const objective = detectConvergenceBreak(samples)
    const camera = assessNpcCamera({ samples, frames: framesRef.current, baselineSpans })
    const last = samples[samples.length - 1]
    const reportedCm = reportedDouble
      ? median(samples.filter((s) => endedAt - s.t <= SUBJECTIVE_WINDOW_MS).map((s) => s.distanceCm)) ??
        (last && endedAt - last.t <= REPORT_MAX_GAP_MS ? last.distanceCm : null)
      : null

    const combined = combineNpcApproach({
      reportedCm,
      cameraBreakCm: objective.breakDistanceCm,
      cameraOk: camera.status === 'ok',
    })
    const breakDetected = combined.npcCm != null
    const closestOk = !breakDetected && camera.status === 'ok' ? objective.closestDistanceCm : null

    const trial = {
      trial: trialsRef.current.length + 1,
      npcCm: breakDetected ? combined.npcCm : closestOk,
      breakDetected,
      breakSource: breakDetected ? combined.source : closestOk != null ? 'no_break_closest' : 'unable_to_measure',
      reportedDouble,
      reportedCm: combined.reportedCm,
      reportedDistanceMissing: reportedDouble && combined.reportedCm == null,
      cameraBreakCm: combined.cameraBreakCm,
      cameraBreakRawCm: objective.breakDistanceCm,
      cameraStatus: camera.status,
      camera,
      agreementCm: combined.agreementCm,
      agree: combined.agree,
      objective,
      samples: samples.length,
      frames: framesRef.current,
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
    const npcMean = mean(measured.map((t) => t.npcCm))
    const anyBreak = measured.some((t) => t.breakDetected)
    const withBreak = allTrials.filter((t) => t.breakDetected)
    const receded =
      withBreak.length === TRIALS && withBreak[1].npcCm - withBreak[0].npcCm >= FATIGUE_RECESSION_CM
    const agreements = allTrials.map((t) => t.agreementCm).filter(Number.isFinite)
    const result = {
      npcMean: round1(npcMean),
      anyBreak,
      receded,
      reportedMean: round1(mean(allTrials.map((t) => t.reportedCm).filter(Number.isFinite))),
      cameraMean: round1(mean(allTrials.map((t) => t.cameraBreakCm).filter(Number.isFinite))),
      meanAgreementCm: round1(mean(agreements)),
      comparedApproaches: agreements.length,
      agreeingApproaches: allTrials.filter((t) => t.agree === true).length,
      cameraUnable: allTrials.filter((t) => t.cameraStatus === 'unable_to_measure').length,
      score: anyBreak ? scoreNearPointConvergence(npcMean) : null,
    }
    setSummary(result)
    setPhase('results')

    if (result.npcMean == null) {
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
          method_version: 2,
          npc_cm: anyBreak ? result.npcMean : null,
          closest_no_break_cm: anyBreak ? null : result.npcMean,
          break_detected: anyBreak,
          reported_diplopia_cm: result.reportedMean,
          camera_break_cm: result.cameraMean,
          mean_agreement_cm: result.meanAgreementCm,
          agreement_limit_cm: NPC_CAMERA_LIMITS.agreementCm,
          compared_approaches: result.comparedApproaches,
          agreeing_approaches: result.agreeingApproaches,
          camera_unable_approaches: result.cameraUnable,
          camera_confidence_limits: NPC_CAMERA_LIMITS,
          receded_on_repeat: receded,
          low_confidence: result.cameraUnable > 0,
          trials: allTrials,
          break_rule: 'Per approach, the break is whichever came first while approaching (the farther distance): reported doubling, or the camera-estimated vergence break. The camera break counts only when it passed the confidence criteria (pupils located in ≥ 70% of frames, eye-corner span ≥ 60 px and stable at baseline, head yaw/roll steady); otherwise it is recorded as unable to measure.',
          scoring_note: 'Measurement: break distance (cm); change tracking uses npc_cm (null when no break was found). Reported and camera distances and their agreement are kept separately. Display index (not clinically validated, not used for alerts or reports): ≤ 6 cm → 100, ≥ 20 cm → 0; null without a break.',
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
              Approach {trials.length}:{' '}
              {trials[trials.length - 1]?.breakDetected ? `${trials[trials.length - 1].npcCm} cm` : 'no break recorded'}
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

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="py-2 pr-2">Approach</th>
                    <th className="py-2 pr-2">You reported doubling</th>
                    <th className="py-2 pr-2">Camera vergence break</th>
                    <th className="py-2 pr-2">Difference</th>
                    <th className="py-2">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {trials.map((t) => (
                    <tr key={t.trial} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-2">{t.trial}</td>
                      <td className="py-2 pr-2">
                        {t.reportedCm != null
                          ? `${t.reportedCm} cm`
                          : t.reportedDistanceMissing
                            ? 'Pressed, but face not tracked at that moment'
                            : 'Not reported'}
                      </td>
                      <td className="py-2 pr-2">
                        {t.cameraStatus === 'unable_to_measure' ? (
                          <span className="text-gray-600">
                            Unable to measure
                            <span className="block text-xs text-gray-500">
                              {t.camera.reasons.map((r) => CAMERA_REASON_TEXT[r] ?? r).join('; ')}
                            </span>
                          </span>
                        ) : t.cameraBreakCm != null ? (
                          `${t.cameraBreakCm} cm${t.objective.divergingEye ? ` (${t.objective.divergingEye} eye)` : ''}`
                        ) : (
                          'No break seen'
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        {t.agreementCm != null
                          ? `${t.agreementCm} cm ${t.agree ? '(agree)' : '(disagree)'}`
                          : '—'}
                      </td>
                      <td className="py-2 font-semibold text-gray-900">
                        {t.breakDetected
                          ? `${t.npcCm} cm`
                          : t.breakSource === 'no_break_closest'
                            ? `No break to ${t.npcCm} cm`
                            : 'Unable to measure'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-600 mb-6">
              Each approach records whichever break came first as you moved in — the moment you saw double, or the moment
              the camera saw one eye stop turning inward — the same rule used for the clinical push-up test. The camera value
              only counts when it passed its checks (pupils found in at least {Math.round(NPC_CAMERA_LIMITS.minTrackedFraction * 100)}%
              of frames, face large enough and steady at the start, head not turning or tilting). Values within{' '}
              {NPC_CAMERA_LIMITS.agreementCm} cm are shown as agreeing.
            </p>

            {summary.receded && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                Your break point was at least {FATIGUE_RECESSION_CM} cm farther on the second approach. This can happen with
                tiredness, but distances are estimates, so a single difference like this is not conclusive.
              </p>
            )}
            {summary.cameraUnable > 0 && (
              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4">
                The camera could not measure on {summary.cameraUnable} of {trials.length} approaches, so those rely on your
                report alone. Brighter, even light and keeping your head straight help.
              </p>
            )}
            {saveState === 'error' && <p className="text-sm text-red-700 mb-4">Results could not be saved.</p>}
            {saveState === 'not_saved' && <p className="text-sm text-gray-600 mb-4">Unable to measure on any approach, so this run was not saved.</p>}

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
