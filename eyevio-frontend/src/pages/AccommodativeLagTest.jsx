import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import SamdDisclaimer from '../components/SamdDisclaimer'
import ScreenSizeCalibration from '../components/ScreenSizeCalibration'
import SloanLetter from '../components/SloanLetter'
import useDistanceMonitor from '../hooks/useDistanceMonitor'
import { getScreenScale } from '../utils/screenScale'
import { DISPLAY_INDEX_LABEL } from '../utils/displayIndex'
import {
  NEAR_BLUR,
  blurAtTime,
  buildRunPlan,
  letterHeightPx,
  pxPerArcmin,
  randomSloanRow,
  summarizeNearBlur,
} from '../utils/nearBlur'

/**
 * Near Blur Tolerance — blur detection threshold on a near letter row.
 * Protocol (target size, distance, blur method, runs, stopping rule,
 * repeatability, unit, index) is defined in utils/nearBlur.js.
 * It does not measure accommodation. Test type id stays `accommodative_lag`
 * so existing history is kept; method_version 2 is not comparable with v1.
 */

const STATUS_TEXT = {
  ok: null,
  unreliable_catch: 'You reported blur on a round where the letters never blurred, so this session was not scored. Retake and press only when the letters actually look blurred.',
  beyond_range: `In more than ${NEAR_BLUR.maxCensoredRuns} round the letters reached the maximum blur (${NEAR_BLUR.capArcmin} arcmin) before you reported blur. The result is beyond this test's range. Check you are 40 cm away and wearing your usual near glasses.`,
  too_few_runs: 'Too few rounds gave a usable answer, so no threshold was calculated.',
  not_repeatable: `Your rounds differed too much from each other (spread above ${NEAR_BLUR.maxLog10Sd} log units) even after extra rounds, so the threshold is shown but not scored.`,
}

const AccommodativeLagTest = () => {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('instructions') // instructions, screen-size, between, running, results
  const [screenScale, setScreenScale] = useState(getScreenScale)
  const [plan, setPlan] = useState([])
  const [runIdx, setRunIdx] = useState(0)
  const [runs, setRuns] = useState([])
  const [row, setRow] = useState('')
  const [blurArcmin, setBlurArcmin] = useState(0)
  const [summary, setSummary] = useState(null)
  const [saveState, setSaveState] = useState(null)
  const [restarts, setRestarts] = useState(0)
  const rafRef = useRef(null)
  const runStartRef = useRef(null)
  const respondedRef = useRef(false)

  const monitorActive = phase === 'between' || phase === 'running'
  const distance = useDistanceMonitor({
    active: monitorActive,
    targetMm: NEAR_BLUR.distanceMm,
    tolerance: NEAR_BLUR.distanceTolerance,
  })

  const pxPerMm = screenScale.pxPerMm
  const letterPx = letterHeightPx(NEAR_BLUR.distanceMm, pxPerMm)
  const blurPx = blurArcmin * pxPerArcmin(NEAR_BLUR.distanceMm, pxPerMm)
  const current = plan[runIdx]

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const submit = useCallback(async (allRuns, s) => {
    try {
      await visionTestAPI.submit({
        test_type: 'accommodative_lag',
        score: s.index,
        test_details: {
          method: 'ascending_limits_gaussian_blur_near_letters',
          method_version: 2,
          native_unit: 'blur detection threshold, Gaussian sigma in arcmin',
          blur_threshold_arcmin: s.thresholdArcmin,
          log10_blur_threshold: s.log10Threshold,
          within_session_log10_sd: s.log10Sd,
          repeatable: s.repeatable,
          status: s.status,
          scored_runs: s.scoredRuns,
          measured_runs: s.measuredRuns,
          censored_runs: s.censoredRuns,
          catch_runs: s.catchRuns,
          catch_false_alarms: s.falseAlarms,
          extra_runs_used: s.extraRunsUsed,
          distance_restarts: restarts,
          protocol: {
            viewing_distance_mm: NEAR_BLUR.distanceMm,
            distance_tolerance: NEAR_BLUR.distanceTolerance,
            letter_logmar: NEAR_BLUR.letterLogMAR,
            letter_height_mm: Number((letterPx / pxPerMm).toFixed(2)),
            letters_per_row: NEAR_BLUR.letters,
            blur_method: 'css_gaussian_filter_sigma',
            hold_s: [NEAR_BLUR.holdMinS, NEAR_BLUR.holdMaxS],
            ramp_arcmin_per_s: NEAR_BLUR.rampArcminPerS,
            cap_arcmin: NEAR_BLUR.capArcmin,
            max_log10_sd: NEAR_BLUR.maxLog10Sd,
          },
          screen_px_per_mm: Number(pxPerMm.toFixed(3)),
          screen_scale_source: screenScale.source,
          distance_baseline_source: distance.baselineSource,
          runs: allRuns,
          scoring_note:
            `Native measure: median Gaussian-blur sigma (arcmin) at which blur was reported, over ${NEAR_BLUR.scoredRuns}+ ascending runs (catch run with no blur checks false alarms). Display index (not clinically validated, not used for alerts): log-linear, 100 at ≤ ${NEAR_BLUR.indexLowArcmin} arcmin, 0 at ≥ ${NEAR_BLUR.indexHighArcmin} arcmin; only computed for reliable, repeatable sessions. Reaction time adds roughly 0.1–0.2 arcmin. Does not measure accommodation.`,
          timestamp: new Date().toISOString(),
        },
      })
      setSaveState('saved')
    } catch (err) {
      console.error('Failed to submit results:', err)
      setSaveState('error')
    }
  }, [letterPx, pxPerMm, restarts, screenScale.source, distance.baselineSource])

  const finishRun = useCallback((result) => {
    cancelAnimationFrame(rafRef.current)
    const nextRuns = [...runs, result]
    setRuns(nextRuns)
    setBlurArcmin(0)

    let nextPlan = plan
    if (runIdx + 1 >= plan.length) {
      const s = summarizeNearBlur(nextRuns)
      if (s.needsExtraRun) {
        nextPlan = [...plan, { kind: 'scored', holdS: NEAR_BLUR.holdMinS + Math.random() * (NEAR_BLUR.holdMaxS - NEAR_BLUR.holdMinS) }]
        setPlan(nextPlan)
      } else {
        setSummary(s)
        setPhase('results')
        submit(nextRuns, s)
        return
      }
    }
    setRunIdx(runIdx + 1)
    setPhase('between')
  }, [runs, plan, runIdx, submit])

  const startRun = () => {
    if (!current) return
    respondedRef.current = false
    setRow(randomSloanRow())
    setBlurArcmin(0)
    setPhase('running')
    runStartRef.current = performance.now()
    const tick = () => {
      const t = (performance.now() - runStartRef.current) / 1000
      if (current.kind === 'catch') {
        if (t >= current.holdS + NEAR_BLUR.catchDurationS) {
          finishRun({ kind: 'catch', falseAlarm: false, holdS: Number(current.holdS.toFixed(2)) })
          return
        }
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const sigma = blurAtTime(t, current.holdS)
      setBlurArcmin(sigma)
      if (sigma >= NEAR_BLUR.capArcmin) {
        finishRun({ kind: current.kind, thresholdArcmin: NEAR_BLUR.capArcmin, censored: true, holdS: Number(current.holdS.toFixed(2)) })
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const reportBlur = useCallback(() => {
    if (phase !== 'running' || respondedRef.current || !current) return
    respondedRef.current = true
    const t = (performance.now() - runStartRef.current) / 1000
    if (current.kind === 'catch') {
      finishRun({ kind: 'catch', falseAlarm: true, responseS: Number(t.toFixed(2)), holdS: Number(current.holdS.toFixed(2)) })
      return
    }
    const sigma = blurAtTime(t, current.holdS)
    finishRun({
      kind: current.kind,
      thresholdArcmin: Number(sigma.toFixed(3)),
      censored: false,
      earlyPress: sigma === 0,
      responseS: Number(t.toFixed(2)),
      holdS: Number(current.holdS.toFixed(2)),
    })
  }, [phase, current, finishRun])

  useEffect(() => {
    if (phase !== 'running') return undefined
    const onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        reportBlur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, reportBlur])

  // Moving out of the 40 cm window aborts the current round; it is repeated.
  useEffect(() => {
    if (phase === 'running' && distance.paused) {
      cancelAnimationFrame(rafRef.current)
      setBlurArcmin(0)
      setRestarts((n) => n + 1)
      setPhase('between')
    }
  }, [phase, distance.paused])

  const begin = () => {
    setPlan(buildRunPlan())
    setRuns([])
    setRunIdx(0)
    setSummary(null)
    setSaveState(null)
    setRestarts(0)
    setPhase('between')
  }

  const scoredDone = runs.filter((r) => r.kind !== 'practice').length
  const scoredTotal = plan.filter((r) => r.kind !== 'practice').length

  return (
    <div className="test-shell">
      {monitorActive && (
        <video ref={distance.videoRef} autoPlay playsInline muted className="fixed top-0 left-0 w-px h-px opacity-0 pointer-events-none" aria-hidden />
      )}
      <div className="max-w-3xl mx-auto">
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
          <div className="test-panel">
            <div className="text-center mb-6">
              <h1 className="page-title mb-1">Near Blur Tolerance</h1>
              <p className="text-sm text-accent-600 font-medium">How much blur it takes before near letters stop looking sharp</p>
            </div>

            <div className="bg-accent-50 border-l-4 border-accent-500 rounded-r-xl p-5 mb-6 text-sm text-accent-900 space-y-2">
              <p>
                A row of letters starts sharp and slowly blurs. You press the button the moment it first looks blurred.
                The result is your <strong>blur detection threshold</strong> in arcminutes of blur.
              </p>
              <p>
                It does not measure your eye&apos;s focusing (accommodation). For how your eyes team up up-close, try the{' '}
                <button type="button" onClick={() => navigate('/vision-tests/near_point_convergence')} className="underline font-semibold">
                  Convergence Near Point
                </button>{' '}
                test.
              </p>
            </div>

            <ul className="space-y-2 text-sm text-gray-700 mb-6 list-disc pl-5">
              <li>Sit <strong>40 cm</strong> from the screen with both eyes open and your usual reading glasses on. The camera checks distance and repeats a round if you move.</li>
              <li>
                The letters are {(letterPx / pxPerMm).toFixed(1)} mm tall ({NEAR_BLUR.letterLogMAR.toFixed(1)} logMAR at 40 cm).
                {screenScale.source === 'default' && ' Your screen size has not been measured, so sizes are approximate.'}
              </li>
              <li>
                {NEAR_BLUR.practiceRuns} practice round, then {NEAR_BLUR.scoredRuns + NEAR_BLUR.catchRuns} rounds (up to{' '}
                {NEAR_BLUR.maxExtraRuns} more if your answers vary). Some rounds may not blur at all — only press when the
                letters really look blurred.
              </li>
              <li>Press <strong>It looks blurred</strong> (or Space) as soon as the edges first soften. About 2–3 minutes.</li>
            </ul>

            <div className="flex gap-3">
              <button onClick={() => navigate('/vision-tests')} className="test-btn-outline">Back</button>
              {screenScale.source === 'default' && (
                <button onClick={() => setPhase('screen-size')} className="test-btn-outline">Measure screen</button>
              )}
              <button onClick={begin} className="test-btn">Begin</button>
            </div>
          </div>
        )}

        {phase === 'between' && current && (
          <div className="test-panel text-center space-y-4">
            <p className="text-xs text-gray-500">
              {current.kind === 'practice' ? 'Practice round' : `Round ${scoredDone + 1} of ${scoredTotal}`}
            </p>
            <h2 className="text-xl font-bold text-gray-900">Ready for the next round</h2>
            <p className="text-sm text-gray-600">
              {distance.distanceMm ? `Camera distance: about ${Math.round(distance.distanceMm / 10)} cm (aim for 40 cm).` : 'Starting the distance check…'}
            </p>
            {distance.paused && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                {distance.reason === 'no_face' ? 'Face not found — sit in front of the camera.' : distance.reason === 'too_close' ? 'Too close — move back to 40 cm.' : 'Too far — move closer to 40 cm.'}
              </p>
            )}
            <button
              type="button"
              onClick={startRun}
              disabled={distance.paused}
              className="test-btn max-w-xs mx-auto disabled:opacity-50"
            >
              Start round
            </button>
          </div>
        )}

        {phase === 'running' && (
          <div className="test-panel text-center space-y-6 py-10">
            <p className="text-xs text-gray-500">Press the moment the letters first look blurred.</p>
            <div className="flex items-center justify-center bg-white min-h-[160px]">
              <div
                className="flex select-none"
                style={{ gap: letterPx, filter: blurPx > 0 ? `blur(${blurPx}px)` : 'none' }}
              >
                {row.split('').map((l, i) => <SloanLetter key={`${row}-${i}`} letter={l} size={letterPx} color="#000" />)}
              </div>
            </div>
            <button type="button" onClick={reportBlur} className="test-btn max-w-xs mx-auto">
              It looks blurred (Space)
            </button>
          </div>
        )}

        {phase === 'results' && summary && (
          <div className="test-panel space-y-6">
            <div className="text-center">
              <h1 className="page-title mb-1">Near Blur Tolerance</h1>
              <p className="text-gray-600 text-sm">Blur detection threshold at 40 cm · home check only</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center">
              <div className="text-sm text-gray-600 mb-1">Blur detection threshold</div>
              <div className="text-5xl font-bold text-accent-700">
                {summary.thresholdArcmin != null ? summary.thresholdArcmin.toFixed(2) : `> ${NEAR_BLUR.capArcmin}`}
                <span className="text-xl font-semibold text-gray-500"> arcmin</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Median of {summary.measuredRuns} rounds · round-to-round spread {summary.log10Sd != null ? `${summary.log10Sd} log units` : '—'}
                {summary.repeatable ? ' (repeatable)' : ' (not repeatable)'}
              </p>
              {summary.index != null && (
                <p className="text-xs text-gray-500 mt-2">Index {summary.index}/100 — {DISPLAY_INDEX_LABEL.toLowerCase()}.</p>
              )}
            </div>

            {STATUS_TEXT[summary.status] && (
              <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 text-sm text-amber-900">{STATUS_TEXT[summary.status]}</div>
            )}

            <div className="text-sm text-gray-700 space-y-2">
              <h3 className="font-semibold text-gray-900">What the numbers mean</h3>
              <p>
                The threshold is the amount of Gaussian blur (its standard deviation, in arcminutes of visual angle) at which
                the letters first looked blurred to you. Lower means you noticed blur sooner.
              </p>
              <p>
                The 0–100 index is a display aid only: 100 means blur was noticed at {NEAR_BLUR.indexLowArcmin} arcmin or
                less, 0 means not until the {NEAR_BLUR.indexHighArcmin} arcmin cap, on a log scale in between. It is only
                shown when the catch round passed and your rounds agreed. It has not been validated and is not used for
                alerts.
              </p>
              <p>
                Compare results taken at the same distance, on the same screen, with the same glasses. Tiredness, lighting,
                and reaction speed all affect it.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500">
                  <tr><th className="py-1">Round</th><th className="py-1">Type</th><th className="py-1">Result</th></tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="py-1">{i + 1}</td>
                      <td className="py-1 capitalize">{r.kind === 'catch' ? 'check (no blur)' : r.kind}</td>
                      <td className="py-1">
                        {r.kind === 'catch'
                          ? (r.falseAlarm ? 'Pressed — no blur was shown' : 'Correctly not pressed')
                          : r.censored ? `Reached ${NEAR_BLUR.capArcmin} arcmin cap` : `${r.thresholdArcmin.toFixed(2)} arcmin`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {saveState === 'error' && (
              <div className="border border-red-300 bg-red-50 rounded-xl p-3 text-sm text-red-800">Results could not be saved.</div>
            )}

            <SamdDisclaimer testType="accommodative_lag" />

            <div className="flex gap-3">
              <button onClick={() => setPhase('instructions')} className="test-btn-outline">Test again</button>
              <button onClick={() => navigate('/vision-tests')} className="test-btn">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AccommodativeLagTest
