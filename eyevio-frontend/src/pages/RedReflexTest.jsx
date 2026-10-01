import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import cameraManager from '../utils/cameraManager.js'
import { visionTestAPI } from '../services/api'
import SamdDisclaimer from '../components/SamdDisclaimer'
import {
  summarizePupilReflex,
  medianPupilReflex,
  redReflexSymmetry,
  estimatePhoneCameraDistanceCm,
  eyeGlowOutcome,
  needsAnotherGlowCapture,
  EYE_GLOW_CAPTURES,
  RED_REFLEX_LIMITS,
} from '../utils/visionTestScoring'
import { PupilRegionTracker, sampleRegionPixels } from '../utils/pupilRegionDetector'
import { lockCameraColour, torchSupported, setTorch, cameraFacing } from '../utils/cameraControls'

/**
 * Eye Glow (Brückner-style red reflex symmetry)
 *
 * A laptop webcam has no light source beside the lens, so it cannot see a real
 * red reflex. This test runs only on a phone's rear camera with its torch (or a
 * second light held against the lens) in a dark room at about 1 m, and reports
 * only how the two eyes' reflexes differ from each other.
 *
 * An asymmetry is reported only when it repeats across captures. There is no
 * "normal" outcome and no symmetry score, and results never feed alerts,
 * trends, or the clinician report.
 */

// Centre square handed to the face model — at 1 m the face is too small in the full frame.
const CROP_FRACTION = 0.5
const DISTANCE_RANGE_CM = { min: 70, max: 130 }
// Dark-room pupils are roughly half the iris diameter; stay inside the pupil edge.
const PUPIL_FRACTION = 0.4
const MIN_PUPIL_RADIUS_PX = 2.5
const RELAX_SECONDS = 3
const TORCH_ON_DELAY_MS = 120
const CAPTURE_FRAMES = 10
const CAPTURE_INTERVAL_MS = 70
const MIN_VALID_FRAMES = 4
const FRAMING_INTERVAL_MS = 250

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const cropRect = (w, h) => {
  const side = Math.round(Math.min(w, h) * CROP_FRACTION)
  return { x: Math.round((w - side) / 2), y: Math.round((h - side) / 2), side }
}

const drawCrop = (video, canvas) => {
  const { x, y, side } = cropRect(video.videoWidth, video.videoHeight)
  canvas.width = side
  canvas.height = side
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, x, y, side, side, 0, 0, side, side)
  return canvas
}

const pupilCircle = (eye) => ({ x: eye.x, y: eye.y, radius: eye.irisRadius * PUPIL_FRACTION })

const RedReflexTest = () => {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const framingCanvasRef = useRef(null)
  const streamRef = useRef(null)
  const trackerRef = useRef(null)
  const runIdRef = useRef(0)
  const lastFramingRef = useRef(null)

  // instructions, camera, relax, capturing, analyzing, results, unsupported
  const [testState, setTestState] = useState('instructions')
  const [cameraReady, setCameraReady] = useState(false)
  const [portrait, setPortrait] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [externalLight, setExternalLight] = useState(false)
  const [framing, setFraming] = useState({ faceFound: false, distanceCm: null, pupilRadiusPx: null })
  const [countdown, setCountdown] = useState(0)
  const [captureProgress, setCaptureProgress] = useState(0)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [captureCount, setCaptureCount] = useState(0)
  const capturesRef = useRef([])
  const failedAttemptsRef = useRef(0)

  const stopCamera = useCallback(() => {
    runIdRef.current += 1
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (trackerRef.current) {
      trackerRef.current.stop()
      trackerRef.current = null
    }
    setCameraReady(false)
    setTorchOn(false)
  }, [])

  const initializeCamera = useCallback(async () => {
    setError(null)
    try {
      cameraManager.reset()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false,
      })
      if (cameraFacing(stream) !== 'environment') {
        stream.getTracks().forEach((t) => t.stop())
        setTestState('unsupported')
        return
      }
      streamRef.current = stream

      const hasTorch = torchSupported(stream)
      setTorchAvailable(hasTorch)
      if (hasTorch) setTorchOn(await setTorch(stream, true))

      if (!trackerRef.current) trackerRef.current = new PupilRegionTracker()
      trackerRef.current.init()

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.onloadedmetadata = () => {
          video.play()
          setPortrait(video.videoHeight > video.videoWidth)
          setCameraReady(true)
        }
      }
    } catch (err) {
      console.error('Camera initialization failed:', err)
      setError('Could not open the rear camera. Allow camera access and try again.')
    }
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  // Live framing: distance and pupil size from the centre crop
  useEffect(() => {
    if (testState !== 'camera' || !cameraReady) return undefined
    let cancelled = false
    let timeoutId = null

    const loop = async () => {
      if (cancelled) return
      const video = videoRef.current
      const canvas = framingCanvasRef.current
      if (video?.videoWidth && canvas && trackerRef.current) {
        try {
          const regions = await trackerRef.current.track(drawCrop(video, canvas))
          const next = regions && regions.source === 'iris-landmarks'
            ? {
                faceFound: true,
                distanceCm: estimatePhoneCameraDistanceCm(regions.eyeSpanPx, video.videoWidth, video.videoHeight),
                pupilRadiusPx: Math.min(regions.anatomicalLeft.irisRadius, regions.anatomicalRight.irisRadius) * PUPIL_FRACTION,
              }
            : { faceFound: false, distanceCm: null, pupilRadiusPx: null }
          lastFramingRef.current = next
          if (!cancelled) setFraming(next)
        } catch (err) {
          console.warn('Framing check failed:', err)
        }
      }
      if (!cancelled) timeoutId = setTimeout(loop, FRAMING_INTERVAL_MS)
    }
    loop()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [testState, cameraReady])

  const distanceStatus = !framing.distanceCm
    ? 'unknown'
    : framing.distanceCm < DISTANCE_RANGE_CM.min
      ? 'too-close'
      : framing.distanceCm > DISTANCE_RANGE_CM.max
        ? 'too-far'
        : 'ok'
  const pupilsResolvable = (framing.pupilRadiusPx ?? 0) >= MIN_PUPIL_RADIUS_PX
  const lightReady = torchOn || externalLight
  const canCapture = cameraReady && framing.faceFound && distanceStatus === 'ok' && pupilsResolvable && lightReady

  const submitResults = async (session) => {
    try {
      await visionTestAPI.submit({
        test_type: 'red_reflex',
        score: null,
        test_details: {
          method: 'phone_rear_torch_bruckner_repeated_captures',
          method_version: 3,
          reporting: 'repeated_inter_ocular_asymmetry_only',
          outcome: session.outcome,
          required_captures: EYE_GLOW_CAPTURES.required,
          usable_captures: session.usableCaptures,
          total_captures: session.totalCaptures,
          failed_attempts: session.failedAttempts,
          repeated_flags: session.repeatedFlags,
          unrepeated_flags: session.unrepeatedFlags,
          captures: session.captures.map((c) => ({
            reflex_visible: c.symmetry.reflexVisible,
            brightness_asymmetry: c.symmetry.brightnessAsymmetry,
            colour_asymmetry: c.symmetry.colourAsymmetry,
            white_asymmetry: c.symmetry.whiteAsymmetry,
            flags: c.symmetry.flags,
            right_eye: c.right,
            left_eye: c.left,
            illumination: c.illumination,
            dark_phase: c.darkPhase,
            exposure_lock: c.exposureLock,
            frames_used: c.framesUsed,
            frames_captured: c.framesCaptured,
            distance_cm: c.distanceCm,
          })),
          excluded_from: ['alerts', 'trends', 'clinician_report'],
          scoring_note:
            'No symmetry score. An asymmetry is reported only when the same flag (same eye for one-sided flags) repeats in at least 2 captures. None of the outcomes means normal; problems affecting both eyes equally cannot be detected.',
          timestamp: new Date().toISOString(),
        },
      })
    } catch (err) {
      console.error('Failed to submit results:', err)
    }
  }

  const finishSession = (captures) => {
    const session = {
      ...eyeGlowOutcome(captures.map((c) => c.symmetry)),
      captures,
      failedAttempts: failedAttemptsRef.current,
    }
    stopCamera()
    setResult(session)
    setTestState('results')
    if (session.usableCaptures >= EYE_GLOW_CAPTURES.required) submitResults(session)
  }

  const analyzeFrames = async (frames, context) => {
    const tracker = trackerRef.current
    const perFrame = []
    for (const canvas of frames) {
      tracker.reset()
      const regions = await tracker.track(canvas, { timeoutMs: 1500 })
      if (!regions || regions.source !== 'iris-landmarks') continue
      const right = pupilCircle(regions.anatomicalRight)
      const left = pupilCircle(regions.anatomicalLeft)
      if (Math.min(right.radius, left.radius) < MIN_PUPIL_RADIUS_PX) continue
      const image = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height)
      perFrame.push({
        right: summarizePupilReflex(sampleRegionPixels(image, right)),
        left: summarizePupilReflex(sampleRegionPixels(image, left)),
      })
    }

    const right = medianPupilReflex(perFrame.map((f) => f.right))
    const left = medianPupilReflex(perFrame.map((f) => f.left))
    const framesUsed = Math.min(right?.frames ?? 0, left?.frames ?? 0)

    if (framesUsed < MIN_VALID_FRAMES) {
      failedAttemptsRef.current += 1
      if (failedAttemptsRef.current >= EYE_GLOW_CAPTURES.maxFailedAttempts) {
        finishSession(capturesRef.current)
        return
      }
      setError(`Both pupils were found in only ${framesUsed} of ${frames.length} photos. Hold the phone steadier, keep the face in the square and try again.`)
      if (torchAvailable) setTorchOn(await setTorch(streamRef.current, true))
      setTestState('camera')
      return
    }

    const round = (s) => ({
      luminance: Math.round(s.luminance),
      red_chroma: Number(s.redChroma.toFixed(3)),
      white_fraction: Number(s.whiteFraction.toFixed(3)),
    })
    const capture = {
      ...context,
      symmetry: redReflexSymmetry(right, left),
      right: round(right),
      left: round(left),
      framesUsed,
      framesCaptured: frames.length,
    }

    const captures = [...capturesRef.current, capture]
    capturesRef.current = captures
    setCaptureCount(captures.length)
    if (needsAnotherGlowCapture(captures.map((c) => c.symmetry))) {
      if (torchAvailable) setTorchOn(await setTorch(streamRef.current, true))
      setTestState('camera')
      return
    }
    finishSession(captures)
  }

  const runCapture = async () => {
    const runId = ++runIdRef.current
    const stale = () => runIdRef.current !== runId
    const stream = streamRef.current
    const video = videoRef.current
    if (!stream || !video) return
    setError(null)

    const distanceCm = lastFramingRef.current?.distanceCm ? Math.round(lastFramingRef.current.distanceCm) : null
    const exposureLock = await lockCameraColour(stream)
    // The dark pause lets pupils widen; only possible when we control the torch.
    const darkPhase = torchOn ? await setTorch(stream, false) : false

    setTestState('relax')
    for (let s = RELAX_SECONDS; s > 0; s -= 1) {
      setCountdown(s)
      await wait(1000)
      if (stale()) return
    }
    if (darkPhase) {
      await setTorch(stream, true)
      await wait(TORCH_ON_DELAY_MS)
      if (stale()) return
    }

    setTestState('capturing')
    const frames = []
    for (let i = 0; i < CAPTURE_FRAMES; i += 1) {
      frames.push(drawCrop(video, document.createElement('canvas')))
      setCaptureProgress(((i + 1) / CAPTURE_FRAMES) * 100)
      await wait(CAPTURE_INTERVAL_MS)
      if (stale()) return
    }

    setTestState('analyzing')
    await analyzeFrames(frames, {
      illumination: torchOn ? 'phone_torch' : 'external_light',
      darkPhase,
      exposureLock,
      distanceCm,
    })
  }

  const startTest = () => {
    setResult(null)
    capturesRef.current = []
    failedAttemptsRef.current = 0
    setCaptureCount(0)
    setExternalLight(false)
    setTestState('camera')
    initializeCamera()
  }

  const renderInstructions = () => (
    <div className="test-shell">
      <div className="max-w-3xl mx-auto">
        <button type="button" onClick={() => navigate('/vision-tests')} className="mb-6 flex items-center text-red-600 hover:text-red-700 font-medium">
          ← Back to Tests
        </button>

        <div className="test-panel p-6 md:p-10 space-y-6">
          <div className="text-center">
            <h1 className="page-title mb-2">Eye Glow Test</h1>
            <p className="text-lg text-gray-600">Compares the red glow in your left and right eye</p>
          </div>

          <div className="bg-red-50 border-l-4 border-red-600 p-5 rounded-r-xl text-red-900">
            <h2 className="font-bold mb-1">What this checks</h2>
            <p>
              When light shines straight into the eye, the back of the eye glows red — the &quot;red-eye&quot; in flash photos.
              Eye doctors compare this glow between the two eyes (the Brückner test). This version only looks for a
              <strong> difference between your eyes</strong>, such as one glow being dimmer, a different colour, or white.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-900">
            <h2 className="font-bold mb-2">You will need</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>A phone</strong> — this test uses the phone&apos;s back camera and flashlight. It will not run on a laptop webcam, because a webcam has no light next to the lens and cannot see a real glow.</li>
              <li><strong>A helper</strong> to hold the phone about 1 metre (3 feet) from your face.</li>
              <li><strong>A dark room</strong> so your pupils are wide.</li>
            </ul>
          </div>

          <ol className="space-y-3 text-gray-800">
            <li><strong>1.</strong> Turn the room lights off and take off your glasses.</li>
            <li><strong>2.</strong> Your helper holds the phone at your eye level, about 1 m away, back camera facing you, and puts your face in the square on screen.</li>
            <li><strong>3.</strong> Look straight at the phone&apos;s light with both eyes open.</li>
            <li><strong>4.</strong> The light turns off for {RELAX_SECONDS} seconds so your pupils can widen, then flashes back on while the phone takes a burst of photos.</li>
            <li><strong>5.</strong> This is repeated at least {EYE_GLOW_CAPTURES.required} times (up to {EYE_GLOW_CAPTURES.max}). A difference is only reported if it shows up again.</li>
            <li><strong>6.</strong> You get a left-versus-right comparison. There is no glow score and no &quot;normal&quot; result.</li>
          </ol>

          <p className="text-sm text-gray-600">
            <strong>iPhone:</strong> Safari cannot switch the flashlight on for a web page. Hold a second phone&apos;s flashlight right beside the camera lens instead — you will be asked to confirm this.
          </p>

          <div className="text-center">
            <button type="button" onClick={startTest} className="btn-primary px-8 py-4 text-lg min-h-[44px]">
              Open back camera
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  const renderUnsupported = () => (
    <div className="test-shell">
      <div className="max-w-2xl mx-auto test-panel p-6 md:p-10 space-y-4">
        <h1 className="page-title">Open this test on a phone</h1>
        <p className="text-gray-700">
          We could not find a back-facing camera. A red-reflex check needs light shining along the camera&apos;s line of
          sight, which a laptop or front-facing camera cannot provide — so a result from this device would be meaningless,
          and we don&apos;t record one.
        </p>
        <p className="text-gray-700">Open this page on a phone:</p>
        <p className="font-mono text-sm bg-gray-100 rounded p-3 break-all">{window.location.href}</p>
        <div className="flex gap-3">
          <button type="button" onClick={() => setTestState('instructions')} className="btn-secondary min-h-[44px] flex-1">Back</button>
          <button type="button" onClick={() => navigate('/vision-tests')} className="btn-primary min-h-[44px] flex-1">All tests</button>
        </div>
      </div>
    </div>
  )

  const framingMessage = () => {
    if (!cameraReady) return 'Starting the back camera…'
    if (!framing.faceFound) return 'Put the face inside the square. If the room is very dark, check the light is on.'
    if (distanceStatus === 'too-close') return 'Move the phone back a little — aim for about 1 m.'
    if (distanceStatus === 'too-far') return 'Move the phone a little closer — aim for about 1 m.'
    if (!pupilsResolvable) return 'The pupils are too small in the picture. Move slightly closer or use a phone with a sharper camera.'
    if (!lightReady) return 'Confirm the light is beside the lens to continue.'
    return 'Good. Ask them to look straight at the light, then press Start.'
  }

  const renderCameraSession = () => (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="relative rounded-2xl overflow-hidden bg-gray-900">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto block" />
          <canvas ref={framingCanvasRef} className="hidden" />
          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aspect-square border-2 rounded-lg pointer-events-none ${
              canCapture ? 'border-green-400' : 'border-white/60'
            }`}
            style={portrait ? { width: `${CROP_FRACTION * 100}%` } : { height: `${CROP_FRACTION * 100}%` }}
          />
          {testState === 'relax' && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-center p-4">
              <div className="text-6xl font-bold mb-2">{countdown}</div>
              <p>{torchOn ? 'Light off — keep looking at the phone. Hold still.' : 'Keep looking at the light. Hold still.'}</p>
            </div>
          )}
          {testState === 'capturing' && (
            <div className="absolute bottom-0 inset-x-0 bg-black/60 p-3 text-center">
              Taking photos… {Math.round(captureProgress)}%
            </div>
          )}
          {testState === 'analyzing' && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">Comparing both eyes…</div>
          )}
        </div>

        {testState === 'camera' && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className={`rounded-lg p-2 ${framing.faceFound ? 'bg-green-700' : 'bg-gray-700'}`}>
                {framing.faceFound ? 'Eyes found' : 'Looking for eyes'}
              </div>
              <div className={`rounded-lg p-2 ${distanceStatus === 'ok' ? 'bg-green-700' : 'bg-gray-700'}`}>
                {framing.distanceCm ? `≈ ${Math.round(framing.distanceCm)} cm` : 'Distance —'}
              </div>
              <div className={`rounded-lg p-2 ${lightReady ? 'bg-green-700' : 'bg-gray-700'}`}>
                {torchOn ? 'Flashlight on' : externalLight ? 'External light' : 'No light yet'}
              </div>
            </div>

            {captureCount > 0 && (
              <div className="bg-gray-800 rounded-xl p-3 text-center text-sm">
                Capture {captureCount} done. Take capture {captureCount + 1} (up to {EYE_GLOW_CAPTURES.max}) so the
                result can be checked for consistency. Keep the same setup.
              </div>
            )}
            <p className="text-center text-gray-200">{framingMessage()}</p>
            <p className="text-center text-xs text-gray-500">Distance is estimated assuming a typical phone camera; ±15 cm is fine.</p>

            {cameraReady && !torchOn && (
              <label className="flex items-start gap-3 bg-gray-800 rounded-xl p-4 cursor-pointer">
                <input type="checkbox" className="mt-1 w-5 h-5" checked={externalLight} onChange={(e) => setExternalLight(e.target.checked)} />
                <span className="text-sm">
                  The flashlight couldn&apos;t be switched on from this browser. I&apos;m holding another light (e.g. a second phone&apos;s flashlight) right beside the camera lens, pointing at the eyes.
                </span>
              </label>
            )}

            {error && <div className="bg-red-900 border border-red-700 rounded-xl p-4 text-red-100">{error}</div>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  if (capturesRef.current.length > 0) {
                    finishSession(capturesRef.current)
                    return
                  }
                  stopCamera()
                  setTestState('instructions')
                }}
                className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-full font-semibold min-h-[44px]"
              >
                {captureCount > 0 ? 'Stop here' : 'Cancel'}
              </button>
              {!cameraReady && error ? (
                <button type="button" onClick={initializeCamera} className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-full font-semibold min-h-[44px]">
                  Retry camera
                </button>
              ) : (
                <button
                  type="button"
                  onClick={runCapture}
                  disabled={!canCapture}
                  className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-full font-semibold min-h-[44px] disabled:opacity-50"
                >
                  Start
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )

  const FLAG_TEXT = {
    white_reflex: (f) =>
      `In ${f.captures} captures the ${f.eye} eye's glow looked white or yellow while the other looked red. Looking slightly off-centre or a reflection can cause this. This app cannot tell what causes it; eye-health organisations advise that a white pupil glow seen repeatedly in photos, especially in a child, be checked by an eye doctor.`,
    brightness: (f) =>
      `In ${f.captures} captures the ${f.eye} eye's glow was noticeably dimmer. Looking off-centre or pupils of different sizes can cause this; so can a big difference in glasses prescription between the eyes or cloudiness in the lens. Mention it at an eye exam.`,
    colour: (f) =>
      `In ${f.captures} captures the two glows were noticeably different colours. Lighting or gaze can cause this. Mention it at an eye exam.`,
  }

  const OUTCOME = {
    asymmetry_observed: {
      title: 'Asymmetry observed',
      body: 'The same left-right difference appeared in repeated captures.',
      tone: 'bg-yellow-50 border-yellow-300 text-yellow-900',
    },
    no_repeated_asymmetry: {
      title: 'No repeated asymmetry measured',
      body: 'No left-right difference repeated across captures. This is not a normal result and does not rule out an eye problem: this check cannot see problems that affect both eyes equally, and it is not a clinical red-reflex exam.',
      tone: 'bg-gray-50 border-gray-300 text-gray-800',
    },
    no_usable_reflex: {
      title: 'No usable reflex',
      body: 'No glow could be measured. This usually means the setup, not the eyes: the room was not dark enough, the light was not right beside the lens, or the eyes were not looking at the light.',
      tone: 'bg-gray-50 border-gray-300 text-gray-800',
    },
    capture_unsuccessful: {
      title: 'Capture unsuccessful',
      body: `Fewer than ${EYE_GLOW_CAPTURES.required} usable captures were taken, so nothing can be reported. Try again with the phone held steady about 1 m away in a dark room.`,
      tone: 'bg-gray-50 border-gray-300 text-gray-800',
    },
  }

  const renderResults = () => {
    if (!result) return null
    const view = OUTCOME[result.outcome]
    const saved = result.usableCaptures >= EYE_GLOW_CAPTURES.required
    const pct = (v) => `${Math.round(v * 100)}%`

    return (
      <div className="test-shell">
        <div className="max-w-3xl mx-auto test-panel p-6 md:p-10 space-y-6">
          <div className="text-center">
            <h1 className="page-title mb-1">Eye Glow Result</h1>
            <p className="text-gray-600">Left-versus-right comparison only · {result.usableCaptures} usable of {result.totalCaptures} captures</p>
          </div>

          <div className={`border-2 rounded-2xl p-6 ${view.tone}`}>
            <h2 className="text-xl font-bold mb-2">{view.title}</h2>
            <p>{view.body}</p>
            {result.outcome === 'no_repeated_asymmetry' && result.unrepeatedFlags && (
              <p className="mt-2 text-sm">One capture showed a difference that did not repeat. It is not reported as an asymmetry.</p>
            )}
            {!saved && <p className="mt-2 text-sm">Nothing was saved.</p>}
          </div>

          {result.outcome === 'asymmetry_observed' && (
            <div className="border-l-4 p-5 rounded-r-xl bg-yellow-50 border-yellow-500 text-yellow-900">
              <h3 className="font-bold mb-2">What repeated</h3>
              <ul className="space-y-2">
                {result.repeatedFlags.filter((f) => FLAG_TEXT[f.type]).map((f) => (
                  <li key={`${f.type}-${f.eye}`}>• {FLAG_TEXT[f.type](f)}</li>
                ))}
              </ul>
            </div>
          )}

          {result.captures.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="py-1 pr-2">Capture</th>
                    <th className="py-1 pr-2">Brightness diff. (flag {pct(RED_REFLEX_LIMITS.brightnessAsymmetry)})</th>
                    <th className="py-1 pr-2">Red-colour diff. (flag {RED_REFLEX_LIMITS.colourAsymmetry.toFixed(2)})</th>
                    <th className="py-1">White-glow diff. (flag {pct(RED_REFLEX_LIMITS.whiteAsymmetry)})</th>
                  </tr>
                </thead>
                <tbody>
                  {result.captures.map((c, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="py-1 pr-2">{i + 1}</td>
                      {c.symmetry.reflexVisible ? (
                        <>
                          <td className="py-1 pr-2">{pct(c.symmetry.brightnessAsymmetry)}</td>
                          <td className="py-1 pr-2">{c.symmetry.colourAsymmetry.toFixed(3)}</td>
                          <td className="py-1">{pct(c.symmetry.whiteAsymmetry)}</td>
                        </>
                      ) : (
                        <td className="py-1 text-gray-500" colSpan={3}>No usable reflex</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-blue-50 rounded-2xl p-5 text-blue-900 text-sm space-y-1">
            <h3 className="font-bold text-base mb-1">What this can&apos;t tell you</h3>
            <p>• It only looks for differences between your eyes. It cannot detect a problem that affects both eyes equally, so none of these outcomes means your eyes are normal.</p>
            <p>• It is not a clinical red-reflex exam with an ophthalmoscope. Babies and young children still need their routine checks.</p>
            <p>• The glow&apos;s absolute brightness depends on the phone, the light and pupil size, so it is not reported.</p>
            <p>• Eye Glow results are not used for alerts, trends, or the clinician report.</p>
          </div>

          {result.captures[0] && (
            <div className="text-xs text-gray-500 space-y-0.5">
              <p>Light: {result.captures[0].illumination === 'phone_torch' ? 'phone flashlight' : 'external light beside the lens'}{result.captures[0].darkPhase ? `, ${RELAX_SECONDS}s dark pause` : ', no dark pause'}</p>
              <p>Exposure lock: {result.captures[0].exposureLock?.locked ? 'on' : 'not supported by this browser'}</p>
              {result.failedAttempts > 0 && <p>Attempts where both pupils could not be found: {result.failedAttempts}</p>}
            </div>
          )}

          <SamdDisclaimer testType="red_reflex" />

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={startTest} className="flex-1 btn-secondary min-h-[44px]">Retake</button>
            <button type="button" onClick={() => navigate('/vision-tests')} className="flex-1 btn-primary min-h-[44px]">Done</button>
          </div>
        </div>
      </div>
    )
  }

  const inCamera = ['camera', 'relax', 'capturing', 'analyzing'].includes(testState)

  return (
    <div className="relative">
      {testState === 'instructions' && renderInstructions()}
      {testState === 'unsupported' && renderUnsupported()}
      {inCamera && renderCameraSession()}
      {testState === 'results' && renderResults()}
    </div>
  )
}

export default RedReflexTest
