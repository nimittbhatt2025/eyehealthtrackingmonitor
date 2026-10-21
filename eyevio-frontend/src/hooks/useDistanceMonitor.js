import { useEffect, useRef, useState } from 'react'
import cameraManager from '../utils/cameraManager'
import { PupilRegionTracker } from '../utils/pupilRegionDetector'
import { AVG_IPD_MM, estimateDistanceCmFromPixelIpd } from '../utils/distanceCalibration'

const BASELINE_SAMPLES = 8
const BASELINE_TIMEOUT_MS = 3000
const BASELINE_MIN_SAMPLES = 3
const FACE_LOST_PAUSE_MS = 4000
const DISTANCE_WINDOW = 5

function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : null
}

/**
 * Continuous viewing-distance monitor.
 *
 * Absolute distance is taken once from pupil separation while both eyes are
 * uncovered, then tracked through face-oval width, which still works when a
 * palm covers one eye. Reports `paused` when distance drifts beyond
 * `tolerance` (fraction of target) for `outMs`. A lost face pauses only after
 * `lostMs` plus a grace period, and brief losses are ignored: covering an eye
 * with a palm makes face tracking drop out for seconds at a time, and pausing
 * on every dropout traps the user mid-test. The baseline is never guessed
 * from the target distance — a baseline taken while the user is still close
 * to the screen tapping would make every later reading wrong.
 * Pass `ipdMm` for people whose eye spacing differs from the adult average (children).
 */
export default function useDistanceMonitor({ active, targetMm, tolerance = 0.1, outMs = 800, backMs = 500, lostMs = 2500, ipdMm = AVG_IPD_MM }) {
  const videoRef = useRef(null)
  const [state, setState] = useState({ distanceMm: null, paused: false, reason: null, ready: false, baselineSource: null })

  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    const tracker = new PupilRegionTracker()
    const baseline = { ipdMm: [], faceWidth: [], startedAt: performance.now(), k: null, source: null }
    const timing = { outSince: null, inSince: null, lastFaceAt: performance.now(), paused: false, reason: null }
    const recentDistances = []

    const run = async () => {
      try {
        const stream = await cameraManager.acquire({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } })
        if (cancelled) { cameraManager.release(); return }
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {})
        }
        await tracker.init()
      } catch (err) {
        console.warn('Distance monitor unavailable:', err)
        return
      }

      while (!cancelled) {
        const video = videoRef.current
        const regions = video ? await tracker.track(video) : null
        const now = performance.now()

        if (regions?.faceWidthPx) {
          timing.lastFaceAt = now
          if (baseline.k == null) {
            baseline.faceWidth.push(regions.faceWidthPx)
            if (regions.source === 'iris-landmarks') {
              const { anatomicalLeft: l, anatomicalRight: r } = regions
              const cm = estimateDistanceCmFromPixelIpd(Math.hypot(l.x - r.x, l.y - r.y), video.videoWidth)
              if (cm) baseline.ipdMm.push(cm * 10)
            }
            const enough = baseline.ipdMm.length >= BASELINE_SAMPLES
            const partial =
              now - baseline.startedAt > BASELINE_TIMEOUT_MS && baseline.ipdMm.length >= BASELINE_MIN_SAMPLES
            if (enough || partial) {
              const dist = median(baseline.ipdMm) * (ipdMm / AVG_IPD_MM)
              baseline.k = dist * median(baseline.faceWidth)
              baseline.source = 'pupil_separation'
            }
          }
        }

        if (baseline.k != null) {
          let distanceMm = regions?.faceWidthPx ? baseline.k / regions.faceWidthPx : null
          if (distanceMm != null) {
            recentDistances.push(distanceMm)
            if (recentDistances.length > DISTANCE_WINDOW) recentDistances.shift()
            distanceMm = median(recentDistances)
          }
          const faceLost = now - timing.lastFaceAt > lostMs
          const drift = distanceMm != null ? (distanceMm - targetMm) / targetMm : null
          const outside = faceLost || (drift != null && Math.abs(drift) > tolerance)

          if (outside) {
            timing.inSince = null
            timing.outSince ??= now
            if (!timing.paused && now - timing.outSince >= (faceLost ? FACE_LOST_PAUSE_MS : outMs)) timing.paused = true
          } else if (distanceMm != null) {
            timing.outSince = null
            timing.inSince ??= now
            if (timing.paused && now - timing.inSince >= backMs) timing.paused = false
          }
          timing.reason = faceLost ? 'no_face' : drift == null ? timing.reason : drift > tolerance ? 'too_far' : drift < -tolerance ? 'too_close' : null

          if (!cancelled) {
            setState({
              distanceMm: distanceMm != null ? Math.round(distanceMm) : null,
              paused: timing.paused,
              reason: timing.paused ? timing.reason : null,
              ready: true,
              baselineSource: baseline.source,
            })
          }
        }
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    run()

    return () => {
      cancelled = true
      tracker.stop()
      try { cameraManager.release() } catch { /* already released */ }
      setState({ distanceMm: null, paused: false, reason: null, ready: false, baselineSource: null })
    }
  }, [active, targetMm, tolerance, outMs, backMs, lostMs, ipdMm])

  return { videoRef, ...state }
}
