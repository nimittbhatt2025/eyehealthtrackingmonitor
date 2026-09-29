import { useEffect, useRef, useState } from 'react'
import cameraManager from '../utils/cameraManager'
import { PupilRegionTracker } from '../utils/pupilRegionDetector'
import { AVG_IPD_MM, estimateDistanceCmFromPixelIpd } from '../utils/distanceCalibration'

const BASELINE_SAMPLES = 15
const BASELINE_TIMEOUT_MS = 3000

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
 * `tolerance` (fraction of target) for `outMs`, or the face is lost.
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
            const timedOut = now - baseline.startedAt > BASELINE_TIMEOUT_MS && baseline.faceWidth.length >= 5
            if (enough || timedOut) {
              const dist = enough ? median(baseline.ipdMm) * (ipdMm / AVG_IPD_MM) : targetMm
              baseline.k = dist * median(baseline.faceWidth)
              baseline.source = enough ? 'pupil_separation' : 'assumed_target'
            }
          }
        }

        if (baseline.k != null) {
          const distanceMm = regions?.faceWidthPx ? baseline.k / regions.faceWidthPx : null
          const faceLost = now - timing.lastFaceAt > lostMs
          const drift = distanceMm != null ? (distanceMm - targetMm) / targetMm : null
          const outside = faceLost || (drift != null && Math.abs(drift) > tolerance)

          if (outside) {
            timing.inSince = null
            timing.outSince ??= now
            if (!timing.paused && now - timing.outSince >= (faceLost ? 0 : outMs)) timing.paused = true
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
