/**
 * Client-side lighting assessment for eye photo capture.
 * Mirrors backend heuristics for live preview feedback.
 */

function sampleVideoFrame(video, canvas) {
  if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
    return null
  }

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0)

  const w = canvas.width
  const h = canvas.height
  const imageData = ctx.getImageData(
    Math.floor(w * 0.2),
    Math.floor(h * 0.12),
    Math.floor(w * 0.6),
    Math.floor(h * 0.76)
  )
  return imageData
}

function assessLightingFromImageData(imageData) {
  if (!imageData) {
    return {
      quality: 'poor',
      acceptable: false,
      score: 0,
      issues: ['Camera not ready'],
      recommendations: ['Wait for the camera preview to load.'],
      message: 'Camera not ready.',
    }
  }

  const { data, width, height } = imageData
  const pixels = width * height
  if (!pixels) {
    return {
      quality: 'poor',
      acceptable: false,
      score: 0,
      issues: ['No image data'],
      recommendations: ['Try reloading the camera.'],
      message: 'Could not read camera frame.',
    }
  }

  let total = 0
  let under = 0
  let over = 0
  let leftTotal = 0
  let rightTotal = 0
  const mid = Math.floor(width / 2)
  const values = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const luma = (data[i] + data[i + 1] + data[i + 2]) / 3
      values.push(luma)
      total += luma
      if (luma < 40) under++
      if (luma > 245) over++
      if (x < mid) leftTotal += luma
      else rightTotal += luma
    }
  }

  const mean = total / pixels
  const leftMean = leftTotal / (pixels / 2)
  const rightMean = rightTotal / (pixels / 2)
  const lrDelta = Math.abs(leftMean - rightMean)
  const underRatio = under / pixels
  const overRatio = over / pixels

  const avg = mean
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / pixels
  const std = Math.sqrt(variance)

  const issues = []
  const recommendations = []
  let quality = 'good'
  let acceptable = true
  let score = 100

  if (mean < 55) {
    issues.push('Too dark')
    recommendations.push('Turn on soft room lights or face indirect daylight')
    quality = 'poor'
    acceptable = false
    score -= 45
  } else if (mean < 78) {
    issues.push('Lighting is dim')
    recommendations.push('Add more even front-facing light')
    quality = 'fair'
    score -= 22
  }

  if (mean > 215) {
    issues.push('Too bright / glare')
    recommendations.push('Reduce direct light on your face')
    quality = 'poor'
    acceptable = false
    score -= 40
  } else if (mean > 188) {
    issues.push('Lighting may be too bright')
    recommendations.push('Use softer, indirect lighting')
    if (quality === 'good') quality = 'fair'
    score -= 18
  }

  if (overRatio > 0.07) {
    issues.push('Glare spots detected')
    recommendations.push('Avoid windows or lamps behind you')
    quality = 'poor'
    acceptable = false
    score -= 28
  }

  if (underRatio > 0.22) {
    issues.push('Shadows on face')
    recommendations.push('Use even front lighting, not side-only light')
    if (acceptable && quality === 'good') quality = 'fair'
    score -= 20
  }

  if (lrDelta > 32) {
    issues.push('Uneven lighting')
    recommendations.push('Face the light source directly')
    if (quality === 'good') quality = 'fair'
    score -= 16
  }

  if (std < 16 && mean < 95) {
    issues.push('Very low contrast')
    quality = 'poor'
    acceptable = false
    score -= 22
  }

  score = Math.max(0, Math.min(100, score))

  let message
  if (!acceptable) {
    message = `${issues[0]}. Improve lighting before capturing.`
  } else if (quality === 'fair') {
    message = `${issues[0] || 'Lighting is acceptable'}. Retake in better light for best accuracy.`
  } else {
    message = 'Lighting looks good.'
  }

  return {
    quality,
    acceptable,
    score: Math.round(score),
    mean_brightness: Math.round(mean),
    contrast: Math.round(std),
    overexposed_ratio: Math.round(overRatio * 1000) / 10,
    underexposed_ratio: Math.round(underRatio * 1000) / 10,
    left_right_imbalance: Math.round(lrDelta),
    issues,
    recommendations,
    message,
  }
}

export function assessVideoLighting(video, canvas) {
  const imageData = sampleVideoFrame(video, canvas)
  return assessLightingFromImageData(imageData)
}

export function getLightingStatusClasses(lighting) {
  if (!lighting) return 'bg-gray-50 border-gray-200 text-gray-700'
  if (!lighting.acceptable) return 'bg-red-50 border-red-200 text-red-800'
  if (lighting.quality === 'fair') return 'bg-amber-50 border-amber-200 text-amber-900'
  return 'bg-emerald-50 border-emerald-200 text-emerald-800'
}

export function getLightingStatusLabel(lighting) {
  if (!lighting) return 'Checking lighting…'
  if (!lighting.acceptable) return 'Poor lighting — fix before capture'
  if (lighting.quality === 'fair') return 'Fair lighting — retake recommended'
  return 'Good lighting'
}

export default assessVideoLighting
