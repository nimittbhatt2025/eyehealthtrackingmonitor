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

  const submitResults = async (summary) => {
    try {
      await visionTestAPI.submit({
        test_type: 'red_reflex',
        score: summary.symmetry.symmetryScore,
        test_details: {
          method: 'phone_rear_torch_bruckner_symmetry',
          method_version: 2,
          symmetry_score: summary.symmetry.symmetryScore,
          brightness_asymmetry: summary.symmetry.brightnessAsymmetry,
          colour_asymmetry: summary.symmetry.colourAsymmetry,
          white_asymmetry: summary.symmetry.whiteAsymmetry,
          flags: summary.symmetry.flags,
          right_eye: summary.right,
          left_eye: summary.left,
          illumination: summary.illumination,
          dark_phase: summary.darkPhase,
          exposure_lock: summary.exposureLock,
          frames_used: summary.framesUsed,
          frames_captured: summary.framesCaptured,
          distance_cm: summary.distanceCm,
          reporting: 'inter_ocular_symmetry_only',
          timestamp: new Date().toISOString(),
        },
      })
    } catch (err) {
      console.error('Failed to submit results:', err)
    }
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
    const summary = {
      ...context,
      symmetry: redReflexSymmetry(right, left),
      right: round(right),
      left: round(left),
      relativeBrightness: {
        right: Math.round((right.luminance / Math.max(right.luminance, left.luminance)) * 100),
        left: Math.round((left.luminance / Math.max(right.luminance, left.luminance)) * 100),
      },
      framesUsed,
      framesCaptured: frames.length,
    }

    stopCamera()
    setResult(summary)
    setTestState('results')
    if (summary.symmetry.reflexVisible) submitResults(summary)
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
            <li><strong>5.</strong> You get a left-versus-right comparison. There is no absolute &quot;glow score&quot;.</li>
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
                  stopCamera()
                  setTestState('instructions')
                }}
                className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-full font-semibold min-h-[44px]"
              >
                Cancel
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
      `The ${f.eye} eye's glow looked white or yellow while the other looked red. Looking slightly off-centre or a reflection can cause this, so retake once. If it shows again, book an eye doctor visit promptly — especially for a child.`,
    brightness: (f) =>
      `The ${f.eye} eye's glow was noticeably dimmer. Common causes are looking off-centre or pupils of different sizes; it can also come from a big difference in glasses prescription between the eyes or cloudiness in the lens.`,
    colour: () =>
      'The two glows were noticeably different colours. This is often lighting or gaze, but a repeated difference is worth mentioning at an eye exam.',
    pale_both: () =>
      'Both glows looked pale. This is usually room light — retake in a darker room.',
  }

  const renderResults = () => {
    if (!result) return null
    const { symmetry } = result
    const score = symmetry.symmetryScore
    const concerns = symmetry.flags.filter((f) => FLAG_TEXT[f.type])
    const critical = concerns.some((f) => f.severity === 'critical')
    const tone = !symmetry.reflexVisible ? 'gray' : critical || score < 50 ? 'red' : score < 75 ? 'yellow' : 'green'
    const toneClass = {
      gray: 'bg-gray-50 border-gray-300 text-gray-800',
      red: 'bg-red-50 border-red-300 text-red-800',
      yellow: 'bg-yellow-50 border-yellow-300 text-yellow-800',
      green: 'bg-green-50 border-green-300 text-green-800',
    }[tone]

    return (
      <div className="test-shell">
        <div className="max-w-3xl mx-auto test-panel p-6 md:p-10 space-y-6">
          <div className="text-center">
            <h1 className="page-title mb-1">Eye Glow Result</h1>
            <p className="text-gray-600">Left-versus-right comparison only</p>
          </div>

          {!symmetry.reflexVisible ? (
            <div className={`border-2 rounded-2xl p-6 ${toneClass}`}>
              <h2 className="text-xl font-bold mb-2">No glow seen in either eye — not scored</h2>
              <p className="mb-2">This usually means the setup, not the eyes:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>the room was not dark enough, so the pupils were small;</li>
                <li>the light was not right beside the camera lens;</li>
                <li>the eyes were not looking straight at the light.</li>
              </ul>
              <p className="mt-2 text-sm">Nothing was saved. Try again in a darker room.</p>
            </div>
          ) : (
            <div className={`border-2 rounded-2xl p-6 text-center ${toneClass}`}>
              <h2 className="text-sm font-semibold uppercase tracking-wide mb-1">Glow symmetry</h2>
              <div className="text-6xl font-bold">
                {score}
                <span className="text-2xl">/100</span>
              </div>
              <p className="mt-2">
                {critical
                  ? 'One eye looked very different from the other'
                  : score >= 75
                    ? 'Both eyes glowed about the same'
                    : score >= 50
                      ? 'A mild difference between the eyes'
                      : 'A clear difference between the eyes'}
              </p>
            </div>
          )}

          {symmetry.reflexVisible && (
            <div className="bg-gray-50 rounded-2xl p-5">
              <h3 className="font-bold text-gray-900 mb-3">Relative glow brightness</h3>
              {['right', 'left'].map((eye) => (
                <div key={eye} className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{eye} eye</span>
                    <span>{result.relativeBrightness[eye]}% of the brighter eye</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-red-600 h-2 rounded-full" style={{ width: `${result.relativeBrightness[eye]}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {concerns.length > 0 && (
            <div className={`border-l-4 p-5 rounded-r-xl ${critical ? 'bg-red-50 border-red-600 text-red-900' : 'bg-yellow-50 border-yellow-500 text-yellow-900'}`}>
              <h3 className="font-bold mb-2">What we noticed</h3>
              <ul className="space-y-2">
                {concerns.map((f) => (
                  <li key={f.type}>• {FLAG_TEXT[f.type](f)}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-blue-50 rounded-2xl p-5 text-blue-900 text-sm space-y-1">
            <h3 className="font-bold text-base mb-1">What this can&apos;t tell you</h3>
            <p>• It only looks for differences between your eyes. An even result does not rule out a problem that affects both eyes equally.</p>
            <p>• It is not a clinical red-reflex exam with an ophthalmoscope. Babies and young children still need their routine checks.</p>
            <p>• The glow&apos;s absolute brightness depends on the phone, the light and pupil size, so it is not reported.</p>
          </div>

          <div className="text-xs text-gray-500 space-y-0.5">
            <p>Photos used: {result.framesUsed} of {result.framesCaptured}</p>
            <p>Light: {result.illumination === 'phone_torch' ? 'phone flashlight' : 'external light beside the lens'}{result.darkPhase ? `, ${RELAX_SECONDS}s dark pause` : ', no dark pause'}</p>
            <p>Exposure lock: {result.exposureLock?.locked ? 'on' : 'not supported by this browser'}</p>
            {result.distanceCm && <p>Estimated distance: {result.distanceCm} cm</p>}
          </div>

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
