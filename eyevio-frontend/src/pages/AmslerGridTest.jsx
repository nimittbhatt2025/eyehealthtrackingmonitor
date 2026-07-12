import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCalibration } from '../context/CalibrationContext'
import InlineDistanceCalibration from '../components/InlineDistanceCalibration'
import { VisionTestShell } from '../components/TestPrepLayout'
import EyeCoverageVerification from '../components/EyeCoverageVerification'
import { visionTestAPI } from '../services/api'

/**
 * Clinical-Grade Amsler Grid Test
 * 
 * CLINICAL STANDARDS IMPLEMENTED:
 * - Pure white background (#FFFFFF)
 * - Pure black grid lines (#000000), 2px thick, sharp edges
 * - 10×10 grid (clinical standard)
 * - Red center fixation dot (#FF0000), 8px diameter
 * - 500×500px fixed size
 * - 355mm (14") viewing distance (near vision/reading distance)
 * - No anti-aliasing, no blur, no gradients
 * - Brightness verification screen
 * - Distance calibration required
 * - Monocular testing with proper eye coverage
 * - Distortion marking capability
 */

const AmslerGridTest = () => {
  const navigate = useNavigate()
  const { isCalibrated } = useCalibration()
  
  // Test flow states
  const [testState, setTestState] = useState('distance-gate') // distance-gate  brightness-check  instructions  eye-coverage-setup  testing  marking  switch-eyes  results
  const [distanceValid, setDistanceValid] = useState(false)
  const [brightnessConfirmed, setBrightnessConfirmed] = useState(false)
  const [currentEye, setCurrentEye] = useState('left')
  
  // Test data
  const [distortions, setDistortions] = useState({
    left: { hasIssues: null, marks: [], notes: '' },
    right: { hasIssues: null, marks: [], notes: '' }
  })
  
  // Canvas refs and state
  const canvasRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const containerRef = useRef(null)
  const [canvasSize] = useState({ width: 500, height: 500 }) // Fixed 500×500px
  
  // Annotation state
  const [annotationMode, setAnnotationMode] = useState('wavy') // 'wavy' or 'blackout'
  const [isAnnotating, setIsAnnotating] = useState(false)
  const [brushSize, setBrushSize] = useState(15)
  const [lastPoint, setLastPoint] = useState(null)
  const [cursorPosition, setCursorPosition] = useState(null)
  const [showCursor, setShowCursor] = useState(false)
  
  // Draw Clinical-Standard 10×10 Amsler Grid
  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    const { width, height } = canvasSize
    
    if (width === 0 || height === 0) return

    // CLINICAL STANDARD: Pure white background (#FFFFFF)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, width, height)

    // CLINICAL STANDARD: Pure black grid lines (#000000), 2px, sharp edges
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    ctx.imageSmoothingEnabled = false // Disable anti-aliasing
    
    const gridLines = 10 // 10×10 grid (clinical standard)
    const cellSize = width / gridLines

    // Draw vertical lines
    for (let i = 0; i <= gridLines; i++) {
      const x = Math.round(i * cellSize)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    
    // Draw horizontal lines
    for (let i = 0; i <= gridLines; i++) {
      const y = Math.round(i * cellSize)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    // CLINICAL STANDARD: Red center fixation dot (#FF0000), 8px diameter
    const centerX = Math.round(width / 2)
    const centerY = Math.round(height / 2)
    const dotRadius = 4 // 8px diameter circle
    
    ctx.fillStyle = '#FF0000'
    ctx.beginPath()
    ctx.arc(centerX, centerY, dotRadius, 0, 2 * Math.PI)
    ctx.fill()
  }, [canvasSize])
  
  // Draw user annotations
  const drawAnnotations = useCallback(() => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    const { width, height } = canvasSize
    
    // Clear overlay
    ctx.clearRect(0, 0, width, height)
    
    const marks = distortions[currentEye].marks
    if (!marks || marks.length === 0) return
    
    marks.forEach((mark, index) => {
      const x = mark.x * width
      const y = mark.y * height
      
      if (mark.type === 'wavy') {
        // Yellow circles for distortion/wavy lines
        ctx.shadowBlur = 8
        ctx.shadowColor = 'rgba(255, 215, 0, 0.6)'
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)'
        ctx.fillStyle = 'rgba(255, 255, 0, 0.15)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(x, y, brushSize, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()
        ctx.shadowBlur = 0
        
      } else if (mark.type === 'blackout') {
        // Red filled circles for scotomas/blind spots
        ctx.shadowBlur = 10
        ctx.shadowColor = 'rgba(255, 0, 0, 0.6)'
        ctx.fillStyle = 'rgba(255, 0, 0, 0.6)'
        ctx.beginPath()
        ctx.arc(x, y, brushSize, 0, 2 * Math.PI)
        ctx.fill()
        ctx.shadowBlur = 0
        
        // Border
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, brushSize, 0, 2 * Math.PI)
        ctx.stroke()
      }
      
      // Connect marks for smooth painting
      if (index > 0 && mark.type === marks[index - 1].type) {
        const prevMark = marks[index - 1]
        const timeDiff = mark.timestamp - prevMark.timestamp
        
        if (timeDiff < 100) {
          const prevX = prevMark.x * width
          const prevY = prevMark.y * height
          
          if (mark.type === 'wavy') {
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)'
            ctx.lineWidth = brushSize * 2
          } else {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
            ctx.lineWidth = brushSize * 2
          }
          
          ctx.beginPath()
          ctx.moveTo(prevX, prevY)
          ctx.lineTo(x, y)
          ctx.stroke()
        }
      }
    })
  }, [canvasSize, distortions, currentEye, brushSize])
  
  // Initialize grid on mount
  useEffect(() => {
    if (testState === 'testing' || testState === 'marking') {
      drawGrid()
    }
  }, [testState, drawGrid])
  
  // Update annotations when marks change
  useEffect(() => {
    if (testState === 'marking') {
      drawAnnotations()
    }
  }, [drawAnnotations, testState, distortions])
  
  // Mouse/touch handlers for annotation
  const handleAnnotationStart = (e) => {
    if (testState !== 'marking') return
    
    setIsAnnotating(true)
    const point = getCanvasPoint(e)
    if (point) {
      addMark(point)
      setLastPoint(point)
    }
  }
  
  const handleAnnotationMove = (e) => {
    const point = getCanvasPoint(e)
    setCursorPosition(point)
    
    if (testState !== 'marking') return
    
    if (isAnnotating && point) {
      addMark(point)
      setLastPoint(point)
    }
  }
  
  const handleAnnotationEnd = () => {
    setIsAnnotating(false)
    setLastPoint(null)
  }
  
  const getCanvasPoint = (e) => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return null
    
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX || (e.touches && e.touches[0]?.clientX)
    const clientY = e.clientY || (e.touches && e.touches[0]?.clientY)
    
    if (clientX === undefined || clientY === undefined) return null
    
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    
    return { x, y }
  }
  
  const addMark = (point) => {
    const newMark = {
      x: point.x,
      y: point.y,
      type: annotationMode,
      timestamp: Date.now()
    }
    
    setDistortions(prev => ({
      ...prev,
      [currentEye]: {
        ...prev[currentEye],
        marks: [...prev[currentEye].marks, newMark]
      }
    }))
  }
  
  const clearMarks = () => {
    setDistortions(prev => ({
      ...prev,
      [currentEye]: {
        ...prev[currentEye],
        marks: []
      }
    }))
  }
  
  const undoLastMark = () => {
    setDistortions(prev => ({
      ...prev,
      [currentEye]: {
        ...prev[currentEye],
        marks: prev[currentEye].marks.slice(0, -10) // Remove last 10 marks (~ one stroke)
      }
    }))
  }
  
  const submitTest = async () => {
    try {
      // Calculate score based on whether issues were detected
      const leftHasIssues = distortions.left.hasIssues === true
      const rightHasIssues = distortions.right.hasIssues === true
      const anyIssues = leftHasIssues || rightHasIssues
      
      const payload = {
        test_type: 'amsler_grid',
        score: anyIssues ? 50 : 100,
        test_details: {
          left_eye_issues: leftHasIssues,
          right_eye_issues: rightHasIssues,
          left_marks_count: distortions.left.marks.length,
          right_marks_count: distortions.right.marks.length,
          test_distance: '355mm',
          completed: true,
          timestamp: new Date().toISOString()
        }
      }
      
      console.log('Submitting Amsler Grid test:', payload)
      const response = await visionTestAPI.submit(payload)
      console.log('Submission successful:', response.data)
      
      // Navigate to results after successful submission
      setTestState('results')
    } catch (error) {
      console.error('Failed to submit test:', error)
      if (error.response) {
        console.error('Error response:', error.response.data)
        console.error('Error status:', error.response.status)
      }
      alert(`Failed to save test results: ${error.response?.data?.error || error.message || 'Unknown error'}`)
    }
  }
  
  // RENDER FUNCTIONS
  
  const renderDistanceGate = () => (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <InlineDistanceCalibration
          testType="amsler_grid"
          optimalDistanceMM={355}
          toleranceMM={30}
          onDistanceValid={() => {
            setDistanceValid(true)
            setTestState('brightness-check')
          }}
          testName="Amsler Grid Test"
        />
      </div>
    </div>
  )
  
  const renderBrightnessCheck = () => (
    <div className="min-h-screen bg-white flex items-center justify-center p-8">
      <div className="max-w-3xl w-full space-y-8">
        <div className="text-center">
          <h2 className="section-title mb-4">Brightness Check</h2>
          <p className="text-lg text-gray-600">
            Before starting, ensure your screen brightness is appropriate for clinical testing
          </p>
        </div>
        
        {/* Brightness test pattern */}
        <div className="bg-white border-4 border-gray-300 rounded-2xl p-12 space-y-8">
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-gray-900 text-center">Can you see all 10 shades clearly?</h3>
            
            {/* Grayscale gradient test */}
            <div className="flex gap-2 h-24">
              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((shade) => (
                <div
                  key={shade}
                  className="flex-1 border border-gray-300"
                  style={{ backgroundColor: `rgb(${255 - shade * 2.5}, ${255 - shade * 2.5}, ${255 - shade * 2.5})` }}
                />
              ))}
            </div>
            
            {/* Black vs White test */}
            <div className="grid grid-cols-2 gap-4 mt-8">
              <div className="bg-white border-4 border-black p-8 rounded-lg">
                <p className="text-center text-black font-bold text-2xl">Pure White<br/>#FFFFFF</p>
              </div>
              <div className="bg-black border-4 border-white p-8 rounded-lg">
                <p className="text-center text-white font-bold text-2xl">Pure Black<br/>#000000</p>
              </div>
            </div>
          </div>
          
          <div className="bg-accent-50 border border-accent-100 rounded-xl p-6">
            <h4 className="font-bold text-accent-800 mb-3"> Requirements:</h4>
            <ul className="text-sm text-gray-700 space-y-2">
              <li>• You should see all 10 gray shades distinctly</li>
              <li>• Black and white should have maximum contrast</li>
              <li>• No glare or reflections on screen</li>
              <li>• Room lighting should be moderate (not too bright or dark)</li>
              <li>• Adjust screen brightness if needed</li>
            </ul>
          </div>
        </div>
        
        <div className="flex gap-4">
          <button
            onClick={() => setTestState('distance-gate')}
            className="flex-1 btn-secondary min-h-[44px]"
          >
             Back
          </button>
          <button
            onClick={() => {
              setBrightnessConfirmed(true)
              setTestState('instructions')
            }}
            className="flex-1 btn-primary min-h-[44px]"
          >
             Brightness is Good - Continue
          </button>
        </div>
      </div>
    </div>
  )
  
  const renderInstructions = () => (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="card">
        <h1 className="page-title mb-4 text-center">Amsler Grid Test</h1>
        <p className="page-subtitle text-center mb-8">
          Look at a grid of straight lines to check the center of your vision
        </p>

        {/* Quick-start summary so users can begin without reading everything */}
        <div className="bg-brand-gradient text-white rounded-2xl p-6 mb-8">
          <h2 className="font-bold text-lg mb-3">In short</h2>
          <ol className="space-y-2 text-white/90">
            <li><span className="font-bold">1.</span> Cover one eye and stare at the dot in the center.</li>
            <li><span className="font-bold">2.</span> Tell us if any lines look wavy, blurry, or missing.</li>
            <li><span className="font-bold">3.</span> Switch eyes and repeat. Takes about 2 minutes.</li>
          </ol>
          <p className="text-sm text-white/80 mt-3">Want more detail and examples? Keep reading below.</p>
        </div>

        {/* Corrective lens guidance */}
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 mb-8">
          <h3 className="text-xl font-bold text-green-900 mb-3"> Glasses/Contacts: YES, Wear Them</h3>
          <div className="text-sm text-green-800 space-y-2">
            <p className="font-semibold"> DO wear your reading glasses or contacts</p>
            <p className="text-green-700 ml-4">
              This test looks at the back of your eye, not how strong your glasses are. Wearing them keeps the lines sharp so it's easier to spot any that look wavy or missing.
            </p>
          </div>
        </div>
        
        <div className="space-y-6 text-gray-700">
          <div className="bg-accent-50 border border-accent-100 rounded-xl p-6">
            <h3 className="font-bold text-accent-800 mb-3 text-lg"> What This Test Does:</h3>
            <ul className="space-y-2 text-gray-700">
              <li>• Checks the center of your vision (the part you use to read and see faces)</li>
              <li>• Helps you notice wavy lines, blurry spots, or missing areas</li>
              <li>• Lets you track changes over time</li>
              <li>• Each eye is checked on its own, with the other eye covered</li>
            </ul>
          </div>
          
          <div className="bg-brand-soft border border-accent-100 rounded-xl p-6">
            <h3 className="font-bold text-accent-800 mb-3 text-lg"> How It Works:</h3>
            <ol className="space-y-3 text-gray-700">
              <li><span className="font-bold">1. View the Grid:</span> You'll see a 10×10 white grid with black lines and a red center dot</li>
              <li><span className="font-bold">2. Fixate on Center:</span> Stare at the red dot without moving your eyes</li>
              <li><span className="font-bold">3. Check Periphery:</span> While fixating, notice if any grid lines appear wavy, blurred, broken, or missing</li>
              <li><span className="font-bold">4. Mark Issues:</span> If you see distortions, you'll mark them on the grid</li>
              <li><span className="font-bold">5. Switch Eyes:</span> Repeat for other eye</li>
            </ol>
          </div>

          {/* Visual Examples Section */}
          <div className="card">
            <h3 className="font-bold text-gray-900 mb-4 text-xl text-center"> Visual Examples: What to Mark</h3>
            
            <div className="space-y-6">
              {/* Example 1: Wavy Lines (Metamorphopsia) */}
              <div className="bg-white rounded-lg p-5 border-2 border-yellow-300">
                <div className="flex items-start gap-4">
                  <div className="bg-yellow-500 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg flex-shrink-0">1</div>
                  <div className="flex-1">
                    <h4 className="font-bold text-yellow-900 text-lg mb-2">Wavy or Curved Lines</h4>
                    <p className="text-yellow-800 text-sm mb-3">
                      <span className="font-semibold">What it looks like:</span> The grid appears bent, wavy, rippled, or distorted - like looking at a reflection in water or a wrinkled cloth.
                    </p>
                    <p className="text-yellow-800 text-sm mb-3">
                      <span className="font-semibold">Why it matters:</span> Wavy lines can be an early sign of swelling at the back of the eye. It's worth getting checked by an eye doctor.
                    </p>
                    <div className="bg-yellow-100 border border-yellow-400 rounded-lg p-3">
                      <p className="text-yellow-900 font-bold text-sm"> Action: Use the WAVY brush (yellow marker) to circle these areas</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Example 2: Blind Spots (Scotoma) */}
              <div className="bg-white rounded-lg p-5 border-2 border-red-300">
                <div className="flex items-start gap-4">
                  <div className="bg-red-500 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg flex-shrink-0">2</div>
                  <div className="flex-1">
                    <h4 className="font-bold text-red-900 text-lg mb-2">Blind Spots or Missing Parts</h4>
                    <p className="text-red-800 text-sm mb-3">
                      <span className="font-semibold">What it looks like:</span> A section of the grid completely disappears, looks like a dark/gray hole, or the lines simply vanish into the background.
                    </p>
                    <p className="text-red-800 text-sm mb-3">
                      <span className="font-semibold">Why it matters:</span> A missing or dark area can be a sign of damage at the back of the eye. Please have an eye doctor take a look.
                    </p>
                    <div className="bg-red-100 border border-red-400 rounded-lg p-3">
                      <p className="text-red-900 font-bold text-sm"> Action: Use the BLACKOUT brush (red marker) to mark these areas</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Example 3: Normal Peripheral Blur */}
              <div className="bg-white rounded-lg p-5 border-2 border-green-300">
                <div className="flex items-start gap-4">
                  <div className="bg-green-500 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg flex-shrink-0"></div>
                  <div className="flex-1">
                    <h4 className="font-bold text-green-900 text-lg mb-2">Normal: Fuzzy Edges (Don't Mark This!)</h4>
                    <p className="text-green-800 text-sm mb-3">
                      <span className="font-semibold">What it looks like:</span> The outer edges of the grid appear slightly soft, out of focus, or less sharp than the center - but the lines are still STRAIGHT.
                    </p>
                    <p className="text-green-800 text-sm mb-3">
                      <span className="font-semibold">Why this is normal:</span> When you fixate intensely on the center red dot, your peripheral vision naturally has lower resolution. This is how your visual system works.
                    </p>
                    <div className="bg-green-100 border border-green-400 rounded-lg p-3">
                      <p className="text-green-900 font-bold text-sm"> Action: NO MARKING NEEDED - This is perfectly normal!</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Reference Table */}
            <div className="mt-6 bg-white rounded-lg p-4 border-2 border-gray-300">
              <h4 className="font-bold text-gray-900 mb-3 text-center">Quick Reference Guide</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left p-2 font-bold text-gray-900">If the lines look...</th>
                      <th className="text-left p-2 font-bold text-gray-900">It means...</th>
                      <th className="text-left p-2 font-bold text-gray-900">Do I mark it?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr className="bg-yellow-50">
                      <td className="p-2 font-semibold text-yellow-900">Wavy / Bent / Rippled</td>
                      <td className="p-2 text-yellow-800">Possible swelling at back of eye</td>
                      <td className="p-2 font-bold text-yellow-600">YES - Use Wavy Brush</td>
                    </tr>
                    <tr className="bg-red-50">
                      <td className="p-2 font-semibold text-red-900">Missing / Dark Hole / Gone</td>
                      <td className="p-2 text-red-800">Possible damage at back of eye</td>
                      <td className="p-2 font-bold text-red-600">YES - Use Blackout Brush</td>
                    </tr>
                    <tr className="bg-green-50">
                      <td className="p-2 font-semibold text-green-900">Fuzzy / Out of Focus / Soft</td>
                      <td className="p-2 text-green-800">Normal Peripheral Vision</td>
                      <td className="p-2 font-bold text-green-600">NO - Keep staring at dot</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
            <h3 className="font-bold text-red-900 mb-2"> Why this matters:</h3>
            <p className="text-red-800 text-sm">
              Changes in these lines can be an early sign of an eye problem at the back of the eye.
              Checking regularly helps you catch changes early. If you suddenly notice new wavy or missing areas, see an eye doctor right away.
            </p>
          </div>
        </div>
        
        <div className="mt-8 flex gap-4">
          <button
            onClick={() => setTestState('brightness-check')}
            className="flex-1 btn-secondary min-h-[44px]"
          >
             Back
          </button>
          <button
            onClick={() => setTestState('eye-coverage-setup')}
            className="flex-1 btn-primary min-h-[44px]"
          >
            Begin Test 
          </button>
        </div>
      </div>
    </div>
  )
  
  const renderEyeCoverageSetup = () => (
    <div className="max-w-4xl mx-auto">
      <EyeCoverageVerification
        expectedEye={currentEye === 'left' ? 'right' : 'left'}
        onVerified={() => setTestState('testing')}
        onSkip={() => setTestState('testing')}
        testName="Amsler Grid Test"
      />
    </div>
  )
  
  const renderGridCanvas = (interactive = false) => (
    <div className="vision-test-stimulus-inner" ref={containerRef}>
      <div className="relative" style={{ width: canvasSize.width, height: canvasSize.height }}>
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute top-0 left-0"
          style={{ imageRendering: 'pixelated' }}
        />
        <canvas
          ref={overlayCanvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className={`absolute top-0 left-0 ${interactive ? '' : 'pointer-events-none'}`}
          style={{ cursor: interactive ? 'crosshair' : undefined }}
          onMouseDown={interactive ? handleAnnotationStart : undefined}
          onMouseMove={interactive ? handleAnnotationMove : undefined}
          onMouseUp={interactive ? handleAnnotationEnd : undefined}
          onMouseLeave={interactive ? handleAnnotationEnd : undefined}
          onTouchStart={interactive ? handleAnnotationStart : undefined}
          onTouchMove={interactive ? handleAnnotationMove : undefined}
          onTouchEnd={interactive ? handleAnnotationEnd : undefined}
          onMouseEnter={interactive ? () => setShowCursor(true) : undefined}
        />
      </div>
    </div>
  )

  const renderTesting = () => (
    <VisionTestShell
      title={`${currentEye === 'left' ? 'Left' : 'Right'} eye`}
      subtitle="Fixate on the red center dot — 355mm (14″)"
      stimulus={renderGridCanvas(false)}
      controls={(
        <>
          <div className="text-sm text-gray-700 space-y-2">
            <p className="font-semibold text-gray-900">While fixating on the red dot:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Do all grid lines appear straight?</li>
              <li>Are all squares equal in size?</li>
              <li>Is any area missing, blurry, or distorted?</li>
            </ul>
            <p className="text-xs text-green-800 bg-green-50 rounded-lg p-2 border border-green-200">
              Fuzzy outer edges are normal — only report wavy, bent, or missing lines.
            </p>
          </div>
          <div className="vision-test-controls-actions">
            <button
              type="button"
              onClick={() => {
                setDistortions(prev => ({
                  ...prev,
                  [currentEye]: { ...prev[currentEye], hasIssues: false }
                }))
                if (currentEye === 'left') {
                  setCurrentEye('right')
                  setTestState('switch-eyes')
                } else {
                  submitTest()
                }
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold min-h-[44px]"
            >
              Grid looks normal
            </button>
            <button
              type="button"
              onClick={() => {
                setDistortions(prev => ({
                  ...prev,
                  [currentEye]: { ...prev[currentEye], hasIssues: true }
                }))
                setTestState('marking')
              }}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold min-h-[44px]"
            >
              I see distortions
            </button>
          </div>
        </>
      )}
    />
  )

  const renderMarking = () => (
    <VisionTestShell
      title={`Mark distortions — ${currentEye === 'left' ? 'left' : 'right'} eye`}
      subtitle="Tap or click on affected areas"
      stimulus={renderGridCanvas(true)}
      controls={(
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAnnotationMode('wavy')}
              className={`flex-1 min-w-[120px] px-4 py-2 rounded-xl font-semibold text-sm ${
                annotationMode === 'wavy' ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Wavy lines
            </button>
            <button
              type="button"
              onClick={() => setAnnotationMode('blackout')}
              className={`flex-1 min-w-[120px] px-4 py-2 rounded-xl font-semibold text-sm ${
                annotationMode === 'blackout' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Blind spots
            </button>
          </div>

          <label className="block text-sm font-semibold text-gray-700">
            Brush size: {brushSize}px
            <input
              type="range"
              min="10"
              max="40"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-full mt-1"
            />
          </label>

          <div className="vision-test-controls-actions">
            <div className="flex gap-2">
              <button type="button" onClick={undoLastMark} className="flex-1 btn-secondary min-h-[44px] text-sm">
                Undo
              </button>
              <button type="button" onClick={clearMarks} className="flex-1 btn-secondary min-h-[44px] text-sm">
                Clear
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                if (currentEye === 'left') {
                  setCurrentEye('right')
                  setTestState('switch-eyes')
                } else {
                  submitTest()
                }
              }}
              className="w-full btn-primary min-h-[44px]"
            >
              Done marking
            </button>
          </div>
        </>
      )}
    />
  )

  const renderSwitchEyes = () => (
    <div className="test-shell flex items-center justify-center min-h-[60vh]">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-12 text-center space-y-8">
        <div className="text-6xl mb-4"> ↔️ </div>
        <h2 className="text-4xl font-bold text-gray-900">Switch Eyes</h2>
        <p className="text-xl text-gray-600">
          {currentEye === 'right' 
            ? 'Now testing your RIGHT eye. Cover your LEFT eye.'
            : 'Now testing your LEFT eye. Cover your RIGHT eye.'}
        </p>
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
          <p className="text-blue-800 font-semibold">
            Remember: Keep your eye on the red center dot throughout the test!
          </p>
        </div>
        <button
          onClick={() => setTestState('eye-coverage-setup')}
          className="w-full btn-primary min-h-[44px]"
        >
          Continue to {currentEye === 'right' ? 'Right' : 'Left'} Eye Test 
        </button>
      </div>
    </div>
  )
  
  const renderResults = () => (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-green-100">
        <h1 className="text-4xl font-bold text-gray-900 mb-4 text-center">Test Complete!</h1>
        <p className="text-lg text-gray-600 text-center mb-8">
          Your Amsler Grid results have been saved
        </p>
        
        <div className="space-y-6">
          {/* Left Eye Result */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
            <h3 className="text-xl font-bold text-blue-900 mb-3">Left Eye</h3>
            <p className="text-blue-800">
              {distortions.left.hasIssues 
                ? ` Distortions reported (${distortions.left.marks.length} marks)`
                : ' No distortions reported'}
            </p>
          </div>
          
          {/* Right Eye Result */}
          <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-6">
            <h3 className="text-xl font-bold text-purple-900 mb-3">Right Eye</h3>
            <p className="text-purple-800">
              {distortions.right.hasIssues 
                ? ` Distortions reported (${distortions.right.marks.length} marks)`
                : ' No distortions reported'}
            </p>
          </div>
          
          {/* Clinical recommendations */}
          {(distortions.left.hasIssues || distortions.right.hasIssues) && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
              <h3 className="text-xl font-bold text-red-900 mb-3"> Important</h3>
              <p className="text-red-800 mb-3">
                You reported seeing distortions in the grid. This could indicate:
              </p>
              <ul className="text-red-800 space-y-2 ml-6">
                <li>• Macular degeneration</li>
                <li>• Diabetic retinopathy</li>
                <li>• Macular edema</li>
                <li>• Other retinal conditions</li>
              </ul>
              <p className="text-red-900 font-bold mt-4">
                 We recommend consulting an eye care professional for a comprehensive examination.
              </p>
            </div>
          )}
          
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
            <h4 className="font-bold text-green-900 mb-2"> Next Steps:</h4>
            <ul className="text-green-800 space-y-2 text-sm">
              <li>• Results saved to your dashboard</li>
              <li>• Retake test periodically to track changes</li>
              <li>• Compare results over time for trends</li>
              <li>• Consult eye care professional if distortions appear or worsen</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-8 flex gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex-1 btn-secondary min-h-[44px]"
          >
             Back to Dashboard
          </button>
          <button
            onClick={() => navigate('/vision-tests')}
            className="flex-1 btn-primary min-h-[44px]"
          >
            More Tests 
          </button>
        </div>
      </div>
    </div>
  )
  
  return (
    <div className="test-shell">
      <div className="max-w-7xl mx-auto">
        {testState === 'distance-gate' && renderDistanceGate()}
        {testState === 'brightness-check' && renderBrightnessCheck()}
        {testState === 'instructions' && renderInstructions()}
        {testState === 'eye-coverage-setup' && renderEyeCoverageSetup()}
        {testState === 'testing' && renderTesting()}
        {testState === 'marking' && renderMarking()}
        {testState === 'switch-eyes' && renderSwitchEyes()}
        {testState === 'results' && renderResults()}
      </div>
    </div>
  )
}

export default AmslerGridTest
