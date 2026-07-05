import { useNavigate } from 'react-router-dom'
import { useCalibration } from '../context/CalibrationContext'

/**
 * Calibration Status Badge
 * Shows calibration status and confidence level
 * Used in test pages to indicate result reliability
 */

const CalibrationBadge = ({ showDetails = false, className = '' }) => {
  const navigate = useNavigate()
  const { calibration, isCalibrated, needsRecalibration } = useCalibration()

  if (!isCalibrated) {
    return (
      <div className={`inline-flex items-center gap-2 bg-red-50 border-2 border-red-300 rounded-lg px-4 py-2 ${className}`}>
        <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <div className="font-bold text-red-900 text-sm">Not Calibrated</div>
          <button
            onClick={() => navigate('/calibration')}
            className="text-xs text-red-700 underline hover:text-red-900"
          >
            Calibrate Now
          </button>
        </div>
      </div>
    )
  }

  if (needsRecalibration) {
    return (
      <div className={`inline-flex items-center gap-2 bg-yellow-50 border-2 border-yellow-300 rounded-lg px-4 py-2 ${className}`}>
        <svg className="w-6 h-6 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <div>
          <div className="font-bold text-yellow-900 text-sm">Calibration Expired</div>
          <button
            onClick={() => navigate('/calibration')}
            className="text-xs text-yellow-700 underline hover:text-yellow-900"
          >
            Recalibrate
          </button>
        </div>
      </div>
    )
  }

  const confidence = calibration?.confidence || { level: 'medium', score: 75 }
  
  const getColorClass = () => {
    if (confidence.level === 'high') return 'bg-green-50 border-green-300 text-green-900'
    if (confidence.level === 'medium') return 'bg-yellow-50 border-yellow-300 text-yellow-900'
    return 'bg-red-50 border-red-300 text-red-900'
  }

  const getIcon = () => {
    if (confidence.level === 'high') {
      return (
        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
    if (confidence.level === 'medium') {
      return (
        <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    }
    return (
      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    )
  }

  return (
    <div className={`inline-flex items-center gap-2 border-2 rounded-lg px-4 py-2 ${getColorClass()} ${className}`}>
      {getIcon()}
      <div>
        <div className="font-bold text-sm">
          Confidence: {confidence.label}
        </div>
        {showDetails && (
          <div className="text-xs mt-1">
            {confidence.message}
          </div>
        )}
        <button
          onClick={() => navigate('/calibration')}
          className="text-xs underline hover:opacity-80 mt-1"
        >
          Recalibrate
        </button>
      </div>
    </div>
  )
}

export default CalibrationBadge
