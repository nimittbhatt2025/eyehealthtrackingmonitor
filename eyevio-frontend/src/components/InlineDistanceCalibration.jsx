import { useState, useEffect, useRef, useCallback } from 'react'
import distanceCalibration, {
  estimateDistanceCmFromPixelIpd,
} from '../utils/distanceCalibration'
import { PupilRegionTracker } from '../utils/pupilRegionDetector'
import cameraManager from '../utils/cameraManager'
import voiceRecognition from '../utils/voiceRecognition'
import { VisionTestShell } from './TestPrepLayout'

/**
 * Distance Gate Component
 * Blocks test from starting until user is at correct distance.
 * Uses MediaPipe iris landmarks (IPD) — same stack as Posture & Lighting.
 */

export default function InlineDistanceCalibration({
  testType = 'default',
  optimalDistanceMM = 500,
  toleranceMM = 100,
  onDistanceValid,
  onDistanceInvalid,
  blockUntilValid = true,
  testName = 'This Test',
  splitLayout = false,
  voiceConfirm = false,
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const detectionIntervalRef = useRef(null)
  const initializingRef = useRef(false)
  const cameraReadyRef = useRef(false)
  const modelsLoadedRef = useRef(false)
  const faceDetectedRef = useRef(false)
  const voiceStartedRef = useRef(false)
  const distanceHoldReadyRef = useRef(false)
  const confirmedRef = useRef(false)
  const initGenerationRef = useRef(0)
  const detectingRef = useRef(false)
  const pupilTrackerRef = useRef(null)
  const rollingDistanceRef = useRef([])

  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [currentDistance, setCurrentDistance] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [isValidDistance, setIsValidDistance] = useState(false)
  const [validDurationCount, setValidDurationCount] = useState(0)
  const [loadingError, setLoadingError] = useState(null)
  const [voiceConfirmListening, setVoiceConfirmListening] = useState(false)
  const [distanceHoldReady, setDistanceHoldReady] = useState(false)
  const [trackingSource, setTrackingSource] = useState(null)
  // idle | priming | ready | denied | unsupported
  const [micStatus, setMicStatus] = useState('idle')
  const [lastHeard, setLastHeard] = useState('')
  const [voiceHint, setVoiceHint] = useState('')
  const listenWatchdogRef = useRef(null)

  const optimalDistanceCM = Math.round(optimalDistanceMM / 10)
  const minDistance = optimalDistanceMM - toleranceMM
  const maxDistance = optimalDistanceMM + toleranceMM

  const pushRolling = (arr, value, max = 4) => [...arr, value].slice(-max)
  const rollingMean = (arr) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

  useEffect(() => {
    modelsLoadedRef.current = modelsLoaded
  }, [modelsLoaded])

  useEffect(() => {
    const generation = ++initGenerationRef.current

    const timeoutId = setTimeout(() => {
      if (generation !== initGenerationRef.current) return
      if (!modelsLoadedRef.current || !cameraReadyRef.current) {
        console.warn('Distance calibration still loading after 15s')
        setLoadingError('Loading is taking longer than expected. You can wait, or refresh the page.')
      }
    }, 15000)

    initCalibration(generation)

    return () => {
      initGenerationRef.current += 1
      clearTimeout(timeoutId)
      voiceRecognition.stop()
      voiceStartedRef.current = false
      stopCamera()
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current)
        detectionIntervalRef.current = null
      }
      initializingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (modelsLoaded && cameraReady) {
      setLoadingError(null)
    }
  }, [modelsLoaded, cameraReady])

  useEffect(() => {
    if (!cameraReady || !modelsLoaded || !videoRef.current || !streamRef.current) return
    const video = videoRef.current
    if (video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current
      video.autoplay = true
      video.muted = true
      video.playsInline = true
    }
    if (video.paused) {
      video.play().catch(() => {})
    }
  }, [cameraReady, modelsLoaded])

  useEffect(() => {
    let timer
    if (isValidDistance) {
      timer = setInterval(() => {
        setValidDurationCount((prev) => {
          const next = prev + 1
          if (next >= 20) {
            distanceHoldReadyRef.current = true
            setDistanceHoldReady(true)
          }
          return next
        })
      }, 100)
    } else {
      setValidDurationCount(0)
      distanceHoldReadyRef.current = false
      setDistanceHoldReady(false)
      if (onDistanceInvalid) onDistanceInvalid()
    }

    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isValidDistance, onDistanceInvalid])

  const handleDistanceConfirmed = useCallback((meta = { viaVoice: false }) => {
    if (confirmedRef.current) return
    confirmedRef.current = true
    if (listenWatchdogRef.current) {
      clearTimeout(listenWatchdogRef.current)
      listenWatchdogRef.current = null
    }
    voiceRecognition.stop()
    voiceStartedRef.current = false
    setVoiceConfirmListening(false)
    if (onDistanceValid) onDistanceValid(true, meta)
  }, [onDistanceValid])

  const startVoiceConfirmListening = useCallback(() => {
    if (!voiceConfirm || !voiceRecognition.isSupported()) return false

    if (voiceRecognition.isListening) {
      voiceStartedRef.current = true
      setVoiceConfirmListening(true)
      setMicStatus('ready')
      setVoiceHint('')
      return true
    }

    // Do not mark listening until onstart — browsers often need a real gesture.
    const started = voiceRecognition.start(
      (transcript) => {
        const heard = Array.isArray(transcript) ? transcript[0] : String(transcript || '')
        if (heard) setLastHeard(heard)

        if (!distanceHoldReadyRef.current) {
          setVoiceHint('Heard you — hold green distance, then say "ready" or "continue"')
          return
        }
        if (voiceRecognition.parseConfirmCommand(transcript)) {
          handleDistanceConfirmed({ viaVoice: true })
        } else {
          setVoiceHint(`Heard "${heard}" — say "ready" or "continue"`)
        }
      },
      (err) => {
        setVoiceConfirmListening(false)
        voiceStartedRef.current = false
        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') {
          setMicStatus('denied')
          setVoiceHint('Microphone permission blocked. Allow mic in the address bar, then tap Enable again.')
        } else if (err === 'network') {
          setVoiceHint('Voice service hiccup — tap Enable microphone again.')
          setMicStatus('idle')
        } else if (err === 'start-failed') {
          setMicStatus('idle')
          setVoiceHint('Could not start listening — tap Enable microphone.')
        }
      },
      () => {
        if (listenWatchdogRef.current) {
          clearTimeout(listenWatchdogRef.current)
          listenWatchdogRef.current = null
        }
        voiceStartedRef.current = true
        setVoiceConfirmListening(true)
        setMicStatus('ready')
        setVoiceHint('Mic is on. Step back, then say "ready" when distance is green.')
      }
    )

    if (!started) {
      voiceStartedRef.current = false
      setVoiceConfirmListening(false)
      setMicStatus('denied')
    }
    return started
  }, [voiceConfirm, handleDistanceConfirmed])

  /**
   * Must run from a click/tap. Chromium only reliably starts SpeechRecognition
   * (and shows the mic permission prompt) inside a user gesture — awaiting
   * getUserMedia first would break that chain.
   */
  const enableMicrophone = useCallback(() => {
    if (!voiceConfirm) return
    if (!voiceRecognition.isSupported()) {
      setMicStatus('unsupported')
      return
    }

    setMicStatus('priming')
    setVoiceHint('')
    setLastHeard('')

    if (listenWatchdogRef.current) {
      clearTimeout(listenWatchdogRef.current)
      listenWatchdogRef.current = null
    }

    // Synchronous start while the click gesture is still active.
    const started = startVoiceConfirmListening()
    if (!started) {
      setMicStatus('denied')
      setVoiceHint('Could not start voice recognition. Check browser mic permissions.')
      return
    }

    // Optional background priming for later sessions (do not await before start).
    voiceRecognition.primeMicrophone(true).catch(() => {})

    // If onstart never fires, roll UI back so the Enable button stays available.
    listenWatchdogRef.current = setTimeout(() => {
      if (!voiceRecognition.isListening) {
        voiceStartedRef.current = false
        setVoiceConfirmListening(false)
        setMicStatus('idle')
        setVoiceHint('Mic did not start. Tap Enable microphone and allow access when prompted.')
      }
    }, 2500)
  }, [voiceConfirm, startVoiceConfirmListening])

  useEffect(() => {
    if (!voiceConfirm) return
    if (!voiceRecognition.isSupported()) {
      setMicStatus('unsupported')
    }
  }, [voiceConfirm])

  useEffect(() => {
    return () => {
      if (listenWatchdogRef.current) clearTimeout(listenWatchdogRef.current)
      voiceRecognition.stop()
      voiceStartedRef.current = false
    }
  }, [])

  const activateCamera = () => {
    cameraReadyRef.current = true
    setCameraReady(true)
    startIpdTracking()
  }

  const initCalibration = async (generation) => {
    if (initializingRef.current) return
    initializingRef.current = true

    try {
      if (!pupilTrackerRef.current) {
        pupilTrackerRef.current = new PupilRegionTracker()
      }
      await pupilTrackerRef.current.init()
      if (generation !== initGenerationRef.current) return

      if (pupilTrackerRef.current.modelUnavailable) {
        setLoadingError('Could not load the pupil landmark model. Check your network and retry.')
        return
      }

      modelsLoadedRef.current = true
      setModelsLoaded(true)
      await startCamera(generation)
    } catch (error) {
      if (generation !== initGenerationRef.current) return
      console.error('Failed to initialize distance calibration:', error)
      setLoadingError(`Failed to load: ${error.message}`)
    } finally {
      if (generation === initGenerationRef.current) {
        initializingRef.current = false
      }
    }
  }

  const startCamera = async (generation) => {
    try {
      const stream = await cameraManager.acquire({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      if (generation != null && generation !== initGenerationRef.current) {
        try {
          cameraManager.release()
        } catch (e) {
          /* ignore */
        }
        return
      }

      if (!videoRef.current) {
        setLoadingError('Video element not ready')
        return
      }

      const video = videoRef.current
      streamRef.current = stream
      video.autoplay = true
      video.muted = true
      video.playsInline = true

      const onReady = () => {
        if (generation != null && generation !== initGenerationRef.current) return
        if (!cameraReadyRef.current) activateCamera()
      }

      video.onloadedmetadata = onReady
      video.oncanplay = onReady

      if (video.srcObject !== stream) {
        video.srcObject = stream
      }

      if (video.readyState >= 1) {
        onReady()
      } else {
        setTimeout(() => {
          if (generation != null && generation !== initGenerationRef.current) return
          if (!cameraReadyRef.current && videoRef.current) {
            videoRef.current.play().catch(() => {})
            activateCamera()
          }
        }, 800)
      }
    } catch (error) {
      if (generation != null && generation !== initGenerationRef.current) return
      console.error('Camera access denied or error:', error)
      setLoadingError(`Camera error: ${error.message}`)
    }
  }

  const stopCamera = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current)
      detectionIntervalRef.current = null
    }

    if (pupilTrackerRef.current) {
      pupilTrackerRef.current.stop()
      pupilTrackerRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    streamRef.current = null
    rollingDistanceRef.current = []

    try {
      cameraManager.release()
    } catch (error) {
      /* ignore */
    }

    cameraReadyRef.current = false
    setCameraReady(false)
    initializingRef.current = false
  }

  const drawEyeOverlay = (regions, width, height) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    if (!regions) return

    // Draw in raw video frame space; CSS scaleX(-1) on video+canvas mirrors both together.
    ctx.lineWidth = 2
    ;[regions.anatomicalLeft, regions.anatomicalRight].forEach((eye) => {
      if (!eye) return
      ctx.beginPath()
      ctx.arc(eye.x, eye.y, Math.max(6, eye.radius), 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.9)'
      ctx.stroke()
    })

    if (regions.anatomicalLeft && regions.anatomicalRight) {
      ctx.beginPath()
      ctx.moveTo(regions.anatomicalLeft.x, regions.anatomicalLeft.y)
      ctx.lineTo(regions.anatomicalRight.x, regions.anatomicalRight.y)
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)'
      ctx.stroke()
    }
  }

  const startIpdTracking = () => {
    if (detectionIntervalRef.current) return
    detectionIntervalRef.current = setInterval(() => {
      trackIpdDistance()
    }, 250)
  }

  const trackIpdDistance = async () => {
    if (!videoRef.current || !cameraReadyRef.current) return
    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) return
    if (detectingRef.current) return
    detectingRef.current = true

    try {
      if (!pupilTrackerRef.current) {
        pupilTrackerRef.current = new PupilRegionTracker()
        await pupilTrackerRef.current.init()
      }

      const video = videoRef.current
      const regions = await pupilTrackerRef.current.track(video)
      drawEyeOverlay(regions, video.videoWidth, video.videoHeight)

      if (regions?.eyeSpanPx > 0) {
        if (!faceDetectedRef.current) {
          faceDetectedRef.current = true
          setFaceDetected(true)
        }

        const cm = estimateDistanceCmFromPixelIpd(regions.eyeSpanPx, video.videoWidth)
        if (cm == null) {
          setIsValidDistance(false)
          return
        }

        const distanceMm = cm * 10
        rollingDistanceRef.current = pushRolling(rollingDistanceRef.current, distanceMm)
        const smoothedMm = rollingMean(rollingDistanceRef.current)
        setCurrentDistance(smoothedMm)
        setTrackingSource(regions.source || 'iris-landmarks')

        const fb = distanceCalibration.getDistanceFeedback(smoothedMm, testType)
        const valid = smoothedMm >= minDistance && smoothedMm <= maxDistance
        setFeedback(
          valid
            ? {
                ...fb,
                status: 'perfect',
                message: `Perfect Distance! (${Math.round(smoothedMm / 10)}cm)`,
                color: 'green',
                borderColor: 'border-green-500',
                bgColor: 'bg-green-500',
                textColor: 'text-green-500',
                action: 'hold-steady',
              }
            : fb
        )
        setIsValidDistance(valid)
      } else {
        if (faceDetectedRef.current) {
          faceDetectedRef.current = false
          setFaceDetected(false)
        }
        rollingDistanceRef.current = []
        setTrackingSource(null)
        setIsValidDistance(false)
      }
    } catch (error) {
      console.error('IPD distance tracking error:', error)
    } finally {
      detectingRef.current = false
    }
  }

  const handleRetry = () => {
    setLoadingError(null)
    setModelsLoaded(false)
    setCameraReady(false)
    setFaceDetected(false)
    faceDetectedRef.current = false
    modelsLoadedRef.current = false
    cameraReadyRef.current = false
    initializingRef.current = false
    rollingDistanceRef.current = []
    stopCamera()
    const generation = ++initGenerationRef.current
    initCalibration(generation)
  }

  const renderVideoPreview = () => (
    <div className="relative bg-gray-900 rounded-xl overflow-hidden w-full h-full min-h-[220px]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full"
        style={{ transform: 'scaleX(-1)' }}
      />

      <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
        {faceDetected ? (
          <div className="flex items-center gap-2 bg-green-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            Pupils locked
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg">
            <div className="w-2 h-2 bg-white rounded-full" />
            Looking for eyes…
          </div>
        )}
        {trackingSource && (
          <span className="text-[10px] bg-black/50 text-white/90 px-2 py-0.5 rounded">
            via {trackingSource}
          </span>
        )}
      </div>

      {blockUntilValid && !isValidDistance && faceDetected && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center text-white p-4">
            <h3 className="text-lg font-bold mb-1">Adjust your distance</h3>
            <p className="text-sm">Move {feedback?.action === 'move-back' ? 'back' : 'closer'}</p>
          </div>
        </div>
      )}
    </div>
  )

  const renderControlsPanel = () => (
    <>
      {voiceConfirm && voiceRecognition.isSupported() && (
        <div className="border-2 border-indigo-400 bg-indigo-50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-indigo-950">
            Step 1 — enable the microphone (required)
          </p>
          <p className="text-xs text-indigo-900">
            Tap the button below <strong>while you are still at the screen</strong>. Browsers only
            show the mic permission prompt after a tap. Then step back; when distance is green, say{' '}
            <strong>&quot;ready&quot;</strong> or <strong>&quot;continue&quot;</strong>.
          </p>

          {voiceConfirmListening ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-indigo-900 font-medium">
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                Mic listening
                {distanceHoldReady
                  ? ' — say "ready" or "continue" now'
                  : ' — wait for green distance, then speak'}
              </div>
              {lastHeard && (
                <p className="text-xs text-indigo-800">Last heard: &quot;{lastHeard}&quot;</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={enableMicrophone}
              className="w-full min-h-[48px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-base shadow"
            >
              {micStatus === 'priming' ? 'Starting microphone…' : 'Enable microphone'}
            </button>
          )}

          {voiceHint && (
            <p className="text-xs text-indigo-950 bg-white/70 border border-indigo-200 rounded-lg px-3 py-2">
              {voiceHint}
            </p>
          )}

          {micStatus === 'denied' && (
            <p className="text-xs text-red-700">
              Microphone blocked. Click the lock/camera icon in the address bar → allow microphone →
              tap Enable again.
            </p>
          )}
        </div>
      )}

      {voiceConfirm && !voiceRecognition.isSupported() && (
        <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-4 text-sm text-amber-900">
          Voice is not supported in this browser. Use Chrome or Edge, or tap Continue when distance is green.
        </div>
      )}

      {feedback && currentDistance ? (
        <div className={`border-2 ${feedback.borderColor} rounded-xl p-4 ${feedback.bgColor} bg-opacity-20`}>
          <div className={`text-lg font-bold ${feedback.textColor} mb-1`}>
            {feedback.message}
          </div>
          <div className="text-gray-700 text-sm">
            Current: <span className="font-bold">{Math.round(currentDistance / 10)}cm</span>
            {' · '}
            Target: <span className="font-bold">{optimalDistanceCM}cm</span>
            {' '}(±{Math.round(toleranceMM / 10)}cm)
          </div>

          {isValidDistance && (
            <div className="mt-3">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${(validDurationCount / 20) * 100}%` }}
                />
              </div>
              <p className="text-xs text-center text-gray-600 mt-1.5">
                {validDurationCount >= 20
                  ? voiceConfirm
                    ? 'Distance stable — say "ready"'
                    : 'Distance stable'
                  : `Hold steady ${Math.max(0, Math.ceil((20 - validDurationCount) / 10))}s…`}
              </p>
            </div>
          )}

          {isValidDistance && validDurationCount >= 20 && (
            <div className="mt-4 space-y-2">
              {voiceConfirm && voiceRecognition.isSupported() && !voiceConfirmListening && (
                <button
                  type="button"
                  onClick={enableMicrophone}
                  className="w-full min-h-[48px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl"
                >
                  Enable microphone to say &quot;ready&quot;
                </button>
              )}
              {voiceConfirm && voiceRecognition.isSupported() && voiceConfirmListening && (
                <div className="text-center text-base font-bold text-indigo-900 bg-white/80 border border-indigo-200 rounded-xl px-3 py-3">
                  Say <span className="underline">ready</span> or <span className="underline">continue</span>
                  {lastHeard ? (
                    <div className="text-xs font-normal text-indigo-700 mt-1">Last heard: &quot;{lastHeard}&quot;</div>
                  ) : null}
                </div>
              )}
              <button
                type="button"
                onClick={() => handleDistanceConfirmed({ viaVoice: false })}
                className={
                  voiceConfirm
                    ? 'w-full text-sm text-gray-600 underline underline-offset-2 py-2 min-h-[44px]'
                    : 'w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg min-h-[44px]'
                }
              >
                {voiceConfirm ? 'Or tap here if you are next to the screen' : 'Distance confirmed — begin test'}
              </button>
            </div>
          )}

          <div className="mt-4">
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden relative">
              <div
                className={`h-full ${feedback.bgColor} transition-all duration-300`}
                style={{
                  width: `${Math.min(100, Math.max(0, (currentDistance / (optimalDistanceMM * 2)) * 100))}%`,
                }}
              />
              <div
                className="absolute top-0 w-0.5 h-full bg-purple-600"
                style={{ left: `${(optimalDistanceMM / (optimalDistanceMM * 2)) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Too close</span>
              <span className="font-bold text-purple-600">{optimalDistanceCM}cm</span>
              <span>Too far</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-2 border-gray-200 rounded-xl p-6 bg-gray-50 text-center text-gray-600">
          <p className="font-medium mb-1">Position your face in the camera</p>
          <p className="text-sm">Keep both eyes visible — distance is measured from pupil spacing</p>
        </div>
      )}

      {splitLayout && voiceConfirm && (
        <p className="text-xs text-gray-500">
          Stand about {optimalDistanceCM}cm away. After distance is green, say &quot;ready&quot; — do not walk back to click.
        </p>
      )}
    </>
  )

  if (!modelsLoaded || !cameraReady) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-2xl p-8">
        <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '640px', height: '480px' }} />
          <canvas ref={canvasRef} style={{ width: '640px', height: '480px' }} />
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent" />
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Loading Distance Calibration…</h3>
            <p className="text-sm text-gray-600 mb-2">Starting camera and MediaPipe iris tracking</p>
            {loadingError && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 font-medium mb-2">Error Loading</p>
                <p className="text-xs text-red-600">{loadingError}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-3 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (splitLayout) {
    return (
      <VisionTestShell
        title="Distance calibration"
        subtitle={`${testName} — stand ${optimalDistanceCM}cm (${Math.round(optimalDistanceMM / 25.4)}″) from the screen`}
        stimulus={renderVideoPreview()}
        controls={renderControlsPanel()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Distance Calibration Required</h2>
        <p className="text-lg text-gray-600">
          {testName} requires you to be{' '}
          <span className="font-bold text-purple-600">{optimalDistanceCM}cm</span> from the screen
        </p>
      </div>

      {renderVideoPreview()}
      {renderControlsPanel()}
    </div>
  )
}
