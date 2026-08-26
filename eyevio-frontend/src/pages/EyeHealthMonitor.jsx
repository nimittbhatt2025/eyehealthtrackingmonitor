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
import StableLightingPreview from '../utils/stableLightingPreview'
import PhotoLightingBanner from '../components/PhotoLightingBanner'
import EyewearReminderBanner from '../components/EyewearReminderBanner'
import GlassesContactsCheck from '../components/GlassesContactsCheck'
import SamdDisclaimer from '../components/SamdDisclaimer'
import { getLightingUiCopy } from '../utils/photoLightingCheck'

const CONDITIONS = [
  {
    id: 'dry_eye',
    label: 'Dry eye',
    description: 'Tracks redness, reflection consistency, surface texture, and aligned eye appearance.',
  },
  {
    id: 'cornea_scar',
    label: 'Cornea / surface changes',
    description: 'Emphasizes surface irregularity, left/right asymmetry, and aligned visual change.',
  },
  {
    id: 'glaucoma',
    label: 'Between-visit surface monitoring',
    description:
      'Selfie photos cannot assess optic nerve or eye pressure. This tracks surface appearance only between visits.',
  },
  {
    id: 'general',
    label: 'General eye health',
    description: 'Broad month-over-month surface tracking with aligned crop comparison.',
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
  const lightingPreviewRef = useRef(null)
  const streamRef = useRef(null)

  const [conditionType, setConditionType] = useState('dry_eye')
  const [doctorMonths, setDoctorMonths] = useState(() => {
    const stored = localStorage.getItem(DOCTOR_INTERVAL_KEY)
    return stored ? parseInt(stored, 10) : 6
  })
  const [view, setView] = useState('home') // home | glasses-check | capture | analyzing | results
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
  const [timelineMetric, setTimelineMetric] = useState('overall')

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
        console.warn('Lighting preview failed:', err)
      }
    }

    tick()
    const intervalId = setInterval(tick, 300)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
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

      if (data.eyewear_warning) {
        toast(data.eyewear_warning.message, { icon: '⚠️', duration: 6000 })
      } else if (data.alert) {
        toast.error(data.alert.message, { duration: 6000 })
      } else if (data.comparison?.recommend_confirm_retake) {
        toast('Visible change detected — retake in similar lighting to confirm.', { icon: '⚠️', duration: 6000 })
      } else if (data.comparison?.deteriorated) {
        toast('Changes detected — review your comparison.', { icon: '⚠️' })
      } else {
        toast.success('Photo saved. Comparison updated.')
      }

      loadData()
    } catch (err) {
      const errorCode = err.response?.data?.error
      const lighting = err.response?.data?.lighting

      if (errorCode === 'face_framing' && lighting) {
        const copy = getLightingUiCopy({ status: 'framing_problem', stable: true })
        setLightingError(lighting)
        setError(copy.message)
        toast.error(copy.label, { duration: 5000 })
      } else if (errorCode === 'poor_lighting' && lighting) {
        const copy = getLightingUiCopy({ status: 'extreme_problem', stable: true })
        setLightingError(lighting)
        setError(copy.message)
        toast.error(copy.label, { duration: 5000 })
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
        setView('glasses-check')
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
          Take a monthly eye photo to track visible surface appearance over time under ideal, well-lit conditions.
          If a sustained visible change is confirmed, EyeVio may suggest checking in with your doctor before your next visit.
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
          {conditionType === 'glaucoma' && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2">
              Front-facing photos cannot monitor glaucoma progression. Use this only for surface comfort between clinic visits.
            </p>
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
            Alerts may recommend an earlier visit if a confirmed visible change appears before this schedule.
          </p>
        </div>
      </div>

      {view === 'home' && (
        <>
          <div className="card p-5 bg-slate-50 border-slate-200">
            <h2 className="font-semibold text-gray-900 mb-2">How this works (simple)</h2>
            <ol className="text-sm text-gray-700 space-y-2 list-decimal pl-5">
              <li><strong>Take a photo</strong> once a month in a well-lit room, face centered, glasses off.</li>
              <li>
                <strong>Watch the banner</strong> while the camera is open:
                <span className="text-emerald-700"> Green = good lighting</span>,
                <span className="text-amber-700"> Amber = fix your position</span>,
                <span className="text-red-700"> Red = fix lighting</span> (or use Capture anyway — saved but less reliable for comparison).
              </li>
              <li><strong>We score the photo</strong> (0–100 appearance score). This is tracking only — not a diagnosis.</li>
              <li><strong>We compare to last month</strong>. Small changes → no alert. Large change → we ask you to <strong>retake once</strong> to confirm.</li>
              <li><strong>Only confirmed changes</strong> can trigger an alert suggesting an earlier doctor visit.</li>
            </ol>
            <p className="text-xs text-gray-500 mt-3">
              Not medical advice. Use even front-facing light and the same setup each month for best results.
            </p>
          </div>

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
                    Last appearance score: <strong>{status.last_health_score}</strong>/100
                    {status.days_since_last != null && ` · ${status.days_since_last} days ago`}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setView('glasses-check')} className="btn-primary min-h-[44px]">
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
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  ['overall', 'Overall'],
                  ['redness', 'Redness'],
                  ['tear_film', 'Reflection'],
                  ['irregularity', 'Texture'],
                  ['asymmetry', 'Asymmetry'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTimelineMetric(key)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      timelineMetric === key
                        ? 'bg-accent-100 border-accent-300 text-accent-900 font-medium'
                        : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {timeline.map((month) => {
                  const metricValue = {
                    overall: month.avg_health_score,
                    redness: month.avg_redness,
                    tear_film: month.avg_tear_film,
                    irregularity: month.avg_irregularity,
                    asymmetry: month.avg_asymmetry ?? 0,
                  }[timelineMetric] ?? month.avg_health_score
                  const barWidth = timelineMetric === 'redness' || timelineMetric === 'irregularity' || timelineMetric === 'asymmetry'
                    ? Math.max(0, 100 - metricValue)
                    : metricValue
                  return (
                    <div key={month.month} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-500 w-16 shrink-0">{month.label}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-500 rounded-full"
                          style={{ width: `${Math.min(100, barWidth)}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-800 w-10 text-right">{metricValue}</span>
                    </div>
                  )
                })}
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
            Not a diagnostic device. Front-facing photos cannot assess glaucoma.
          </p>
        </>
      )}

      {view === 'glasses-check' && (
        <GlassesContactsCheck
          testType="Eye Health Photo Monitor"
          message="Remove eyeglasses and contact lenses before the photo. The camera cannot reliably verify this — your confirmation is what we rely on."
          onBack={() => setView('home')}
          onComplete={() => {
            setError(null)
            setView('capture')
          }}
        />
      )}

      {view === 'capture' && (() => {
        const framingBlock = liveLighting?.status === 'framing_problem' && liveLighting?.stable
        const lightingBlock = liveLighting?.status === 'extreme_problem' && liveLighting?.stable
        const checking = !liveLighting?.stable || liveLighting?.status === 'checking'
        return (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Capture eye photo</h2>
          <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
            <li>Use soft, even front-facing light (not backlight from a window)</li>
            <li>Remove glasses and contact lenses (confirmed in prior step)</li>
            <li>Wait for the green “Good lighting” indicator before capturing</li>
          </ul>

          <PhotoLightingBanner lighting={liveLighting} />
          <EyewearReminderBanner />
          {lightingBlock && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This photo may be saved, but may not be reliable for month-to-month comparison.
            </p>
          )}
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
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={() => captureAndAnalyze(false)}
              disabled={!cameraReady || checking || framingBlock}
              className="btn-primary min-h-[44px] disabled:opacity-50"
            >
              Capture &amp; analyze
            </button>
            {lightingBlock && !framingBlock && (
              <button
                type="button"
                onClick={() => captureAndAnalyze(true)}
                disabled={!cameraReady || checking}
                className="btn-secondary min-h-[44px] disabled:opacity-50"
              >
                Capture anyway
              </button>
            )}
            <button type="button" onClick={() => { stopCamera(); setView('glasses-check') }} className="btn-secondary min-h-[44px]">
              Cancel
            </button>
          </div>
        </div>
        )
      })()}

      {view === 'analyzing' && (
        <div className="card p-10 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-100 border-t-accent-600 mx-auto mb-4" />
          <p className="text-gray-700 font-medium">Analyzing your eye photo…</p>
          <p className="text-sm text-gray-500 mt-1">Aligning eye crops and comparing carefully to prior months</p>
        </div>
      )}

      {view === 'results' && lastResult && (
        <div className="space-y-4">
          <SamdDisclaimer testType={conditionType} />

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
                  {lastResult.comparison?.deteriorated
                    ? 'Confirmed visible change'
                    : lastResult.comparison?.recommend_confirm_retake
                      ? 'Retake recommended'
                      : 'Photo saved'}
                </h2>
                <p className="text-sm text-gray-700 mt-1">
                  {lastResult.comparison?.message || 'Your photo has been added to your history.'}
                </p>
                {lastResult.comparison?.comparison_confidence && (
                  <p className="text-xs text-gray-500 mt-2">
                    Comparison confidence: <strong>{lastResult.comparison.comparison_confidence}</strong>
                    {lastResult.comparison.baseline_type && (
                      <> · baseline: {lastResult.comparison.baseline_type}</>
                    )}
                    {lastResult.comparison.action && (
                      <> · status: {lastResult.comparison.action.replace(/_/g, ' ').toLowerCase()}</>
                    )}
                  </p>
                )}
                {lastResult.comparison?.confirmation_note && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1.5 mt-2">
                    {lastResult.comparison.confirmation_note}
                  </p>
                )}
                {lastResult.comparison?.condition_scope?.disclaimer && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 mt-2">
                    {lastResult.comparison.condition_scope.disclaimer}
                  </p>
                )}
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
                  <p><strong>Appearance score:</strong> {lastResult.photo.health_score}/100</p>
                  {lastResult.analysis?.capture_quality && (
                    <p><strong>Capture quality:</strong> {lastResult.analysis.capture_quality.grade}</p>
                  )}
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
                  <MetricDelta label="Appearance score" change={lastResult.comparison.changes.health_score} />
                  <MetricDelta label="Redness" change={lastResult.comparison.changes.sclera_redness} higherIsWorse />
                  <MetricDelta label="Reflection consistency" change={lastResult.comparison.changes.tear_film_quality} />
                  <MetricDelta
                    label="Surface texture"
                    change={lastResult.comparison.changes.surface_irregularity}
                    higherIsWorse
                  />
                  {lastResult.comparison.eye_changes && (
                    <>
                      <MetricDelta label="Left eye score" change={lastResult.comparison.eye_changes.left} />
                      <MetricDelta label="Right eye score" change={lastResult.comparison.eye_changes.right} />
                      {lastResult.comparison.eye_changes.asymmetry_flag && (
                        <p className="text-xs text-amber-800 pt-2">
                          One eye changed more than the other — review both eyes in the comparison crops.
                        </p>
                      )}
                    </>
                  )}
                  {lastResult.comparison.changes.irregularity_asymmetry && (
                    <MetricDelta
                      label="L/R irregularity asymmetry"
                      change={lastResult.comparison.changes.irregularity_asymmetry}
                      higherIsWorse
                    />
                  )}
                </div>
              )}

              {lastResult.comparison.visual_comparison?.available && (
                <div className="mt-5 border-t border-gray-100 pt-4">
                  <h4 className="font-semibold text-gray-900 mb-1">Photo similarity comparison</h4>
                  <p className="text-xs text-gray-500 mb-3">
                    {lastResult.comparison.visual_comparison.message}
                    {lastResult.comparison.visual_comparison.ssim_avg != null && (
                      <> · similarity {lastResult.comparison.visual_comparison.ssim_avg}</>
                    )}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Previous · left / right</p>
                      <div className="flex gap-2">
                        {lastResult.comparison.baseline_left_crop && (
                          <img
                            src={lastResult.comparison.baseline_left_crop}
                            alt="Previous left eye"
                            className="rounded border border-gray-200 w-1/2 object-cover"
                          />
                        )}
                        {lastResult.comparison.baseline_right_crop && (
                          <img
                            src={lastResult.comparison.baseline_right_crop}
                            alt="Previous right eye"
                            className="rounded border border-gray-200 w-1/2 object-cover"
                          />
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Today · left / right</p>
                      <div className="flex gap-2">
                        {lastResult.comparison.current_left_crop && (
                          <img
                            src={lastResult.comparison.current_left_crop}
                            alt="Current left eye"
                            className="rounded border border-gray-200 w-1/2 object-cover"
                          />
                        )}
                        {lastResult.comparison.current_right_crop && (
                          <img
                            src={lastResult.comparison.current_right_crop}
                            alt="Current right eye"
                            className="rounded border border-gray-200 w-1/2 object-cover"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {lastResult.comparison.has_baseline && !lastResult.comparison.visual_comparison?.available && (
                <p className="text-xs text-gray-500 mt-3">
                  Aligned crop comparison needs a newer baseline photo with Phase 1 crops saved. Your next captures will enable SSIM tracking.
                </p>
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
            {lastResult.comparison?.recommend_confirm_retake && (
              <button
                type="button"
                onClick={() => {
                  setLastResult(null)
                  setView('glasses-check')
                }}
                className="btn-secondary min-h-[44px]"
              >
                Retake to confirm
              </button>
            )}
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
