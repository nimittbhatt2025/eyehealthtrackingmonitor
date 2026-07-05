import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCalibration } from '../context/CalibrationContext'
import InlineDistanceCalibration from '../components/InlineDistanceCalibration'
import EyeCoverageVerification from '../components/EyeCoverageVerification'
import { visionTestAPI } from '../services/api'

/**
 * Amsler Grid Test
 * Professional-grade macular health screening with:
 * - Classic 10x10 grid pattern (20cm x 20cm standard)
 * - Central fixation point
 * - Distortion mapping (user marks problem areas)
 * - Monocular testing (left eye then right eye)
 * - Change tracking over time
 * - Safe medical language (screening for macular health)
 */

const AmslerGridTest = () => {
  const navigate = useNavigate()
  const { isCalibrated, needsRecalibration, getConfidence } = useCalibration()
  
  const [testState, setTestState] = useState('distance-gate') // distance-gate, brightness-check, instructions, eye-coverage-setup, testing, marking, switch-eyes, results
  const [distanceValid, setDistanceValid] = useState(false)
  const [brightnessConfirmed, setBrightnessConfirmed] = useState(false)
  const [currentEye, setCurrentEye] = useState('left') // left, right
  const [distortions, setDistortions] = useState({
    left: { hasIssues: null, marks: [], notes: '', gridPattern: null },
    right: { hasIssues: null, marks: [], notes: '', gridPattern: null }
  })
  const [isDrawing, setIsDrawing] = useState(false)
  const canvasRef = useRef(null)
  const overlayCanvasRef = useRef(null) // For user annotations
  const containerRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ width: 500, height: 500 })
  const [annotationMode, setAnnotationMode] = useState('wavy') // 'wavy' or 'blackout'
  const [isAnnotating, setIsAnnotating] = useState(false)
  const [brushSize, setBrushSize] = useState(15)
  const [lastPoint, setLastPoint] = useState(null)
  const [cursorPosition, setCursorPosition] = useState(null) // For brush preview
  const [showCursor, setShowCursor] = useState(false)
  
  // Clinical standard: 10×10 grid, 500×500px, pure white background, black lines, red center dot
  // Standard viewing distance: 355mm (14 inches) - near vision/reading distance
  // Grid represents central 10-20 degrees of visual field

  useEffect(() => {
    // Fixed 500×500px grid for consistent clinical testing
    const gridSize = 500
    setCanvasSize({ width: gridSize, height: gridSize })
    
    // Force immediate redraw
    if (canvasRef.current) {
      requestAnimationFrame(() => {
        drawGrid()
        if (testState === 'marking') {
          drawAnnotations()
        }
      })
    }
  }, [])
  
  // Pulsating center dot effect for better fixation
  useEffect(() => {
    if (testState === 'testing' && dotPulse) {
      const interval = setInterval(() => {
        drawGrid()
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [testState, dotPulse])

  // Draw Clinical-Grade 20x20 Amsler Grid (Standard Medical Protocol)
  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      console.log('Canvas ref not available')
      return
    }

    const ctx = canvas.getContext('2d')
    const { width, height } = canvasSize
    
    if (width === 0 || height === 0) {
      console.log('Canvas size is zero:', { width, height })
      return
    }

    console.log('Drawing 20x20 Amsler grid with size:', { width, height }, 'for eye:', currentEye)

    // Clear canvas with BLACK background (medical standard)
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, width, height)

    // Draw 20x20 grid (clinical standard)
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 1 // Thin lines for precision
    
    const cellSize = width / 20 // 20x20 grid

    // Draw vertical lines
    for (let i = 0; i <= 20; i++) {
      ctx.beginPath()
      ctx.moveTo(i * cellSize, 0)
      ctx.lineTo(i * cellSize, height)
      ctx.stroke()
    }
    
    // Draw horizontal lines
    for (let i = 0; i <= 20; i++) {
      ctx.beginPath()
      ctx.moveTo(0, i * cellSize)
      ctx.lineTo(width, i * cellSize)
      ctx.stroke()
    }

    // Draw center fixation point - PULSATING for better focus maintenance
    const time = Date.now() % 1000
    const pulseScale = dotPulse ? 1 + 0.3 * Math.sin((time / 1000) * Math.PI * 2) : 1
    const dotSize = 6 * pulseScale
    
    ctx.fillStyle = '#FF0000'
    ctx.beginPath()
    ctx.arc(width / 2, height / 2, dotSize, 0, 2 * Math.PI)
    ctx.fill()
    
    // White ring for visibility
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(width / 2, height / 2, dotSize + 2, 0, 2 * Math.PI)
    ctx.stroke()

    console.log('Clinical 20x20 grid drawn successfully')
  }, [canvasSize, currentEye, dotPulse])
  
  // Draw annotations on overlay canvas (separate from grid)
  const drawAnnotations = useCallback(() => {
    console.log(' DRAW ANNOTATIONS called')
    const canvas = overlayCanvasRef.current
    if (!canvas) {
      console.log('  [X] No overlay canvas found!')
      return
    }
    
    const ctx = canvas.getContext('2d')
    const { width, height } = canvasSize
    
    // Clear overlay
    ctx.clearRect(0, 0, width, height)
    
    // Draw all marks for current eye
    const marks = distortions[currentEye].marks
    console.log('  - Drawing', marks.length, 'marks for', currentEye, 'eye')
    console.log('  - Canvas size:', width, 'x', height)
    
    // Group consecutive marks into strokes for smooth lines
    if (marks.length > 0) {
      marks.forEach((mark, index) => {
        const x = mark.x * width
        const y = mark.y * height
        
        if (mark.type === 'wavy') {
          // Yellow circles with glow for wavy distortions (metamorphopsia)
          ctx.shadowBlur = 8
          ctx.shadowColor = 'rgba(255, 255, 0, 0.6)'
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.9)'
          ctx.fillStyle = 'rgba(255, 255, 0, 0.2)'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(x, y, brushSize, 0, 2 * Math.PI)
          ctx.fill()
          ctx.stroke()
          ctx.shadowBlur = 0
          
          // Add wavy line indicator in center
          ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)'
          ctx.lineWidth = 2
          ctx.beginPath()
          for (let i = -brushSize/2; i < brushSize/2; i += 2) {
            const waveY = y + Math.sin(i / 3) * 3
            if (i === -brushSize/2) {
              ctx.moveTo(x + i, waveY)
            } else {
              ctx.lineTo(x + i, waveY)
            }
          }
          ctx.stroke()
          
        } else if (mark.type === 'blackout') {
          // Red filled circles with glow for scotomas/blind spots
          ctx.shadowBlur = 10
          ctx.shadowColor = 'rgba(255, 0, 0, 0.6)'
          ctx.fillStyle = 'rgba(255, 0, 0, 0.6)'
          ctx.beginPath()
          ctx.arc(x, y, brushSize, 0, 2 * Math.PI)
          ctx.fill()
          
          // Add darker center
          ctx.shadowBlur = 0
          ctx.fillStyle = 'rgba(200, 0, 0, 0.8)'
          ctx.beginPath()
          ctx.arc(x, y, brushSize * 0.5, 0, 2 * Math.PI)
          ctx.fill()
          
          // Add border
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(x, y, brushSize, 0, 2 * Math.PI)
          ctx.stroke()
        }
        
        // Draw connecting lines between consecutive marks for smooth painting
        if (index > 0 && mark.type === marks[index - 1].type) {
          const prevMark = marks[index - 1]
          const timeDiff = mark.timestamp - prevMark.timestamp
          
          // Only connect if marks are close in time (within 100ms)
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
    }
  }, [canvasSize, distortions, currentEye, brushSize])

  useEffect(() => {
    drawGrid()
    
    // Force redraw when state changes to ensure grid is visible
    const timer = setTimeout(() => {
      drawGrid()
    }, 100)
    
    return () => clearTimeout(timer)
  }, [drawGrid, testState])
  
  // Update annotations when marks change
  useEffect(() => {
    if (testState === 'marking') {
      drawAnnotations()
    }
  }, [drawAnnotations, testState, distortions])
  
  // Draw cursor preview
  useEffect(() => {
    if (testState === 'marking' && showCursor && cursorPosition) {
      drawCursorPreview()
    }
  }, [cursorPosition, showCursor, testState, brushSize, annotationMode])
  
  // Draw brush cursor preview
  const drawCursorPreview = () => {
    const canvas = overlayCanvasRef.current
    if (!canvas || !cursorPosition) return
    
    // Redraw all annotations first
    drawAnnotations()
    
    const ctx = canvas.getContext('2d')
    const { width, height } = canvasSize
    const x = cursorPosition.x * width
    const y = cursorPosition.y * height
    
    // Draw cursor preview
    if (annotationMode === 'wavy') {
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'
      ctx.fillStyle = 'rgba(255, 255, 0, 0.1)'
      ctx.lineWidth = 2
    } else {
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
      ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'
      ctx.lineWidth = 2
    }
    
    ctx.beginPath()
    ctx.arc(x, y, brushSize, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke()
    
    // Draw crosshair
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x - brushSize - 5, y)
    ctx.lineTo(x + brushSize + 5, y)
    ctx.moveTo(x, y - brushSize - 5)
    ctx.lineTo(x, y + brushSize + 5)
    ctx.stroke()
  }

  // Handle canvas click to mark distortions
  const handleCanvasClick = (e) => {
    console.log(' CANVAS CLICK')
    console.log('  - testState:', testState)
    console.log('  - overlayCanvas exists:', !!overlayCanvasRef.current)
    console.log('  - annotationMode:', annotationMode)
    
    if (testState !== 'marking') {
      console.log('  [X] Not in marking state!')
      return
    }

    const canvas = overlayCanvasRef.current || canvasRef.current
    if (!canvas) {
      console.log('  [X] No canvas found!')
      return
    }
    
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    console.log('   Adding mark at:', { x: x.toFixed(3), y: y.toFixed(3) })

    // Add annotation mark
    setDistortions(prev => {
      const newMarks = [...prev[currentEye].marks, { 
        x, 
        y, 
        type: annotationMode, // 'wavy' or 'blackout'
        timestamp: Date.now() 
      }]
      console.log('  - Total marks:', newMarks.length)
      return {
        ...prev,
        [currentEye]: {
          ...prev[currentEye],
          marks: newMarks
        }
      }
    })
    
    // Redraw annotations immediately
    setTimeout(() => drawAnnotations(), 10)
  }
  
  // Handle canvas drawing (for painting distortion areas)
  const handleCanvasDraw = (e) => {
    console.log('🖌️ CANVAS DRAW')
    if (!isAnnotating || testState !== 'marking') {
      console.log('  [X] Not annotating or not in marking state')
      return
    }
    
    const canvas = overlayCanvasRef.current || canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    
    // Smooth line drawing - only add point if moved sufficiently
    if (lastPoint) {
      const distance = Math.sqrt(
        Math.pow((x - lastPoint.x) * rect.width, 2) + 
        Math.pow((y - lastPoint.y) * rect.height, 2)
      )
      if (distance < 3) return // Reduced threshold for smoother drawing
    }
    
    setLastPoint({ x, y })
    
    console.log('   Adding draw point at:', { x: x.toFixed(3), y: y.toFixed(3) })
    
    // Add continuous marks while drawing
    setDistortions(prev => ({
      ...prev,
      [currentEye]: {
        ...prev[currentEye],
        marks: [...prev[currentEye].marks, { 
          x, 
          y, 
          type: annotationMode,
          timestamp: Date.now() 
        }]
      }
    }))
    
    // Immediate visual feedback - draw this mark right away
    const overlayCanvas = overlayCanvasRef.current
    if (overlayCanvas) {
      const ctx = overlayCanvas.getContext('2d')
      const { width, height } = canvasSize
      const pixelX = x * width
      const pixelY = y * height
      
      if (annotationMode === 'wavy') {
        ctx.shadowBlur = 8
        ctx.shadowColor = 'rgba(255, 255, 0, 0.6)'
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.9)'
        ctx.fillStyle = 'rgba(255, 255, 0, 0.2)'
        ctx.lineWidth = 3
      } else {
        ctx.shadowBlur = 10
        ctx.shadowColor = 'rgba(255, 0, 0, 0.6)'
        ctx.fillStyle = 'rgba(255, 0, 0, 0.6)'
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'
        ctx.lineWidth = 2
      }
      
      ctx.beginPath()
      ctx.arc(pixelX, pixelY, brushSize, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()
      ctx.shadowBlur = 0
      
      // Draw connecting line to previous point
      if (lastPoint) {
        const prevX = lastPoint.x * width
        const prevY = lastPoint.y * height
        
        if (annotationMode === 'wavy') {
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)'
        } else {
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
        }
        ctx.lineWidth = brushSize * 2
        ctx.beginPath()
        ctx.moveTo(prevX, prevY)
        ctx.lineTo(pixelX, pixelY)
        ctx.stroke()
      }
    }
  }
  
  // Touch handlers for mobile support
  const handleTouchStart = (e) => {
    e.preventDefault()
    setIsAnnotating(true)
    const touch = e.touches[0]
    const canvas = overlayCanvasRef.current || canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (touch.clientX - rect.left) / rect.width
    const y = (touch.clientY - rect.top) / rect.height
    
    setLastPoint({ x, y })
    
    // Add initial touch point
    setDistortions(prev => ({
      ...prev,
      [currentEye]: {
        ...prev[currentEye],
        marks: [...prev[currentEye].marks, { 
          x, 
          y, 
          type: annotationMode,
          timestamp: Date.now() 
        }]
      }
    }))
    
    // Immediate visual feedback
    drawSingleMark(x, y)
  }
  
  const handleTouchMove = (e) => {
    e.preventDefault()
    if (!isAnnotating) return
    
    const touch = e.touches[0]
    const canvas = overlayCanvasRef.current || canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (touch.clientX - rect.left) / rect.width
    const y = (touch.clientY - rect.top) / rect.height
    
    // Smooth line drawing
    if (lastPoint) {
      const distance = Math.sqrt(
        Math.pow((x - lastPoint.x) * rect.width, 2) + 
        Math.pow((y - lastPoint.y) * rect.height, 2)
      )
      if (distance < 3) return // Reduced for smoother touch
    }
    
    const prevPoint = lastPoint
    setLastPoint({ x, y })
    
    setDistortions(prev => ({
      ...prev,
      [currentEye]: {
        ...prev[currentEye],
        marks: [...prev[currentEye].marks, { 
          x, 
          y, 
          type: annotationMode,
          timestamp: Date.now() 
        }]
      }
    }))
    
    // Immediate visual feedback with connecting line
    drawSingleMark(x, y, prevPoint)
  }
  
  const handleTouchEnd = (e) => {
    e.preventDefault()
    setIsAnnotating(false)
    setLastPoint(null)
    drawAnnotations() // Full redraw for clean result
  }
  
  // Helper to draw a single mark immediately for responsive feedback
  const drawSingleMark = (x, y, prevPoint = null) => {
    const overlayCanvas = overlayCanvasRef.current
    if (!overlayCanvas) return
    
    const ctx = overlayCanvas.getContext('2d')
    const { width, height } = canvasSize
    const pixelX = x * width
    const pixelY = y * height
    
    // Set styles based on annotation mode
    if (annotationMode === 'wavy') {
      ctx.shadowBlur = 8
      ctx.shadowColor = 'rgba(255, 255, 0, 0.6)'
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.9)'
      ctx.fillStyle = 'rgba(255, 255, 0, 0.2)'
      ctx.lineWidth = 3
    } else {
      ctx.shadowBlur = 10
      ctx.shadowColor = 'rgba(255, 0, 0, 0.6)'
      ctx.fillStyle = 'rgba(255, 0, 0, 0.6)'
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'
      ctx.lineWidth = 2
    }
    
    // Draw mark circle
    ctx.beginPath()
    ctx.arc(pixelX, pixelY, brushSize, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0
    
    // Draw connecting line if there's a previous point
    if (prevPoint) {
      const prevX = prevPoint.x * width
      const prevY = prevPoint.y * height
      
      if (annotationMode === 'wavy') {
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)'
      } else {
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
      }
      ctx.lineWidth = brushSize * 2
      ctx.beginPath()
      ctx.moveTo(prevX, prevY)
      ctx.lineTo(pixelX, pixelY)
      ctx.stroke()
    }
  }
  
  const handleMouseDown = (e) => {
    console.log(' MOUSE DOWN - Starting annotation')
    console.log('  - testState:', testState)
    console.log('  - annotationMode:', annotationMode)
    console.log('  - brushSize:', brushSize)
    console.log('  - overlayCanvasRef exists:', !!overlayCanvasRef.current)
    setIsAnnotating(true)
    handleCanvasClick(e)
  }
  
  const handleMouseMove = (e) => {
    // Update cursor position for preview
    if (testState === 'marking') {
      const canvas = overlayCanvasRef.current || canvasRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        const x = (e.clientX - rect.left) / rect.width
        const y = (e.clientY - rect.top) / rect.height
        setCursorPosition({ x, y })
      }
    }
    
    // Handle drawing if mouse is down
    if (isAnnotating) {
      console.log(' MOUSE MOVE - Drawing')
      handleCanvasDraw(e)
    }
  }
  
  const handleMouseUp = () => {
    console.log(' MOUSE UP - Ending annotation')
    console.log('  - Total marks for', currentEye, ':', distortions[currentEye].marks.length)
    setIsAnnotating(false)
    setLastPoint(null)
    drawAnnotations() // Final redraw
  }
  
  const handleMouseEnter = () => {
    setShowCursor(true)
  }
  
  const handleMouseLeave = () => {
    setShowCursor(false)
    setCursorPosition(null)
    if (isAnnotating) {
      setIsAnnotating(false)
      setLastPoint(null)
      drawAnnotations()
    }
  }
  
  // Clear all annotations for current eye
  const clearAnnotations = () => {
    setDistortions(prev => ({
      ...prev,
      [currentEye]: {
        ...prev[currentEye],
        marks: []
      }
    }))
    drawAnnotations()
  }
  
  // Undo last stroke (remove marks from last continuous drawing session)
  const undoLastStroke = () => {
    const marks = distortions[currentEye].marks
    if (marks.length === 0) return
    
    // Find the last stroke by looking for time gaps
    let strokeStartIndex = marks.length - 1
    for (let i = marks.length - 2; i >= 0; i--) {
      const timeDiff = marks[i + 1].timestamp - marks[i].timestamp
      if (timeDiff > 100) { // 100ms gap indicates new stroke
        strokeStartIndex = i + 1
        break
      }
      if (i === 0) {
        strokeStartIndex = 0
      }
    }
    
    // Remove marks from the last stroke
    setDistortions(prev => ({
      ...prev,
      [currentEye]: {
        ...prev[currentEye],
        marks: marks.slice(0, strokeStartIndex)
      }
    }))
    
    setTimeout(() => drawAnnotations(), 10)
  }

  // Start test - go to eye coverage verification first
  const startEyeTest = () => {
    setTestState('eye-coverage-setup')
  }
  
  // After eye coverage verified, start actual testing
  const handleEyeCoverageVerified = () => {
    setTestState('testing')
  }
  
  // Skip eye coverage (fallback option)
  const handleSkipEyeCoverage = () => {
    setTestState('testing')
  }

  // Record response (no issues seen)
  const recordNoIssues = () => {
    setDistortions(prev => ({
      ...prev,
      [currentEye]: {
        ...prev[currentEye],
        hasIssues: false
      }
    }))
    finishEyeTest()
  }

  // Move to marking distortions
  const startMarking = () => {
    console.log(' STARTING MARKING MODE')
    console.log('  - Current eye:', currentEye)
    console.log('  - Annotation mode:', annotationMode)
    console.log('  - Brush size:', brushSize)
    
    setDistortions(prev => ({
      ...prev,
      [currentEye]: {
        ...prev[currentEye],
        hasIssues: true
      }
    }))
    setTestState('marking')
    
    // Verify canvas is mounted after state change
    setTimeout(() => {
      console.log('  - Overlay canvas exists:', !!overlayCanvasRef.current)
      console.log('  - Base canvas exists:', !!canvasRef.current)
      if (overlayCanvasRef.current) {
        const rect = overlayCanvasRef.current.getBoundingClientRect()
        console.log('  - Overlay canvas rect:', rect.width, 'x', rect.height)
      }
    }, 100)
  }

  // Finish marking and move to next eye or results
  const finishMarking = () => {
    finishEyeTest()
  }

  // Finish testing current eye
  const finishEyeTest = () => {
    if (currentEye === 'left') {
      setCurrentEye('right')
      setTestState('switch-eyes')
    } else {
      setTestState('results')
    }
  }

  // Calculate grid coverage percentage
  const calculateGridCoverage = (marks) => {
    if (marks.length === 0) return 0
    
    // Create a 20x20 grid to track affected cells
    const gridSize = 20
    const affectedCells = new Set()
    
    marks.forEach(mark => {
      // Convert normalized coordinates to grid cell
      const cellX = Math.floor(mark.x * gridSize)
      const cellY = Math.floor(mark.y * gridSize)
      affectedCells.add(`${cellX},${cellY}`)
    })
    
    // Calculate percentage (total cells = 400)
    const totalCells = gridSize * gridSize
    return (affectedCells.size / totalCells) * 100
  }
  
  // Identify affected quadrants
  const identifyQuadrants = (marks) => {
    const quadrants = {
      'Superior-Temporal': 0,
      'Superior-Nasal': 0,
      'Inferior-Temporal': 0,
      'Inferior-Nasal': 0
    }
    
    marks.forEach(mark => {
      const isUpper = mark.y < 0.5
      const isRight = mark.x > 0.5
      
      if (isUpper && isRight) quadrants['Superior-Temporal']++
      else if (isUpper && !isRight) quadrants['Superior-Nasal']++
      else if (!isUpper && isRight) quadrants['Inferior-Temporal']++
      else quadrants['Inferior-Nasal']++
    })
    
    // Return quadrants with marks
    return Object.entries(quadrants)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }
  
  // Calculate distortion density
  const calculateDensity = (marks, type) => {
    const typeMarks = marks.filter(m => m.type === type)
    if (typeMarks.length === 0) return null
    
    // Group marks into clusters
    const clusters = []
    typeMarks.forEach(mark => {
      let addedToCluster = false
      for (let cluster of clusters) {
        // Check if mark is close to any mark in cluster (within 0.1 normalized distance)
        if (cluster.some(m => Math.sqrt(Math.pow(m.x - mark.x, 2) + Math.pow(m.y - mark.y, 2)) < 0.1)) {
          cluster.push(mark)
          addedToCluster = true
          break
        }
      }
      if (!addedToCluster) {
        clusters.push([mark])
      }
    })
    
    return {
      clusters: clusters.length,
      avgClusterSize: typeMarks.length / clusters.length,
      isDense: clusters.some(c => c.length > 10) // Dense if any cluster has >10 marks
    }
  }

  // Analyze results with change tracking focus
  const analyzeResults = () => {
    const leftMarks = distortions.left.marks
    const rightMarks = distortions.right.marks
    const leftHasIssues = distortions.left.hasIssues
    const rightHasIssues = distortions.right.hasIssues
    
    // Calculate grid coverage for each eye
    const leftCoverage = calculateGridCoverage(leftMarks)
    const rightCoverage = calculateGridCoverage(rightMarks)
    
    // Identify affected quadrants
    const leftQuadrants = identifyQuadrants(leftMarks)
    const rightQuadrants = identifyQuadrants(rightMarks)
    
    // Calculate densities
    const leftWavyDensity = calculateDensity(leftMarks, 'wavy')
    const leftBlackoutDensity = calculateDensity(leftMarks, 'blackout')
    const rightWavyDensity = calculateDensity(rightMarks, 'wavy')
    const rightBlackoutDensity = calculateDensity(rightMarks, 'blackout')
    
    // Determine status
    let status = 'Normal'
    let statusColor = 'green'
    let actionRequired = false
    let visualChange = 'No distortions detected'
    let action = 'Continue monthly self-monitoring. Test again in 30 days.'
    
    if (leftHasIssues || rightHasIssues) {
      // For MVP: treat any distortion as "New/Progressive" since we don't have baseline
      // In production, you'd compare to previous test
      status = 'Abnormal (New Distortion)'
      statusColor = 'red'
      actionRequired = true
      
      const totalBlocks = Math.round((leftCoverage + rightCoverage) / 2)
      const affectedEyes = []
      if (leftHasIssues) affectedEyes.push('left')
      if (rightHasIssues) affectedEyes.push('right')
      
      visualChange = `${totalBlocks}% of grid affected in ${affectedEyes.join(' and ')} eye${affectedEyes.length > 1 ? 's' : ''}`
      action = 'NEW DISTORTION DETECTED. Contact your eye care professional within 24-48 hours. Mention "positive Amsler Grid test" when you call.'
      
      // Check for scotomas (more urgent)
      const hasScotomas = leftBlackoutDensity || rightBlackoutDensity
      if (hasScotomas) {
        status = 'Abnormal (Scotomas Detected)'
        action = 'BLIND SPOTS (SCOTOMAS) DETECTED. Contact your eye care professional TODAY. This may indicate macular hole, AMD, or other serious conditions.'
      }
    }
    
    return {
      status,
      statusColor,
      actionRequired,
      visualChange,
      action,
      leftCoverage,
      rightCoverage,
      leftQuadrants,
      rightQuadrants,
      leftWavyDensity,
      leftBlackoutDensity,
      rightWavyDensity,
      rightBlackoutDensity,
      leftHasIssues,
      rightHasIssues,
      leftMarksCount: leftMarks.length,
      rightMarksCount: rightMarks.length
    }
  }

  // Submit results to backend
  const submitResults = async () => {
    try {
      const analysis = analyzeResults()
      const confidence = getConfidence()
      
      // Score based on grid coverage (0-100 scale)
      // 0% coverage = 100 score (perfect)
      // 100% coverage = 0 score (worst case)
      // Formula: score = 100 - (average coverage percentage)
      const avgCoverage = (analysis.leftCoverage + analysis.rightCoverage) / 2
      let score = Math.max(0, Math.round(100 - avgCoverage))
      
      // If user reported no issues for both eyes, score is 100
      if (!analysis.leftHasIssues && !analysis.rightHasIssues) {
        score = 100
      }
      
      // Additional penalty for scotomas (more serious than distortions)
      if (analysis.leftBlackoutDensity || analysis.rightBlackoutDensity) {
        score = Math.max(0, score - 10) // Extra 10 point penalty for scotomas
      }
      
      await visionTestAPI.submit({
        test_type: 'amsler_grid',
        score: score,
        test_details: {
          left_eye: {
            has_issues: distortions.left.hasIssues,
            distortion_marks: distortions.left.marks,
            coverage_percentage: analysis.leftCoverage,
            affected_quadrants: analysis.leftQuadrants,
            wavy_density: analysis.leftWavyDensity,
            blackout_density: analysis.leftBlackoutDensity,
            notes: distortions.left.notes
          },
          right_eye: {
            has_issues: distortions.right.hasIssues,
            distortion_marks: distortions.right.marks,
            coverage_percentage: analysis.rightCoverage,
            affected_quadrants: analysis.rightQuadrants,
            wavy_density: analysis.rightWavyDensity,
            blackout_density: analysis.rightBlackoutDensity,
            notes: distortions.right.notes
          },
          status: analysis.status,
          action_required: analysis.actionRequired,
          visual_change: analysis.visualChange,
          recommended_action: analysis.action,
          calibration_confidence: confidence,
          timestamp: new Date().toISOString()
        }
      })
      
      navigate('/vision-tests')
    } catch (error) {
      console.error('Failed to submit results:', error)
      alert('Failed to save results. Please try again.')
    }
  }

  // Render Eye Coverage Setup
  const renderEyeCoverageSetup = () => {
    // CRITICAL FIX: If testing LEFT eye, we need to verify RIGHT eye is covered (and vice versa)
    const eyeToCover = currentEye === 'left' ? 'right' : 'left'
    
    return (
      <EyeCoverageVerification
        expectedEye={eyeToCover}
        onVerified={handleEyeCoverageVerified}
        onSkip={handleSkipEyeCoverage}
      />
    )
  }

  // Render Instructions
  const renderInstructions = () => (
    <div className="max-w-3xl mx-auto space-y-4 py-4">
      {/* Header */}
      <div className="text-center mb-5">
        <div className="mb-3">
          <div className="w-14 h-14 mx-auto bg-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Amsler Grid Test
        </h1>
        <p className="text-base text-gray-600">
          Screen for macular degeneration and central vision problems
        </p>
      </div>

      {/* Medical Disclaimer */}
      <div className="bg-white rounded-xl shadow-md border-l-4 border-red-500 p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-gray-900 mb-1">Medical Disclaimer</h3>
            <p className="text-sm text-gray-700">
              This is a SCREENING tool only. Any distortions require <strong>immediate professional evaluation</strong>. Not FDA approved for diagnosis.
            </p>
          </div>
        </div>
      </div>

      {/* How This Works */}
      <div className="bg-white rounded-xl shadow-md p-4">
        <h2 className="text-xl font-bold text-gray-900 mb-3">Clinical Protocol</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl mb-1"></div>
            <h3 className="font-semibold text-sm text-gray-900 mb-1">Test Each Eye</h3>
            <p className="text-xs text-gray-600">Monocular testing required</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl mb-1"></div>
            <h3 className="font-semibold text-sm text-gray-900 mb-1">Fixate Center</h3>
            <p className="text-xs text-gray-600">Pulsating dot helps focus</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl mb-1"></div>
            <h3 className="font-semibold text-sm text-gray-900 mb-1">Mark Distortions</h3>
            <p className="text-xs text-gray-600">Draw on problem areas</p>
          </div>
        </div>
      </div>

      {/* Critical Distance & Calibration */}
      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
        <h3 className="font-bold text-amber-900 mb-2 text-sm">📏 Standardized Testing Distance</h3>
        <div className="grid md:grid-cols-2 gap-2">
          <div className="flex items-start gap-2 text-xs text-amber-900">
            <span></span>
            <span><strong>30-38cm (12-15 inches)</strong> from screen</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-amber-900">
            <span></span>
            <span>Grid at <strong>eye level</strong> (not tilted)</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-amber-900">
            <span></span>
            <span><strong>Maximum screen brightness</strong></span>
          </div>
          <div className="flex items-start gap-2 text-xs text-amber-900">
            <span></span>
            <span>Wear <strong>reading glasses</strong> if prescribed</span>
          </div>
        </div>
        <div className="mt-2 p-2 bg-amber-100 rounded">
          <p className="text-xs text-amber-900">
             <strong>Webcam will verify distance</strong> during test setup
          </p>
        </div>
      </div>

      {/* Clinical Grid Specifications */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
        <h3 className="font-bold text-blue-900 mb-2 text-sm"> Medical-Grade 20×20 Grid Specifications</h3>
        <p className="text-xs text-blue-900 mb-2">
          This digital grid follows <strong>FDA-cleared clinical standards</strong> for at-home macular screening:
        </p>
        <ul className="space-y-1 text-xs text-blue-900">
          <li className="flex items-start gap-2">
            <span>•</span>
            <span><strong>20×20 squares</strong> (400 test points) - industry standard</span>
          </li>
          <li className="flex items-start gap-2">
            <span>•</span>
            <span><strong>10cm × 10cm physical size</strong> - automatically calculated for your screen DPI</span>
          </li>
          <li className="flex items-start gap-2">
            <span>•</span>
            <span>Tests central <strong>10-20° visual field</strong> (macular region where AMD occurs)</span>
          </li>
          <li className="flex items-start gap-2">
            <span>•</span>
            <span><strong>Pulsating red fixation dot</strong> - helps maintain central focus during test</span>
          </li>
          <li className="flex items-start gap-2">
            <span>•</span>
            <span><strong>Interactive canvas overlay</strong> - draw directly on problem areas with precision tools</span>
          </li>
        </ul>
        <div className="mt-2 p-2 bg-blue-100 rounded">
          <p className="text-xs text-blue-900 font-semibold">
             Grid size: ~{physicalSize}px on your display (targeting 10cm × 10cm at standard viewing distance)
          </p>
        </div>
      </div>

      {/* What We're Looking For - Clinical Indicators */}
      <div className="bg-white rounded-xl shadow-md p-4">
        <h3 className="font-bold text-gray-900 mb-3 text-base">Visual Indicators (Macular Pathology)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="text-center p-2 bg-red-50 rounded-lg border border-red-200">
            <div className="text-2xl mb-1"></div>
            <h4 className="font-semibold mb-1 text-xs">Metamorphopsia</h4>
            <p className="text-xs text-gray-600">Wavy/curved lines</p>
          </div>
          <div className="text-center p-2 bg-red-50 rounded-lg border border-red-200">
            <div className="text-2xl mb-1"></div>
            <h4 className="font-semibold mb-1 text-xs">Scotomas</h4>
            <p className="text-xs text-gray-600">Dark/blank patches</p>
          </div>
          <div className="text-center p-2 bg-red-50 rounded-lg border border-red-200">
            <div className="text-2xl mb-1">📐</div>
            <h4 className="font-semibold mb-1 text-xs">Micropsia</h4>
            <p className="text-xs text-gray-600">Squares too small</p>
          </div>
          <div className="text-center p-2 bg-red-50 rounded-lg border border-red-200">
            <div className="text-2xl mb-1">〜</div>
            <h4 className="font-semibold mb-1 text-xs">Blurring</h4>
            <p className="text-xs text-gray-600">Smudged areas</p>
          </div>
        </div>
      </div>

      {/* Why This Matters */}
      <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
        <h3 className="font-bold text-red-900 mb-2 text-sm">[ALERT] Clinical Importance</h3>
        <p className="text-xs text-red-900 mb-2">
          Amsler grid detects <strong>macular degeneration</strong>, the #1 cause of vision loss over age 50, PLUS diabetic retinopathy, macular holes, and epiretinal membranes.
        </p>
        <p className="text-xs text-red-900 font-semibold">
           NEW distortions require same-day ophthalmology evaluation!
        </p>
      </div>

      {/* Longitudinal Tracking Feature */}
      <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-4">
        <h3 className="font-bold text-purple-900 mb-2 text-sm">� Longitudinal Tracking</h3>
        <p className="text-xs text-purple-900 mb-2">
          Your results are saved and compared over time:
        </p>
        <ul className="space-y-1 text-xs text-purple-900">
          <li className="flex items-start gap-2">
            <span>•</span>
            <span>Detect if scotomas (blind spots) are growing</span>
          </li>
          <li className="flex items-start gap-2">
            <span>•</span>
            <span>Track new distortion patterns over weeks/months</span>
          </li>
          <li className="flex items-start gap-2">
            <span>•</span>
            <span>Overlay current vs previous test results</span>
          </li>
        </ul>
        <p className="text-xs text-purple-900 mt-2 font-semibold bg-purple-100 p-2 rounded">
           Test monthly for early detection - changes may be subtle at first!
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-3">
        <button
          onClick={() => navigate('/vision-tests')}
          className="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-all shadow-md text-sm"
        >
          ← Back to Tests
        </button>
        <button
          onClick={() => startEyeTest()}
          className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-3 rounded-xl font-bold hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg text-sm"
        >
          Start Test →
        </button>
      </div>

      <p className="text-center text-xs text-gray-500 italic mt-3">
         This is a screening tool, not a diagnostic device
      </p>
    </div>
  )

  // Render Testing Screen
  const renderTesting = () => (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-3 bg-gradient-to-r from-purple-100 to-purple-50 rounded-full px-6 py-3 mb-3 shadow-md border border-purple-200">
          <span className={`text-xl font-bold transition-all ${currentEye === 'left' ? 'text-purple-600 scale-110' : 'text-gray-400 scale-90'}`}>
            {currentEye === 'left' && '→ '}Left Eye
          </span>
          <span className="text-gray-300">|</span>
          <span className={`text-xl font-bold transition-all ${currentEye === 'right' ? 'text-purple-600 scale-110' : 'text-gray-400 scale-90'}`}>
            Right Eye{currentEye === 'right' && ' ←'}
          </span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Cover your <span className="text-red-600">{currentEye === 'left' ? 'RIGHT' : 'LEFT'}</span> eye
        </h2>
        <p className="text-gray-600 text-base">
          Stare directly at the <span className="text-red-600 font-bold">red dot</span> in the center - don't look away!
        </p>
      </div>

      {/* Grid Display - Centered with better visibility */}
      <div className="flex justify-center">
        <div className="bg-black rounded-2xl p-4 shadow-2xl border-4 border-gray-800">
          <div className="relative" ref={containerRef}>
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className="rounded-lg"
              style={{ 
                display: 'block',
                maxWidth: '100%',
                height: 'auto'
              }}
            />
          </div>
        </div>
      </div>

      {/* Instructions - Clinical Fixation Protocol */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-xl p-5 max-w-2xl mx-auto shadow-md">
        <h3 className="font-bold text-blue-900 mb-3 text-base"> Fixation Protocol (10-20 seconds)</h3>
        <div className="grid md:grid-cols-2 gap-2 text-sm mb-3">
          <div className="flex items-start gap-2 text-blue-900">
            <span className="text-lg"></span>
            <span><strong>Stare at pulsating red dot</strong> - don't look away</span>
          </div>
          <div className="flex items-start gap-2 text-blue-900">
            <span className="text-lg"></span>
            <span>Use peripheral vision to check grid</span>
          </div>
          <div className="flex items-start gap-2 text-blue-900">
            <span className="text-lg"></span>
            <span>All lines should appear <strong>perfectly straight</strong></span>
          </div>
          <div className="flex items-start gap-2 text-blue-900">
            <span className="text-lg"></span>
            <span>All 400 squares should be <strong>equal size</strong></span>
          </div>
        </div>
        <div className="bg-blue-100 border border-blue-300 rounded-lg p-2 mt-3">
          <p className="text-xs text-blue-900 font-semibold">
            � 20×20 clinical grid | Tests central 10-20° macular field
          </p>
        </div>
      </div>

      {/* Answer Buttons */}
      <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <button
          onClick={recordNoIssues}
          className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-5 rounded-xl font-bold hover:from-green-700 hover:to-green-800 transition-all shadow-lg transform hover:scale-105"
        >
          <div className="text-3xl mb-1"></div>
          <div className="text-base">Everything Looks Normal</div>
        </button>
        <button
          onClick={startMarking}
          className="bg-gradient-to-r from-red-600 to-red-700 text-white px-6 py-5 rounded-xl font-bold hover:from-red-700 hover:to-red-800 transition-all shadow-lg transform hover:scale-105"
        >
          <div className="text-3xl mb-1"></div>
          <div className="text-base">I See Distortions</div>
        </button>
      </div>

      <p className="text-center text-sm text-gray-500 italic">
        Take your time - keep staring at the red dot while you decide
      </p>
    </div>
  )

  // Render Marking Screen
  const renderMarking = () => (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Mark Problem Areas on Grid
        </h2>
        <p className="text-gray-600 text-sm">
          Click/tap areas with distortions • Use tools below to annotate what you see
        </p>
      </div>

      {/* Annotation Toolbox */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 shadow-md border-2 border-purple-200">
        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
           Annotation Toolbox
          <span className="text-xs font-normal text-gray-600">(Paint over problem areas)</span>
        </h3>
        
        {/* Tool Selection */}
        <div className="grid md:grid-cols-2 gap-3 mb-3">
          <button
            onClick={() => setAnnotationMode('wavy')}
            className={`p-3 rounded-lg border-2 transition-all transform ${
              annotationMode === 'wavy' 
                ? 'border-yellow-500 bg-yellow-100 shadow-lg scale-105 ring-2 ring-yellow-300' 
                : 'border-gray-300 bg-white hover:border-yellow-300 hover:scale-102'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="text-3xl"></div>
              <div className="text-left flex-1">
                <div className="font-bold text-sm">Wavy Brush</div>
                <div className="text-xs text-gray-600">For curved/bent lines</div>
                <div className="text-xs text-yellow-700 font-semibold">Metamorphopsia</div>
              </div>
              {annotationMode === 'wavy' && (
                <div className="text-yellow-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
          </button>
          
          <button
            onClick={() => setAnnotationMode('blackout')}
            className={`p-3 rounded-lg border-2 transition-all transform ${
              annotationMode === 'blackout' 
                ? 'border-red-500 bg-red-100 shadow-lg scale-105 ring-2 ring-red-300' 
                : 'border-gray-300 bg-white hover:border-red-300 hover:scale-102'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="text-3xl"></div>
              <div className="text-left flex-1">
                <div className="font-bold text-sm">Blackout Brush</div>
                <div className="text-xs text-gray-600">For blank/missing areas</div>
                <div className="text-xs text-red-700 font-semibold">Scotomas</div>
              </div>
              {annotationMode === 'blackout' && (
                <div className="text-red-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
          </button>
        </div>
        
        {/* Brush Size Control */}
        <div className="bg-white rounded-lg p-3 mb-3 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">Brush Size</label>
            <span className="text-lg font-bold text-purple-600">{brushSize}px</span>
          </div>
          <input
            type="range"
            min="8"
            max="40"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Fine</span>
            <span>Medium</span>
            <span>Large</span>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={undoLastStroke}
            disabled={distortions[currentEye].marks.length === 0}
            className={`px-3 py-2 rounded-lg font-semibold text-sm transition-all ${
              distortions[currentEye].marks.length === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200 active:scale-95'
            }`}
          >
            ↶ Undo
          </button>
          
          <button
            onClick={clearAnnotations}
            disabled={distortions[currentEye].marks.length === 0}
            className={`px-3 py-2 rounded-lg font-semibold text-sm transition-all ${
              distortions[currentEye].marks.length === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-red-100 text-red-700 hover:bg-red-200 active:scale-95'
            }`}
          >
            🗑️ Clear
          </button>
          
          <div className="bg-gradient-to-r from-purple-100 to-blue-100 px-3 py-2 rounded-lg text-center border border-purple-200">
            <div className="text-xs text-gray-600">Marks</div>
            <div className="text-lg font-bold text-purple-700">{distortions[currentEye].marks.length}</div>
          </div>
        </div>
      </div>

      {/* Grid Display with Overlay Canvas */}
      <div className="flex justify-center">
        <div className="bg-black rounded-2xl p-4 shadow-2xl border-4 border-gray-800">
          <div className="relative" ref={containerRef}>
            {/* Base grid canvas */}
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className="rounded-lg"
              style={{ 
                display: 'block',
                maxWidth: '100%',
                height: 'auto'
              }}
            />
            {/* Overlay canvas for annotations */}
            <canvas
              ref={overlayCanvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="rounded-lg absolute top-0 left-0"
              style={{ 
                display: 'block',
                maxWidth: '100%',
                height: 'auto',
                touchAction: 'none',
                cursor: 'none' // Hide default cursor, we'll draw custom one
              }}
            />
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 max-w-2xl mx-auto">
        <h3 className="font-bold text-amber-900 mb-2 text-sm">📝 How to Annotate</h3>
        <ul className="space-y-2 text-xs text-amber-900">
          <li className="flex items-start gap-2">
            <span className="font-bold">1.</span>
            <span>Select a brush tool above (Wavy for distorted lines, Blackout for missing areas)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">2.</span>
            <span>Adjust brush size if needed using the slider</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">3.</span>
            <span><strong>Click and drag</strong> on the grid to paint over problem areas</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">4.</span>
            <span>Works on touch screens - just draw with your finger!</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">5.</span>
            <span>Mark ALL areas with distortions - be thorough for accurate results</span>
          </li>
        </ul>
      </div>

      {/* Controls */}
      <div className="flex gap-4 max-w-2xl mx-auto">
        <button
          onClick={() => setTestState('testing')}
          className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-300 transition-all"
        >
          ← Back to Grid
        </button>
        <button
          onClick={finishMarking}
          className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl font-bold hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg"
        >
          Done Marking →
        </button>
      </div>
    </div>
  )

  // Render Switch Eyes Screen
  const renderSwitchEyes = () => (
    <div className="max-w-2xl mx-auto text-center space-y-6">
      <div className="text-6xl mb-4">👏</div>
      <h2 className="text-3xl font-bold text-gray-900">Left Eye Complete!</h2>
      <p className="text-xl text-gray-600">
        Great job! Now let's test your right eye.
      </p>
      
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-8">
        <h3 className="font-bold text-lg mb-3">Your Left Eye:</h3>
        {distortions.left.hasIssues ? (
          <div>
            <p className="text-red-600 font-semibold mb-2"> Distortions Detected</p>
            <p className="text-gray-700">{distortions.left.marks.length} area(s) marked</p>
          </div>
        ) : (
          <p className="text-green-600 font-semibold"> No issues detected</p>
        )}
      </div>

      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-6">
        <p className="text-amber-900 mb-3">
          <strong>Remember:</strong> Now cover your LEFT eye with your palm and use only your right eye. 
          Keep staring at the red dot!
        </p>
        <p className="text-xs text-blue-900 bg-blue-100 rounded p-2 mt-2">
          � Same standardized 20×20 clinical grid for both eyes
        </p>
      </div>

      <button
        onClick={() => startEyeTest()}
        className="bg-blue-600 text-white px-12 py-4 rounded-full font-bold hover:bg-blue-700 transition-colors"
      >
        Verify Eye Coverage & Test Right Eye →
      </button>
    </div>
  )

  // Render Results with Change Tracking Focus
  const renderResults = () => {
    const analysis = analyzeResults()
    const confidence = getConfidence()
    
    // Calculate score (same logic as submitResults)
    const avgCoverage = (analysis.leftCoverage + analysis.rightCoverage) / 2
    let score = Math.max(0, Math.round(100 - avgCoverage))
    
    if (!analysis.leftHasIssues && !analysis.rightHasIssues) {
      score = 100
    }
    
    if (analysis.leftBlackoutDensity || analysis.rightBlackoutDensity) {
      score = Math.max(0, score - 10)
    }
    
    const getStatusInfo = (status) => {
      if (status === 'Normal') {
        return {
          emoji: '',
          title: 'No Changes Detected',
          subtitle: 'Grid appears normal',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-400',
          textColor: 'text-green-900',
          badgeColor: 'bg-green-500'
        }
      } else if (status.includes('Scotomas')) {
        return {
          emoji: '',
          title: 'Blind Spots Detected',
          subtitle: 'Immediate attention required',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-500',
          textColor: 'text-red-900',
          badgeColor: 'bg-red-600'
        }
      } else {
        return {
          emoji: '',
          title: 'Distortions Detected',
          subtitle: 'Professional evaluation needed',
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-400',
          textColor: 'text-orange-900',
          badgeColor: 'bg-orange-500'
        }
      }
    }
    
    const info = getStatusInfo(analysis.status)
    
    return (
      <div className="max-w-5xl mx-auto space-y-6 py-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-7xl mb-4">{info.emoji}</div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Test Complete
          </h1>
          <p className="text-xl text-gray-600">{info.subtitle}</p>
        </div>

        <CalibrationBadge showDetails={true} className="w-full justify-center mb-6" />

        {/* Score Display */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-4 border-purple-300 rounded-2xl p-6 text-center shadow-lg">
          <h3 className="text-lg font-bold text-gray-700 mb-2">Macular Health Score</h3>
          <div className={`text-6xl font-bold mb-2 ${
            score >= 90 ? 'text-green-600' : 
            score >= 70 ? 'text-yellow-600' : 
            score >= 50 ? 'text-orange-600' : 
            'text-red-600'
          }`}>
            {score}/100
          </div>
          <p className="text-sm text-gray-600">
            {score === 100 ? ' Perfect - No distortions detected' : 
             score >= 90 ? ' Excellent - Minimal changes' :
             score >= 70 ? ' Good - Minor distortions noted' :
             score >= 50 ? ' Fair - Moderate distortions' :
             '[ALERT] Poor - Significant distortions detected'}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Based on {avgCoverage.toFixed(1)}% average grid coverage
          </p>
        </div>

        {/* Status Card - Primary Result */}
        <div className={`${info.bgColor} border-4 ${info.borderColor} rounded-2xl p-8 shadow-xl`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{info.title}</h2>
              <div className={`inline-block px-4 py-2 rounded-full ${info.badgeColor} text-white font-bold text-sm`}>
                {analysis.status}
              </div>
            </div>
            <div className="text-6xl">{info.emoji}</div>
          </div>
          
          {/* Visual Change Summary */}
          <div className="bg-white rounded-xl p-6 mb-6">
            <h3 className="font-bold text-lg text-gray-900 mb-3 flex items-center gap-2">
               Visual Change Analysis
            </h3>
            <p className="text-xl font-semibold text-gray-800 mb-4">
              {analysis.visualChange}
            </p>
            
            {/* Grid Coverage */}
            {analysis.actionRequired && (
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                {/* Left Eye */}
                {analysis.leftHasIssues && (
                  <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
                    <h4 className="font-bold text-gray-900 mb-2"> Left Eye</h4>
                    <div className="space-y-2 text-sm">
                      <p><span className="font-semibold">Grid Coverage:</span> {analysis.leftCoverage.toFixed(1)}%</p>
                      {analysis.leftQuadrants.length > 0 && (
                        <div>
                          <p className="font-semibold">Affected Regions:</p>
                          <ul className="ml-4 mt-1">
                            {analysis.leftQuadrants.map(q => (
                              <li key={q.name} className="text-xs">
                                • {q.name} ({q.count} marks)
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysis.leftWavyDensity && (
                        <p className="text-xs text-yellow-700">
                          🌊 Metamorphopsia: {analysis.leftWavyDensity.clusters} area(s)
                        </p>
                      )}
                      {analysis.leftBlackoutDensity && (
                        <p className="text-xs text-red-700 font-bold">
                           Scotomas: {analysis.leftBlackoutDensity.clusters} blind spot(s)
                        </p>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Right Eye */}
                {analysis.rightHasIssues && (
                  <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
                    <h4 className="font-bold text-gray-900 mb-2"> Right Eye</h4>
                    <div className="space-y-2 text-sm">
                      <p><span className="font-semibold">Grid Coverage:</span> {analysis.rightCoverage.toFixed(1)}%</p>
                      {analysis.rightQuadrants.length > 0 && (
                        <div>
                          <p className="font-semibold">Affected Regions:</p>
                          <ul className="ml-4 mt-1">
                            {analysis.rightQuadrants.map(q => (
                              <li key={q.name} className="text-xs">
                                • {q.name} ({q.count} marks)
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysis.rightWavyDensity && (
                        <p className="text-xs text-yellow-700">
                          🌊 Metamorphopsia: {analysis.rightWavyDensity.clusters} area(s)
                        </p>
                      )}
                      {analysis.rightBlackoutDensity && (
                        <p className="text-xs text-red-700 font-bold">
                           Scotomas: {analysis.rightBlackoutDensity.clusters} blind spot(s)
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Action Required */}
          <div className={`rounded-xl p-6 border-2 ${
            analysis.actionRequired 
              ? 'bg-red-100 border-red-400' 
              : 'bg-green-100 border-green-400'
          }`}>
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
              {analysis.actionRequired ? '[ALERT]' : ''} Recommended Action
            </h3>
            <p className={`text-lg ${analysis.actionRequired ? 'text-red-900' : 'text-green-900'} font-semibold`}>
              {analysis.action}
            </p>
          </div>
        </div>

        {/* Understanding Your Results */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
          <h3 className="font-bold text-lg text-blue-900 mb-4">📖 Understanding Your Results</h3>
          <div className="space-y-3 text-sm text-blue-900">
            <div className="bg-white rounded-lg p-4">
              <h4 className="font-bold mb-2">What We're Tracking: Change, Not "Scores"</h4>
              <p>
                The Amsler Grid doesn't give you a vision "score." Instead, it tracks <strong>changes over time</strong>. 
                In eye health monitoring, <strong>no change is the perfect result</strong>.
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-4">
              <h4 className="font-bold mb-2">Grid Coverage</h4>
              <p>
                Shows what percentage of your central 20-degree visual field has distortions. 
                Even 1-2% can be significant if it's new or growing.
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-4">
              <h4 className="font-bold mb-2">Quadrant Mapping</h4>
              <p>
                We identify which regions are affected (Superior/Inferior, Temporal/Nasal). 
                This helps your doctor locate the problem in your macula.
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-4">
              <h4 className="font-bold mb-2">Density Types</h4>
              <ul className="mt-2 ml-4 space-y-1">
                <li>🌊 <strong>Metamorphopsia</strong> (Wavy): Lines appear curved - early AMD sign</li>
                <li> <strong>Scotomas</strong> (Blackout): Complete blind spots - more serious, may indicate macular hole</li>
              </ul>
            </div>
          </div>
        </div>

        {/* What Distortions May Indicate */}
        {analysis.actionRequired && (
          <div className="bg-red-50 border-3 border-red-400 rounded-xl p-6">
            <h3 className="font-bold text-xl text-red-900 mb-4">🩺 Possible Conditions</h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-red-900">
              <div className="bg-white rounded-lg p-4">
                <h4 className="font-bold mb-2">Age-Related Macular Degeneration (AMD)</h4>
                <p className="text-xs">Leading cause of vision loss over 50. Early detection critical for treatment.</p>
              </div>
              <div className="bg-white rounded-lg p-4">
                <h4 className="font-bold mb-2">Diabetic Macular Edema</h4>
                <p className="text-xs">Swelling in the macula from diabetes. Requires prompt management.</p>
              </div>
              <div className="bg-white rounded-lg p-4">
                <h4 className="font-bold mb-2">Macular Hole</h4>
                <p className="text-xs">Small tear in macula. May require surgical repair.</p>
              </div>
              <div className="bg-white rounded-lg p-4">
                <h4 className="font-bold mb-2">Epiretinal Membrane</h4>
                <p className="text-xs">Scar tissue on macula causing distortion.</p>
              </div>
            </div>
          </div>
        )}

        {/* Change Tracking Feature */}
        <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-6">
          <h3 className="font-bold text-lg text-purple-900 mb-3"> Baseline Established</h3>
          <p className="text-sm text-purple-900 mb-3">
            This test establishes your baseline. Future tests will be compared to detect:
          </p>
          <ul className="space-y-2 text-sm text-purple-900">
            <li className="flex items-start gap-2">
              <span></span>
              <span><strong>Stable:</strong> Distortion exists but hasn't changed (good!)</span>
            </li>
            <li className="flex items-start gap-2">
              <span></span>
              <span><strong>Progressive:</strong> New areas affected or existing areas growing (urgent!)</span>
            </li>
            <li className="flex items-start gap-2">
              <span></span>
              <span><strong>Improved:</strong> Distortion has decreased (rare, but tracked)</span>
            </li>
          </ul>
          <p className="text-xs text-purple-900 mt-4 font-semibold bg-purple-100 p-3 rounded">
             Test daily if you have AMD risk factors, monthly otherwise. Small changes matter!
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => {
              setTestState('instructions')
              setCurrentEye('left')
              setDistortions({
                left: { hasIssues: null, marks: [], notes: '' },
                right: { hasIssues: null, marks: [], notes: '' }
              })
            }}
            className="flex-1 bg-gray-200 text-gray-700 px-8 py-4 rounded-xl font-semibold hover:bg-gray-300 transition-all shadow-md"
          >
            🔄 Retake Test
          </button>
          <button
            onClick={submitResults}
            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg"
          >
            Save & Track Changes →
          </button>
        </div>

        <p className="text-center text-xs text-gray-500 italic mt-4">
           Screening tool only. Results saved for longitudinal tracking. Consult eye care professional for diagnosis.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-slate-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
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
