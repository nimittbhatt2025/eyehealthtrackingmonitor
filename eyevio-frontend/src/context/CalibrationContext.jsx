import { createContext, useContext, useState, useEffect } from 'react'
import calibrationEngine from '../utils/calibrationEngine'

const CalibrationContext = createContext()

export const useCalibration = () => {
  const context = useContext(CalibrationContext)
  if (!context) {
    throw new Error('useCalibration must be used within CalibrationProvider')
  }
  return context
}

export const CalibrationProvider = ({ children }) => {
  const [calibration, setCalibration] = useState(null)
  const [isCalibrated, setIsCalibrated] = useState(false)
  const [needsRecalibration, setNeedsRecalibration] = useState(false)

  useEffect(() => {
    loadCalibration()
  }, [])

  const loadCalibration = () => {
    const summary = calibrationEngine.getCalibrationSummary()
    setCalibration(summary)
    setIsCalibrated(summary.calibrated)
    setNeedsRecalibration(summary.needsRecalibration)
  }

  const saveCalibration = async (data) => {
    await calibrationEngine.saveCalibration(data)
    loadCalibration()
  }

  const clearCalibration = () => {
    calibrationEngine.clearCalibration()
    setCalibration(null)
    setIsCalibrated(false)
    setNeedsRecalibration(false)
  }

  const getConfidence = () => {
    if (!calibration) return { level: 'none', score: 0 }
    return calibration.confidence
  }

  return (
    <CalibrationContext.Provider
      value={{
        calibration,
        isCalibrated,
        needsRecalibration,
        saveCalibration,
        clearCalibration,
        loadCalibration,
        getConfidence
      }}
    >
      {children}
    </CalibrationContext.Provider>
  )
}
