/**
 * Distance Calibration Engine using IPD (Interpupillary Distance)
 * 
 * This module provides universal distance measurement across any camera
 * by using the constant of human anatomy: average IPD is 63mm
 * 
 * Theory: Triangle Similarity
 * D = (W × F) / P
 * where:
 * - D = Distance from camera
 * - W = Real-world width (IPD = 63mm)
 * - F = Focal constant (camera-specific, calculated during calibration)
 * - P = Pixel width between pupils
 */

// Constants
const AVG_IPD_MM = 63 // Average adult interpupillary distance
const IPD_RANGE = { min: 54, max: 74 } // 95% of adults fall within this range

// Test-specific optimal distances (in mm)
export const OPTIMAL_DISTANCES = {
  // Near Zone (12-16 inches / 30-40cm) - Fine detail and macular health
  amsler_grid: 355,    // 14 inches (35.5cm) - Tests central 20° of macula
  color_vision: 355,   // 14 inches (35.5cm) - Ishihara standard distance
  contrast_sensitivity: 406, // 16 inches (40.6cm) - Reading distance simulation
  red_reflex: 305,     // 12 inches (30.5cm) - Bruckner test, retinal reflex capture
  
  // Arm's Length Zone (20-25 inches / 50-65cm) - Ergonomics and ciliary muscle
  eye_burnout: 610,    // 24 inches (61cm) - Ciliary muscle strain measurement
  ocular_ergonomics: 610, // 24 inches (61cm) - Standard monitor distance
  peripheral_awareness: 508, // 20 inches (50.8cm) - Peripheral field testing
  
  // Standardized Zone - Distance acuity simulation
  visual_acuity: 1000, // 40 inches (100cm / 1 meter) - Simulates 20ft with DPI-scaled letters
  peripheral_field: 457, // 18 inches (45.7cm) - Fixed angle peripheral testing
  
  // Legacy/fallback
  glaucoma_neural: 457, // 18 inches
  cataract_glare: 508,  // 20 inches
  accommodative_lag: 406, // 16 inches
  default: 406 // 16 inches default
}

// Distance tolerance (±10%)
export const DISTANCE_TOLERANCE = 0.10

class DistanceCalibrationEngine {
  constructor() {
    this.focalConstant = null
    this.calibrated = false
    this.calibrationHistory = []
  }

  /**
   * Phase 1: Calibration
   * Ask user to position themselves at a known distance
   * We measure the pixel width of their IPD to calculate the focal constant
   * 
   * @param {number} pixelIPD - Measured pixel distance between pupils
   * @param {number} knownDistanceMM - Distance user is sitting at (default 400mm)
   * @returns {object} Calibration result
   */
  calibrate(pixelIPD, knownDistanceMM = 400) {
    if (!pixelIPD || pixelIPD <= 0) {
      throw new Error('Invalid pixel IPD measurement')
    }

    // F = (P × D) / W
    this.focalConstant = (pixelIPD * knownDistanceMM) / AVG_IPD_MM
    this.calibrated = true

    // Store calibration for quality tracking
    this.calibrationHistory.push({
      timestamp: Date.now(),
      focalConstant: this.focalConstant,
      pixelIPD,
      knownDistanceMM
    })

    console.log('✓ Camera calibrated:', {
      focalConstant: this.focalConstant.toFixed(2),
      pixelIPD: pixelIPD.toFixed(1),
      knownDistance: knownDistanceMM + 'mm'
    })

    return {
      success: true,
      focalConstant: this.focalConstant,
      message: 'Camera successfully calibrated'
    }
  }

  /**
   * Phase 2: Real-time Distance Monitoring
   * Calculate current distance based on measured pixel IPD
   * 
   * @param {number} currentPixelIPD - Current measured pixel distance between pupils
   * @returns {number} Distance in millimeters
   */
  getDistance(currentPixelIPD) {
    if (!this.calibrated || !this.focalConstant) {
      throw new Error('Camera not calibrated. Call calibrate() first.')
    }

    if (!currentPixelIPD || currentPixelIPD <= 0) {
      return null
    }

    // D = (W × F) / P
    const distanceMM = (AVG_IPD_MM * this.focalConstant) / currentPixelIPD
    return distanceMM
  }

  /**
   * Get distance feedback for UI
   * 
   * @param {number} currentDistance - Current distance in mm
   * @param {string} testType - Type of vision test
   * @returns {object} Feedback object with status, message, and color
   */
  getDistanceFeedback(currentDistance, testType = 'default') {
    const optimalDistance = OPTIMAL_DISTANCES[testType] || OPTIMAL_DISTANCES.default
    const minDistance = optimalDistance * (1 - DISTANCE_TOLERANCE)
    const maxDistance = optimalDistance * (1 + DISTANCE_TOLERANCE)

    const distanceCM = Math.round(currentDistance / 10)
    const optimalCM = Math.round(optimalDistance / 10)

    if (currentDistance < minDistance * 0.8) {
      return {
        status: 'too-close-critical',
        message: `WAY TOO CLOSE! Move back to ${optimalCM}cm`,
        color: 'red',
        borderColor: 'border-red-500',
        bgColor: 'bg-red-500',
        textColor: 'text-red-500',
        action: 'move-back',
        severity: 'critical'
      }
    }

    if (currentDistance < minDistance) {
      return {
        status: 'too-close',
        message: `Too Close - Move back to ${optimalCM}cm`,
        color: 'orange',
        borderColor: 'border-orange-500',
        bgColor: 'bg-orange-500',
        textColor: 'text-orange-500',
        action: 'move-back',
        severity: 'warning'
      }
    }

    if (currentDistance > maxDistance * 1.3) {
      return {
        status: 'too-far-critical',
        message: `WAY TOO FAR! Move closer to ${optimalCM}cm`,
        color: 'blue',
        borderColor: 'border-blue-500',
        bgColor: 'bg-blue-500',
        textColor: 'text-blue-500',
        action: 'move-closer',
        severity: 'critical'
      }
    }

    if (currentDistance > maxDistance) {
      return {
        status: 'too-far',
        message: `Too Far - Move closer to ${optimalCM}cm`,
        color: 'cyan',
        borderColor: 'border-cyan-500',
        bgColor: 'bg-cyan-500',
        textColor: 'text-cyan-500',
        action: 'move-closer',
        severity: 'warning'
      }
    }

    return {
      status: 'perfect',
      message: `Perfect Distance! (${distanceCM}cm)`,
      color: 'green',
      borderColor: 'border-green-500',
      bgColor: 'bg-green-500',
      textColor: 'text-green-500',
      action: 'hold-steady',
      severity: 'success'
    }
  }

  /**
   * Validate calibration quality
   * Checks if measurements are within reasonable bounds
   * 
   * @param {number} pixelIPD - Measured pixel IPD
   * @returns {object} Validation result
   */
  validateMeasurement(pixelIPD) {
    // Sanity check: pixel IPD should be reasonable (20-200 pixels typically)
    if (pixelIPD < 20) {
      return {
        valid: false,
        reason: 'Face too far away or not detected properly',
        suggestion: 'Move closer to the camera'
      }
    }

    if (pixelIPD > 300) {
      return {
        valid: false,
        reason: 'Face too close to camera',
        suggestion: 'Move back from the camera'
      }
    }

    return {
      valid: true,
      reason: 'Measurement within valid range'
    }
  }

  /**
   * Get calibration status
   */
  getStatus() {
    return {
      calibrated: this.calibrated,
      focalConstant: this.focalConstant,
      calibrationCount: this.calibrationHistory.length,
      lastCalibration: this.calibrationHistory[this.calibrationHistory.length - 1]
    }
  }

  /**
   * Reset calibration
   */
  reset() {
    this.focalConstant = null
    this.calibrated = false
    console.log('Calibration reset')
  }

  /**
   * Save calibration to localStorage
   */
  save() {
    if (!this.calibrated) return

    const data = {
      focalConstant: this.focalConstant,
      timestamp: Date.now(),
      calibrationHistory: this.calibrationHistory
    }

    localStorage.setItem('eyevio_distance_calibration', JSON.stringify(data))
    console.log('✓ Calibration saved to localStorage')
  }

  /**
   * Load calibration from localStorage
   * 
   * @param {number} maxAgeHours - Maximum age of calibration in hours (default 24)
   * @returns {boolean} Success status
   */
  load(maxAgeHours = 24) {
    try {
      const data = JSON.parse(localStorage.getItem('eyevio_distance_calibration'))
      
      if (!data || !data.focalConstant) {
        return false
      }

      // Check if calibration is too old
      const ageHours = (Date.now() - data.timestamp) / (1000 * 60 * 60)
      if (ageHours > maxAgeHours) {
        console.log('Calibration expired (age: ' + ageHours.toFixed(1) + 'h)')
        return false
      }

      this.focalConstant = data.focalConstant
      this.calibrationHistory = data.calibrationHistory || []
      this.calibrated = true

      console.log('✓ Calibration loaded from localStorage (age: ' + ageHours.toFixed(1) + 'h)')
      return true
    } catch (error) {
      console.error('Failed to load calibration:', error)
      return false
    }
  }
}

// Export singleton instance
const distanceCalibration = new DistanceCalibrationEngine()
export default distanceCalibration
