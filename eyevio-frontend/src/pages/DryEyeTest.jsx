import { useState, useEffect, useCallback, useRef } from 'react'
import cameraManager from '../utils/cameraManager.js'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import {
  OSDI_SECTIONS,
  FREQUENCY_OPTIONS,
  NOT_APPLICABLE,
  calculateOsdi,
  emptyOsdiAnswers,
  osdiComplete,
  combineDryEyeScores,
} from '../utils/dryEyeQuestionnaire'
import StableLightingPreview from '../utils/stableLightingPreview'
import PhotoLightingBanner from '../components/PhotoLightingBanner'
import SamdDisclaimer from '../components/SamdDisclaimer'
import PathologyTriagePanel from '../components/PathologyTriagePanel'
import TearStabilityCheck from '../components/TearStabilityCheck'
import { lockCameraColour } from '../utils/cameraControls'

/**
 * Dry Eye Check
 *
 * OSDI-12 questionnaire → tear stability (blink interval + break-up proxy) →
 * photo (white-balance-normalised redness) → combined result.
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

  const analyzePhoto = useCallback(async (dataUrl, symptoms, tear) => {
    setTestState('analyzing')
    setError(null)
    setLightingError(null)
    const colourLock = colourLockRef.current
    stopCamera()

    try {
      const response = await visionTestAPI.analyzeDryEye({ image: dataUrl, capture_mode: 'camera' })
      const cvData = response.data
      const tearScore = tear?.breakup?.score ?? null
      const blended = combineDryEyeScores(cvData.score, symptoms.symptomHealthScore, tearScore)

      const cvRiskLabel = cvData.risk_level === 'similar' ? 'low'
        : cvData.risk_level === 'some_variation' ? 'moderate' : 'elevated'

      const finalResults = {
        ...cvData,
        cv_score: cvData.score,
        cv_risk_level: cvRiskLabel,
        symptom_score: symptoms.symptomHealthScore,
        osdi_score: symptoms.osdiScore,
        score: blended.combinedScore,
        risk_level: blended.riskLevel,
        risk_message: blended.riskMessage,
        symptom_severity: symptoms.severity,
        symptom_severity_label: symptoms.severityLabel,
        symptom_responses: symptoms.responses,
        osdi_subscales: symptoms.subscales,
        tear: tear ?? null,
      }

      setResults(finalResults)

      setSubmitting(true)
      await visionTestAPI.submit({
        test_type: 'dry_eye',
        score: finalResults.score,
        left_eye_score: cvData.left_eye?.health_score,
        right_eye_score: cvData.right_eye?.health_score,
        test_details: {
          method: 'osdi12_tear_proxy_wb_photo',
          method_version: 2,
          risk_level: finalResults.risk_level,
          risk_message: finalResults.risk_message,
          cv_score: cvData.score,
          symptom_score: symptoms.symptomHealthScore,
          osdi_score: symptoms.osdiScore,
          osdi_items: 12,
          osdi_subscales: symptoms.subscales,
          tear_breakup_proxy: tear?.breakup ?? null,
          blink_interval: tear?.natural ?? null,
          tear_score: tearScore,
          camera_colour_lock: colourLock,
          white_balance: cvData.white_balance,
          symptom_severity: symptoms.severity,
          symptom_severity_label: symptoms.severityLabel,
          symptom_responses: symptoms.responses,
          findings: cvData.findings,
          metrics: cvData.metrics,
          crop_source: cvData.crop_source,
          scoring_path: cvData.scoring_path,
          pathology_triage: cvData.pathology_triage,
          left_eye: cvData.left_eye,
          right_eye: cvData.right_eye,
          lighting: cvData.lighting,
          disclaimer: cvData.disclaimer,
        },
        notes: 'Dry eye check (OSDI-12 + tear break-up proxy + photo)',
      })
      setTestState('results')
    } catch (err) {
      console.error('Analysis failed:', err)
      const poorLighting = err.response?.data?.error === 'poor_lighting'
      const lighting = err.response?.data?.lighting

      if (poorLighting && lighting) {
        setLightingError(lighting)
        setError(lighting.message || 'Lighting is not suitable. Adjust lighting and try again.')
      } else {
        const msg = err.response?.data?.message || err.response?.data?.error || 'Analysis failed. Please try again in brighter, even lighting.'
        setError(msg)
      }
      setTestState('capture')
      initializeCamera()
    } finally {
      setSubmitting(false)
    }
  }, [stopCamera, initializeCamera])

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
    const dataUrl = capturePhoto()
    if (dataUrl) analyzePhoto(dataUrl, symptomResults, tearResult)
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

  const riskBadge = (level) => {
    const map = {
      low: { label: 'Low signs', className: 'badge-success' },
      moderate: { label: 'Mild signs', className: 'badge-warning' },
      elevated: { label: 'Higher signs', className: 'badge-danger' },
    }
    return map[level] || map.moderate
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
                OSDI questionnaire, tear stability, and a photo
              </p>
            </div>

            <div className="bg-brand-gradient text-white rounded-2xl p-6 mb-6">
              <h3 className="font-bold text-lg mb-3">In short (about 5 minutes)</h3>
              <ol className="space-y-2 text-white/90 text-sm">
                <li><span className="font-bold">1.</span> Answer the 12-question OSDI about the past week.</li>
                <li><span className="font-bold">2.</span> Tear stability: read for 30 s, then hold your eyes open until the text blurs (3 times).</li>
                <li><span className="font-bold">3.</span> Take a photo in bright, even room light.</li>
              </ol>
            </div>

            <div className="bg-accent-50 border-l-4 border-accent-500 rounded-r-xl p-5 mb-6">
              <h3 className="font-semibold text-accent-900 mb-2">What we look for</h3>
              <ul className="text-sm text-accent-800 space-y-1.5">
                <li>• OSDI symptom score (0–100) with its three subscales</li>
                <li>• Blink rate and gaps between blinks while reading</li>
                <li>• Seconds until your vision first blurs after a blink (a tear break-up proxy)</li>
                <li>• Redness in the white of the eye, corrected for room light colour</li>
              </ul>
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
            <p className="text-gray-500 mb-6 text-sm">
              12 questions about the <strong>past week</strong>. Choose N/A for activities you didn&apos;t do.
            </p>

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
            <h2 className="section-title text-xl mb-2">Take your photo</h2>
            <p className="text-gray-500 mb-6">
              Center your face, keep both eyes open, and use even lighting.
            </p>

            {symptomResults && (
              <div className="bg-accent-50 border border-accent-100 rounded-xl p-4 mb-4 text-sm text-accent-800">
                OSDI {symptomResults.osdiScore}/100 — {symptomResults.severityLabel}
                {tearResult?.breakup && <> · blur after {tearResult.breakup.medianSeconds}s</>}
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
            <p className="text-gray-500">Combining symptoms with photo analysis…</p>
            {previewUrl && (
              <img src={previewUrl} alt="Captured" className="mt-8 mx-auto max-h-40 rounded-xl opacity-60" />
            )}
          </div>
        )}

        {/* Results */}
        {testState === 'results' && results && (
          <div className="test-panel">
            <div className="text-center mb-8">
              <div className={`inline-flex ${riskBadge(results.risk_level).className} text-base px-4 py-2 mb-4`}>
                {riskBadge(results.risk_level).label}
              </div>
              <h2 className="section-title text-2xl mb-2">Screening Complete</h2>
              <p className="text-gray-500">{results.risk_message}</p>
            </div>

            <div className="bg-brand-soft rounded-2xl p-6 mb-6 text-center">
              <div className="text-5xl font-bold text-gray-900">{results.score}</div>
              <div className="text-sm text-gray-500 mt-1">Combined health score (higher is better)</div>
            </div>

            {results.lighting?.quality === 'fair' && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 mb-6 text-sm">
                <strong>Lighting note:</strong> {results.lighting.message}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="card text-center">
                <h4 className="font-semibold text-gray-900 mb-2">OSDI</h4>
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
                <h4 className="font-semibold text-gray-900 mb-2">Tear stability</h4>
                {results.tear?.breakup ? (
                  <>
                    <div className="text-3xl font-bold text-accent-700">{results.tear.breakup.medianSeconds}s</div>
                    <p className="text-xs text-gray-500 mt-1">
                      until first blur ·{' '}
                      {results.tear.breakup.band === 'short' ? 'short' : results.tear.breakup.band === 'borderline' ? 'borderline' : 'typical'}
                    </p>
                    {results.tear.natural && (
                      <p className="text-[11px] text-gray-400 mt-2">
                        {results.tear.natural.blinkRatePerMin} blinks/min while reading
                        {results.tear.natural.medianInterBlinkSec != null && ` · ${results.tear.natural.medianInterBlinkSec}s between blinks`}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Skipped</p>
                )}
              </div>
              <div className="card text-center">
                <h4 className="font-semibold text-gray-900 mb-2">Photo analysis</h4>
                <div className="text-3xl font-bold text-accent-700">{results.cv_score}</div>
                <p className="text-xs text-gray-500 mt-1">
                  Redness & tear film · {results.cv_risk_level || results.risk_level} risk (photo)
                </p>
                {results.left_eye?.ml_grade != null && (
                  <p className="text-xs text-teal-700 mt-1">
                    ML grade L:{results.left_eye.ml_grade} R:{results.right_eye?.ml_grade}
                  </p>
                )}
                {(results.crop_source || results.scoring_path) && (
                  <p className="text-[11px] text-gray-400 mt-2">
                    Crop: {formatCropSource(results.crop_source)}
                    {results.ml_redness?.available ? ' · sclera model on' : ''}
                  </p>
                )}
              </div>
            </div>

            <div className="mb-6">
              <PathologyTriagePanel triage={results.pathology_triage} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <EyeResultCard title="Left eye" data={results.left_eye} />
              <EyeResultCard title="Right eye" data={results.right_eye} />
            </div>

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

            <div className="card bg-gray-50 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">What we noticed (photo)</h3>
              <ul className="space-y-2">
                {results.findings?.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-accent-600">•</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              The break-up proxy is the time until <em>you</em> notice blur — not a fluorescein or keratograph
              break-up time. Redness is corrected for room-light colour; the Efron-style grade is an approximate
              mapping, not yet validated against graded reference photos.
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
      <div className="text-3xl font-bold text-accent-700 mb-3">{data.health_score}</div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-500">Redness (light-corrected)</dt>
          <dd className="font-medium">{data.sclera_redness}%</dd>
        </div>
        {data.efron_style_grade != null && (
          <div className="flex justify-between">
            <dt className="text-gray-500">Efron-style grade (approx.)</dt>
            <dd className="font-medium">{data.efron_style_grade} · {data.efron_style_label}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-gray-500">Tear film smoothness</dt>
          <dd className="font-medium">{data.tear_film_quality}%</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Surface irregularity</dt>
          <dd className="font-medium">{data.surface_irregularity}%</dd>
        </div>
      </dl>
    </div>
  )
}

export default DryEyeTest
