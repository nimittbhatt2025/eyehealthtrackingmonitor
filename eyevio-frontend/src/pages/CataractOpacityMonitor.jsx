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
  History,
  Trash2,
  Eye,
} from 'lucide-react'
import cameraManager from '../utils/cameraManager'
import { eyePhotoAPI } from '../services/api'
import assessVideoLighting from '../utils/photoLightingCheck'
import PhotoLightingBanner from '../components/PhotoLightingBanner'

const CONDITION_TYPE = 'cataract'
const DOCTOR_INTERVAL_KEY = 'cataract_monitor_doctor_months'

const GRADE_COLORS = {
  clear: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  mild: 'bg-amber-50 text-amber-900 border-amber-200',
  moderate: 'bg-orange-50 text-orange-900 border-orange-200',
  dense: 'bg-red-50 text-red-800 border-red-200',
}

function GradeBadge({ grade, label }) {
  if (!grade) return null
  const colors = GRADE_COLORS[grade] || 'bg-gray-100 text-gray-800 border-gray-200'
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${colors}`}>
      {label || grade}
    </span>
  )
}

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

export default function CataractOpacityMonitor() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const lightingCanvasRef = useRef(null)
  const streamRef = useRef(null)

  const [doctorMonths, setDoctorMonths] = useState(() => {
    const stored = localStorage.getItem(DOCTOR_INTERVAL_KEY)
    return stored ? parseInt(stored, 10) : 6
  })
  const [view, setView] = useState('home')
  const [status, setStatus] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [photos, setPhotos] = useState([])
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
      const [statusRes, timelineRes, photosRes] = await Promise.all([
        eyePhotoAPI.getStatus({
          condition_type: CONDITION_TYPE,
          doctor_visit_interval_months: doctorMonths,
        }),
        eyePhotoAPI.getTimeline({ condition_type: CONDITION_TYPE, months: 12 }),
        eyePhotoAPI.list({ condition_type: CONDITION_TYPE, limit: 24 }),
      ])
      setStatus(statusRes.data)
      setTimeline(timelineRes.data.timeline || [])
      setPhotos(photosRes.data.photos || [])
    } catch (err) {
      console.error('Failed to load cataract monitor data:', err)
    } finally {
      setLoading(false)
    }
  }, [doctorMonths])

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
      condition_type: CONDITION_TYPE,
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
        toast('Photo saved, but lighting was not ideal — grade comparison may be less reliable.', {
          icon: '⚠️',
          duration: 6000,
        })
      } else if (data.alert) {
        toast.error(data.alert.message, { duration: 6000 })
      } else if (data.comparison?.deteriorated) {
        toast('Opacity change detected — review your comparison.', { icon: '⚠️' })
      } else {
        toast.success('Opacity grade saved.')
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
        const msg =
          err.response?.data?.message ||
          err.response?.data?.error ||
          'Analysis failed. Move closer, center both eyes, and use even front light.'
        setError(msg)
      }
      setView('capture')
      initializeCamera()
    }
  }

  const handleDeletePhoto = async (photoId, { fromResults = false } = {}) => {
    const confirmed = window.confirm(
      'Delete this cataract screening photo? It will be removed from your opacity timeline.'
    )
    if (!confirmed) return

    setDeletingId(photoId)
    try {
      await eyePhotoAPI.delete(photoId)
      toast.success('Photo deleted')
      if (fromResults && lastResult?.photo?.id === photoId) {
        setLastResult(null)
        setView('home')
      }
      await loadData()
    } catch (err) {
      console.error('Failed to delete photo:', err)
      toast.error(err.response?.data?.error || 'Could not delete photo')
    } finally {
      setDeletingId(null)
    }
  }

  const analysis = lastResult?.analysis || lastResult?.photo?.analysis_details || {}
  const opacityGrade = analysis.opacity_grade || lastResult?.comparison?.opacity?.current?.opacity_grade
  const opacityScore = analysis.opacity_score
  const gradeLabel = analysis.grade_label

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
        <h1 className="text-2xl font-bold text-gray-900">Cataract Opacity Monitor</h1>
        <p className="text-gray-600 mt-1 text-sm max-w-2xl">
          Phase 1 screening: capture an anterior eye photo each month to track opacity grade over time.
          This estimates cloudiness — not cataract size in millimeters, and not LOCS III diagnosis.
        </p>
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-3 max-w-2xl">
          A dilated slit-lamp exam remains the clinical standard. Use this for trends between visits, and
          share results with your eye doctor.
        </p>
      </div>

      <div className="card p-5 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-sm font-medium text-gray-700 mb-1.5">What Phase 1 tracks</div>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Opacity grade: clear → mild → moderate → dense</li>
            <li>Clarity score (higher = clearer lens region)</li>
            <li>Month-over-month grade change alerts</li>
          </ul>
          <p className="text-xs text-gray-500 mt-2">
            Also try the{' '}
            <Link to="/vision-tests" className="text-accent-700 font-medium underline-offset-2 hover:underline">
              cataract glare functional test
            </Link>{' '}
            for vision-with-glare symptoms.
          </p>
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
            Alerts can recommend an earlier visit if opacity grade worsens before this schedule.
          </p>
        </div>
      </div>

      {view === 'home' && (
        <>
          <div className={`card p-5 border-l-4 ${status?.check_due ? 'border-l-amber-500' : 'border-l-emerald-500'}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
                  <Calendar className="w-4 h-4" />
                  Monthly opacity check
                </div>
                <p className="text-gray-900 font-semibold">{status?.message}</p>
                {status?.has_photos && (
                  <p className="text-sm text-gray-600 mt-1">
                    Last clarity: <strong>{status.last_health_score}</strong>/100
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

          {timeline.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <History className="w-4 h-4" />
                Opacity grade timeline
              </h2>
              <div className="space-y-3">
                {timeline.map((month) => {
                  const opacity = month.avg_opacity_score
                  const barWidth = opacity != null ? Math.min(100, opacity) : Math.min(100, 100 - (month.avg_health_score || 0))
                  return (
                    <div key={month.month} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-500 w-16 shrink-0">{month.label}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${barWidth}%` }}
                          title="Higher bar = more opacity"
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-800 w-24 text-right">
                        {opacity != null ? `${opacity} opac.` : `${month.avg_health_score} clear`}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Bar shows estimated opacity (higher = cloudier). Grades are screening estimates only.
              </p>
            </div>
          )}

          {photos.length > 0 ? (
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Saved opacity photos ({photos.length})</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map((photo) => {
                  const details = photo.analysis_details || {}
                  return (
                    <div key={photo.id} className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                      <img
                        src={photo.image_thumbnail}
                        alt={`Cataract screening ${new Date(photo.captured_at).toLocaleDateString()}`}
                        className="w-full aspect-[4/3] object-cover"
                      />
                      <div className="p-2 text-xs space-y-1">
                        <GradeBadge grade={details.opacity_grade} label={details.grade_label || details.opacity_grade} />
                        <div className="font-semibold text-gray-900">
                          Opacity {details.opacity_score ?? Math.round(100 - (photo.health_score || 0))}
                        </div>
                        <div className="text-gray-500">{new Date(photo.captured_at).toLocaleDateString()}</div>
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(photo.id)}
                          disabled={deletingId === photo.id}
                          className="mt-1 inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium min-h-[36px] disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {deletingId === photo.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="card p-5 text-center text-sm text-gray-600">
              <Eye className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="font-medium text-gray-900 mb-1">No cataract screening photos yet</p>
              <p>Take your first anterior-eye photo to start the opacity grade timeline.</p>
            </div>
          )}
        </>
      )}

      {view === 'capture' && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Capture anterior eye photo</h2>
          <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
            <li>Even front light aimed at your face (avoid strong backlight)</li>
            <li>Remove glasses; look straight ahead with both eyes open</li>
            <li>Move close enough that both eyes fill most of the frame</li>
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
            >
              Capture &amp; grade opacity
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera()
                setView('home')
              }}
              className="btn-secondary min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {view === 'analyzing' && (
        <div className="card p-10 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-100 border-t-accent-600 mx-auto mb-4" />
          <p className="text-gray-700 font-medium">Estimating opacity grade…</p>
          <p className="text-sm text-gray-500 mt-1">Aligning pupil-region crops and comparing to prior months</p>
        </div>
      )}

      {view === 'results' && lastResult && (
        <div className="space-y-4">
          <div className="card p-5 border-l-4 border-l-accent-500">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">Opacity screening result</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <GradeBadge grade={opacityGrade} label={gradeLabel || opacityGrade} />
                  {opacityScore != null && (
                    <span className="text-sm text-gray-700">
                      Opacity score <strong>{opacityScore}</strong>/100
                    </span>
                  )}
                  {analysis.score != null && (
                    <span className="text-sm text-gray-500">· Clarity {analysis.score}/100</span>
                  )}
                </div>
                {analysis.risk_message && (
                  <p className="text-sm text-gray-700 mt-2">{analysis.risk_message}</p>
                )}
              </div>
            </div>
            {(analysis.findings || []).length > 0 && (
              <ul className="mt-3 text-sm text-gray-600 list-disc pl-5 space-y-1">
                {analysis.findings.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            {analysis.disclaimer && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 mt-3">
                {analysis.disclaimer}
              </p>
            )}
          </div>

          {(lastResult.lighting_warning || lastResult.lighting?.quality === 'fair') && (
            <div className="card p-4 border-l-4 border-l-amber-500 bg-amber-50">
              <p className="text-sm font-semibold text-amber-900">Lighting warning</p>
              <p className="text-sm text-amber-800 mt-1">
                {lastResult.lighting?.message ||
                  'Suboptimal lighting can inflate opacity estimates. Retake in even front light when possible.'}
              </p>
            </div>
          )}

          <div
            className={`card p-5 border-l-4 ${
              lastResult.comparison?.deteriorated ? 'border-l-red-500' : 'border-l-emerald-500'
            }`}
          >
            <div className="flex items-start gap-3">
              {lastResult.comparison?.deteriorated ? (
                <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <Minus className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h2 className="font-semibold text-gray-900">
                  {lastResult.comparison?.deteriorated ? 'Opacity change detected' : 'Photo saved'}
                </h2>
                <p className="text-sm text-gray-700 mt-1">
                  {lastResult.comparison?.message || 'Your screening photo has been added to your timeline.'}
                </p>
                {lastResult.comparison?.changes && (
                  <div className="mt-3 max-w-md">
                    <MetricDelta label="Clarity score" change={lastResult.comparison.changes.health_score} />
                    <MetricDelta
                      label="Opacity score"
                      change={lastResult.comparison.changes.opacity_score}
                      higherIsWorse
                    />
                    <MetricDelta
                      label="Grade level"
                      change={lastResult.comparison.changes.grade_level}
                      higherIsWorse
                    />
                  </div>
                )}
                {lastResult.comparison?.recommend_doctor_visit && (
                  <p className="text-sm text-red-700 font-medium mt-2">
                    Consider scheduling a dilated exam before your next {doctorMonths}-month appointment.
                  </p>
                )}
              </div>
            </div>
          </div>

          {lastResult.photo?.image_thumbnail && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Your saved photo</h3>
              <div className="grid sm:grid-cols-[200px_1fr] gap-4 items-start">
                <img
                  src={lastResult.photo.image_thumbnail}
                  alt="Saved cataract screening"
                  className="w-full rounded-lg border border-gray-200"
                />
                <div className="text-sm text-gray-600 space-y-2">
                  <p>
                    Method:{' '}
                    <strong className="text-gray-800">
                      {analysis.method === 'resnet_v1' ? 'ResNet grader' : 'CV heuristic (Phase 1)'}
                    </strong>
                  </p>
                  <p className="text-xs text-gray-500">
                    ResNet deep-learning grading is scaffolded for a later phase; Phase 1 uses pupil-region
                    brightness and texture heuristics.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(lastResult.photo.id, { fromResults: true })}
                    disabled={deletingId === lastResult.photo.id}
                    className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium min-h-[36px] disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete this photo
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setView('home')} className="btn-primary min-h-[44px]">
              Back to timeline
            </button>
            <button
              type="button"
              onClick={() => {
                setLastResult(null)
                setView('capture')
              }}
              className="btn-secondary min-h-[44px]"
            >
              Take another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
