import { useState, useEffect, useCallback, useRef } from 'react'
import cameraManager from '../utils/cameraManager.js'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import EyeTracker from '../utils/eyeTracker'
import SamdDisclaimer from '../components/SamdDisclaimer'
import {
  scorePeripheralAwareness,
  eccentricityDeg,
  fitHitRateVsEccentricity,
  fitReactionTimeVsEccentricity,
} from '../utils/visionTestScoring'
import { getScreenScale } from '../utils/screenScale'

/**
 * Side Vision Game — tap targets that appear away from the centre while
 * looking at the centre dot.
 *
 * Targets appear at a continuous range of eccentricities (in degrees, from
 * the screen scale and an assumed 50.8 cm viewing distance). Hit rate is fitted
 * with a logistic psychometric function of eccentricity and reaction time with
 * a robust line, and the slopes are reported. Not a visual-field test.
 */

const VIEW_MM = 508
const SAFE_RADIUS_PX = 110
const DIRECTION_ANGLE = { right: 0, bottomRight: 45, bottom: 90, bottomLeft: 135, left: 180, topLeft: 225, top: 270, topRight: 315 }

function EccentricityChart({ trials, hitFit, rtFit }) {
  const W = 300
  const H = 150
  const pad = { l: 36, r: 36, t: 10, b: 26 }
  const maxEcc = Math.max(10, Math.ceil(Math.max(...trials.map((t) => t.ecc)) / 5) * 5)
  const x = (e) => pad.l + (e / maxEcc) * (W - pad.l - pad.r)
  const yHit = (p) => pad.t + (1 - p) * (H - pad.t - pad.b)
  const hits = trials.filter((t) => t.hit && t.rt)
  const rtMax = Math.max(1000, Math.ceil(Math.max(0, ...hits.map((t) => t.rt)) / 500) * 500)
  const yRt = (ms) => pad.t + (1 - ms / rtMax) * (H - pad.t - pad.b)
  const bins = 5
  const binned = Array.from({ length: bins }, (_, i) => {
    const lo = (i * maxEcc) / bins
    const hi = ((i + 1) * maxEcc) / bins
    const inBin = trials.filter((t) => t.ecc >= lo && t.ecc < hi)
    return inBin.length ? { e: (lo + hi) / 2, p: inBin.filter((t) => t.hit).length / inBin.length, n: inBin.length } : null
  }).filter(Boolean)
  const curve = hitFit
    ? Array.from({ length: 40 }, (_, i) => {
        const e = hitFit.rangeDeg[0] + (i / 39) * (hitFit.rangeDeg[1] - hitFit.rangeDeg[0])
        const e50 = hitFit.e50Deg ?? 1000
        const p = 0.97 / (1 + Math.exp((e - e50) / hitFit.spreadDeg))
        return `${i ? 'L' : 'M'}${x(e).toFixed(1)},${yHit(p).toFixed(1)}`
      }).join(' ')
    : null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Hit rate and reaction time by distance from centre">
      {[0, 0.5, 1].map((p) => (
        <g key={p}>
          <line x1={pad.l} x2={W - pad.r} y1={yHit(p)} y2={yHit(p)} stroke="#e5e7eb" />
          <text x={pad.l - 4} y={yHit(p) + 3} fontSize="8" textAnchor="end" fill="#059669">{p * 100}%</text>
        </g>
      ))}
      <text x={W - pad.r + 4} y={yRt(rtMax) + 3} fontSize="8" fill="#6366f1">{rtMax} ms</text>
      <text x={W - pad.r + 4} y={yRt(0) + 3} fontSize="8" fill="#6366f1">0</text>
      {[0, maxEcc / 2, maxEcc].map((e) => (
        <text key={e} x={x(e)} y={H - 12} fontSize="8" textAnchor="middle" fill="#6b7280">{e}°</text>
      ))}
      <text x={(W - pad.r + pad.l) / 2} y={H - 2} fontSize="8" textAnchor="middle" fill="#6b7280">distance from centre</text>
      {hits.map((t, i) => (
        <circle key={i} cx={x(t.ecc)} cy={yRt(t.rt)} r="1.8" fill="#6366f1" opacity="0.5" />
      ))}
      {rtFit && (
        <line
          x1={x(0)}
          x2={x(maxEcc)}
          y1={yRt(rtFit.interceptMs)}
          y2={yRt(rtFit.interceptMs + rtFit.slopeMsPerDeg * maxEcc)}
          stroke="#6366f1"
          strokeDasharray="4 3"
        />
      )}
      {curve && <path d={curve} fill="none" stroke="#059669" strokeWidth="2" />}
      {binned.map((b) => (
        <circle key={b.e} cx={x(b.e)} cy={yHit(b.p)} r={2 + Math.min(4, b.n / 3)} fill="#059669" />
      ))}
    </svg>
  )
}

const PeripheralAwarenessTest = () => {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const eyeTracker = useRef(null)
  const calibrationCenter = useRef({ x: 0.5, y: 0.5 })
  const spawnIntervalRef = useRef(null)
  const timerIntervalRef = useRef(null)
  const finishingRef = useRef(false)
  const gameStateRef = useRef({
    totalHits: 0,
    totalMisses: 0,
    reactionTime: 0,
    missedTargets: [],
    trials: []
  })
  const screenScaleRef = useRef(getScreenScale())
  const playAreaRef = useRef(null)
  const [eccFit, setEccFit] = useState(null)

  const [testState, setTestState] = useState('instructions') // instructions, setup, calibrating, playing, results
  const [cameraReady, setCameraReady] = useState(false)
  
  // Game state
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [gameTime, setGameTime] = useState(60) // 60 seconds
  const [remainingTime, setRemainingTime] = useState(60)
  const [targets, setTargetsState] = useState([])
  // Hit/miss bookkeeping must not live inside state updaters: StrictMode runs them twice.
  const targetsRef = useRef([])
  const setTargets = useCallback((next) => {
    targetsRef.current = next
    setTargetsState(next)
  }, [])
  const [missedTargets, setMissedTargets] = useState([])
  const [eyePosition, setEyePosition] = useState({ x: 0.5, y: 0.5 }) // 0-1 normalized
  const [centerDisplay, setCenterDisplay] = useState({ x: 0.5, y: 0.5 })
  const [isLookingCenter, setIsLookingCenter] = useState(true)
  const [calibrationProgress, setCalibrationProgress] = useState(0)
  const calibrationSamplesRef = useRef([])
  
  // Results
  const [totalHits, setTotalHits] = useState(0)
  const [totalMisses, setTotalMisses] = useState(0)
  const [peripheralDeficits, setPeripheralDeficits] = useState([])
  const [reactionTime, setReactionTime] = useState(0)
  const [fieldScore, setFieldScore] = useState(0)

  // Visual field quadrants
  const QUADRANTS = {
    topLeft: { x: 0.2, y: 0.2, label: 'Top Left' },
    topRight: { x: 0.8, y: 0.2, label: 'Top Right' },
    bottomLeft: { x: 0.2, y: 0.8, label: 'Bottom Left' },
    bottomRight: { x: 0.8, y: 0.8, label: 'Bottom Right' },
    left: { x: 0.1, y: 0.5, label: 'Left' },
    right: { x: 0.9, y: 0.5, label: 'Right' },
    top: { x: 0.5, y: 0.2, label: 'Top' },
    bottom: { x: 0.5, y: 0.8, label: 'Bottom' }
  }

  // Initialize camera with MediaPipe Eye Tracking
  const initializeCamera = useCallback(async () => {
    try {
      const stream = await cameraManager.acquire({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()

        // Initialize MediaPipe Eye Tracker
        eyeTracker.current = new EyeTracker()
        await eyeTracker.current.initialize(videoRef.current, handleGazeUpdate)

        setCameraReady(true)
        console.log('[OK] Camera and eye tracker ready')
      }
    } catch (err) {
      console.error('Camera access denied:', err)
      alert('Camera access is required for eye tracking. Please allow camera access and refresh.')
    }
  }, [])

  // Handle gaze position updates from eye tracker
  const phaseRef = useRef('instructions')
  useEffect(() => { phaseRef.current = testState }, [testState])

  const handleGazeUpdate = useCallback((gazeData) => {
    setEyePosition({ x: gazeData.x, y: gazeData.y })

    if (phaseRef.current === 'calibrating' && gazeData.detected) {
      calibrationSamplesRef.current.push({ x: gazeData.x, y: gazeData.y })
    }

    const centerTolerance = 0.18
    const distFromCenter = Math.sqrt(
      (gazeData.x - calibrationCenter.current.x) ** 2 +
      (gazeData.y - calibrationCenter.current.y) ** 2
    )
    setIsLookingCenter(distFromCenter < centerTolerance)
  }, [])

  // Stop camera and eye tracking
  const stopCamera = useCallback(() => {
    if (spawnIntervalRef.current) {
      clearInterval(spawnIntervalRef.current)
      spawnIntervalRef.current = null
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    if (streamRef.current) {
      try { cameraManager.release() } catch (e) { try { streamRef.current.getTracks().forEach(track => track.stop()) } catch (err) {} }
      streamRef.current = null
    }
    if (eyeTracker.current) {
      try { eyeTracker.current.stop() } catch (err) {}
      eyeTracker.current = null
    }
    setCameraReady(false)
  }, [])

  // Spawn new target
  const spawnTarget = useCallback(() => {
    const quadrantKeys = Object.keys(QUADRANTS)
    const randomQuadrant = quadrantKeys[Math.floor(Math.random() * quadrantKeys.length)]

    // Random distance along a jittered direction, so eccentricity covers a continuous range.
    const W = playAreaRef.current?.clientWidth || window.innerWidth
    const H = playAreaRef.current?.clientHeight || window.innerHeight
    const cx = calibrationCenter.current.x * W
    const cy = calibrationCenter.current.y * H
    const a = ((DIRECTION_ANGLE[randomQuadrant] + (Math.random() - 0.5) * 30) * Math.PI) / 180
    const margin = 48
    const limits = []
    if (Math.cos(a) > 1e-6) limits.push((W - margin - cx) / Math.cos(a))
    if (Math.cos(a) < -1e-6) limits.push((margin - cx) / Math.cos(a))
    if (Math.sin(a) > 1e-6) limits.push((H - margin - cy) / Math.sin(a))
    if (Math.sin(a) < -1e-6) limits.push((margin + 72 - cy) / Math.sin(a))
    const rMax = Math.max(0, Math.min(...limits))
    const rMin = Math.min(rMax, SAFE_RADIUS_PX)
    const r = rMin + Math.random() * (rMax - rMin)
    const target = {
      id: Date.now() + Math.random(),
      x: (cx + r * Math.cos(a)) / W,
      y: (cy + r * Math.sin(a)) / H,
      ecc: eccentricityDeg(r / screenScaleRef.current.pxPerMm, VIEW_MM),
      quadrant: randomQuadrant,
      spawnTime: Date.now(),
      lifetime: Math.max(1000, 2000 - level * 100) // Faster at higher levels
    }

    setTargets([...targetsRef.current, target])

    gameStateRef.current.totalSpawned += 1
    if (!gameStateRef.current.spawnedByQuadrant[randomQuadrant]) {
      gameStateRef.current.spawnedByQuadrant[randomQuadrant] = 0
    }
    gameStateRef.current.spawnedByQuadrant[randomQuadrant] += 1

    // Auto-remove after lifetime
    setTimeout(() => {
      if (!targetsRef.current.some(t => t.id === target.id)) return
      setTargets(targetsRef.current.filter(t => t.id !== target.id))
      setMissedTargets(prev => [...prev, target])
      setTotalMisses(prev => prev + 1)

      // Update ref for endGame
      gameStateRef.current.totalMisses += 1
      gameStateRef.current.missedTargets.push(target)
      gameStateRef.current.trials.push({ ecc: target.ecc, direction: target.quadrant, hit: false, rt: null })
    }, target.lifetime)
  }, [level, setTargets])

  // Handle target tap
  const handleTargetTap = useCallback((targetId) => {
    const target = targetsRef.current.find(t => t.id === targetId)
    if (!target) return
    setTargets(targetsRef.current.filter(t => t.id !== targetId))

    if (isLookingCenter) {
      // Valid hit - eyes were on center
      const reactionMs = Date.now() - target.spawnTime
      setScore(s => s + (10 * level))
      setTotalHits(h => h + 1)
      setReactionTime(prev => prev + reactionMs)

      // Update ref for endGame
      gameStateRef.current.totalHits += 1
      gameStateRef.current.reactionTime += reactionMs
      gameStateRef.current.trials.push({ ecc: target.ecc, direction: target.quadrant, hit: true, rt: reactionMs })

      // Level up every 10 hits
      if (gameStateRef.current.totalHits % 10 === 0) {
        setLevel(l => Math.min(l + 1, 10))
      }
    } else {
      // Invalid hit - eyes were NOT on center (cheating detected)
      // Count as miss and penalize score
      setMissedTargets(prev => [...prev, target])
      setTotalMisses(prev => prev + 1)
      setScore(s => Math.max(0, s - 5)) // Penalty for looking away

      // Update ref for endGame
      gameStateRef.current.totalMisses += 1
      gameStateRef.current.missedTargets.push(target)
      gameStateRef.current.trials.push({ ecc: target.ecc, direction: target.quadrant, hit: false, rt: null, gazeOff: true })
    }
  }, [isLookingCenter, level, setTargets])

  const startCalibration = useCallback(() => {
    calibrationSamplesRef.current = []
    setCalibrationProgress(0)
    setTestState('calibrating')

    const start = Date.now()
    const duration = 2000
    const tick = setInterval(() => {
      const elapsed = Date.now() - start
      setCalibrationProgress(Math.min(100, Math.round((elapsed / duration) * 100)))
      if (elapsed >= duration) {
        clearInterval(tick)
        const samples = calibrationSamplesRef.current
        if (samples.length > 0) {
          const avg = {
            x: samples.reduce((s, p) => s + p.x, 0) / samples.length,
            y: samples.reduce((s, p) => s + p.y, 0) / samples.length,
          }
          calibrationCenter.current = avg
          setCenterDisplay(avg)
        } else {
          calibrationCenter.current = { x: 0.5, y: 0.5 }
          setCenterDisplay({ x: 0.5, y: 0.5 })
        }
        startGameRef.current?.()
      }
    }, 100)
  }, [])

  const startGameRef = useRef(null)

  const startGame = useCallback(() => {
    finishingRef.current = false
    setTestState('playing')
    setScore(0)
    setLevel(1)
    setRemainingTime(gameTime)
    setTargets([])
    setMissedTargets([])
    setTotalHits(0)
    setTotalMisses(0)
    setReactionTime(0)

    gameStateRef.current = {
      totalHits: 0,
      totalMisses: 0,
      totalSpawned: 0,
      spawnedByQuadrant: {},
      reactionTime: 0,
      missedTargets: [],
      trials: []
    }
    setEccFit(null)

    if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current)
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)

    spawnIntervalRef.current = setInterval(() => {
      spawnTarget()
    }, 1200)

    let timeLeft = gameTime
    timerIntervalRef.current = setInterval(() => {
      timeLeft -= 1
      setRemainingTime(timeLeft)

      if (timeLeft <= 0) {
        clearInterval(spawnIntervalRef.current)
        clearInterval(timerIntervalRef.current)
        spawnIntervalRef.current = null
        timerIntervalRef.current = null
        endGameRef.current?.()
      }
    }, 1000)
  }, [gameTime, spawnTarget, setTargets])

  startGameRef.current = startGame

  const endGameRef = useRef(() => {})

  // End game and analyze results
  const endGame = useCallback(() => {
    if (finishingRef.current) return
    finishingRef.current = true

    if (spawnIntervalRef.current) {
      clearInterval(spawnIntervalRef.current)
      spawnIntervalRef.current = null
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    setTestState('analyzing')
    setTargets([])

    const finish = () => {
      try {
        const { totalHits, totalMisses, reactionTime, missedTargets, spawnedByQuadrant, totalSpawned } = gameStateRef.current

        const missedByQuadrant = {}
        Object.keys(QUADRANTS).forEach(q => {
          missedByQuadrant[q] = 0
        })

        missedTargets.forEach(target => {
          missedByQuadrant[target.quadrant]++
        })

        const deficits = []
        const totalTargets = totalSpawned > 0 ? totalSpawned : totalHits + totalMisses

        Object.entries(missedByQuadrant).forEach(([quadrant, misses]) => {
          const quadrantTotal = spawnedByQuadrant[quadrant] || 0
          const denominator = quadrantTotal > 0 ? quadrantTotal : totalTargets
          const missRate = denominator > 0 ? (misses / denominator) * 100 : 0
          if (missRate > 30) {
            deficits.push({
              quadrant: QUADRANTS[quadrant].label,
              missRate: Math.round(missRate),
              spawned: quadrantTotal,
              misses,
              severity: missRate > 50 ? 'severe' : 'moderate'
            })
          }
        })

        const hitRate = totalTargets > 0 ? (totalHits / totalTargets) * 100 : 0
        const avgReactionTime = totalHits > 0 ? reactionTime / totalHits : 0
        const overallScore = scorePeripheralAwareness(hitRate, avgReactionTime)
        const allTrials = gameStateRef.current.trials || []
        const fitTrials = allTrials.filter((t) => !t.gazeOff)
        const hitFit = fitHitRateVsEccentricity(fitTrials)
        const rtFit = fitReactionTimeVsEccentricity(fitTrials)
        setEccFit({ trials: fitTrials, hitFit, rtFit, fixationLosses: allTrials.length - fitTrials.length })

        setPeripheralDeficits(deficits)
        setFieldScore(overallScore)
        setReactionTime(Math.round(avgReactionTime))
        setTotalHits(totalHits)
        setTotalMisses(totalMisses)

        submitResults({
          score: overallScore,
          totalHits,
          totalMisses,
          avgReactionTime: Math.round(avgReactionTime),
          deficits,
          hitRate: Math.round(hitRate),
          trials: allTrials,
          hitFit,
          rtFit,
        })
      } catch (err) {
        console.error('Failed to score peripheral test:', err)
        setFieldScore(0)
      } finally {
        stopCamera()
        setTestState('results')
      }
    }

    window.setTimeout(finish, 600)
  }, [stopCamera, setTargets])

  endGameRef.current = endGame

  // Submit results to backend
  const submitResults = async (results) => {
    try {
      await visionTestAPI.submit({
        test_type: 'peripheral_awareness',
        score: results.score,
        test_details: {
          total_hits: results.totalHits,
          total_misses: results.totalMisses,
          hit_rate: results.hitRate,
          avg_reaction_time: results.avgReactionTime,
          peripheral_deficits: results.deficits,
          method: 'eccentricity_psychometric',
          method_version: 2,
          hit_rate_fit: results.hitFit,
          reaction_time_fit: results.rtFit,
          trials: results.trials.map((t) => ({
            ecc_deg: Number(t.ecc.toFixed(1)),
            direction: t.direction,
            hit: t.hit,
            rt_ms: t.rt,
            gaze_off: !!t.gazeOff,
          })),
          fixation_losses: results.trials.filter((t) => t.gazeOff).length,
          viewing_distance_mm_assumed: VIEW_MM,
          screen_scale_source: screenScaleRef.current.source,
          scoring_note:
            'Score = 0.7 × hit rate + 0.3 × reaction-time score (unchanged game score). Hit rate vs eccentricity is fitted with a logistic function (lapse 3%) and reaction time with a Theil–Sen line; slopes are reported, not scored.',
          timestamp: new Date().toISOString()
        }
      })
    } catch (err) {
      console.error('Failed to submit results:', err)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  // Render instructions
  const renderInstructions = () => (
    <div className="test-shell">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/vision-tests')}
          className="mb-6 flex items-center text-green-600 hover:text-green-700 font-medium"
        >
          ← Back to Tests
        </button>

        <div className="test-panel p-8 md:p-12">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <h1 className="page-title mb-2">Peripheral Vision Trainer</h1>
            <p className="text-xl text-gray-600">Side-awareness reaction game</p>
          </div>

          <div className="bg-green-50 border-l-4 border-green-600 p-6 mb-8 rounded-r-xl">
            <h2 className="text-lg font-bold text-green-900 mb-2">What This Tests</h2>
            <p className="text-green-800">
              Your <strong>side awareness</strong> matters for sports and walking in crowds.
              This game checks whether you can tap edge targets while looking at the center.
              It is <strong>not</strong> a visual-field test and cannot detect or rule out any eye or neurological condition.
            </p>
          </div>

          <div className="space-y-6 mb-8">
            <h3 className="text-2xl font-bold text-gray-900">How to Play:</h3>
            
            <div className="grid gap-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600 font-bold text-xl">1</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Keep Eyes on Center RED DOT</h4>
                  <p className="text-gray-600">Stare at the center red dot. A CYAN DOT shows where you're looking. Keep it inside the GREEN CIRCLE!</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600 font-bold text-xl">2</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Use Peripheral Vision</h4>
                  <p className="text-gray-600">Orange targets appear around screen edges. Tap them WITHOUT moving your eyes from center!</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold text-sm">
                  !
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Cheating = Penalty!</h4>
                  <p className="text-gray-600">
                    <span className="font-bold text-red-600">If cyan dot leaves green circle when you click: -5 points + miss!</span>
                    <br />The eye tracker will turn RED and pulse when you're in penalty zone.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600 font-bold text-xl">4</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">60 Seconds</h4>
                  <p className="text-gray-600">Score points, level up, and test your peripheral awareness!</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-accent-50 border border-accent-200 p-6 mb-8 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-12 h-12 bg-cyan-400 rounded-full flex items-center justify-center animate-pulse">
                <span className="text-white font-bold text-xl">👁️</span>
              </div>
              <div>
                <h4 className="font-bold text-cyan-900 mb-2 text-lg">Eye Tracker Visual Guide:</h4>
                <ul className="text-cyan-800 space-y-1 text-sm">
                  <li>• <span className="font-semibold text-cyan-600">CYAN DOT</span> = Where your eyes are looking (follows your gaze)</li>
                  <li>• <span className="font-semibold text-green-600">GREEN CIRCLE</span> = Safe zone (keep cyan dot inside)</li>
                  <li>• <span className="font-semibold text-red-600">RED DOT</span> = Center fixation point (stare at this)</li>
                  <li>• <span className="font-semibold text-red-600">RED PULSING</span> = Penalty zone! Your eyes left the center!</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-8 rounded-r-xl">
            <p className="text-red-900 font-semibold">
              <strong>ANTI-CHEAT:</strong> Watch the cyan tracking dot - it shows exactly where you're looking in real-time. 
              If it leaves the green circle when you tap a target, you'll lose 5 points and it counts as a miss!
            </p>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-8">
            <h3 className="font-bold text-emerald-900 mb-3">Perfect For:</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl mb-2 font-bold text-emerald-600">ELDERLY</div>
                <h4 className="font-bold text-emerald-900 mb-1">Elderly</h4>
                <p className="text-sm text-emerald-800">Fall prevention & safety</p>
              </div>
              <div className="text-center">
                <div className="text-3xl mb-2 font-bold text-emerald-600">ATHLETES</div>
                <h4 className="font-bold text-emerald-900 mb-1">Athletes</h4>
                <p className="text-sm text-emerald-800">Reaction time training</p>
              </div>
              <div className="text-center">
                <div className="text-3xl mb-2 font-bold text-emerald-600">DRIVERS</div>
                <h4 className="font-bold text-emerald-900 mb-1">Drivers</h4>
                <p className="text-sm text-emerald-800">Hazard detection skills</p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-600 p-4 mb-8 rounded-r-xl">
            <p className="text-yellow-900">
              <strong>Note:</strong> Targets appear at different distances from the centre, and your results show how
              catch rate and reaction time change with that distance. If you keep missing one side over several games,
              mention it at your next eye exam — this game can&apos;t test your visual field.
            </p>
          </div>

          <div className="text-center">
            <button
              onClick={() => {
                setTestState('setup')
                initializeCamera()
              }}
              className="btn-primary px-8 py-4 text-xl"
            >
              Start Peripheral Test
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // Render setup
  const renderSetup = () => (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-4">Enable Eye Tracking</h2>
        <p className="text-gray-400 mb-6">Position your face so your eyes are clearly visible</p>

        <div className="relative mb-6 min-h-[240px]" />

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => {
              stopCamera()
              setTestState('instructions')
            }}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-full font-semibold"
          >
            Cancel
          </button>
          
          <button
            onClick={startCalibration}
            disabled={!cameraReady}
            className={`px-8 py-3 rounded-full font-semibold ${
              cameraReady
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gray-600 cursor-not-allowed opacity-50'
            }`}
          >
            {cameraReady ? 'Start Game' : 'Initializing Camera...'}
          </button>
        </div>
      </div>
    </div>
  )

  const renderCalibrating = () => (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-bold mb-2">Calibrating gaze</h2>
        <p className="text-gray-400 mb-6">Keep your eyes on the center red dot</p>
        <div className="w-full bg-gray-700 rounded-full h-3 mb-4">
          <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${calibrationProgress}%` }} />
        </div>
        <p className="text-sm text-gray-500">{calibrationProgress}%</p>
      </div>
    </div>
  )

  // Render game
  const renderPlaying = () => (
    <div ref={playAreaRef} className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
      {/* HUD */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-20 pointer-events-none">
        <div className="bg-black/50 backdrop-blur-sm rounded-xl p-4 pointer-events-auto">
          <div className="text-3xl font-bold text-yellow-400">{score}</div>
          <div className="text-xs text-gray-400">SCORE</div>
        </div>

        <div className={`px-4 py-2 rounded-full text-sm font-semibold pointer-events-auto ${
          isLookingCenter ? 'bg-green-500/80 text-white' : 'bg-red-500/80 text-white'
        }`}>
          {isLookingCenter ? 'Eyes on center' : 'Look at center'}
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="bg-black/50 backdrop-blur-sm rounded-xl p-4">
            <div className="text-3xl font-bold text-blue-400">{remainingTime}s</div>
            <div className="text-xs text-gray-400">TIME</div>
          </div>
          <div className="bg-black/50 backdrop-blur-sm rounded-xl p-4">
            <div className="text-3xl font-bold text-purple-400">L{level}</div>
            <div className="text-xs text-gray-400">LEVEL</div>
          </div>
          <button
            type="button"
            onClick={() => endGameRef.current?.()}
            className="bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3 text-sm font-semibold min-h-[44px]"
          >
            Finish
          </button>
        </div>
      </div>

      {/* Center fixation + safe zone at calibrated position */}
      <div
        className="absolute z-10 pointer-events-none"
        style={{
          left: `${centerDisplay.x * 100}%`,
          top: `${centerDisplay.y * 100}%`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Outer warning zone */}
        <div className="absolute w-48 h-48 border-2 border-red-500/20 rounded-full -translate-x-1/2 -translate-y-1/2" />
        
        {/* Center detection zone (safe zone) */}
        <div className={`absolute w-32 h-32 border-4 rounded-full -translate-x-1/2 -translate-y-1/2 transition-all ${
          isLookingCenter 
            ? 'border-green-500/60 shadow-[0_0_30px_rgba(34,197,94,0.5)]' 
            : 'border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.5)] animate-pulse'
        }`} />
        
        {/* Fixation point */}
        <div className="w-6 h-6 bg-red-600 rounded-full shadow-lg animate-pulse" />
      </div>

      {/* GAZE TRACKER - Shows where your eyes are looking */}
      <div 
        className={`absolute w-12 h-12 rounded-full pointer-events-none z-30 transition-all duration-75 ${
          isLookingCenter ? 'opacity-60' : 'opacity-100'
        }`}
        style={{
          left: `${eyePosition.x * 100}%`,
          top: `${eyePosition.y * 100}%`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Outer glow ring */}
        <div className={`absolute inset-0 rounded-full ${
          isLookingCenter 
            ? 'bg-cyan-400/30 shadow-[0_0_40px_rgba(34,211,238,0.8)]' 
            : 'bg-red-500/40 shadow-[0_0_40px_rgba(239,68,68,0.9)] animate-ping'
        }`} />
        
        {/* Middle ring */}
        <div className={`absolute inset-2 rounded-full border-4 ${
          isLookingCenter ? 'border-cyan-400' : 'border-red-500'
        }`} />
        
        {/* Inner dot */}
        <div className={`absolute inset-4 rounded-full ${
          isLookingCenter ? 'bg-cyan-400' : 'bg-red-500'
        }`} />
        
        {/* Crosshair */}
        <div className={`absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 ${
          isLookingCenter ? 'text-cyan-400' : 'text-red-500'
        }`}>
          <div className="absolute w-3 h-px bg-current -left-1.5 top-0" />
          <div className="absolute w-px h-3 bg-current left-0 -top-1.5" />
        </div>
      </div>

      {/* Eye tracking info overlay */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 text-xs text-gray-300 z-10 space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-bold">Eye Tracker Active: {isLookingCenter ? 'VALID ✓' : 'PENALTY ZONE [WARNING]'}</span>
        </div>
        <div className="text-[10px] text-gray-400 font-mono">
          Position: X={eyePosition.x.toFixed(2)} Y={eyePosition.y.toFixed(2)}
        </div>
      </div>

      {/* Targets */}
      {targets.map(target => (
        <button
          key={target.id}
          onClick={() => handleTargetTap(target.id)}
          className="absolute w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full shadow-2xl transform transition-all hover:scale-110 animate-pulse border-4 border-white"
          style={{
            left: `${target.x * 100}%`,
            top: `${target.y * 100}%`,
            transform: 'translate(-50%, -50%)'
          }}
        />
      ))}

      {/* Hidden camera (shown in setup, hidden during game) */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )

  // Render analyzing
  const renderAnalyzing = () => (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="relative w-48 h-48 mx-auto mb-8">
          <div className="absolute inset-0 border-4 border-green-600 rounded-full animate-spin" style={{ borderTopColor: 'transparent' }} />
          <div className="absolute inset-4 border-4 border-emerald-500 rounded-full animate-spin" style={{ borderTopColor: 'transparent', animationDirection: 'reverse' }} />
          
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 bg-green-600 rounded-full"></div>
          </div>
        </div>

        <h2 className="text-3xl font-bold mb-4">Analyzing Visual Field</h2>
        <p className="text-gray-400">Mapping peripheral awareness...</p>
      </div>
    </div>
  )

  // Render results
  const renderResults = () => {
    const getScoreColor = (score) => {
      if (score >= 80) return 'text-green-600'
      if (score >= 60) return 'text-yellow-600'
      if (score >= 40) return 'text-orange-600'
      return 'text-red-600'
    }

    const getScoreBg = (score) => {
      if (score >= 80) return 'bg-green-100 border-green-300'
      if (score >= 60) return 'bg-yellow-100 border-yellow-300'
      if (score >= 40) return 'bg-orange-100 border-orange-300'
      return 'bg-red-100 border-red-300'
    }

    return (
      <div className="test-shell">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/vision-tests')}
            className="mb-6 flex items-center text-green-600 hover:text-green-700 font-medium"
          >
            ← Back to Tests
          </button>

          <div className="test-panel p-8 md:p-12">
            <div className="text-center mb-8">
              <div className="text-4xl font-bold mb-4 text-gray-700">
                {fieldScore >= 80 ? 'EXCELLENT' : fieldScore >= 60 ? 'GOOD' : fieldScore >= 40 ? 'FAIR' : 'NEEDS ATTENTION'}
              </div>
              <h1 className="page-title mb-2">Peripheral Vision Results</h1>
            </div>

            {/* Main score */}
            <div className={`border-2 rounded-2xl p-8 mb-8 text-center ${getScoreBg(fieldScore)}`}>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">SIDE AWARENESS SCORE</h3>
              <div className={`text-7xl font-bold ${getScoreColor(fieldScore)} mb-4`}>
                {fieldScore}
              </div>
              <p className="text-lg font-semibold text-gray-700">
                {fieldScore >= 80 ? 'Excellent Peripheral Awareness!' :
                 fieldScore >= 60 ? 'Good - Some room for improvement' :
                 fieldScore >= 40 ? 'Moderate - try again when rested' :
                 'Low this game - check your setup and try again'}
              </p>
            </div>

            {/* Stats */}
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <div className="bg-blue-50 rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-blue-600 mb-2">{totalHits}</div>
                <div className="text-sm text-blue-800">Targets Hit</div>
              </div>
              <div className="bg-purple-50 rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-purple-600 mb-2">{totalMisses}</div>
                <div className="text-sm text-purple-800">Targets Missed</div>
              </div>
              <div className="bg-indigo-50 rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-indigo-600 mb-2">{reactionTime}ms</div>
                <div className="text-sm text-indigo-800">Avg Reaction Time</div>
              </div>
            </div>

            {eccFit && eccFit.trials.length > 0 && (
              <div className="rounded-2xl border border-gray-200 p-6 mb-8">
                <h3 className="text-lg font-bold text-gray-900 mb-1">Side awareness vs distance from centre</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Green: share of targets caught (dots = groups, line = fitted curve). Purple: reaction time of each catch
                  (dashed = trend).
                </p>
                <EccentricityChart trials={eccFit.trials} hitFit={eccFit.hitFit} rtFit={eccFit.rtFit} />
                <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <div className="font-bold text-emerald-900">
                      {eccFit.hitFit ? `${eccFit.hitFit.slopePctPerDeg > 0 ? '+' : ''}${eccFit.hitFit.slopePctPerDeg}% per degree` : 'Not enough targets'}
                    </div>
                    <div className="text-emerald-800 text-xs">
                      {eccFit.hitFit
                        ? eccFit.hitFit.e50Deg != null
                          ? `Catch rate fell to 50% at about ${eccFit.hitFit.e50Deg}° from centre.`
                          : `You caught most targets across the whole range (${eccFit.hitFit.rangeDeg[0]}–${eccFit.hitFit.rangeDeg[1]}°).`
                        : 'Play the full 60 seconds for a fit.'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-indigo-50 p-3">
                    <div className="font-bold text-indigo-900">
                      {eccFit.rtFit ? `${eccFit.rtFit.slopeMsPerDeg > 0 ? '+' : ''}${eccFit.rtFit.slopeMsPerDeg} ms per degree` : 'Not enough catches'}
                    </div>
                    <div className="text-indigo-800 text-xs">
                      {eccFit.rtFit ? `Reaction-time change with distance from centre (median ${eccFit.rtFit.medianRtMs} ms).` : 'Reaction-time trend needs at least 6 catches.'}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Degrees assume you sat about 50 cm from the screen
                  {screenScaleRef.current.source === 'default' ? ' and a typical screen size' : ''}. Compare your slopes
                  between sessions on the same setup.
                  {eccFit.fixationLosses > 0 && ` ${eccFit.fixationLosses} tap${eccFit.fixationLosses === 1 ? '' : 's'} made while looking away were left out.`}
                </p>
              </div>
            )}

            {peripheralDeficits.length > 0 && (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-6 mb-8 rounded-r-xl">
                <h3 className="text-lg font-bold text-amber-900 mb-3">Directions with more misses</h3>
                <p className="text-amber-800 mb-4">
                  You missed more targets in these directions this time:
                </p>
                <ul className="space-y-2">
                  {peripheralDeficits.map((deficit, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        deficit.severity === 'severe' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'
                      }`}>
                        {deficit.severity.toUpperCase()}
                      </span>
                      <span className="font-semibold">{deficit.quadrant}</span>
                      <span className="text-sm text-red-700">({deficit.missRate}% miss rate)</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm text-amber-900">
                  Misses can come from looking away, screen position or chance. If the same side keeps coming up over
                  several games, mention it at your next eye exam — this game cannot test your visual field.
                </p>
              </div>
            )}

            {peripheralDeficits.length === 0 && (
              <div className="bg-green-50 border-l-4 border-green-600 p-6 mb-8 rounded-r-xl">
                <h3 className="text-lg font-bold text-green-900 mb-2">No direction stood out</h3>
                <p className="text-green-800">
                  Misses were spread evenly this game. This is a reaction game, not a visual-field test, so it
                  can&apos;t rule out field loss.
                </p>
              </div>
            )}

            <SamdDisclaimer testType="peripheral_awareness" className="mb-6" />

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => setTestState('instructions')}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold"
              >
                Play Again
              </button>
              <button
                onClick={() => navigate('/vision-tests')}
                className="flex-1 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main render
  return (
    <div className="relative">
      {/* Persistent camera feed - always rendering but only visible in setup */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={testState === 'setup' || testState === 'calibrating' ? 'w-full max-w-2xl mx-auto rounded-2xl' : 'fixed top-0 left-0 w-[640px] h-[480px] opacity-0 pointer-events-none'}
      />
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Render appropriate state */}
      {testState === 'instructions' && renderInstructions()}
      {testState === 'setup' && renderSetup()}
      {testState === 'calibrating' && renderCalibrating()}
      {testState === 'playing' && renderPlaying()}
      {testState === 'analyzing' && renderAnalyzing()}
      {testState === 'results' && renderResults()}
    </div>
  )
}

export default PeripheralAwarenessTest
