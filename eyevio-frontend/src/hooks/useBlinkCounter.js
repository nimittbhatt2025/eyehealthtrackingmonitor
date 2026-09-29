import { useEffect, useRef, useState } from 'react'
import MediaEyeTracker from '../utils/mediaEyeTracker'

/**
 * Counts blinks with FaceMesh eye-aspect-ratio while `active`.
 * Render the returned `videoRef` on a hidden <video>; the tracker opens its own camera stream.
 */
export default function useBlinkCounter({ active }) {
  const videoRef = useRef(null)
  const blinkTimesRef = useRef([])
  const lastFaceAtRef = useRef(0)
  const [faceSeen, setFaceSeen] = useState(false)
  const [status, setStatus] = useState('idle') // idle, starting, running, error

  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    let tracker = null
    const video = videoRef.current
    setStatus('starting')
    const start = async () => {
      try {
        tracker = new MediaEyeTracker(video, null)
        tracker.onFaceDetected = (seen) => {
          if (cancelled) return
          if (seen) lastFaceAtRef.current = Date.now()
          setFaceSeen(seen)
        }
        tracker.onBlink = ({ timestamp }) => {
          if (!cancelled) blinkTimesRef.current.push(timestamp ?? Date.now())
        }
        await tracker.start()
        if (cancelled) tracker.stop()
        else setStatus('running')
      } catch (err) {
        console.warn('Blink counter unavailable:', err)
        if (!cancelled) setStatus('error')
      }
    }
    start()
    return () => {
      cancelled = true
      try {
        tracker?.stop()
      } catch {
        /* already stopped */
      }
      const stream = video?.srcObject
      stream?.getTracks?.().forEach((t) => t.stop())
      setStatus('idle')
    }
  }, [active])

  return { videoRef, blinkTimesRef, lastFaceAtRef, faceSeen, status }
}
