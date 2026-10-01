import { useState, useEffect, useRef, useCallback } from 'react'
import MediaEyeTracker from '../utils/mediaEyeTracker'
import { summarizeBlurReportTime } from '../utils/dryEyeQuestionnaire'

/**
 * Blink and blur-report check from the webcam:
 *  1. Natural reading — blink rate and inter-blink interval (camera blink detection).
 *  2. Blur-report time — blink, then hold eyes open; seconds until the user
 *     reports blur or blinks involuntarily (camera). Median of 3 trials.
 *     Not a tear break-up time.
 */

const NATURAL_SECONDS = 30
const BREAKUP_TRIALS = 3
const BREAKUP_CAP_SECONDS = 30
const START_BLINK_GRACE_MS = 400

const READING_TEXT =
  'Tears keep the front of the eye smooth and clear. Each blink spreads a thin film across the surface, ' +
  'and between blinks that film slowly thins. When it thins unevenly, vision can blur for a moment and the ' +
  'eyes may sting or feel gritty. Screens make us blink less often, which gives the film more time to break up. ' +
  'Looking away every twenty minutes and blinking fully are simple ways to keep the surface comfortable. ' +
  'Room air matters too: heating, air conditioning, and fans all speed up evaporation. '

function median(values) {
  const v = [...values].sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : null
}

const TearStabilityCheck = ({ onComplete, onSkip }) => {
  const videoRef = useRef(null)
  const trackerRef = useRef(null)
  const blinkTimesRef = useRef([])
  const phaseRef = useRef('intro')
  const holdStartRef = useRef(null)
  const trialsRef = useRef([])
  const naturalRef = useRef(null)

  const [phase, setPhase] = useState('intro') // intro, natural, ready, holding, done
  const [faceSeen, setFaceSeen] = useState(false)
  const [error, setError] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(NATURAL_SECONDS)
  const [trialIdx, setTrialIdx] = useState(0)
  const [lastTrial, setLastTrial] = useState(null)

  const setPhaseBoth = (p) => {
    phaseRef.current = p
    setPhase(p)
  }

  const stopTracker = useCallback(() => {
    try { trackerRef.current?.stop() } catch { /* already stopped */ }
    const stream = videoRef.current?.srcObject
    stream?.getTracks?.().forEach((t) => t.stop())
    trackerRef.current = null
  }, [])

  useEffect(() => () => stopTracker(), [stopTracker])

  const endHold = useCallback((reason) => {
    if (phaseRef.current !== 'holding' || holdStartRef.current == null) return
    const seconds = Math.min(BREAKUP_CAP_SECONDS, (performance.now() - holdStartRef.current) / 1000)
    holdStartRef.current = null
    const trial = { seconds: Math.round(seconds * 10) / 10, endedBy: reason }
    trialsRef.current = [...trialsRef.current, trial]
    setLastTrial(trial)

    if (trialsRef.current.length >= BREAKUP_TRIALS) {
      setPhaseBoth('done')
      stopTracker()
      onComplete({
        natural: naturalRef.current,
        blurReport: summarizeBlurReportTime(trialsRef.current),
      })
    } else {
      setTrialIdx(trialsRef.current.length)
      setPhaseBoth('ready')
    }
  }, [onComplete, stopTracker])

  const start = async () => {
    setError(null)
    try {
      const tracker = new MediaEyeTracker(videoRef.current, null)
      tracker.onFaceDetected = (seen) => setFaceSeen(seen)
      tracker.onBlink = ({ timestamp }) => {
        if (phaseRef.current === 'natural') blinkTimesRef.current.push(timestamp)
        if (
          phaseRef.current === 'holding' &&
          holdStartRef.current != null &&
          performance.now() - holdStartRef.current > START_BLINK_GRACE_MS
        ) {
          endHold('blink')
        }
      }
      trackerRef.current = tracker
      await tracker.start()
      blinkTimesRef.current = []
      setPhaseBoth('natural')
    } catch (err) {
      console.error('Tear check camera failed:', err)
      setError('Could not start the camera. You can skip this step.')
    }
  }

  useEffect(() => {
    if (phase !== 'natural') return undefined
    const startedAt = Date.now()
    setSecondsLeft(NATURAL_SECONDS)
    const id = setInterval(() => {
      const left = NATURAL_SECONDS - Math.floor((Date.now() - startedAt) / 1000)
      setSecondsLeft(Math.max(0, left))
      if (left <= 0) {
        clearInterval(id)
        const times = blinkTimesRef.current
        const intervals = times.slice(1).map((t, i) => (t - times[i]) / 1000)
        naturalRef.current = {
          durationSec: NATURAL_SECONDS,
          blinks: times.length,
          blinkRatePerMin: Math.round((times.length / NATURAL_SECONDS) * 60 * 10) / 10,
          medianInterBlinkSec: intervals.length ? Math.round(median(intervals) * 10) / 10 : null,
          maxInterBlinkSec: intervals.length ? Math.round(Math.max(...intervals) * 10) / 10 : null,
        }
        setPhaseBoth('ready')
      }
    }, 250)
    return () => clearInterval(id)
  }, [phase])

  const beginHold = useCallback(() => {
    holdStartRef.current = performance.now()
    setPhaseBoth('holding')
  }, [])

  useEffect(() => {
    if (phase !== 'ready' && phase !== 'holding') return undefined
    const onKey = (e) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      if (phaseRef.current === 'ready') beginHold()
      else if (phaseRef.current === 'holding') endHold('blur')
    }
    window.addEventListener('keydown', onKey)
    let cap = null
    if (phase === 'holding') cap = setTimeout(() => endHold('cap'), BREAKUP_CAP_SECONDS * 1000)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (cap) clearTimeout(cap)
    }
  }, [phase, beginHold, endHold])

  return (
    <div className="test-panel">
      <h2 className="section-title text-xl mb-1">Blinking and blur-report check</h2>
      <p className="text-gray-500 text-sm mb-4">About 90 seconds. Camera counts blinks; nothing is recorded.</p>

      <div className={phase === 'intro' || phase === 'done' ? 'hidden' : 'flex items-center gap-3 mb-4'}>
        <video ref={videoRef} autoPlay playsInline muted className="w-28 rounded-lg scale-x-[-1]" />
        <span className={`text-xs ${faceSeen ? 'text-green-700' : 'text-amber-700'}`}>
          {faceSeen ? 'Eyes tracked' : 'Looking for your face…'}
        </span>
      </div>

      {phase === 'intro' && (
        <>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 mb-6">
            <li><strong>Read normally for {NATURAL_SECONDS} seconds</strong> while the camera counts your natural blinks.</li>
            <li>Then, {BREAKUP_TRIALS} times: <strong>blink twice, press Space, and keep your eyes open</strong> on the text.
              Press Space again the moment the text <strong>first blurs</strong> or your eyes sting. If you blink first, the camera stops the timer.</li>
          </ol>
          <p className="text-xs text-gray-500 mb-6">
            The hold time records when <em>you</em> notice blur. It is not a clinical tear break-up time, and no
            normal or abnormal cut-off is applied to it.
          </p>
          {error && <p className="text-sm text-red-700 mb-4">{error}</p>}
          <div className="flex gap-4">
            <button type="button" onClick={onSkip} className="test-btn-outline">Skip this step</button>
            <button type="button" onClick={start} className="test-btn">Start</button>
          </div>
        </>
      )}

      {phase === 'natural' && (
        <>
          <p className="text-xs text-gray-500 mb-2">Just read normally — {secondsLeft}s left</p>
          <p className="text-lg leading-relaxed text-gray-800 bg-gray-50 rounded-xl p-5">{READING_TEXT}{READING_TEXT}</p>
        </>
      )}

      {(phase === 'ready' || phase === 'holding') && (
        <>
          <p className="text-sm font-semibold text-gray-800 mb-2">
            Hold {trialIdx + 1} of {BREAKUP_TRIALS}:{' '}
            {phase === 'ready' ? 'blink twice, then press Space (or Start) and keep your eyes open.' : 'eyes open… press Space when the text first blurs.'}
          </p>
          {lastTrial && phase === 'ready' && (
            <p className="text-xs text-gray-500 mb-2">
              Last hold: {lastTrial.seconds}s ({lastTrial.endedBy === 'blur' ? 'you reported blur' : lastTrial.endedBy === 'blink' ? 'you blinked' : 'time limit'})
            </p>
          )}
          <p className={`text-base leading-relaxed text-gray-800 rounded-xl p-5 mb-4 ${phase === 'holding' ? 'bg-accent-50' : 'bg-gray-50'}`}>
            {READING_TEXT}
          </p>
          <button
            type="button"
            onClick={phase === 'ready' ? beginHold : () => endHold('blur')}
            className="test-btn"
          >
            {phase === 'ready' ? 'Start (Space)' : 'It blurred (Space)'}
          </button>
        </>
      )}

      {phase === 'done' && <p className="text-sm text-gray-700">Blinking and blur-report check complete.</p>}
    </div>
  )
}

export default TearStabilityCheck
