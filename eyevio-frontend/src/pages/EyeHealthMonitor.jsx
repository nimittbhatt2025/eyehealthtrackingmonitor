import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  Camera,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertTriangle,
  Calendar,
  ChevronRight,
  History,
  Trash2,
} from 'lucide-react'
import cameraManager from '../utils/cameraManager'
import { eyePhotoAPI } from '../services/api'
import assessVideoLighting from '../utils/photoLightingCheck'
import PhotoLightingBanner from '../components/PhotoLightingBanner'

const CONDITIONS = [
  {
    id: 'dry_eye',
    label: 'Dry eye',
    description: 'Tracks redness, tear film smoothness, and surface irritation signs.',
  },
  {
    id: 'cornea_scar',
    label: 'Cornea / surface changes',
    description: 'Emphasizes surface irregularity and texture changes over time.',
  },
  {
    id: 'glaucoma',
    label: 'Glaucoma monitoring',
    description: 'Surface-health proxy between visits — not a substitute for pressure checks.',
  },
  {
    id: 'general',
    label: 'General eye health',
    description: 'Broad month-over-month tracking for any ongoing eye condition.',
  },
]

const DOCTOR_INTERVAL_KEY = 'eye_monitor_doctor_months'

const conditionLabel = (id) => CONDITIONS.find((c) => c.id === id)?.label || id

function MetricDelta({ label, change, higherIsWorse = false }) {
  if (!change) return null
  const { delta, current, baseline } = change
  const worsened = higherIsWorse ? delta > 0 : delta < 0
  const improved = higherIsWorse ? delta < 0 : delta > 0
  const Icon = worsened ? TrendingDown : improved ? TrendingUp : Minus
  const color = worsened ? 'text-red-600' : improved ? 'text-emerald-600' : 'text-gray-500'

  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-600">{label}</span>
      <div className={`flex items-center gap-1.5 font-medium ${color}`}>
        <Icon className="w-3.5 h-3.5" aria-hidden />
        <span>{current}</span>
        <span className="text-gray-400 font-normal">vs {baseline}</span>
      </div>
    </div>
  )
}

export default function EyeHealthMonitor() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const lightingCanvasRef = useRef(null)
  const streamRef = useRef(null)

  const [conditionType, setConditionType] = useState('dry_eye')
  const [doctorMonths, setDoctorMonths] = useState(() => {
    const stored = localStorage.getItem(DOCTOR_INTERVAL_KEY)
    return stored ? parseInt(stored, 10) : 6
  })
  const [view, setView] = useState('home') // home | capture | analyzing | results
  const [status, setStatus] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [photos, setPhotos] = useState([])
  const [allPhotos, setAllPhotos] = useState([])
  const [totalPhotoCount, setTotalPhotoCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [cameraReady, setCameraReady] = useState(false)
  const [error, setError] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const [liveLighting, setLiveLighting] = useState(null)
  const [lightingError, setLightingError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, timelineRes, photosRes, allPhotosRes] = await Promise.all([
        eyePhotoAPI.getStatus({ condition_type: conditionType, doctor_visit_interval_months: doctorMonths }),
        eyePhotoAPI.getTimeline({ condition_type: conditionType, months: 6 }),
        eyePhotoAPI.list({ condition_type: conditionType, limit: 12 }),
        eyePhotoAPI.list({ limit: 24 }),
      ])
      setStatus(statusRes.data)
      setTimeline(timelineRes.data.timeline || [])
      setPhotos(photosRes.data.photos || [])
      setAllPhotos(allPhotosRes.data.photos || [])
      setTotalPhotoCount(allPhotosRes.data.total ?? (allPhotosRes.data.photos || []).length)
    } catch (err) {
      console.error('Failed to load eye monitor data:', err)
    } finally {
      setLoading(false)
    }
  }, [conditionType, doctorMonths])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    localStorage.setItem(DOCTOR_INTERVAL_KEY, String(doctorMonths))
  }, [doctorMonths])

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

  const initializeCamera = useCallback(async () => {
    try {
      setError(null)
      const stream = await cameraManager.acquire({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setCameraReady(true)
        }
      }
    } catch {
      setError('Camera access is required. Please allow camera permissions.')
    }
  }, [])

  useEffect(() => {
    if (view === 'capture') initializeCamera()
    return () => {
      if (view !== 'capture') stopCamera()
    }
  }, [view, initializeCamera, stopCamera])

  useEffect(() => {
    if (view !== 'capture' || !cameraReady) {
      setLiveLighting(null)
      return undefined
    }

    const sampleLighting = () => {
      const lighting = assessVideoLighting(videoRef.current, lightingCanvasRef.current)
      setLiveLighting(lighting)
    }

    sampleLighting()
    const intervalId = setInterval(sampleLighting, 500)
    return () => clearInterval(intervalId)
  }, [view, cameraReady])

  const submitCapture = async (dataUrl, acknowledgePoorLighting = false) => {
    const response = await eyePhotoAPI.capture({
      image: dataUrl,
      condition_type: conditionType,
      doctor_visit_interval_months: doctorMonths,
      acknowledge_poor_lighting: acknowledgePoorLighting,
    })
    return response.data
  }

  const captureAndAnalyze = async (acknowledgePoorLighting = false) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !cameraReady) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)

    setView('analyzing')
    stopCamera()
    setError(null)
    setLightingError(null)

    try {
      const data = await submitCapture(dataUrl, acknowledgePoorLighting)

      setLastResult(data)
      setView('results')

      if (data.lighting_warning) {
        toast('Photo saved, but lighting was not ideal — month-over-month comparison may be less reliable.', {
          icon: '⚠️',
          duration: 6000,
        })
      } else if (data.alert) {
        toast.error(data.alert.message, { duration: 6000 })
      } else if (data.comparison?.deteriorated) {
        toast('Changes detected — review your comparison.', { icon: '⚠️' })
      } else {
        toast.success('Photo saved. Comparison updated.')
      }

      loadData()
    } catch (err) {
      const poorLighting = err.response?.data?.error === 'poor_lighting'
      const lighting = err.response?.data?.lighting

      if (poorLighting && lighting) {
        setLightingError(lighting)
        setError(lighting.message || 'Lighting is not suitable. Adjust your lighting and try again.')
        toast.error('Poor lighting — please fix before capturing.', { duration: 5000 })
      } else {
        const msg = err.response?.data?.message || err.response?.data?.error || 'Analysis failed. Try again in even, bright lighting.'
        setError(msg)
      }
      setView('capture')
      initializeCamera()
    }
  }

  const selectedCondition = CONDITIONS.find((c) => c.id === conditionType)

  const handleDeletePhoto = async (photoId, { fromResults = false } = {}) => {
    const confirmed = window.confirm(
      'Delete this photo? It will be removed from your history and month-over-month comparisons.'
    )
    if (!confirmed) return

    setDeletingId(photoId)
    try {
      await eyePhotoAPI.delete(photoId)
      toast.success('Photo deleted')
      if (fromResults && lastResult?.photo?.id === photoId) {
        setLastResult(null)
        setView('capture')
      }
      await loadData()
    } catch (err) {
      console.error('Failed to delete photo:', err)
      toast.error(err.response?.data?.error || 'Could not delete photo')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading && view === 'home') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-100 border-t-accent-600" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Eye Health Photo Monitor</h1>
        <p className="text-gray-600 mt-1 text-sm max-w-2xl">
          Take a monthly eye photo to track surface health over time. If metrics worsen before your
          next doctor visit, EyeVio can alert you to schedule an earlier appointment.
        </p>
      </div>

      {/* Condition + doctor interval */}
      <div className="card p-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="condition-type" className="block text-sm font-medium text-gray-700 mb-1.5">
            Condition you are monitoring
          </label>
          <select
            id="condition-type"
            value={conditionType}
            onChange={(e) => setConditionType(e.target.value)}
            className="input w-full"
            disabled={view !== 'home'}
          >
            {CONDITIONS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          {selectedCondition && (
            <p className="text-xs text-gray-500 mt-1.5">{selectedCondition.description}</p>
          )}
        </div>
        <div>
          <label htmlFor="doctor-months" className="block text-sm font-medium text-gray-700 mb-1.5">
            Planned doctor visit interval
          </label>
          <select
            id="doctor-months"
            value={doctorMonths}
            onChange={(e) => setDoctorMonths(parseInt(e.target.value, 10))}
            className="input w-full"
            disabled={view !== 'home'}
          >
            <option value={3}>Every 3 months</option>
            <option value={6}>Every 6 months</option>
            <option value={12}>Every 12 months</option>
          </select>
          <p className="text-xs text-gray-500 mt-1.5">
            Alerts recommend an earlier visit if photos worsen before this schedule.
          </p>
        </div>
      </div>

      {view === 'home' && (
        <>
          {/* Status card */}
          <div className={`card p-5 border-l-4 ${status?.check_due ? 'border-l-amber-500' : 'border-l-emerald-500'}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
                  <Calendar className="w-4 h-4" />
                  Monthly check status
                </div>
                <p className="text-gray-900 font-semibold">{status?.message}</p>
                {status?.has_photos && (
                  <p className="text-sm text-gray-600 mt-1">
                    Last score: <strong>{status.last_health_score}</strong>/100
                    {status.days_since_last != null && ` · ${status.days_since_last} days ago`}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setView('capture')} className="btn-primary min-h-[44px]">
                <Camera className="w-4 h-4 mr-2 inline" />
                {status?.check_due ? 'Take monthly photo' : 'Take photo now'}
              </button>
            </div>
          </div>

          {/* Timeline */}
          {timeline.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <History className="w-4 h-4" />
                Month-over-month trends
              </h2>
              <div className="space-y-3">
                {timeline.map((month) => (
                  <div key={month.month} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-500 w-16 shrink-0">{month.label}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent-500 rounded-full"
                        style={{ width: `${Math.min(100, month.avg_health_score)}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-800 w-10 text-right">{month.avg_health_score}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4 text-center text-xs text-gray-500">
                <div>Redness (lower better)</div>
                <div>Tear film (higher better)</div>
                <div>Irregularity (lower better)</div>
              </div>
            </div>
          )}

          {/* Photo history — all saved photos */}
          {allPhotos.length > 0 ? (
            <div className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="font-semibold text-gray-900">Saved photos ({totalPhotoCount})</h2>
                {photos.length === 0 && (
                  <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                    None for &quot;{conditionLabel(conditionType)}&quot; — showing all conditions
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {allPhotos.map((photo) => (
                  <div key={photo.id} className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50 group relative">
                    <img
                      src={photo.image_thumbnail}
                      alt={`Eye photo ${new Date(photo.captured_at).toLocaleDateString()}`}
                      className="w-full aspect-[4/3] object-cover"
                    />
                    <div className="p-2 text-xs">
                      <div className="font-semibold text-gray-900">{photo.health_score}/100</div>
                      <div className="text-gray-500">
                        {new Date(photo.captured_at).toLocaleDateString()}
                      </div>
                      <div className="text-gray-400 mt-0.5">{conditionLabel(photo.condition_type)}</div>
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(photo.id)}
                        disabled={deletingId === photo.id}
                        className="mt-2 inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium min-h-[36px] disabled:opacity-50"
                        aria-label={`Delete photo from ${new Date(photo.captured_at).toLocaleDateString()}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deletingId === photo.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Bad lighting or a blurry shot? Delete it and take a new photo for accurate tracking.
              </p>
            </div>
          ) : (
            <div className="card p-5 text-center text-sm text-gray-600">
              <p className="font-medium text-gray-900 mb-1">No saved photos yet</p>
              <p>Take your first monthly photo — it will appear here with the date and health score.</p>
            </div>
          )}

          <p className="text-xs text-gray-500 text-center">
            Screening only — not a medical diagnosis. Always follow your eye care provider&apos;s advice.
          </p>
        </>
      )}

      {view === 'capture' && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Capture eye photo</h2>
          <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
            <li>Use soft, even front-facing light (not backlight from a window)</li>
            <li>Remove glasses; look straight ahead with eyes open</li>
            <li>Wait for the green lighting indicator before capturing</li>
          </ul>

          <PhotoLightingBanner lighting={liveLighting} />
          <canvas ref={lightingCanvasRef} className="hidden" aria-hidden />

          <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-video max-w-lg mx-auto">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          </div>
          <canvas ref={canvasRef} className="hidden" />

          {error && (
            <div className="space-y-2">
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              {lightingError?.recommendations?.map((tip) => (
                <p key={tip} className="text-xs text-red-700 pl-1">• {tip}</p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={() => captureAndAnalyze(false)}
              disabled={!cameraReady || (liveLighting && !liveLighting.acceptable)}
              className="btn-primary min-h-[44px] disabled:opacity-50"
              title={liveLighting && !liveLighting.acceptable ? 'Improve lighting before capturing' : undefined}
            >
              Capture &amp; analyze
            </button>
            <button type="button" onClick={() => { stopCamera(); setView('home') }} className="btn-secondary min-h-[44px]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {view === 'analyzing' && (
        <div className="card p-10 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-100 border-t-accent-600 mx-auto mb-4" />
          <p className="text-gray-700 font-medium">Analyzing your eye photo…</p>
          <p className="text-sm text-gray-500 mt-1">Comparing to your previous months</p>
        </div>
      )}

      {view === 'results' && lastResult && (
        <div className="space-y-4">
          {(lastResult.lighting_warning || lastResult.lighting?.quality === 'fair') && (
            <div className="card p-4 border-l-4 border-l-amber-500 bg-amber-50">
              <p className="text-sm font-semibold text-amber-900">Lighting warning</p>
              <p className="text-sm text-amber-800 mt-1">
                {lastResult.lighting?.message || 'This photo was taken in suboptimal lighting. Retake next month in better light for more reliable comparisons.'}
              </p>
            </div>
          )}

          <div className={`card p-5 border-l-4 ${
            lastResult.comparison?.deteriorated ? 'border-l-red-500' : 'border-l-emerald-500'
          }`}>
            <div className="flex items-start gap-3">
              {lastResult.comparison?.deteriorated ? (
                <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <Minus className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div>
                <h2 className="font-semibold text-gray-900">
                  {lastResult.comparison?.deteriorated ? 'Changes detected' : 'Photo saved'}
                </h2>
                <p className="text-sm text-gray-700 mt-1">
                  {lastResult.comparison?.message || 'Your photo has been added to your history.'}
                </p>
                {lastResult.comparison?.recommend_doctor_visit && (
                  <p className="text-sm text-red-700 font-medium mt-2">
                    Consider scheduling a visit before your next {doctorMonths}-month appointment.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Saved photo (always show after capture) */}
          {lastResult.photo?.image_thumbnail && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Your saved photo</h3>
              <div className="grid sm:grid-cols-[200px_1fr] gap-4 items-start">
                <img
                  src={lastResult.photo.image_thumbnail}
                  alt="Saved eye photo"
                  className="rounded-lg border border-gray-200 w-full aspect-[4/3] object-cover"
                />
                <div className="text-sm text-gray-700 space-y-1">
                  <p><strong>Health score:</strong> {lastResult.photo.health_score}/100</p>
                  <p><strong>Condition:</strong> {conditionLabel(lastResult.photo.condition_type)}</p>
                  <p><strong>Saved:</strong> {new Date(lastResult.photo.captured_at).toLocaleString()}</p>
                  <p className="text-xs text-gray-500 pt-2">
                    This photo is stored in your account. Open &quot;Back to monitor&quot; to see your full gallery.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(lastResult.photo.id, { fromResults: true })}
                    disabled={deletingId === lastResult.photo.id}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium min-h-[44px] disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deletingId === lastResult.photo.id ? 'Deleting…' : 'Delete photo & retake'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Side-by-side comparison */}
          {lastResult.comparison?.has_baseline && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Comparison vs last month</h3>
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Previous</p>
                  <img
                    src={lastResult.comparison.baseline_thumbnail}
                    alt="Previous month"
                    className="rounded-lg border border-gray-200 w-full aspect-[4/3] object-cover"
                  />
                  {lastResult.comparison.baseline_captured_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(lastResult.comparison.baseline_captured_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Today</p>
                  <img
                    src={lastResult.photo?.image_thumbnail}
                    alt="Today"
                    className="rounded-lg border border-gray-200 w-full aspect-[4/3] object-cover"
                  />
                </div>
              </div>

              {lastResult.comparison.changes && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <MetricDelta label="Health score" change={lastResult.comparison.changes.health_score} />
                  <MetricDelta label="Redness" change={lastResult.comparison.changes.sclera_redness} higherIsWorse />
                  <MetricDelta label="Tear film" change={lastResult.comparison.changes.tear_film_quality} />
                  <MetricDelta
                    label="Surface irregularity"
                    change={lastResult.comparison.changes.surface_irregularity}
                    higherIsWorse
                  />
                </div>
              )}
            </div>
          )}

          {lastResult.analysis?.findings && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 mb-2">Findings</h3>
              <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
                {lastResult.analysis.findings.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 mt-3">{lastResult.analysis.disclaimer}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => { setView('home'); setLastResult(null) }} className="btn-primary min-h-[44px]">
              Back to monitor
            </button>
            {lastResult.alert?.id && (
              <Link to="/alerts" className="btn-secondary min-h-[44px] inline-flex items-center">
                View alert
                <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
