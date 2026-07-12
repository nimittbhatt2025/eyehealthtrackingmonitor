import { useState } from 'react'
import InlineDistanceCalibration from './InlineDistanceCalibration'
import EyeCoverageVerification from './EyeCoverageVerification'

// UnifiedCalibration orchestrates one or more calibration steps in sequence.
// steps: array of 'distance' | 'eyeCoverage' | 'gamma' (gamma not yet implemented)
const UnifiedCalibration = ({
  steps = ['distance'],
  onFinish = () => {},
  testName = '',
  splitLayout = false,
  testType = 'default',
  optimalDistanceMM,
  toleranceMM,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  const currentStep = steps[currentStepIndex]

  const stepNames = steps.map(s => s === 'distance' ? 'Distance' : s === 'eyeCoverage' ? 'Eye Coverage' : 'Gamma')

  const next = () => {
    if (currentStepIndex + 1 < steps.length) {
      setCurrentStepIndex(i => i + 1)
    } else {
      onFinish()
    }
  }

  return (
    <div className={splitLayout ? '' : 'min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-6 px-4'}>
      <div className={splitLayout ? '' : 'max-w-4xl mx-auto'}>
        {!splitLayout && (
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{testName || 'Calibration'}</h2>
              <p className="text-sm text-gray-600">Step {currentStepIndex + 1} of {steps.length}: <span className="font-semibold">{stepNames[currentStepIndex]}</span></p>
            </div>
            <div>
              <button type="button" onClick={() => onFinish()} className="text-sm text-gray-500 hover:underline">Skip all</button>
            </div>
          </div>
        </div>
        )}

        <div className={splitLayout ? '' : 'bg-white rounded-2xl shadow p-6'}>
          {currentStep === 'distance' && (
            <InlineDistanceCalibration
              testType={testType}
              optimalDistanceMM={optimalDistanceMM}
              toleranceMM={toleranceMM}
              splitLayout={splitLayout}
              testName={testName}
              onDistanceValid={() => next()}
              onDistanceInvalid={() => { /* no-op */ }}
            />
          )}

          {currentStep === 'eyeCoverage' && (
            <EyeCoverageVerification
              expectedEye="right"
              splitLayout={splitLayout}
              testName={testName}
              onVerified={() => next()}
              onSkip={() => next()}
            />
          )}

          {currentStep === 'gamma' && (
            <div className="p-6 text-center">
              <p className="text-gray-700">Gamma / black point calibration coming soon.</p>
              <button onClick={() => next()} className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-xl">Skip</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default UnifiedCalibration
