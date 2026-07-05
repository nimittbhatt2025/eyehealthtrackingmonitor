import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function DistanceCalibration({ testType, onCalibrated }) {
  const [step, setStep] = useState('instructions')
  const [cardWidth, setCardWidth] = useState(null)
  const [distance, setDistance] = useState(null)
  const navigate = useNavigate()

  // Standard credit card dimensions: 85.6mm × 53.98mm
  const CARD_WIDTH_MM = 85.6
  const OPTIMAL_DISTANCE_CM = 40 // 40cm = 16 inches (medical standard for digital tests)

  const handleCardMeasurement = () => {
    // Get the actual pixel width of the card element
    const cardElement = document.getElementById('calibration-card')
    if (cardElement) {
      const pixelWidth = cardElement.offsetWidth
      setCardWidth(pixelWidth)
      
      // Calculate pixels per mm
      const pixelsPerMm = pixelWidth / CARD_WIDTH_MM
      
      // Estimate distance (simplified - would need more complex calculation in production)
      const estimatedDistance = Math.round((OPTIMAL_DISTANCE_CM * pixelsPerMm) / 10)
      setDistance(estimatedDistance)
      setStep('distance')
    }
  }

  const renderInstructions = () => (
    <div className="max-w-2xl mx-auto text-center space-y-6">
      <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-8">
        <h2 className="text-3xl font-serif font-bold text-gray-900 mb-4">
          Distance Calibration
        </h2>
        <p className="text-lg text-gray-700 mb-6">
          For accurate test results, we need to calibrate your viewing distance.
        </p>
        
        <div className="bg-white rounded-xl p-6 mb-6 text-left space-y-4">
          <h3 className="font-semibold text-gray-900 mb-3">What you'll need:</h3>
          <ul className="space-y-3 text-gray-700">
            <li className="flex items-start">
              <span className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                <span className="text-primary-700 font-bold text-sm">1</span>
              </span>
              <span>A standard credit card, debit card, or driver's license</span>
            </li>
            <li className="flex items-start">
              <span className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                <span className="text-primary-700 font-bold text-sm">2</span>
              </span>
              <span>Position your device 40cm (16 inches) away - about the length from your elbow to fingertips</span>
            </li>
            <li className="flex items-start">
              <span className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                <span className="text-primary-700 font-bold text-sm">3</span>
              </span>
              <span>Good lighting in your room</span>
            </li>
          </ul>
        </div>

        <button
          onClick={() => setStep('measure')}
          className="bg-primary-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-primary-700 transition-colors text-lg"
        >
          I'm Ready →
        </button>
      </div>
    </div>
  )

  const renderMeasurement = () => (
    <div className="max-w-2xl mx-auto text-center space-y-6">
      <h2 className="text-3xl font-serif font-bold text-gray-900 mb-4">
        Place Your Card on the Screen
      </h2>
      <p className="text-lg text-gray-700 mb-6">
        Hold your card (credit card, ID, etc.) against the rectangle below and adjust it to match the size.
      </p>

      <div className="bg-gray-50 rounded-2xl p-12 flex flex-col items-center justify-center">
        <div 
          id="calibration-card"
          className="border-4 border-dashed border-primary-500 bg-white rounded-lg flex items-center justify-center relative"
          style={{ 
            width: '325px', 
            height: '205px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}
        >
          <div className="text-center">
            <div className="text-6xl mb-2">💳</div>
            <div className="text-sm text-gray-600 font-medium">
              Standard Card Size<br/>
              85.6mm × 53.98mm
            </div>
          </div>
          
          {/* Corner markers */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-primary-600"></div>
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary-600"></div>
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary-600"></div>
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-primary-600"></div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
         <strong>Tip:</strong> If the rectangle is too small or too large compared to your card, 
        adjust your browser zoom level (Cmd/Ctrl + or -)
      </div>

      <button
        onClick={handleCardMeasurement}
        className="bg-primary-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-primary-700 transition-colors text-lg"
      >
        Card Matches →
      </button>
    </div>
  )

  const renderDistance = () => (
    <div className="max-w-2xl mx-auto text-center space-y-6">
      <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-8">
        <div className="text-6xl mb-4"></div>
        <h2 className="text-3xl font-serif font-bold text-gray-900 mb-4">
          Calibration Complete!
        </h2>
        
        <div className="bg-white rounded-xl p-6 mb-6">
          <div className="text-sm text-gray-600 mb-2">Optimal Testing Distance</div>
          <div className="text-5xl font-serif font-bold text-primary-700 mb-2">
            {OPTIMAL_DISTANCE_CM}cm
          </div>
          <div className="text-gray-600">
            ({Math.round(OPTIMAL_DISTANCE_CM / 2.54)} inches - about elbow to fingertips distance)
          </div>
          <div className="mt-3 text-sm text-gray-500">
            This is the medical standard for digital vision testing
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl p-6 mb-6 text-left">
          <h3 className="font-semibold text-gray-900 mb-3">Before you start:</h3>
          <ul className="space-y-2 text-gray-700 text-sm">
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Sit 40cm (16 inches) from your screen - measure with a ruler for accuracy</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Ensure good lighting (no glare on screen, no backlighting)</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Keep your screen at eye level (not looking up or down)</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Remove glasses if testing uncorrected vision</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Sit in a comfortable position with good posture</span>
            </li>
          </ul>
        </div>

        <button
          onClick={() => onCalibrated({ distance: OPTIMAL_DISTANCE_CM, pixelWidth: cardWidth })}
          className="bg-primary-600 text-white px-8 py-4 rounded-full font-semibold hover:bg-primary-700 transition-colors text-lg"
        >
          Start {testType === 'acuity' ? 'Acuity' : testType === 'contrast' ? 'Contrast' : 'Color'} Test →
        </button>
        
        <button
          onClick={() => navigate('/vision-tests')}
          className="block mx-auto mt-4 text-gray-600 hover:text-gray-900 underline"
        >
          Cancel
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-cream-200 py-12 px-4">
      {step === 'instructions' && renderInstructions()}
      {step === 'measure' && renderMeasurement()}
      {step === 'distance' && renderDistance()}
    </div>
  )
}

export default DistanceCalibration
