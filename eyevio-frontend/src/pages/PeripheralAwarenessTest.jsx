import { useState, useEffect, useCallback, useRef } from 'react'
import cameraManager from '../utils/cameraManager.js'
import { useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import EyeTracker from '../utils/eyeTracker'

/**
 * Peripheral Awareness Trainer - Gamified Visual Field Test
 * 
 * "Whack-a-Mole" style game that tests peripheral vision while 
 * ensuring eyes stay centered (glaucoma/field deficit detection)
 * 
 * Perfect for elderly (fall prevention) and athletes (reaction time)
 */

const PeripheralAwarenessTest = () => {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const eyeTracker = useRef(null)
  const calibrationCenter = useRef({ x: 0.5, y: 0.5 })
  const gameStateRef = useRef({
    totalHits: 0,
    totalMisses: 0,
    reactionTime: 0,
    missedTargets: []
  })

  const [testState, setTestState] = useState('instructions') // instructions, setup, calibrating, playing, results
  const [cameraReady, setCameraReady] = useState(false)
  
  // Game state
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [gameTime, setGameTime] = useState(60) // 60 seconds
  const [remainingTime, setRemainingTime] = useState(60)
  const [targets, setTargets] = useState([])
  const [missedTargets, setMissedTargets] = useState([])
  const [eyePosition, setEyePosition] = useState({ x: 0.5, y: 0.5 }) // 0-1 normalized
  const [isLookingCenter, setIsLookingCenter] = useState(true)
  
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
  const handleGazeUpdate = useCallback((gazeData) => {
    setEyePosition({ x: gazeData.x, y: gazeData.y })
    
    // Check if looking at center (relative to calibrated position)
    const centerTolerance = 0.15 // Reasonable tolerance for accurate tracking
    const distFromCenter = Math.sqrt(
      (gazeData.x - calibrationCenter.current.x) ** 2 + 
      (gazeData.y - calibrationCenter.current.y) ** 2
    )
    setIsLookingCenter(distFromCenter < centerTolerance)
  }, [])

  // Stop camera and eye tracking
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      try { cameraManager.release() } catch (e) { try { streamRef.current.getTracks().forEach(track => track.stop()) } catch (err) {} }
      streamRef.current = null
    }
    if (eyeTracker.current) {
      eyeTracker.current.stop()
    }
    setCameraReady(false)
  }, [])

  // Spawn new target
  const spawnTarget = useCallback(() => {
    const quadrantKeys = Object.keys(QUADRANTS)
    const randomQuadrant = quadrantKeys[Math.floor(Math.random() * quadrantKeys.length)]
    const quadrant = QUADRANTS[randomQuadrant]

    // Add some randomness to position
    const jitter = 0.05
    const target = {
      id: Date.now() + Math.random(),
      x: quadrant.x + (Math.random() - 0.5) * jitter,
      y: quadrant.y + (Math.random() - 0.5) * jitter,
      quadrant: randomQuadrant,
      spawnTime: Date.now(),
      lifetime: Math.max(1000, 2000 - level * 100) // Faster at higher levels
    }

    setTargets(prev => [...prev, target])

    // Auto-remove after lifetime
    setTimeout(() => {
      setTargets(prev => {
        const stillExists = prev.find(t => t.id === target.id)
        if (stillExists) {
          setMissedTargets(prev => [...prev, target])
          setTotalMisses(prev => prev + 1)
          
          // Update ref for endGame
          gameStateRef.current.totalMisses += 1
          gameStateRef.current.missedTargets.push(target)
        }
        return prev.filter(t => t.id !== target.id)
      })
    }, target.lifetime)
  }, [level])

  // Handle target tap
  const handleTargetTap = useCallback((targetId) => {
    setTargets(prev => {
      const target = prev.find(t => t.id === targetId)
      if (target) {
        if (isLookingCenter) {
          // Valid hit - eyes were on center
          const reactionMs = Date.now() - target.spawnTime
          setScore(s => s + (10 * level))
          setTotalHits(h => h + 1)
          setReactionTime(prev => prev + reactionMs)
          
          // Update ref for endGame
          gameStateRef.current.totalHits += 1
          gameStateRef.current.reactionTime += reactionMs
          
          // Level up every 10 hits
          if ((totalHits + 1) % 10 === 0) {
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
        }
      }
      return prev.filter(t => t.id !== targetId)
    })
  }, [isLookingCenter, level, totalHits])

  // Start game
  const startGame = useCallback(() => {
    // Calibrate: Set current position as "center"
    calibrationCenter.current = { ...eyePosition }
    console.log('Calibrated center position:', calibrationCenter.current)
    
    setTestState('playing')
    setScore(0)
    setLevel(1)
    setRemainingTime(gameTime)
    setTargets([])
    setMissedTargets([])
    setTotalHits(0)
    setTotalMisses(0)
    setReactionTime(0)
    
    // Reset ref
    gameStateRef.current = {
      totalHits: 0,
      totalMisses: 0,
      reactionTime: 0,
      missedTargets: []
    }
    
    // MediaPipe eye tracking is already running from camera initialization

    // Spawn targets periodically
    const spawnInterval = setInterval(() => {
      spawnTarget()
    }, Math.max(800, 1500 - level * 50))

    // Game timer
    let timeLeft = gameTime
    const timerInterval = setInterval(() => {
      timeLeft -= 1
      setRemainingTime(timeLeft)

      if (timeLeft <= 0) {
        clearInterval(spawnInterval)
        clearInterval(timerInterval)
        endGame()
      }
    }, 1000)
  }, [gameTime, spawnTarget, level])

  // End game and analyze results
  const endGame = useCallback(() => {
    setTestState('analyzing')
    
    if (eyeTrackingInterval.current) {
      clearInterval(eyeTrackingInterval.current)
    }

    setTimeout(() => {
      // Use ref values to avoid stale closure
      const { totalHits, totalMisses, reactionTime, missedTargets } = gameStateRef.current
      
      // Analyze missed targets by quadrant
      const missedByQuadrant = {}
      Object.keys(QUADRANTS).forEach(q => {
        missedByQuadrant[q] = 0
      })

      missedTargets.forEach(target => {
        missedByQuadrant[target.quadrant]++
      })

      // Identify deficits (quadrants with >30% miss rate)
      const deficits = []
      const totalTargets = totalHits + totalMisses
      
      Object.entries(missedByQuadrant).forEach(([quadrant, misses]) => {
        const missRate = totalTargets > 0 ? (misses / totalTargets) * 100 : 0
        if (missRate > 30) {
          deficits.push({
            quadrant: QUADRANTS[quadrant].label,
            missRate: Math.round(missRate),
            severity: missRate > 50 ? 'severe' : 'moderate'
          })
        }
      })

      // Calculate overall field score
      const hitRate = totalTargets > 0 ? (totalHits / totalTargets) * 100 : 0
      const avgReactionTime = totalHits > 0 ? reactionTime / totalHits : 0
      const reactionScore = Math.max(0, 100 - (avgReactionTime / 10))
      const overallScore = Math.round((hitRate * 0.7 + reactionScore * 0.3))

      setPeripheralDeficits(deficits)
      setFieldScore(overallScore)
      setReactionTime(Math.round(avgReactionTime))
      
      stopCamera()
      setTestState('results')

      // Submit to backend
      submitResults({
        score: overallScore,
        totalHits,
        totalMisses,
        avgReactionTime: Math.round(avgReactionTime),
        deficits,
        hitRate: Math.round(hitRate)
      })
    }, 2000)
  }, [stopCamera])

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
            <p className="text-xl text-gray-600">Gamified Visual Field Assessment</p>
          </div>

          <div className="bg-green-50 border-l-4 border-green-600 p-6 mb-8 rounded-r-xl">
            <h2 className="text-lg font-bold text-green-900 mb-2">What This Tests</h2>
            <p className="text-green-800">
              Your <strong>peripheral vision</strong> is crucial for safety, spatial awareness, and reaction time. 
              This fun "Whack-a-Mole" game tests your ability to detect targets <strong>without looking at them directly</strong>, 
              helping identify early visual field deficits from glaucoma, retinal damage, or neurological issues.
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

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 font-bold text-xl">[WARNING]</span>
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
              <strong>Warning:</strong> If you consistently miss targets in one corner, it may indicate 
              a visual field deficit that requires professional evaluation.
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

        <div className="relative mb-6">
          <div id="video-container"></div>
        </div>

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
            onClick={startGame}
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

  // Render game
  const renderPlaying = () => (
    <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden">
      {/* HUD */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10">
        <div className="bg-black/50 backdrop-blur-sm rounded-xl p-4">
          <div className="text-3xl font-bold text-yellow-400">{score}</div>
          <div className="text-xs text-gray-400">SCORE</div>
        </div>

        <div className="bg-black/50 backdrop-blur-sm rounded-xl p-4">
          <div className="text-3xl font-bold text-blue-400">{remainingTime}s</div>
          <div className="text-xs text-gray-400">TIME</div>
        </div>

        <div className="bg-black/50 backdrop-blur-sm rounded-xl p-4">
          <div className="text-3xl font-bold text-purple-400">L{level}</div>
          <div className="text-xs text-gray-400">LEVEL</div>
        </div>
      </div>

      {/* Eye tracking status */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className={`px-4 py-2 rounded-full text-sm font-semibold ${
          isLookingCenter 
            ? 'bg-green-500/80 text-white' 
            : 'bg-red-500/80 text-white'
        }`}>
          {isLookingCenter ? 'Eyes on Center ✓' : 'Look at Center!'}
        </div>
      </div>

      {/* Center fixation point */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
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
              <h3 className="text-sm font-semibold text-gray-700 mb-2">VISUAL FIELD SCORE</h3>
              <div className={`text-7xl font-bold ${getScoreColor(fieldScore)} mb-4`}>
                {fieldScore}
              </div>
              <p className="text-lg font-semibold text-gray-700">
                {fieldScore >= 80 ? 'Excellent Peripheral Awareness!' :
                 fieldScore >= 60 ? 'Good - Some room for improvement' :
                 fieldScore >= 40 ? 'Moderate - Consider professional check' :
                 'Concerning - Seek professional evaluation'}
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

            {/* Visual field deficits */}
            {peripheralDeficits.length > 0 && (
              <div className="bg-red-50 border-l-4 border-red-600 p-6 mb-8 rounded-r-xl">
                <h3 className="text-lg font-bold text-red-900 mb-3">WARNING: Potential Visual Field Deficits Detected</h3>
                <p className="text-red-800 mb-4">
                  You consistently missed targets in the following areas:
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
                <p className="mt-4 text-sm text-red-900 font-semibold">
                  RECOMMENDATION: Consult an ophthalmologist for comprehensive visual field testing.
                </p>
              </div>
            )}

            {peripheralDeficits.length === 0 && (
              <div className="bg-green-50 border-l-4 border-green-600 p-6 mb-8 rounded-r-xl">
                <h3 className="text-lg font-bold text-green-900 mb-2">No Deficits Detected</h3>
                <p className="text-green-800">
                  Your peripheral vision appears healthy across all quadrants. Keep up the good work!
                </p>
              </div>
            )}

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
        className={testState === 'setup' ? 'w-full max-w-2xl mx-auto rounded-2xl' : 'fixed top-0 left-0 w-1 h-1 opacity-0 pointer-events-none'}
        style={testState !== 'setup' ? { width: '1px', height: '1px' } : {}}
      />
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Render appropriate state */}
      {testState === 'instructions' && renderInstructions()}
      {testState === 'setup' && renderSetup()}
      {testState === 'playing' && renderPlaying()}
      {testState === 'analyzing' && renderAnalyzing()}
      {testState === 'results' && renderResults()}
    </div>
  )
}

export default PeripheralAwarenessTest
