import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  Camera,
  Minus,
  AlertTriangle,
  Calendar,
  History,
  Trash2,
  Eye,
} from 'lucide-react'
import cameraManager from '../utils/cameraManager'
import { eyePhotoAPI } from '../services/api'
import StableLightingPreview from '../utils/stableLightingPreview'
import PhotoLightingBanner from '../components/PhotoLightingBanner'
import SamdDisclaimer from '../components/SamdDisclaimer'
import ExperimentalModelNotice from '../components/ExperimentalModelNotice'
import { PupilRegionTracker } from '../utils/pupilRegionDetector'
import OnDevicePrivacyToggle from '../components/OnDevicePrivacyToggle'
import EyeThumbnail from '../components/EyeThumbnail'
import { analyzeCapturedFrame, describeAnalysisLocation } from '../ml/eyePhotoAnalysis'
import { prepareImageUpload } from '../utils/imageUpload'
import { getSavePhotosPreference, setSavePhotosPreference, warmOnDevice } from '../ml/onDeviceInference'
import {
  cropEyeDataUrl,
  drawEyeZoom,
  regionsSharpEnough,
} from '../utils/eyeCropFromRegions'

const CONDITION_TYPE = 'cataract'
const DOCTOR_INTERVAL_KEY = 'cataract_monitor_doctor_months'

function getPupilCrops(source) {
  const details =
    source?.analysis_details ||
    source?.analysis ||
    source?.photo?.analysis_details ||
    source ||
    {}
  const pupil = details.pupil_crops || {}
  const aligned = details.aligned_crops || {}
  return {
    left: pupil.left || aligned.left || null,
    right: pupil.right || aligned.right || null,
  }
}

export default function CataractOpacityMonitor() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const lightingCanvasRef = useRef(null)
  const lightingPreviewRef = useRef(null)
  const streamRef = useRef(null)
  const pupilTrackerRef = useRef(null)
  const leftZoomRef = useRef(null)
  const rightZoomRef = useRef(null)

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
  const [pupilsLocked, setPupilsLocked] = useState(false)
  const [zoomSharp, setZoomSharp] = useState(false)
  const [savePhotos, setSavePhotos] = useState(getSavePhotosPreference)
  const [analysisWhere, setAnalysisWhere] = useState(null)

  const handleSavePhotosChange = (value) => {
    setSavePhotos(value)
    setSavePhotosPreference(value)
  }

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
    if (pupilTrackerRef.current) {
      try {
        pupilTrackerRef.current.stop?.()
      } catch {
        /* ignore */
      }
      pupilTrackerRef.current = null
    }
    setCameraReady(false)
    setPupilsLocked(false)
    setZoomSharp(false)
  }, [])

  const initializeCamera = useCallback(async () => {
    try {
      setError(null)
      const stream = await cameraManager.acquire({
        video: {
          facingMode: 'user',
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
      })
      streamRef.current = stream
      if (!pupilTrackerRef.current) {
        pupilTrackerRef.current = new PupilRegionTracker()
      }
      await pupilTrackerRef.current.init()
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setCameraReady(true)
        }
      }
    } catch {
      // Fallback if 1080p is rejected by the device
      try {
        const stream = await cameraManager.acquire({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        streamRef.current = stream
        if (!pupilTrackerRef.current) {
          pupilTrackerRef.current = new PupilRegionTracker()
        }
        await pupilTrackerRef.current.init()
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
    }
  }, [])

  useEffect(() => {
    if (view === 'capture') initializeCamera()
    return () => {
      if (view !== 'capture') stopCamera()
    }
  }, [view, initializeCamera, stopCamera])

  useEffect(() => {
    if (view === 'capture' && !savePhotos) warmOnDevice('cataract')
  }, [view, savePhotos])

  useEffect(() => {
    if (view !== 'capture' || !cameraReady) {
      setLiveLighting(null)
      setPupilsLocked(false)
      setZoomSharp(false)
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
        console.warn('Cataract monitor lighting preview failed:', err)
      }

      try {
        const regions = await pupilTrackerRef.current?.track(videoRef.current)
        if (cancelled) return
        if (regions?.anatomicalLeft && regions?.anatomicalRight) {
          const leftDraw = drawEyeZoom(
            videoRef.current,
            leftZoomRef.current,
            regions.anatomicalLeft,
            { mirror: true }
          )
          const rightDraw = drawEyeZoom(
            videoRef.current,
            rightZoomRef.current,
            regions.anatomicalRight,
            { mirror: true }
          )
          setPupilsLocked(Boolean(leftDraw && rightDraw))
          setZoomSharp(
            regionsSharpEnough(
              regions,
              videoRef.current.videoWidth,
              videoRef.current.videoHeight
            )
          )
        } else {
          setPupilsLocked(false)
          setZoomSharp(false)
        }
      } catch (err) {
        console.warn('Pupil zoom preview failed:', err)
        if (!cancelled) {
          setPupilsLocked(false)
          setZoomSharp(false)
        }
      }
    }

    tick()
    const intervalId = setInterval(tick, 200)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [view, cameraReady])

  const submitCapture = async (where, canvas, eyeCrops, acknowledgePoorLighting = false) => {
    const common = {
      condition_type: CONDITION_TYPE,
      doctor_visit_interval_months: doctorMonths,
      acknowledge_poor_lighting: acknowledgePoorLighting,
    }
    let body
    if (where.mode === 'on_device') {
      body = { ...common, on_device: where.payload, lighting: lightingPreviewRef.current?.lastUi }
    } else {
      const upload = await prepareImageUpload(canvas, where.landmarks, { quality: 0.95 })
      body = {
        ...common,
        image: upload.blob,
        client_crop: upload.meta,
        eye_crops: eyeCrops || undefined,
        store_image: savePhotos,
      }
    }
    const { data } = await eyePhotoAPI.capture(body)
    return data
  }

  const captureAndAnalyze = async (acknowledgePoorLighting = false) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !cameraReady) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.imageSmoothingEnabled = true
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(video, 0, 0)
    }

    // Pupil close-ups are only needed when photos are kept (timeline thumbnails).
    let eyeCrops = null
    if (savePhotos) {
      try {
        const regions =
          (await pupilTrackerRef.current?.track(video)) ||
          pupilTrackerRef.current?.getRegions(canvas.width, canvas.height)
        if (regions?.anatomicalLeft || regions?.anatomicalRight) {
          eyeCrops = {
            left: cropEyeDataUrl(canvas, regions.anatomicalLeft),
            right: cropEyeDataUrl(canvas, regions.anatomicalRight),
            size: [320, 320],
            source: 'client_iris_zoom_v2',
          }
        }
      } catch (err) {
        console.warn('Could not crop pupil close-ups at capture:', err)
      }
    }

    setView('analyzing')
    stopCamera()
    setError(null)
    setLightingError(null)

    try {
      const where = await analyzeCapturedFrame('cataract', canvas, lightingPreviewRef.current, { savePhotos })
      setAnalysisWhere(where)
      const data = await submitCapture(where, canvas, eyeCrops, acknowledgePoorLighting)
      setLastResult(data)
      setView('results')

      if (data.lighting?.quality === 'fair' || data.lighting?.acknowledged) {
        toast('Photo saved, but lighting was not ideal — comparison may be less reliable.', {
          icon: '⚠️',
          duration: 6000,
        })
      } else if (data.alert) {
        toast.error(data.alert.message, { duration: 6000 })
      } else if (data.comparison?.deteriorated) {
        toast('Photos look different from last month — review the comparison.', { icon: '⚠️' })
      } else {
        toast.success('Lens photo saved.')
      }

      loadData()
    } catch (err) {
      const poorLighting = err.response?.data?.error === 'poor_lighting'
      const lighting = err.response?.data?.lighting

      if (poorLighting && lighting) {
        setLightingError(lighting)
        setError(lighting.message || 'Lighting is not suitable. Adjust your lighting and try again.')
        toast.error('Poor lighting — please fix before capturing.', { duration: 5000 })
      } else if (err.code === 'no_face' || err.code === 'eye_too_small') {
        setError(err.message)
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
      'Delete this lens photo? It will be removed from your timeline.'
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
        <h1 className="text-2xl font-bold text-gray-900">Lens photo timeline</h1>
        <p className="text-gray-600 mt-1 text-sm max-w-2xl">
          Capture zoomed left and right pupil photos each month and compare them side by side. No cataract
          result is produced: the cataract model is a research experiment, not a screening tool.
        </p>
        <SamdDisclaimer testType="cataract" className="mt-3 max-w-2xl" />
      </div>

      <div className="card p-5 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-sm font-medium text-gray-700 mb-1.5">What this tracks</div>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Aligned left and right pupil close-ups, month by month</li>
            <li>Photo-quality checks: framing, lighting, shadows and glare</li>
            <li>Side-by-side comparison with an earlier month</li>
          </ul>
          <p className="text-xs text-gray-500 mt-2">
            The cataract model is not used for results: masking the eye out of a photo barely changed its
            output, so it learned the dataset rather than the eye. The experiment is described in the{' '}
            <Link to="/research-lab" className="text-accent-700 font-medium underline-offset-2 hover:underline">
              Experimental AI Research Lab
            </Link>
            .
          </p>
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
            Used for your monthly photo reminder. Keep your scheduled eye exams regardless of these photos.
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
                  Monthly lens photo
                </div>
                <p className="text-gray-900 font-semibold">{status?.message}</p>
                {status?.has_photos && (
                  <div className="text-sm text-gray-600 mt-1 flex flex-wrap items-center gap-2">
                    {status.days_since_last != null && <span>Last photo {status.days_since_last} days ago</span>}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setView('capture')} className="btn-primary min-h-[44px]">
                <Camera className="w-4 h-4 mr-2 inline" />
                {status?.check_due ? 'Capture pupil close-ups' : 'Capture pupils now'}
              </button>
            </div>
          </div>

          {timeline.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <History className="w-4 h-4" />
                Photo timeline
              </h2>
              <div className="space-y-4">
                {timeline.map((month) => {
                  const latest = month.latest_photo
                  return (
                    <div key={month.month} className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-medium text-gray-500 w-16 shrink-0">{month.label}</span>
                        <span className="text-xs text-gray-500">
                          {month.photo_count} photo{month.photo_count === 1 ? '' : 's'}
                        </span>
                        {latest?.image_thumbnail && (
                          <img
                            src={latest.image_thumbnail}
                            alt=""
                            className="w-10 h-10 rounded object-cover border border-gray-200"
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {photos.length > 0 ? (
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Saved pupil close-ups ({photos.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {photos.map((photo) => {
                  const crops = getPupilCrops(photo)
                  return (
                    <div key={photo.id} className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                      {crops.left || crops.right ? (
                        <div className="grid grid-cols-2 gap-px bg-gray-200">
                          <div className="bg-black">
                            {crops.left ? (
                              <img
                                src={crops.left}
                                alt="Left pupil"
                                className="w-full aspect-square object-cover"
                              />
                            ) : (
                              <div className="aspect-square flex items-center justify-center text-xs text-gray-400">
                                L —
                              </div>
                            )}
                            <div className="text-[10px] text-center text-white bg-black/80 py-0.5">Left</div>
                          </div>
                          <div className="bg-black">
                            {crops.right ? (
                              <img
                                src={crops.right}
                                alt="Right pupil"
                                className="w-full aspect-square object-cover"
                              />
                            ) : (
                              <div className="aspect-square flex items-center justify-center text-xs text-gray-400">
                                R —
                              </div>
                            )}
                            <div className="text-[10px] text-center text-white bg-black/80 py-0.5">Right</div>
                          </div>
                        </div>
                      ) : (
                        <EyeThumbnail
                          src={photo.image_thumbnail}
                          alt={`Lens photo ${new Date(photo.captured_at).toLocaleDateString()}`}
                          className="w-full aspect-[2/1] object-cover"
                        />
                      )}
                      <div className="p-2 text-xs space-y-1">
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
              <p className="font-medium text-gray-900 mb-1">No lens photos yet</p>
              <p>Take your first pupil close-up to start the photo timeline.</p>
            </div>
          )}
        </>
      )}

      {view === 'capture' && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Capture pupil close-ups</h2>
          <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
            <li>Even front light aimed at your face (avoid strong backlight)</li>
            <li>Remove glasses; look straight ahead with both eyes open</li>
            <li>Move close until both pupil zooms lock onto the dark center of each eye</li>
            <li>
              Wait for the green lighting indicator — or use Capture anyway if you must
              (saved but less reliable for month-over-month comparison)
            </li>
          </ul>

          <OnDevicePrivacyToggle savePhotos={savePhotos} onChange={handleSavePhotosChange} />
          <PhotoLightingBanner lighting={liveLighting} />
          <canvas ref={lightingCanvasRef} className="hidden" aria-hidden />

          <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] gap-4 items-start max-w-4xl mx-auto">
            <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              <div className="absolute bottom-2 left-2 right-2 flex justify-between gap-2 text-[11px]">
                <span
                  className={`px-2 py-1 rounded-full font-medium ${
                    pupilsLocked && zoomSharp
                      ? 'bg-emerald-500/90 text-white'
                      : pupilsLocked
                        ? 'bg-amber-500/90 text-white'
                        : 'bg-black/60 text-white'
                  }`}
                >
                  {!pupilsLocked
                    ? 'Looking for pupils…'
                    : zoomSharp
                      ? 'Sharp pupil lock — ready to capture'
                      : 'Pupils found — move closer for a sharper zoom'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
              <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-950">
                <div className="px-2 py-1 text-xs font-semibold text-white bg-black/70">Your left eye</div>
                <canvas ref={leftZoomRef} className="w-full aspect-square bg-black object-contain" />
              </div>
              <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-950">
                <div className="px-2 py-1 text-xs font-semibold text-white bg-black/70">Your right eye</div>
                <canvas ref={rightZoomRef} className="w-full aspect-square bg-black object-contain" />
              </div>
              <p className="text-xs text-gray-500 col-span-2 md:col-span-1">
                Move closer until the zooms look sharp (not pixelated).
                {savePhotos ? ' We save these close-ups — not the whole face.' : ' Nothing is uploaded unless you turn on photo saving.'}
              </p>
            </div>
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
              Capture pupil close-ups &amp; screen
            </button>
            {liveLighting && !liveLighting.acceptable && (
              <button
                type="button"
                onClick={() => captureAndAnalyze(true)}
                disabled={!cameraReady}
                className="btn-secondary min-h-[44px] disabled:opacity-50"
              >
                Capture anyway
              </button>
            )}
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
          <p className="text-gray-700 font-medium">Saving…</p>
          <p className="text-sm text-gray-500 mt-1">Checking photo quality and comparing with earlier months</p>
        </div>
      )}

      {view === 'results' && lastResult && (
        <div className="space-y-4">
          <SamdDisclaimer testType="cataract" />
          <ExperimentalModelNotice notice={analysis.experimental_models} />

          {(lastResult.lighting?.quality === 'fair' || lastResult.lighting?.acknowledged) && (
            <div className="card p-4 border-l-4 border-l-amber-500 bg-amber-50">
              <p className="text-sm font-semibold text-amber-900">Lighting warning</p>
              <p className="text-sm text-amber-800 mt-1">
                {lastResult.lighting?.message ||
                  'Suboptimal lighting makes month-to-month comparison less reliable. Retake in even front light when possible.'}
              </p>
            </div>
          )}

          <div
            className={`card p-5 border-l-4 ${
              lastResult.comparison?.deteriorated ? 'border-l-amber-500' : 'border-l-emerald-500'
            }`}
          >
            <div className="flex items-start gap-3">
              {lastResult.comparison?.deteriorated ? (
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <Minus className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h2 className="font-semibold text-gray-900">
                  {lastResult.comparison?.deteriorated ? 'Photos look different from your reference' : 'Photo saved'}
                </h2>
                <p className="text-sm text-gray-700 mt-1">
                  {lastResult.comparison?.message || 'Your lens photo has been added to your timeline.'}
                </p>
                {lastResult.comparison?.recommend_doctor_visit && (
                  <p className="text-sm text-red-700 font-medium mt-2">
                    Consider scheduling a dilated exam before your next {doctorMonths}-month appointment.
                  </p>
                )}
              </div>
            </div>
          </div>

          {(lastResult.photo?.image_thumbnail ||
            getPupilCrops(lastResult).left ||
            getPupilCrops(lastResult).right) && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Saved pupil close-ups</h3>
              {analysisWhere && (
                <p className="text-xs text-gray-500 mb-3">{describeAnalysisLocation(analysisWhere)}</p>
              )}
              <div className="grid sm:grid-cols-[1fr_1fr] gap-4 items-start">
                {(() => {
                  const crops = getPupilCrops(lastResult)
                  if (!lastResult.photo?.image_thumbnail && !crops.left && !crops.right) return null
                  if (crops.left || crops.right) {
                    return (
                      <>
                        <div className="rounded-lg overflow-hidden border border-gray-200 bg-black">
                          {crops.left ? (
                            <img src={crops.left} alt="Left pupil close-up" className="w-full aspect-square object-cover" />
                          ) : (
                            <div className="aspect-square flex items-center justify-center text-sm text-gray-400">Left unavailable</div>
                          )}
                          <div className="text-xs text-center text-white bg-black/80 py-1.5 font-medium">Left eye</div>
                        </div>
                        <div className="rounded-lg overflow-hidden border border-gray-200 bg-black">
                          {crops.right ? (
                            <img src={crops.right} alt="Right pupil close-up" className="w-full aspect-square object-cover" />
                          ) : (
                            <div className="aspect-square flex items-center justify-center text-sm text-gray-400">Right unavailable</div>
                          )}
                          <div className="text-xs text-center text-white bg-black/80 py-1.5 font-medium">Right eye</div>
                        </div>
                      </>
                    )
                  }
                  return (
                    <img
                      src={lastResult.photo.image_thumbnail}
                      alt="Saved lens photo"
                      className="w-full rounded-lg border border-gray-200 sm:col-span-2"
                    />
                  )
                })()}
              </div>
              <div className="text-sm text-gray-600 space-y-2 mt-4">
                  {lastResult.photo?.id && (
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(lastResult.photo.id, { fromResults: true })}
                      disabled={deletingId === lastResult.photo.id}
                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium min-h-[36px] disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete this photo
                    </button>
                  )}
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
