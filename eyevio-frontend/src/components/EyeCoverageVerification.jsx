import { useState, useRef, useEffect } from 'react'
import EyeCoverageDetector from '../utils/eyeCoverageDetector'
import cameraManager from '../utils/cameraManager'
import { VisionTestShell } from './TestPrepLayout'

/**
 * EyeCoverageVerification Component
 * Webcam-based verification that the correct anatomical eye is covered
 */
const EyeCoverageVerification = ({ expectedEye, onVerified, onSkip, splitLayout = false, testName = '' }) => {
  const [detector, setDetector] = useState(null)
  const [status, setStatus] = useState(null)
  const [isChecking, setIsChecking] = useState(false)
  const [baselineEstablished, setBaselineEstablished] = useState(false)
  const [permissionState, setPermissionState] = useState('unknown')
  const [holdProgress, setHoldProgress] = useState(0)
  const videoRef = useRef(null)
  const checkIntervalRef = useRef(null)
  const detectorRef = useRef(null)
  const checkingRef = useRef(false)
  const correctSinceRef = useRef(null)
  const cancelledRef = useRef(false)

  const HOLD_MS = 1000

  useEffect(() => {
    cancelledRef.current = false
    const init = async () => {
      if (cameraManager && cameraManager.queryPermission) {
        try {
          const p = await cameraManager.queryPermission()
          setPermissionState(p)
        } catch (e) {
          setPermissionState('unknown')
        }
      }
      await initializeDetector()
    }
    init()

    return () => {
      cancelledRef.current = true
      cleanup()
    }
  }, [])

  const initializeDetector = async () => {
    if (!videoRef.current) return

    try {
      const stream = await cameraManager.acquire({ video: { facingMode: 'user', width: 640, height: 480 } })
      if (!stream) throw new Error('No stream returned')
      videoRef.current.srcObject = stream
      try {
        await videoRef.current.play()
      } catch (playErr) {
        console.warn('Video play() failed:', playErr)
      }

      const det = new EyeCoverageDetector(videoRef.current)
      const initialized = await det.initialize()

      if (cancelledRef.current) {
        det.stop()
        return
      }

      if (initialized) {
        detectorRef.current = det
        setDetector(det)
        setStatus({
          detected: 'unknown',
          correct: false,
          message: 'Please look at the camera with both eyes visible...',
        })
        await establishBaseline(det)
      } else {
        setStatus({
          detected: 'unknown',
          correct: false,
          message: 'Unable to initialize detector. Please ensure camera is available.',
        })
      }
    } catch (err) {
      console.warn('Camera permission or acquisition failed:', err)
      if (cameraManager && cameraManager.getLastError) {
        const last = cameraManager.getLastError()
        if (last && last.name === 'NotAllowedError') {
          setPermissionState('denied')
        }
      }

      setStatus({
        detected: 'unknown',
        correct: false,
        message: 'Unable to access webcam. Please allow camera access and use the button below to retry.',
      })
    }
  }

  const tryAcquire = async () => {
    setStatus({ detected: 'unknown', correct: false, message: 'Requesting camera permission...' })
    try {
      if (cameraManager && cameraManager.reset) cameraManager.reset()
      const stream = await cameraManager.acquire({ video: { facingMode: 'user', width: 640, height: 480 } })
      setPermissionState('granted')
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch (e) {
          console.warn('play after retry failed', e)
        }
      }
      const det = new EyeCoverageDetector(videoRef.current)
      const initialized = await det.initialize()
      if (initialized && !cancelledRef.current) {
        detectorRef.current = det
        setDetector(det)
        await establishBaseline(det)
      }
    } catch (e) {
      console.warn('Retry acquire failed', e)
      setStatus({
        detected: 'unknown',
        correct: false,
        message: 'Camera access not granted. Please check browser permissions.',
      })
      if (cameraManager && cameraManager.getLastError) {
        const last = cameraManager.getLastError()
        if (last && last.name === 'NotAllowedError') setPermissionState('denied')
      }
    }
  }

  const establishBaseline = async (det) => {
    setBaselineEstablished(false)
    setStatus({
      detected: 'unknown',
      correct: false,
      message: 'Detecting your face… keep both eyes visible and uncovered.',
    })

    const result = await det.establishBaseline()
    if (cancelledRef.current) return

    if (result.success) {
      setBaselineEstablished(true)
      setStatus({
        detected: 'neither',
        correct: false,
        message: `Face detected! Now cover your ${expectedEye === 'left' ? 'LEFT' : 'RIGHT'} eye.`,
        handsAvailable: result.handsAvailable,
      })
      startChecking(det)
    } else {
      setStatus({
        detected: 'unknown',
        correct: false,
        message: result.message,
      })
      setTimeout(() => {
        if (!cancelledRef.current) establishBaseline(det)
      }, 2000)
    }
  }

  const startChecking = (det) => {
    if (checkIntervalRef.current) clearInterval(checkIntervalRef.current)
    setIsChecking(true)
    correctSinceRef.current = null
    setHoldProgress(0)

    checkIntervalRef.current = setInterval(async () => {
      if (checkingRef.current || cancelledRef.current) return
      checkingRef.current = true
      try {
        const result = await det.verifyCoverage(expectedEye)
        if (cancelledRef.current) return

        const now = Date.now()
        if (result.correct) {
          if (!correctSinceRef.current) correctSinceRef.current = now
          const held = now - correctSinceRef.current
          const progress = Math.min(100, Math.round((held / HOLD_MS) * 100))
          setHoldProgress(progress)
          setStatus({
            ...result,
            correct: held >= HOLD_MS,
            message:
              held >= HOLD_MS
                ? result.message
                : `Hold still… confirming coverage (${Math.ceil((HOLD_MS - held) / 100) / 10}s)`,
          })
        } else {
          correctSinceRef.current = null
          setHoldProgress(0)
          setStatus(result)
        }
      } finally {
        checkingRef.current = false
      }
    }, 350)
  }

  const cleanup = () => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
      checkIntervalRef.current = null
    }
    if (detectorRef.current) {
      detectorRef.current.stop()
      detectorRef.current = null
    }
    setDetector(null)
    try {
      cameraManager.release()
    } catch (e) {
      /* ignore */
    }
  }

  const handleContinue = () => {
    cleanup()
    onVerified()
  }

  const handleSkip = () => {
    cleanup()
    onSkip()
  }

  const eyeLabel = expectedEye === 'left' ? 'LEFT' : 'RIGHT'
  const canContinue = Boolean(status?.correct)

  const renderVideoFeed = () => (
    <div className="eye-coverage-video-wrap relative bg-black rounded-xl overflow-hidden border border-gray-200 w-full h-full min-h-[200px]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover scale-x-[-1]"
      />
      <div className="absolute inset-0 pointer-events-none">
        {/* Mirrored preview: anatomical left appears on screen-left */}
        <div className="absolute left-[10%] top-[35%] bottom-[45%] w-[40%] border-2 border-blue-400 border-dashed opacity-50 flex items-center justify-center">
          <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs font-bold">YOUR LEFT</span>
        </div>
        <div className="absolute right-[10%] top-[35%] bottom-[45%] w-[40%] border-2 border-red-400 border-dashed opacity-50 flex items-center justify-center">
          <span className="bg-red-600 text-white px-2 py-0.5 rounded text-xs font-bold">YOUR RIGHT</span>
        </div>
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-yellow-400 opacity-50" />
      </div>
      {holdProgress > 0 && holdProgress < 100 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${holdProgress}%` }} />
        </div>
      )}
    </div>
  )

  const renderInstructionsList = () => (
    <ul className="space-y-2 text-sm text-blue-900">
      <li>Center your face in the camera with good lighting.</li>
      <li>This is a mirrored view — your left eye is on the left side of the screen.</li>
      <li>
        Cover your <strong>{eyeLabel}</strong> eye with your palm — do not press on the eye.
      </li>
      <li>Hold for about a second once it turns green, then continue.</li>
      <li>Having trouble? Use Skip below to continue without detection.</li>
    </ul>
  )

  const renderActionButtons = (compact = false) => (
    <div className={`flex flex-col gap-2 ${compact ? '' : 'gap-4'}`}>
      {permissionState !== 'granted' && (
        <div className="flex gap-2">
          <button type="button" onClick={tryAcquire} className="flex-1 btn-primary min-h-[44px] text-sm">
            Allow camera
          </button>
          <button type="button" onClick={handleSkip} className="flex-1 btn-secondary min-h-[44px] text-sm">
            Skip
          </button>
        </div>
      )}
      <div className="flex gap-2 vision-test-controls-actions">
        <button type="button" onClick={handleSkip} className="flex-1 btn-secondary min-h-[44px] text-sm">
          Skip
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          className={`flex-1 min-h-[44px] text-sm rounded-xl font-bold ${
            canContinue ? 'btn-primary' : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  )

  const renderStatusPanel = () => (
    <div
      className={`rounded-xl border-2 p-4 ${
        status?.correct ? 'bg-green-50 border-green-400' : 'bg-blue-50 border-blue-300'
      }`}
    >
      <p className="text-sm font-medium text-gray-800 mb-2">
        {status?.message || 'Establishing baseline…'}
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded bg-white border border-gray-200">
          Detected: <strong>{status?.detected || '…'}</strong>
        </span>
        <span className="px-2 py-1 rounded bg-blue-100 text-blue-800">
          Cover: <strong>{expectedEye}</strong>
        </span>
        {status?.method && status.method !== 'none' && (
          <span className="px-2 py-1 rounded bg-gray-100 text-gray-700">
            via {status.method}
          </span>
        )}
      </div>
    </div>
  )

  if (splitLayout) {
    return (
      <VisionTestShell
        title="Eye coverage check"
        subtitle={`Cover your ${eyeLabel} eye — testing ${expectedEye === 'left' ? 'right' : 'left'} eye`}
        stimulus={renderVideoFeed()}
        controls={(
          <>
            {renderStatusPanel()}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <h3 className="font-bold text-blue-900 text-sm mb-2">Instructions</h3>
              {renderInstructionsList()}
            </div>
            {renderActionButtons(true)}
          </>
        )}
      />
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          Eye Coverage Verification
        </h2>
        <p className="text-lg text-gray-700 mb-2">
          Please cover your <span className="font-bold text-blue-600">{eyeLabel}</span> eye with your palm
        </p>
        <p className="text-sm text-gray-500">
          Position your palm to completely block vision without pressing on the eye
        </p>
      </div>

      <div
        className={`p-5 rounded-xl border-2 ${
          status?.correct ? 'bg-green-50 border-green-500' : 'bg-blue-50 border-blue-400'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 flex-shrink-0">
            {status?.correct ? (
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <p className="text-gray-800 font-medium mb-2">
              {status?.message || 'Establishing baseline...'}
            </p>
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Detected:</span>
                <span
                  className={`font-semibold px-2 py-1 rounded ${
                    status?.detected === expectedEye
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {status?.detected || 'Checking...'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Expected:</span>
                <span className="font-semibold px-2 py-1 rounded bg-blue-100 text-blue-700">
                  {expectedEye}
                </span>
              </div>
              {status?.method && status.method !== 'none' && (
                <span className="text-xs text-gray-500">via {status.method}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {renderVideoFeed()}

      {status && (
        <div
          className={`p-6 rounded-xl border-2 ${
            status.correct ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            {status.correct ? (
              <svg className="w-8 h-8 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <div className="flex-1">
              <p className={`font-semibold text-lg ${status.correct ? 'text-green-900' : 'text-amber-900'}`}>
                {status.message}
              </p>
              <p className={`text-sm mt-1 ${status.correct ? 'text-green-700' : 'text-amber-700'}`}>
                Detected: {status.detected || 'checking...'} | Expected: {expectedEye}
              </p>
            </div>
          </div>

          {status.correct && (
            <button
              onClick={handleContinue}
              className="w-full mt-4 bg-green-600 text-white px-6 py-3 rounded-full font-bold hover:bg-green-700 transition-colors"
            >
              Continue to Test →
            </button>
          )}
        </div>
      )}

      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
        <h3 className="font-bold text-blue-900 mb-4 text-lg">Instructions for eye coverage</h3>
        {renderInstructionsList()}
      </div>

      {renderActionButtons()}

      <p className="text-center text-sm text-gray-500">
        Eye coverage verification helps ensure accurate monocular testing results
      </p>
    </div>
  )
}

export default EyeCoverageVerification
