import { useCallback, useEffect, useRef, useState } from 'react'
import voiceRecognition from '../utils/voiceRecognition'

/**
 * Hands-free spoken commands for the screens between distance setup and the
 * test itself (glasses check, eye coverage, switch eyes), where the user is
 * already standing at test distance and must not walk back to tap.
 *
 * Uses the shared voiceRecognition singleton. Browsers only reliably start
 * speech recognition from a tap, so callers should also render the returned
 * `startListening` on a button; auto-start is attempted and usually works once
 * mic permission was granted earlier in the flow.
 *
 * `onTranscript(transcripts)` is called with the recognised alternatives; the
 * latest render's closure is always used.
 */
export default function useVoiceCommands({ active, onTranscript }) {
  const [listening, setListening] = useState(false)
  const [lastHeard, setLastHeard] = useState('')
  const [hint, setHint] = useState('')
  const handlerRef = useRef(onTranscript)
  useEffect(() => {
    handlerRef.current = onTranscript
  }, [onTranscript])

  const supported = voiceRecognition.isSupported()

  const startListening = useCallback(() => {
    if (!voiceRecognition.isSupported()) return false
    setHint('')
    const started = voiceRecognition.start(
      (transcripts) => {
        const heard = Array.isArray(transcripts) ? transcripts[0] : String(transcripts || '')
        if (heard) setLastHeard(heard)
        handlerRef.current?.(transcripts)
      },
      (err) => {
        setListening(false)
        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') {
          setHint('Microphone blocked — allow mic access in the address bar, then tap Enable microphone.')
        } else if (err === 'network') {
          setHint('Voice service hiccup — tap Enable microphone to try again.')
        } else if (err === 'start-failed') {
          setHint('Could not start listening — tap Enable microphone.')
        }
      },
      () => setListening(true)
    )
    if (!started) setHint('Could not start voice recognition. Check browser mic permissions.')
    return started
  }, [])

  const stopListening = useCallback(() => {
    voiceRecognition.stop()
    setListening(false)
  }, [])

  useEffect(() => {
    if (!active) return undefined
    const t = window.setTimeout(() => startListening(), 250)
    return () => {
      window.clearTimeout(t)
      voiceRecognition.stop()
      setListening(false)
    }
  }, [active, startListening])

  return { supported, listening, lastHeard, hint, startListening, stopListening }
}
