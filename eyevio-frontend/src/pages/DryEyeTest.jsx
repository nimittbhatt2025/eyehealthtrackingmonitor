import { useState, useEffect, useCallback, useRef } from 'react'
import cameraManager from '../utils/cameraManager.js'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import {
  OSDI_LICENCE_NOTE,
  OSDI_SECTIONS,
  FREQUENCY_OPTIONS,
  NOT_APPLICABLE,
  calculateOsdi,
  emptyOsdiAnswers,
  osdiComplete,
} from '../utils/dryEyeQuestionnaire'
import StableLightingPreview from '../utils/stableLightingPreview'
import PhotoLightingBanner from '../components/PhotoLightingBanner'
import SamdDisclaimer from '../components/SamdDisclaimer'
import ExperimentalModelNotice from '../components/ExperimentalModelNotice'
import TearStabilityCheck from '../components/TearStabilityCheck'
import { lockCameraColour } from '../utils/cameraControls'
import OnDevicePrivacyToggle from '../components/OnDevicePrivacyToggle'
import { analyzeCapturedFrame, describeAnalysisLocation } from '../ml/eyePhotoAnalysis'
import { prepareImageUpload } from '../utils/imageUpload'
import { warmOnDevice } from '../ml/onDeviceInference'

/**
 * Dry Eye Check
 *
 * OSDI-12 questionnaire → blinking while reading + blur-report time →
 * optional photo (experimental white-balanced redness index). Each measure is
 * reported in its own units; there is no combined index.
 * Home check only — not a clinical diagnosis.
 */

// Ask the browser to freeze auto white balance / exposure once they have settled,
// so the photo's colour doesn't drift between frames. Not supported everywhere.
const COLOUR_LOCK_SETTLE_MS = 1500

const CROP_SOURCE_LABELS = {
  mediapipe_face_landmarker: 'MediaPipe eye landmarks',
  haar_eye: 'Haar eye detector (fallback)',
  haar_eye_macro: 'Close-up Haar crop',
  binocular_split: 'Binocular split (fallback)',
  production_smart_crop: 'Smart periocular crop (fallback)',
  external_eye: 'External eye crop',
}

function formatCropSource(source) {
  if (!source) return 'unknown'
  return CROP_SOURCE_LABELS[source] || source.replace(/_/g, ' ')
}

const DryEyeTest = () => {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const lightingCanvasRef = useRef(null)
  const lightingPreviewRef = useRef(null)
  const streamRef = useRef(null)

  const [testState, setTestState] = useState('instructions')
  const [cameraReady, setCameraReady] = useState(false)
  const [error, setError] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [results, setResults] = useState(null)
  const [symptomResults, setSymptomResults] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [liveLighting, setLiveLighting] = useState(null)
  const [lightingError, setLightingError] = useState(null)
  const [answers, setAnswers] = useState(emptyOsdiAnswers)
  const [tearResult, setTearResult] = useState(null)
  const [analysisWhere, setAnalysisWhere] = useState(null)
  const colourLockRef = useRef({ locked: false, reason: 'not_attempted' })

  const allQuestionsAnswered = osdiComplete(answers)

  const initializeCamera = useCallback(async () => {
    try {
      setError(null)
      const stream = await cameraManager.acquire({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      streamRef.current = stream
      colourLockRef.current = { locked: false, reason: 'pending' }
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setCameraReady(true)
          setTimeout(async () => {
            if (streamRef.current === stream) colourLockRef.current = await lockCameraColour(stream)
          }, COLOUR_LOCK_SETTLE_MS)
        }
      }
    } catch (err) {
      console.error('Camera error:', err)
      setError('Camera access is required. Please allow camera access and try again.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      try {
        cameraManager.release()
      } catch {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      streamRef.current = null
    }
    setCameraReady(false)
  }, [])

  useEffect(() => {
    if (testState === 'capture') {
      initializeCamera()
      warmOnDevice('redness')
    }
    return () => {
      if (testState !== 'capture') stopCamera()
    }
  }, [testState, initializeCamera, stopCamera])

  useEffect(() => {
    if (testState !== 'capture' || !cameraReady) {
      setLiveLighting(null)
      return undefined
    }

    if (!lightingPreviewRef.current) {
      lightingPreviewRef.current = new StableLightingPreview()
    }
    lightingPreviewRef.current.reset()

    let cancelled = false

    const tick = async () => {
      if (cancelled || !videoRef.current) return
      try {
        const lighting = await lightingPreviewRef.current.sample(
          videoRef.current,
          lightingCanvasRef.current
        )
        if (!cancelled) setLiveLighting(lighting)
      } catch (err) {
        console.warn('Dry eye lighting preview failed:', err)
      }
    }

    tick()
    const intervalId = setInterval(tick, 300)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [testState, cameraReady])

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !cameraReady) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setPreviewUrl(dataUrl)
    return dataUrl
  }, [cameraReady])

  const saveResults = useCallback(async ({ symptoms, tear, cvData = null, where = null, colourLock = null }) => {
    const finalResults = {
      ...(cvData || {}),
      photo_taken: !!cvData,
      osdi_score: symptoms.osdiScore,
      symptom_severity: symptoms.severity,
      symptom_severity_label: symptoms.severityLabel,
      symptom_responses: symptoms.responses,
      osdi_subscales: symptoms.subscales,
      tear: tear ?? null,
    }
    setResults(finalResults)
    setSubmitting(true)
    try {
      await visionTestAPI.submit({
        test_type: 'dry_eye',
        score: null,
        left_eye_score: null,
        right_eye_score: null,
        test_details: {
          method: cvData ? 'osdi12_blur_report_wb_photo' : 'osdi12_blur_report_no_photo',
          method_version: 3,
          reporting: 'separate_native_measures_no_combined_index',
          osdi_score: symptoms.osdiScore,
          osdi_items: 12,
          osdi_subscales: symptoms.subscales,
          blur_report_time: tear?.blurReport ?? null,
          blink_interval: tear?.natural ?? null,
          symptom_severity: symptoms.severity,
          symptom_severity_label: symptoms.severityLabel,
          symptom_responses: symptoms.responses,
          photo_taken: !!cvData,
          ...(cvData
            ? {
                experimental_image_indices: {
                  redness: cvData.metrics?.avg_sclera_redness ?? null,
                  reflection_smoothness: cvData.metrics?.avg_tear_film_quality ?? null,
                  surface_texture: cvData.metrics?.avg_surface_irregularity ?? null,
                  note: 'Experimental image indices; not validated against graded reference photos.',
                },
                camera_colour_lock: colourLock,
                white_balance: cvData.white_balance,
                findings: cvData.findings,
                metrics: cvData.metrics,
                crop_source: cvData.crop_source,
                scoring_path: cvData.scoring_path,
                analysis_location: where?.mode ?? null,
                analysis_fallback_reason: where?.mode === 'server' ? where.reason : null,
                on_device: cvData.on_device ?? null,
                experimental_models: cvData.experimental_models ?? null,
                left_eye: cvData.left_eye,
                right_eye: cvData.right_eye,
                lighting: cvData.lighting,
                disclaimer: cvData.disclaimer,
              }
            : {}),
          scoring_note:
            'Each measure is reported in its own units; no combined index is computed. Blur-report time is a self-reported hold time, not a tear break-up time, and no cut-offs are applied. Image indices are experimental.',
        },
        notes: cvData ? 'Dry eye check (OSDI-12 + blur-report time + photo)' : 'Dry eye check (OSDI-12 + blur-report time, no photo)',
      })
      setTestState('results')
    } finally {
      setSubmitting(false)
    }
  }, [])

  const skipPhoto = useCallback(async () => {
    if (!symptomResults) return
    stopCamera()
    setError(null)
    setAnalysisWhere(null)
    setPreviewUrl(null)
    try {
      await saveResults({ symptoms: symptomResults, tear: tearResult })
    } catch (err) {
      console.error('Save failed:', err)
      setError('Results could not be saved. Check your connection and try again.')
      setTestState('capture')
    }
  }, [symptomResults, tearResult, saveResults, stopCamera])

  const analyzePhoto = useCallback(async (symptoms, tear) => {
    setTestState('analyzing')
    setError(null)
    setLightingError(null)
    const colourLock = colourLockRef.current
    stopCamera()

    try {
      const preview = lightingPreviewRef.current || new StableLightingPreview()
      const where = await analyzeCapturedFrame('redness', canvasRef.current, preview)
      setAnalysisWhere(where)
      let response
      if (where.mode === 'on_device') {
        response = await visionTestAPI.analyzeDryEye({ on_device: where.payload, lighting: preview.lastUi })
      } else {
        const upload = await prepareImageUpload(canvasRef.current, where.landmarks)
        response = await visionTestAPI.analyzeDryEye({ image: upload.blob, client_crop: upload.meta, capture_mode: 'camera' })
      }
      await saveResults({ symptoms, tear, cvData: response.data, where, colourLock })
    } catch (err) {
      console.error('Analysis failed:', err)
      const poorLighting = err.response?.data?.error === 'poor_lighting'
      const lighting = err.response?.data?.lighting

      if (poorLighting && lighting) {
        setLightingError(lighting)
        setError(lighting.message || 'Lighting is not suitable. Adjust lighting and try again.')
      } else if (err.code === 'no_face' || err.code === 'eye_too_small') {
        setError(err.message)
      } else {
        const msg = err.response?.data?.message || err.response?.data?.error || 'Analysis failed. Please try again in brighter, even lighting.'
        setError(msg)
      }
      setTestState('capture')
      initializeCamera()
    }
  }, [stopCamera, initializeCamera, saveResults])

  const handleQuestionnaireSubmit = () => {
    const symptoms = calculateOsdi(answers)
    setSymptomResults(symptoms)
    setTestState('tear')
  }

  const handleTearComplete = useCallback((result) => {
    setTearResult(result)
    setTestState('capture')
  }, [])

  const handleCapture = () => {
    if (!symptomResults) return
    if (capturePhoto()) analyzePhoto(symptomResults, tearResult)
  }

  const handleRetake = () => {
    setPreviewUrl(null)
    setResults(null)
    setSymptomResults(null)
    setTearResult(null)
    setError(null)
    setLightingError(null)
    setAnswers(emptyOsdiAnswers())
    setTestState('questionnaire')
  }

  return (
    <div className="test-shell">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Instructions */}
        {testState === 'instructions' && (
          <div className="test-panel">
            <div className="text-center mb-8">
              <div className="icon-tile w-16 h-16 bg-accent-50 text-accent-600 mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h1 className="page-title mb-2">Dry Eye Check</h1>
              <p className="text-sm text-accent-600 font-medium">
                OSDI questionnaire, blinking, blur-report time, and an optional photo
              </p>
            </div>

            <div className="bg-brand-gradient text-white rounded-2xl p-6 mb-6">
              <h3 className="font-bold text-lg mb-3">In short (about 5 minutes)</h3>
              <ol className="space-y-2 text-white/90 text-sm">
                <li><span className="font-bold">1.</span> Answer the 12-question OSDI about the past week.</li>
                <li><span className="font-bold">2.</span> Read for 30 s, then hold your eyes open until you notice blur (3 times).</li>
                <li><span className="font-bold">3.</span> Optional: take a photo in bright, even room light. You can skip it.</li>
              </ol>
            </div>

            <div className="bg-accent-50 border-l-4 border-accent-500 rounded-r-xl p-5 mb-6">
              <h3 className="font-semibold text-accent-900 mb-2">What we look for</h3>
              <ul className="text-sm text-accent-800 space-y-1.5">
                <li>• OSDI symptom score (0–100) with its three subscales</li>
                <li>• Blink rate and gaps between blinks while reading</li>
                <li>• Blur-report time: seconds until <em>you</em> notice blur after a blink (not a tear break-up time)</li>
                <li>• If you take a photo: an experimental redness index for the white of the eye</li>
              </ul>
              <p className="text-xs text-accent-800 mt-2">Each is shown separately. There is no combined score.</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-sm text-amber-900">
              <strong>Important:</strong> This home check cannot diagnose dry eye disease.
            </div>

            <div className="flex gap-4">
              <button type="button" onClick={() => navigate('/vision-tests')} className="test-btn-outline">
                Back
              </button>
              <button type="button" onClick={() => setTestState('questionnaire')} className="test-btn">
                Start Test
              </button>
            </div>
          </div>
        )}

        {/* Questionnaire */}
        {testState === 'questionnaire' && (
          <div className="test-panel">
            <h2 className="section-title text-xl mb-1">Ocular Surface Disease Index (OSDI)</h2>
            <p className="text-gray-500 mb-2 text-sm">
              12 questions about the <strong>past week</strong>. Choose N/A for activities you didn&apos;t do.
            </p>
            <p className="text-gray-400 mb-6 text-xs">{OSDI_LICENCE_NOTE}</p>

            {(() => {
              let number = 0
              return OSDI_SECTIONS.map((section) => (
                <div key={section.id} className="mb-8">
                  <h3 className="text-sm font-semibold text-accent-800 mb-3">{section.title}</h3>
                  <div className="space-y-4">
                    {section.questions.map((question) => {
                      number += 1
                      const options = section.allowNA
                        ? [...FREQUENCY_OPTIONS, { value: NOT_APPLICABLE, label: 'N/A' }]
                        : FREQUENCY_OPTIONS
                      return (
                        <fieldset key={question.id} className="border border-gray-100 rounded-xl p-4">
                          <legend className="text-sm font-medium text-gray-900 px-1 mb-3">
                            {number}. {question.text}
                          </legend>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {options.map((option) => (
                              <label
                                key={option.value}
                                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                                  answers[question.id] === option.value
                                    ? 'border-accent-500 bg-accent-50 text-accent-900'
                                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={question.id}
                                  value={option.value}
                                  checked={answers[question.id] === option.value}
                                  onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: option.value }))}
                                  className="text-accent-600 focus:ring-accent-500"
                                />
                                {option.label}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}

            <div className="flex gap-4">
              <button type="button" onClick={() => setTestState('instructions')} className="test-btn-outline">
                Back
              </button>
              <button
                type="button"
                onClick={handleQuestionnaireSubmit}
                disabled={!allQuestionsAnswered}
                className="test-btn"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {testState === 'tear' && (
          <TearStabilityCheck onComplete={handleTearComplete} onSkip={() => handleTearComplete(null)} />
        )}

        {/* Capture */}
        {testState === 'capture' && (
          <div className="test-panel">
            <h2 className="section-title text-xl mb-2">Optional photo</h2>
            <p className="text-gray-500 mb-2">
              Center your face, keep both eyes open, and use even lighting.
            </p>
            <p className="text-sm text-gray-600 mb-6">
              The photo only adds an experimental redness index. You can skip it and save your questionnaire and
              blink results without any photo.
            </p>

            {symptomResults && (
              <div className="bg-accent-50 border border-accent-100 rounded-xl p-4 mb-4 text-sm text-accent-800">
                OSDI {symptomResults.osdiScore}/100 — {symptomResults.severityLabel}
                {tearResult?.blurReport && <> · blur reported after {tearResult.blurReport.medianSeconds}s</>}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 mb-4 text-sm space-y-2">
                <p>{error}</p>
                {lightingError?.recommendations?.map((tip) => (
                  <p key={tip} className="text-xs">• {tip}</p>
                ))}
              </div>
            )}

            <OnDevicePrivacyToggle allowSaving={false} />
            <PhotoLightingBanner lighting={liveLighting} />
            <canvas ref={lightingCanvasRef} className="hidden" aria-hidden />

            <div className="relative rounded-2xl overflow-hidden bg-gray-900 mb-6 aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <canvas ref={canvasRef} className="hidden" />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
                  Starting camera…
                </div>
              )}
              <div className="absolute inset-0 pointer-events-none border-2 border-white/30 rounded-2xl m-4" />
            </div>

            <div className="flex gap-4">
              <button type="button" onClick={() => { stopCamera(); setTestState('tear') }} className="test-btn-outline">
                Back
              </button>
              <button type="button" onClick={skipPhoto} disabled={submitting} className="test-btn-outline">
                Skip photo and save
              </button>
              <button
                type="button"
                onClick={handleCapture}
                disabled={!cameraReady || (liveLighting && !liveLighting.acceptable)}
                className="test-btn disabled:opacity-50"
                title={liveLighting && !liveLighting.acceptable ? 'Improve lighting before capturing' : undefined}
              >
                Capture & Analyze
              </button>
            </div>
          </div>
        )}

        {/* Analyzing */}
        {testState === 'analyzing' && (
          <div className="test-panel text-center py-16">
            <div className="spinner mx-auto mb-6" />
            <h2 className="section-title text-xl mb-2">Analyzing your results</h2>
            <p className="text-gray-500">Measuring the photo…</p>
            {previewUrl && (
              <img src={previewUrl} alt="Captured" className="mt-8 mx-auto max-h-40 rounded-xl opacity-60" />
            )}
          </div>
        )}

        {/* Results */}
        {testState === 'results' && results && (
          <div className="test-panel">
            <div className="text-center mb-8">
              <h2 className="section-title text-2xl mb-2">Dry Eye Check complete</h2>
              <p className="text-gray-500">Each measure is reported separately in its own units.</p>
              {analysisWhere && (
                <p className="text-xs text-gray-400 mt-2">{describeAnalysisLocation(analysisWhere)}</p>
              )}
            </div>

            {results.lighting?.quality === 'fair' && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 mb-6 text-sm">
                <strong>Lighting note:</strong> {results.lighting.message}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div className="card text-center">
                <h4 className="font-semibold text-gray-900 mb-2">OSDI symptoms</h4>
                <div className="text-3xl font-bold text-accent-700">{results.osdi_score}</div>
                <p className="text-xs text-gray-500 mt-1">
                  /100 · {results.symptom_severity_label} (lower is better)
                </p>
                {results.osdi_subscales && (
                  <p className="text-[11px] text-gray-400 mt-2">
                    Symptoms {results.osdi_subscales.symptoms ?? '—'} · Activities {results.osdi_subscales.function ?? '—'} · Environment {results.osdi_subscales.environment ?? '—'}
                  </p>
                )}
              </div>
              <div className="card text-center">
                <h4 className="font-semibold text-gray-900 mb-2">Blinking while reading</h4>
                {results.tear?.natural ? (
                  <>
                    <div className="text-3xl font-bold text-accent-700">{results.tear.natural.blinkRatePerMin}</div>
                    <p className="text-xs text-gray-500 mt-1">blinks per minute</p>
                    {results.tear.natural.medianInterBlinkSec != null && (
                      <p className="text-[11px] text-gray-400 mt-2">
                        {results.tear.natural.medianInterBlinkSec} s median inter-blink interval
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Skipped</p>
                )}
              </div>
              <div className="card text-center">
                <h4 className="font-semibold text-gray-900 mb-2">Blur-report time</h4>
                {results.tear?.blurReport ? (
                  <>
                    <div className="text-3xl font-bold text-accent-700">{results.tear.blurReport.medianSeconds}s</div>
                    <p className="text-xs text-gray-500 mt-1">median of {results.tear.blurReport.trials.length} holds until you reported blur</p>
                    <p className="text-[11px] text-gray-400 mt-2">
                      Holds: {results.tear.blurReport.trials.map((t) => `${t.seconds}s`).join(', ')}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Skipped</p>
                )}
              </div>
              <div className="card text-center">
                <h4 className="font-semibold text-gray-900 mb-2">Redness index</h4>
                {results.photo_taken ? (
                  <>
                    <div className="text-3xl font-bold text-accent-700">{results.metrics?.avg_sclera_redness ?? '—'}</div>
                    <p className="text-xs text-gray-500 mt-1">Experimental image index, not a redness grade</p>
                    {results.crop_source && (
                      <p className="text-[11px] text-gray-400 mt-2">Crop: {formatCropSource(results.crop_source)}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">No photo taken</p>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-6 text-center">
              Each measure is shown on its own. EyeVio does not combine them into a single dry-eye score, and the
              blur-report time has no normal or abnormal cut-off.
            </p>

            {results.photo_taken && (
              <>
                <ExperimentalModelNotice notice={results.experimental_models} className="mb-6" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <EyeResultCard title="Left eye" data={results.left_eye} />
                  <EyeResultCard title="Right eye" data={results.right_eye} />
                </div>
              </>
            )}

            {results.symptom_responses?.length > 0 && (
              <div className="card bg-gray-50 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Your symptom responses</h3>
                <ul className="space-y-2">
                  {results.symptom_responses.map((r) => (
                    <li key={r.id} className="flex justify-between gap-4 text-sm text-gray-700">
                      <span>{r.question}</span>
                      <span className="font-medium text-gray-900 shrink-0">{r.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {results.photo_taken && results.findings?.length > 0 && (
              <div className="card bg-gray-50 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">What we noticed (photo)</h3>
                <ul className="space-y-2">
                  {results.findings.map((f, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-accent-600">•</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-gray-500 mb-4">
              Blur-report time is how long until <em>you</em> noticed blur. It is not a fluorescein or keratograph
              tear break-up time and is not interpreted against clinical cut-offs. The redness index is an
              experimental pixel-colour measurement corrected for room-light colour; it has not been validated against
              graded reference photos.
            </p>

            <SamdDisclaimer testType="dry_eye" className="mb-8" />

            <div className="flex gap-4">
              <button type="button" onClick={handleRetake} className="test-btn-outline" disabled={submitting}>
                Retake
              </button>
              <button type="button" onClick={() => navigate('/vision-tests')} className="test-btn">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function EyeResultCard({ title, data }) {
  if (!data) return null
  return (
    <div className="card">
      <h4 className="font-semibold text-gray-900 mb-3">{title}</h4>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-500">Redness index</dt>
          <dd className="font-medium">{data.sclera_redness ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Reflection smoothness index</dt>
          <dd className="font-medium">{data.tear_film_quality ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Surface texture index</dt>
          <dd className="font-medium">{data.surface_irregularity ?? '—'}</dd>
        </div>
      </dl>
      <p className="text-[11px] text-gray-400 mt-2">Experimental image indices (0–100), not clinical measurements.</p>
    </div>
  )
}

export default DryEyeTest
