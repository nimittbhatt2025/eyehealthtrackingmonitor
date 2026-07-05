import { useState } from 'react'

/**
 * GlassesContactsCheck Component
 * Verifies that user has removed corrective lenses for testing
 */
const GlassesContactsCheck = ({ 
  onConfirm, 
  onComplete, 
  onBack, 
  testType = 'Vision Test',
  requirement = 'required',
  message 
}) => {
  const [wearsCorrection, setWearsCorrection] = useState(null)
  const [hasRemoved, setHasRemoved] = useState(false)

  const handleContinue = () => {
    if (wearsCorrection === false || (wearsCorrection === true && hasRemoved)) {
      const info = { wearsCorrection, hasRemoved }
      // Support both onConfirm (old) and onComplete (new) prop names
      if (onComplete) {
        onComplete(info)
      } else if (onConfirm) {
        onConfirm(info)
      }
    }
  }

  const canContinue = wearsCorrection === false || (wearsCorrection === true && hasRemoved)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          Corrective Lenses Check
        </h2>
        <p className="text-lg text-gray-600">
          {message || 'For accurate natural vision testing, corrective lenses must be removed'}
        </p>
      </div>

      {/* Question 1: Do you wear glasses or contacts? */}
      <div className="bg-white rounded-2xl p-8 border-2 border-gray-200">
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          Do you currently wear glasses or contact lenses for distance vision?
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => {
              setWearsCorrection(true)
              setHasRemoved(false)
            }}
            className={`p-6 rounded-xl border-2 transition-all ${
              wearsCorrection === true
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <p className="font-semibold text-lg">Yes</p>
              <p className="text-sm text-gray-600 mt-1">I wear glasses or contacts</p>
            </div>
          </button>

          <button
            onClick={() => {
              setWearsCorrection(false)
              setHasRemoved(false)
            }}
            className={`p-6 rounded-xl border-2 transition-all ${
              wearsCorrection === false
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-semibold text-lg">No</p>
              <p className="text-sm text-gray-600 mt-1">I don't wear correction</p>
            </div>
          </button>
        </div>
      </div>

      {/* Question 2: Have you removed them? (only if they wear correction) */}
      {wearsCorrection === true && (
        <div className="bg-amber-50 rounded-2xl p-8 border-2 border-amber-300">
          <div className="flex items-start gap-4 mb-6">
            <svg className="w-8 h-8 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-xl font-bold text-amber-900 mb-2">
                Please Remove Your Corrective Lenses
              </h3>
              <p className="text-amber-900 mb-4">
                This test measures your natural, uncorrected vision. Wearing glasses or contacts will invalidate the results.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border-2 border-amber-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasRemoved}
                onChange={(e) => setHasRemoved(e.target.checked)}
                className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-gray-900 font-medium">
                I confirm that I have removed my glasses/contact lenses and am testing my uncorrected natural vision
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Information Box */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
        <h4 className="font-bold text-blue-900 mb-3">Why This Matters:</h4>
        <ul className="space-y-2 text-blue-900 text-sm">
          <li className="flex items-start gap-2">
            <span className="font-bold mt-0.5">•</span>
            <span><strong>Baseline Testing:</strong> We need to measure your natural vision to detect changes over time</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold mt-0.5">•</span>
            <span><strong>Accurate Results:</strong> Testing with correction would hide vision problems we need to detect</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold mt-0.5">•</span>
            <span><strong>Safety First:</strong> If you cannot safely navigate without correction, please retake this test another time</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold mt-0.5">•</span>
            <span><strong>For Contact Wearers:</strong> Remove contacts at least 15 minutes before testing for accurate results</span>
          </li>
        </ul>
      </div>

      {/* Continue Button */}
      <div className="flex gap-4">
        <button
          onClick={onBack || (() => window.history.back())}
          className="flex-1 bg-gray-200 text-gray-700 px-6 py-4 rounded-full font-semibold hover:bg-gray-300 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className={`flex-1 px-6 py-4 rounded-full font-bold transition-colors ${
            canContinue
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Continue to Test →
        </button>
      </div>

      {!canContinue && wearsCorrection === true && (
        <p className="text-center text-amber-700 font-medium">
          Please confirm that you have removed your corrective lenses to continue
        </p>
      )}
    </div>
  )
}

export default GlassesContactsCheck
