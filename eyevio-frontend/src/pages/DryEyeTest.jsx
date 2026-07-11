import { useState, useEffect, useCallback, useRef } from 'react'
import cameraManager from '../utils/cameraManager.js'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import {
  OSDI_LITE_QUESTIONS,
  FREQUENCY_OPTIONS,
  calculateOsdiLite,
  combineDryEyeScores,
} from '../utils/dryEyeQuestionnaire'

/**
 * Dry Eye Screening Test (Option B + OSDI-lite)
 *
 * Symptom questionnaire → photo capture → CV analysis → combined results.
 * Screening only — not a clinical diagnosis.
 */

const DryEyeTest = () => {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const [testState, setTestState] = useState('instructions')
  const [cameraReady, setCameraReady] = useState(false)
  const [error, setError] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [results, setResults] = useState(null)
  const [symptomResults, setSymptomResults] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(OSDI_LITE_QUESTIONS.map((q) => [q.id, null]))
  )

  const allQuestionsAnswered = OSDI_LITE_QUESTIONS.every(
    (q) => answers[q.id] !== null && answers[q.id] !== undefined
  )

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
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setCameraReady(true)
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

  const analyzePhoto = useCallback(async (dataUrl, symptoms) => {
    setTestState('analyzing')
    setError(null)
    stopCamera()

    try {
      const response = await visionTestAPI.analyzeDryEye({ image: dataUrl })
      const cvData = response.data
      const blended = combineDryEyeScores(cvData.score, symptoms.symptomHealthScore)

      const finalResults = {
        ...cvData,
        cv_score: cvData.score,
        symptom_score: symptoms.symptomHealthScore,
        osdi_score: symptoms.osdiScore,
        score: blended.combinedScore,
        risk_level: blended.riskLevel,
        risk_message: blended.riskMessage,
        symptom_severity: symptoms.severity,
        symptom_severity_label: symptoms.severityLabel,
        symptom_responses: symptoms.responses,
      }

      setResults(finalResults)

      setSubmitting(true)
      await visionTestAPI.submit({
        test_type: 'dry_eye',
        score: finalResults.score,
        left_eye_score: cvData.left_eye?.health_score,
        right_eye_score: cvData.right_eye?.health_score,
        test_details: {
          risk_level: finalResults.risk_level,
          risk_message: finalResults.risk_message,
          cv_score: cvData.score,
          symptom_score: symptoms.symptomHealthScore,
          osdi_score: symptoms.osdiScore,
          symptom_severity: symptoms.severity,
          symptom_severity_label: symptoms.severityLabel,
          symptom_responses: symptoms.responses,
          findings: cvData.findings,
          metrics: cvData.metrics,
          left_eye: cvData.left_eye,
          right_eye: cvData.right_eye,
          disclaimer: cvData.disclaimer,
        },
        notes: 'Dry eye screening (OSDI-lite + photo CV)',
      })
      setTestState('results')
    } catch (err) {
      console.error('Analysis failed:', err)
      const msg = err.response?.data?.error || 'Analysis failed. Please try again in brighter, even lighting.'
      setError(msg)
      setTestState('capture')
      initializeCamera()
    } finally {
      setSubmitting(false)
    }
  }, [stopCamera, initializeCamera])

  const handleQuestionnaireSubmit = () => {
    const symptoms = calculateOsdiLite(answers)
    setSymptomResults(symptoms)
    setTestState('capture')
  }

  const handleCapture = () => {
    if (!symptomResults) return
    const dataUrl = capturePhoto()
    if (dataUrl) analyzePhoto(dataUrl, symptomResults)
  }

  const handleRetake = () => {
    setPreviewUrl(null)
    setResults(null)
    setSymptomResults(null)
    setError(null)
    setAnswers(Object.fromEntries(OSDI_LITE_QUESTIONS.map((q) => [q.id, null])))
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
              <h1 className="page-title mb-2">Dry Eye Screening</h1>
              <p className="text-sm text-accent-600 font-medium">
                Symptom check + photo analysis for dryness signs
              </p>
            </div>

            <div className="bg-brand-gradient text-white rounded-2xl p-6 mb-6">
              <h3 className="font-bold text-lg mb-3">In short</h3>
              <ol className="space-y-2 text-white/90 text-sm">
                <li><span className="font-bold">1.</span> Answer 6 quick questions about eye comfort (past week).</li>
                <li><span className="font-bold">2.</span> Take a photo in bright, even room light.</li>
                <li><span className="font-bold">3.</span> We combine symptoms and photo signals for your result.</li>
              </ol>
            </div>

            <div className="bg-accent-50 border-l-4 border-accent-500 rounded-r-xl p-5 mb-6">
              <h3 className="font-semibold text-accent-900 mb-2">What we look for</h3>
              <ul className="text-sm text-accent-800 space-y-1.5">
                <li>• Symptom frequency (gritty, burning, blurry vision)</li>
                <li>• Redness in the white of the eye</li>
                <li>• Uneven reflections on the eye surface (tear film proxy)</li>
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-sm text-amber-900">
              <strong>Important:</strong> This is a screening tool only. It cannot diagnose dry eye disease.
              If your eyes often feel dry, gritty, or burn, please see an eye care professional.
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
            <h2 className="section-title text-xl mb-1">Symptom questionnaire</h2>
            <p className="text-gray-500 mb-6 text-sm">
              During the <strong>past week</strong>, how often did you experience the following?
            </p>

            <div className="space-y-6 mb-8">
              {OSDI_LITE_QUESTIONS.map((question, index) => (
                <fieldset key={question.id} className="border border-gray-100 rounded-xl p-4">
                  <legend className="text-sm font-medium text-gray-900 px-1 mb-3">
                    {index + 1}. {question.text}
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FREQUENCY_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
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
              ))}
            </div>

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
                Continue to Photo
              </button>
            </div>
          </div>
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
                Symptom check complete — {symptomResults.severityLabel} (OSDI-lite: {symptomResults.osdiScore}/100)
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 mb-4 text-sm">
                {error}
              </div>
            )}

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
              <button type="button" onClick={() => { stopCamera(); setTestState('questionnaire') }} className="test-btn-outline">
                Back
              </button>
              <button
                type="button"
                onClick={handleCapture}
                disabled={!cameraReady}
                className="test-btn"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="card text-center">
                <h4 className="font-semibold text-gray-900 mb-2">Symptoms</h4>
                <div className="text-3xl font-bold text-accent-700">{results.symptom_score}</div>
                <p className="text-xs text-gray-500 mt-1">
                  {results.symptom_severity_label} · OSDI {results.osdi_score}/100
                </p>
              </div>
              <div className="card text-center">
                <h4 className="font-semibold text-gray-900 mb-2">Photo analysis</h4>
                <div className="text-3xl font-bold text-accent-700">{results.cv_score}</div>
                <p className="text-xs text-gray-500 mt-1">Redness & tear film surface</p>
              </div>
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

            <p className="text-xs text-gray-500 mb-8">{results.disclaimer}</p>

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
          <dt className="text-gray-500">Redness</dt>
          <dd className="font-medium">{data.sclera_redness}%</dd>
        </div>
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
