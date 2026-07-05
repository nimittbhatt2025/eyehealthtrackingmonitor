/**
 * Calibration Engine - Foundation for all vision tests
 * Ensures reliable, consistent results across devices and environments
 */

export class CalibrationEngine {
  constructor() {
    this.calibrationData = this.loadCalibration()
  }

  /**
   * Load saved calibration from localStorage
   */
  loadCalibration() {
    try {
      const saved = localStorage.getItem('eyevio_calibration')
      return saved ? JSON.parse(saved) : null
    } catch (error) {
      console.error('Failed to load calibration:', error)
      return null
    }
  }

  /**
   * Save calibration to localStorage and backend
   */
  async saveCalibration(data) {
    try {
      const calibration = {
        ...data,
        timestamp: new Date().toISOString(),
        device: this.getDeviceInfo(),
        version: '1.0'
      }
      
      localStorage.setItem('eyevio_calibration', JSON.stringify(calibration))
      this.calibrationData = calibration
      
      return calibration
    } catch (error) {
      console.error('Failed to save calibration:', error)
      throw error
    }
  }

  /**
   * Check if calibration is valid (not expired, same device)
   */
  isCalibrationValid() {
    if (!this.calibrationData) return false
    
    // Check if expired (7 days)
    const age = Date.now() - new Date(this.calibrationData.timestamp).getTime()
    const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days
    if (age > maxAge) return false
    
    // Check if same device
    const currentDevice = this.getDeviceInfo()
    if (this.calibrationData.device.screenWidth !== currentDevice.screenWidth ||
        this.calibrationData.device.screenHeight !== currentDevice.screenHeight) {
      return false
    }
    
    return true
  }

  /**
   * Get device information
   */
  getDeviceInfo() {
    return {
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      devicePixelRatio: window.devicePixelRatio,
      userAgent: navigator.userAgent,
      platform: navigator.platform
    }
  }

  /**
   * Calculate pixels per millimeter based on card measurement
   */
  calculatePixelsPerMM(cardWidthPixels) {
    const CARD_WIDTH_MM = 85.6 // Standard credit card width
    return cardWidthPixels / CARD_WIDTH_MM
  }

  /**
   * Measure ambient light from video feed
   */
  measureAmbientLight(videoElement, canvasElement) {
    if (!videoElement || !canvasElement) return 0

    const ctx = canvasElement.getContext('2d')
    canvasElement.width = videoElement.videoWidth
    canvasElement.height = videoElement.videoHeight
    ctx.drawImage(videoElement, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height)
    const data = imageData.data

    // Calculate average brightness
    let totalBrightness = 0
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
      totalBrightness += brightness
    }

    return Math.round(totalBrightness / (data.length / 4))
  }

  /**
   * Assess ambient lighting quality
   */
  assessLighting(ambientBrightness) {
    // Target: 300-500 lux (indoor office lighting)
    // Webcam brightness mapping: ~100-150 = good
    if (ambientBrightness < 60) {
      return {
        level: 'too_dark',
        quality: 'poor',
        score: 40,
        recommendation: 'Turn on room lights. Your environment is too dark for accurate testing.'
      }
    }
    if (ambientBrightness < 90) {
      return {
        level: 'dim',
        quality: 'acceptable',
        score: 70,
        recommendation: 'Lighting is acceptable but could be improved. Add more ambient light if possible.'
      }
    }
    if (ambientBrightness <= 170) {
      return {
        level: 'optimal',
        quality: 'good',
        score: 100,
        recommendation: 'Lighting is optimal for testing.'
      }
    }
    return {
      level: 'too_bright',
      quality: 'acceptable',
      score: 80,
      recommendation: 'Very bright environment. Reduce direct lighting or move to a more neutral space.'
    }
  }

  /**
   * Assess viewing distance
   */
  assessDistance(distanceCM) {
    const OPTIMAL_MIN = 38
    const OPTIMAL_MAX = 42
    
    if (distanceCM < 30) {
      return {
        quality: 'poor',
        score: 50,
        recommendation: 'Too close! Move back to 40cm (16 inches) for accurate results.'
      }
    }
    if (distanceCM < OPTIMAL_MIN) {
      return {
        quality: 'acceptable',
        score: 75,
        recommendation: 'Slightly too close. Move back a bit to 40cm.'
      }
    }
    if (distanceCM <= OPTIMAL_MAX) {
      return {
        quality: 'optimal',
        score: 100,
        recommendation: 'Perfect distance!'
      }
    }
    if (distanceCM <= 50) {
      return {
        quality: 'acceptable',
        score: 80,
        recommendation: 'Slightly too far. Move closer to 40cm.'
      }
    }
    return {
      quality: 'poor',
      score: 60,
      recommendation: 'Too far away. Move closer to 40cm (16 inches).'
    }
  }

  /**
   * Calculate overall calibration confidence score
   */
  calculateConfidence(lighting, distance, screenSize) {
    let totalScore = 0
    let weights = { lighting: 0.4, distance: 0.4, screenSize: 0.2 }
    
    totalScore += (lighting?.score || 0) * weights.lighting
    totalScore += (distance?.score || 0) * weights.distance
    totalScore += (screenSize?.score || 100) * weights.screenSize
    
    if (totalScore >= 90) {
      return {
        level: 'high',
        score: totalScore,
        label: 'High Confidence',
        color: 'green',
        message: 'Environment is optimized for reliable testing.'
      }
    }
    if (totalScore >= 75) {
      return {
        level: 'medium',
        score: totalScore,
        label: 'Medium Confidence',
        color: 'yellow',
        message: 'Environment is acceptable. Results should be reliable.'
      }
    }
    return {
      level: 'low',
      score: totalScore,
      label: 'Low Confidence',
      color: 'red',
      message: 'Environment needs improvement. Consider recalibrating.'
    }
  }

  /**
   * Get calibration summary
   */
  getCalibrationSummary() {
    if (!this.calibrationData) {
      return {
        calibrated: false,
        confidence: { level: 'none', score: 0 }
      }
    }

    const lighting = this.calibrationData.lighting
    const distance = this.calibrationData.distance
    
    // Recalculate distance assessment with the stored distance value (or default to 40cm)
    const distanceValue = distance?.value || 40
    const distanceAssessment = this.assessDistance(distanceValue)
    
    const confidence = this.calculateConfidence(lighting, distanceAssessment, { score: 100 })

    return {
      calibrated: true,
      timestamp: this.calibrationData.timestamp,
      daysOld: Math.floor((Date.now() - new Date(this.calibrationData.timestamp)) / (1000 * 60 * 60 * 24)),
      lighting: lighting,
      distance: distance,
      confidence: confidence,
      needsRecalibration: !this.isCalibrationValid()
    }
  }

  /**
   * Clear calibration (force recalibration)
   */
  clearCalibration() {
    localStorage.removeItem('eyevio_calibration')
    this.calibrationData = null
  }
}

export default new CalibrationEngine()
