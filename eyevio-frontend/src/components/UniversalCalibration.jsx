import { useState, useEffect, useRef } from 'react'
import cameraManager from '../utils/cameraManager.js'
import { useNavigate } from 'react-router-dom'
import { useCalibration } from '../context/CalibrationContext'
import calibrationEngine from '../utils/calibrationEngine'

/**
 * Universal Calibration Component
 * Foundation for all vision tests - ensures reliable, consistent results
 * 
 * Steps:
 * 1. Welcome & Instructions
 * 2. Screen Size Calibration (credit card method)
 * 3. Viewing Distance Measurement
 * 4. Ambient Lighting Check
 * 5. Screen Brightness Check
 * 6. Environment Quality Summary
 */

const UniversalCalibration = ({ onComplete, returnPath = '/vision-tests' }) => {
  const navigate = useNavigate()
  const { saveCalibration } = useCalibration()
  
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const [step, setStep] = useState('welcome') // welcome, screen-size, distance, lighting, brightness, summary
  const [loading, setLoading] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  
  // Calibration data
  const [screenSize, setScreenSize] = useState(null)
  const [distance, setDistance] = useState(null)
  const [lighting, setLighting] = useState(null)
  const [brightness, setBrightness] = useState(null)
  const [confidence, setConfidence] = useState(null)

  // Card measurement
  const [cardWidthPx, setCardWidthPx] = useState(325) // Default display size
  const CARD_WIDTH_MM = 85.6

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  const startCamera = async () => {
    try {
      setCameraReady(false)
      const stream = await cameraManager.acquire({ 
        video: { facingMode: 'user', width: 640, height: 480 } 
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream

        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          setCameraReady(true)
        }
      }
    } catch (error) {
      console.error('Camera access denied:', error)
      alert('Camera access is required for calibration. Please allow camera access and try again.')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      try { cameraManager.release() } catch (e) { try { streamRef.current.getTracks().forEach(track => track.stop()) } catch (err) {} }
      streamRef.current = null
    }
    setCameraReady(false)
  }

  const measureAmbientLight = () => {
    if (!videoRef.current || !canvasRef.current) return 0
    return calibrationEngine.measureAmbientLight(videoRef.current, canvasRef.current)
  }

  // Step 1: Welcome
  const renderWelcome = () => (
    <div className="max-w-3xl mx-auto text-center space-y-8">
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-12 border-2 border-blue-200">
        <div className="w-20 h-20 mx-auto mb-6 bg-blue-600 rounded-2xl flex items-center justify-center">
          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to Vision Calibration
        </h1>
        <p className="text-xl text-gray-700 mb-8">
          To ensure accurate and reliable test results, we need to calibrate your environment.
        </p>

        <div className="bg-white rounded-2xl p-8 text-left space-y-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">Why Calibrate?</h3>
          
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-lg text-gray-900">Screen Size & Distance</h4>
                <p className="text-gray-600">Ensures tests display at the correct size and you're at the optimal viewing distance (40cm).</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-lg text-gray-900">Lighting Conditions</h4>
                <p className="text-gray-600">Verifies you have adequate lighting for accurate color and contrast perception.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-lg text-gray-900">Confidence Scoring</h4>
                <p className="text-gray-600">Gives you and your eye doctor confidence in the reliability of your results.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-amber-50 border-2 border-amber-200 rounded-xl p-6">
          <h4 className="font-bold text-amber-900 mb-3">What You'll Need:</h4>
          <ul className="text-left space-y-2 text-amber-900">
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center font-bold text-sm">1</span>
              A credit card, debit card, or driver's license
            </li>
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center font-bold text-sm">2</span>
              Camera access (for distance and lighting measurement)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center font-bold text-sm">3</span>
              2-3 minutes of time
            </li>
          </ul>
        </div>

        <button
          onClick={() => setStep('screen-size')}
          className="mt-8 bg-blue-600 text-white px-12 py-4 rounded-full font-bold text-xl hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
        >
          Start Calibration →
        </button>
      </div>
    </div>
  )

  // Step 2: Screen Size Calibration
  const renderScreenSize = () => (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          Step 1: Screen Size Calibration
        </h2>
        <p className="text-lg text-gray-600">
          Hold your card against the rectangle below and adjust it to match perfectly.
        </p>
      </div>

      <div className="bg-gray-50 rounded-3xl p-12 flex flex-col items-center justify-center">
        <div 
          id="calibration-card"
          className="border-4 border-dashed border-blue-500 bg-white rounded-2xl flex items-center justify-center relative transition-all"
          style={{ 
            width: `${cardWidthPx}px`, 
            height: `${Math.round(cardWidthPx * 0.63)}px`,
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
          }}
        >
          <div className="text-center p-6">
            <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div className="text-lg font-semibold text-gray-700">
              Standard Card Size
            </div>
            <div className="text-sm text-gray-500 mt-2">
              85.6mm × 53.98mm
            </div>
            <div className="text-xs text-gray-400 mt-4">
              {cardWidthPx}px wide
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-4">
          <button
            onClick={() => setCardWidthPx(prev => Math.max(200, prev - 10))}
            className="bg-gray-700 text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 transition-colors"
          >
            ← Smaller
          </button>
          <span className="text-gray-600 font-mono">{cardWidthPx}px</span>
          <button
            onClick={() => setCardWidthPx(prev => Math.min(500, prev + 10))}
            className="bg-gray-700 text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 transition-colors"
          >
            Larger →
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
        <p className="text-sm text-blue-900">
          <strong>Tip:</strong> Place your physical card directly on the screen and adjust the size until they match perfectly. This calibrates the display size for accurate visual acuity testing.
        </p>
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => setStep('welcome')}
          className="flex-1 bg-gray-200 text-gray-700 px-8 py-4 rounded-full font-semibold hover:bg-gray-300 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => {
            const pixelsPerMM = calibrationEngine.calculatePixelsPerMM(cardWidthPx)
            const estimatedDistance = Math.round((40 * pixelsPerMM * 10) / cardWidthPx)
            setScreenSize({ pixelsPerMM, cardWidthPx })
            setDistance({ value: estimatedDistance, unit: 'cm' })
            setStep('distance')
          }}
          className="flex-1 bg-blue-600 text-white px-8 py-4 rounded-full font-bold hover:bg-blue-700 transition-colors"
        >
          Card Matches → Next Step
        </button>
      </div>
    </div>
  )

  // Step 3: Distance Verification
  const renderDistance = () => (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          Step 2: Viewing Distance
        </h2>
        <p className="text-lg text-gray-600">
          Position yourself at the optimal viewing distance for accurate testing.
        </p>
      </div>

      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-3xl p-12 text-center border-2 border-green-200">
        <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center">
          <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </div>
        <h3 className="text-4xl font-bold text-gray-900 mb-4">
          40 cm (16 inches)
        </h3>
        <p className="text-xl text-gray-700 mb-8">
          This is about the length from your elbow to your fingertips.
        </p>

        <div className="bg-white rounded-2xl p-8 max-w-xl mx-auto">
          <h4 className="font-bold text-xl mb-4 text-gray-900">Quick Check:</h4>
          <ol className="text-left space-y-3 text-gray-700">
            <li className="flex items-start gap-3">
              <span className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center font-bold text-sm text-green-700 flex-shrink-0">1</span>
              <span>Extend your arm straight out toward the screen</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center font-bold text-sm text-green-700 flex-shrink-0">2</span>
              <span>Your fingertips should touch the screen when your elbow is at your side</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center font-bold text-sm text-green-700 flex-shrink-0">3</span>
              <span>Adjust your chair or monitor until this feels natural</span>
            </li>
          </ol>
        </div>

        <div className="mt-8 inline-flex items-center gap-3 bg-green-100 px-6 py-3 rounded-full">
          <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-semibold text-green-900">I am positioned at 40cm from the screen</span>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => setStep('screen-size')}
          className="flex-1 bg-gray-200 text-gray-700 px-8 py-4 rounded-full font-semibold hover:bg-gray-300 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={async () => {
            setStep('lighting')
            await startCamera()
          }}
          className="flex-1 bg-blue-600 text-white px-8 py-4 rounded-full font-bold hover:bg-blue-700 transition-colors"
        >
          I'm at 40cm → Next Step
        </button>
      </div>
    </div>
  )

  // Step 4: Lighting Check
  const renderLighting = () => {
    const checkLighting = async () => {
      // Wait for video to be ready
      if (!videoRef.current || videoRef.current.readyState < 2) {
        alert('Camera is still loading. Please wait a moment and try again.')
        return
      }
      
      const ambientBrightness = measureAmbientLight()
      console.log('Measured ambient brightness:', ambientBrightness)
      
      if (ambientBrightness === 0) {
        alert('Unable to measure lighting. Please ensure your camera is working and try again.')
        return
      }
      
      const assessment = calibrationEngine.assessLighting(ambientBrightness)
      console.log('Lighting assessment:', assessment)
      setLighting(assessment)
      setStep('brightness')
    }

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Step 3: Ambient Lighting Check
          </h2>
          <p className="text-lg text-gray-600">
            Let's measure your room lighting to ensure accurate color and contrast perception.
          </p>
        </div>

        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-3xl p-12 text-center border-2 border-yellow-200">
          <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-2xl flex items-center justify-center">
            <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          
          <div className="bg-white rounded-2xl p-8 mb-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Camera Preview</h3>
            <div className="relative bg-gray-900 rounded-xl overflow-hidden mx-auto" style={{ maxWidth: '640px' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-auto"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <p className="text-sm text-gray-600 mt-4">
              We'll analyze the brightness from your camera to assess lighting conditions.
              {!cameraReady && <span className="block mt-2 text-amber-600 font-semibold">⏳ Camera is loading...</span>}
              {cameraReady && <span className="block mt-2 text-green-600 font-semibold">✓ Camera ready!</span>}
            </p>
          </div>

          <div className="bg-amber-100 border-2 border-amber-300 rounded-xl p-6 max-w-xl mx-auto">
            <h4 className="font-bold text-amber-900 mb-3">Optimal Lighting:</h4>
            <ul className="text-left space-y-2 text-amber-900">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Soft, indirect room lighting (no harsh overhead lights)</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>No glare on your screen</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>No bright windows directly behind your screen</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Screen brightness matches room brightness</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => {
              stopCamera()
              setStep('distance')
            }}
            className="flex-1 bg-gray-200 text-gray-700 px-8 py-4 rounded-full font-semibold hover:bg-gray-300 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={checkLighting}
            disabled={!cameraReady}
            className={`flex-1 px-8 py-4 rounded-full font-bold transition-colors ${
              cameraReady 
                ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer' 
                : 'bg-gray-400 text-gray-600 cursor-not-allowed'
            }`}
          >
            Measure Lighting →
          </button>
        </div>
      </div>
    )
  }

  // Step 5: Screen Brightness
  const renderBrightness = () => (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          Step 4: Screen Brightness Check
        </h2>
        <p className="text-lg text-gray-600">
          Ensure your screen brightness is appropriate for testing.
        </p>
      </div>

      <div className="bg-white rounded-3xl p-12 border-4 border-gray-200">
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
            <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Can you see this text clearly?
          </h3>
          <p className="text-lg text-gray-600 mb-8">
            The background should appear white, not gray or glowing.
          </p>

          <div className="bg-gray-50 rounded-2xl p-8 max-w-xl mx-auto mb-8">
            <h4 className="font-bold text-xl mb-4">Brightness Guidelines:</h4>
            <ul className="text-left space-y-3 text-gray-700">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>Too Dim:</strong> If the screen looks gray, increase brightness</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>Too Bright:</strong> If the screen causes eye strain or "glows", reduce brightness</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>Just Right:</strong> Screen brightness should match your room lighting</span>
              </li>
            </ul>
          </div>

          <div className="flex gap-4 justify-center">
            <button
              onClick={() => {
                setBrightness({ quality: 'optimal', adjusted: false })
              }}
              className={`px-8 py-3 rounded-full font-semibold flex items-center gap-2 transition-all ${
                brightness 
                  ? 'bg-green-600 text-white ring-4 ring-green-200' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{brightness ? '✓ Confirmed' : 'Yes, I can see clearly'}</span>
            </button>
            <button
              onClick={() => {
                alert('Please adjust your screen brightness using your device settings, then click "Yes, I can see clearly" when ready.')
                setBrightness(null)
              }}
              className="bg-gray-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-gray-700"
            >
              No, need to adjust
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => setStep('lighting')}
          className="flex-1 bg-gray-200 text-gray-700 px-8 py-4 rounded-full font-semibold hover:bg-gray-300 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => {
            if (!brightness) {
              alert('Please confirm your screen brightness first.')
              return
            }
            stopCamera()
            
            // Calculate final confidence
            // User confirmed 40cm distance manually, so give it optimal score
            const distanceAssessment = { quality: 'optimal', score: 100, recommendation: 'Perfect distance!' }
            const conf = calibrationEngine.calculateConfidence(lighting, distanceAssessment, { score: 100 })
            setConfidence(conf)
            setStep('summary')
          }}
          className={`flex-1 px-8 py-4 rounded-full font-bold transition-all ${
            brightness 
              ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer' 
              : 'bg-gray-400 text-gray-600 cursor-not-allowed'
          }`}
          disabled={!brightness}
        >
          Finish Calibration →
        </button>
      </div>
    </div>
  )

  // Step 6: Summary
  const renderSummary = () => {
    const getColorClass = (quality) => {
      if (quality === 'optimal' || quality === 'good') return 'bg-green-100 text-green-800 border-green-300'
      if (quality === 'acceptable') return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      return 'bg-red-100 text-red-800 border-red-300'
    }

    const handleComplete = async () => {
      setLoading(true)
      try {
        await saveCalibration({
          screenSize,
          distance: { value: 40, unit: 'cm', assessment: calibrationEngine.assessDistance(40) },
          lighting,
          brightness,
          confidence
        })
        
        if (onComplete) {
          onComplete()
        } else {
          navigate(returnPath)
        }
      } catch (error) {
        console.error('Failed to save calibration:', error)
        alert('Failed to save calibration. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <div className="w-28 h-28 mx-auto mb-4 bg-gradient-to-br from-green-400 to-emerald-500 rounded-3xl flex items-center justify-center">
            <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-4xl font-bold text-gray-900 mb-3">
            Calibration Complete!
          </h2>
          <p className="text-lg text-gray-600">
            Here's a summary of your testing environment:
          </p>
        </div>

        {/* Confidence Score */}
        <div className={`rounded-3xl p-8 border-4 ${confidence?.level === 'high' ? 'bg-green-50 border-green-300' : confidence?.level === 'medium' ? 'bg-yellow-50 border-yellow-300' : 'bg-red-50 border-red-300'}`}>
          <div className="text-center">
            <h3 className="text-3xl font-bold mb-2" style={{ color: confidence?.color }}>
              {confidence?.label}
            </h3>
            <p className="text-lg text-gray-700 mb-4">{confidence?.message}</p>
            <div className="text-5xl font-bold" style={{ color: confidence?.color }}>
              {Math.round(confidence?.score || 0)}%
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-2xl p-8 border-2 border-gray-200 space-y-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">Environment Details:</h3>
          
          <div className={`p-4 rounded-xl border-2 ${getColorClass(lighting?.quality)}`}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span className="font-semibold">Ambient Lighting:</span>
              </div>
              <span className="font-bold uppercase">{lighting?.level?.replace('_', ' ')}</span>
            </div>
            <p className="text-sm mt-2">{lighting?.recommendation}</p>
          </div>

          <div className={`p-4 rounded-xl border-2 ${getColorClass(calibrationEngine.assessDistance(40).quality)}`}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                <span className="font-semibold">Viewing Distance:</span>
              </div>
              <span className="font-bold">40 cm</span>
            </div>
            <p className="text-sm mt-2">{calibrationEngine.assessDistance(40).recommendation}</p>
          </div>

          <div className={`p-4 rounded-xl border-2 ${getColorClass(brightness?.quality)}`}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="font-semibold">Screen Brightness:</span>
              </div>
              <span className="font-bold">OPTIMAL</span>
            </div>
            <p className="text-sm mt-2">Screen brightness is appropriate for testing.</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          {confidence?.level === 'low' && (
            <button
              onClick={() => setStep('welcome')}
              className="flex-1 bg-amber-600 text-white px-8 py-4 rounded-full font-bold hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Recalibrate (Recommended)</span>
            </button>
          )}
          <button
            onClick={handleComplete}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white px-8 py-4 rounded-full font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Continue to Tests →'}
          </button>
        </div>

        <p className="text-center text-sm text-gray-500">
          Calibration valid for 7 days. You can recalibrate anytime from the test menu.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Progress Bar */}
        {step !== 'welcome' && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-gray-600">
                Step {step === 'screen-size' ? '1' : step === 'distance' ? '2' : step === 'lighting' ? '3' : step === 'brightness' ? '4' : '5'} of 5
              </span>
              <span className="text-sm font-semibold text-blue-600">
                {step === 'screen-size' ? '20%' : step === 'distance' ? '40%' : step === 'lighting' ? '60%' : step === 'brightness' ? '80%' : '100%'} Complete
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ 
                  width: step === 'screen-size' ? '20%' : step === 'distance' ? '40%' : step === 'lighting' ? '60%' : step === 'brightness' ? '80%' : '100%'
                }}
              />
            </div>
          </div>
        )}

        {/* Render Current Step */}
        {step === 'welcome' && renderWelcome()}
        {step === 'screen-size' && renderScreenSize()}
        {step === 'distance' && renderDistance()}
        {step === 'lighting' && renderLighting()}
        {step === 'brightness' && renderBrightness()}
        {step === 'summary' && renderSummary()}
      </div>
    </div>
  )
}

export default UniversalCalibration
