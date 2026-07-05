/**
 * Ishihara Plate Color Science
 * 
 * Proper implementation using:
 * - CIELAB color space (ensures equal brightness)
 * - Poisson disk sampling (natural dot distribution)
 * - Color blindness simulation (validation)
 */

// ============================================================================
// LAB COLOR SPACE CONVERSION
// ============================================================================

/**
 * Convert RGB to XYZ color space (D65 illuminant)
 */
function rgbToXyz(r, g, b) {
  // Normalize to 0-1
  r = r / 255
  g = g / 255
  b = b / 255
  
  // Apply gamma correction (sRGB)
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92
  
  // Convert to XYZ (D65 illuminant)
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
  const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041
  
  return { x: x * 100, y: y * 100, z: z * 100 }
}

/**
 * Convert XYZ to LAB color space
 */
function xyzToLab(x, y, z) {
  // D65 reference white point
  const refX = 95.047
  const refY = 100.000
  const refZ = 108.883
  
  x = x / refX
  y = y / refY
  z = z / refZ
  
  // Apply CIE function
  const f = (t) => t > 0.008856 ? Math.pow(t, 1/3) : (7.787 * t + 16/116)
  
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  
  const L = 116 * fy - 16
  const a = 500 * (fx - fy)
  const b = 200 * (fy - fz)
  
  return { L, a, b }
}

/**
 * Convert LAB to XYZ color space
 */
function labToXyz(L, a, b) {
  const refX = 95.047
  const refY = 100.000
  const refZ = 108.883
  
  const fy = (L + 16) / 116
  const fx = a / 500 + fy
  const fz = fy - b / 200
  
  const finv = (t) => t > 0.206897 ? Math.pow(t, 3) : (t - 16/116) / 7.787
  
  const x = refX * finv(fx)
  const y = refY * finv(fy)
  const z = refZ * finv(fz)
  
  return { x, y, z }
}

/**
 * Convert XYZ to RGB
 */
function xyzToRgb(x, y, z) {
  x = x / 100
  y = y / 100
  z = z / 100
  
  let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314
  let g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560
  let b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252
  
  // Apply gamma correction (sRGB)
  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1/2.4) - 0.055 : 12.92 * r
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1/2.4) - 0.055 : 12.92 * g
  b = b > 0.0031308 ? 1.055 * Math.pow(b, 1/2.4) - 0.055 : 12.92 * b
  
  // Clamp to valid range
  r = Math.max(0, Math.min(1, r))
  g = Math.max(0, Math.min(1, g))
  b = Math.max(0, Math.min(1, b))
  
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  }
}

/**
 * Convert RGB hex to LAB
 */
export function hexToLab(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  
  const xyz = rgbToXyz(r, g, b)
  return xyzToLab(xyz.x, xyz.y, xyz.z)
}

/**
 * Convert LAB to RGB hex
 */
export function labToHex(L, a, b) {
  const xyz = labToXyz(L, a, b)
  const rgb = xyzToRgb(xyz.x, xyz.y, xyz.z)
  
  const toHex = (n) => n.toString(16).padStart(2, '0')
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

/**
 * Generate colors with same brightness (L*) but different hue (a*, b*)
 * This is THE KEY to Ishihara plates working
 */
export function generateIsochromaticPair(targetL, numberHue, bgHue, chroma = 40) {
  // Convert hue angles to a*, b* coordinates
  const numberA = chroma * Math.cos(numberHue * Math.PI / 180)
  const numberB = chroma * Math.sin(numberHue * Math.PI / 180)
  
  const bgA = chroma * Math.cos(bgHue * Math.PI / 180)
  const bgB = chroma * Math.sin(bgHue * Math.PI / 180)
  
  return {
    number: labToHex(targetL, numberA, numberB),
    background: labToHex(targetL, bgA, bgB)
  }
}

/**
 * Generate confusion line colors for specific color blindness types
 */
export function generateDeficiencyColors(type, targetL = 70) {
  const configs = {
    protan: {
      // Red deficiency: confuse red/green
      // Confusion line: ~0° to ~180° in a*b* plane
      numberHue: 0,    // Red direction
      bgHue: 120,      // Green direction
      chroma: 50
    },
    deutan: {
      // Green deficiency: confuse red/green (different confusion line)
      numberHue: 30,   // Orange direction
      bgHue: 150,      // Cyan-green direction
      chroma: 50
    },
    tritan: {
      // Blue deficiency: confuse blue/yellow
      numberHue: 240,  // Blue direction
      bgHue: 60,       // Yellow direction
      chroma: 50
    },
    normal: {
      // High contrast for normal vision
      numberHue: 25,   // Orange
      bgHue: 220,      // Blue-gray
      chroma: 35
    }
  }
  
  const config = configs[type] || configs.normal
  const pair = generateIsochromaticPair(targetL, config.numberHue, config.bgHue, config.chroma)
  
  // Generate variations (±5 L*, ±10° hue)
  const variations = {
    number: [],
    background: []
  }
  
  for (let i = 0; i < 6; i++) {
    const Lvar = targetL + (Math.random() - 0.5) * 10
    const hueVar = Math.random() * 20 - 10
    
    const numColor = generateIsochromaticPair(
      Lvar, 
      config.numberHue + hueVar, 
      config.bgHue, 
      config.chroma + (Math.random() - 0.5) * 10
    )
    
    const bgColor = generateIsochromaticPair(
      Lvar, 
      config.numberHue, 
      config.bgHue + hueVar, 
      config.chroma + (Math.random() - 0.5) * 10
    )
    
    variations.number.push(numColor.number)
    variations.background.push(bgColor.background)
  }
  
  return variations
}

// ============================================================================
// POISSON DISK SAMPLING (Natural Dot Distribution)
// ============================================================================

/**
 * Poisson disk sampling for natural, evenly-distributed dots
 * Prevents clustering and grid patterns
 */
export function poissonDiskSampling(width, height, minDist, maxAttempts = 30) {
  const cellSize = minDist / Math.sqrt(2)
  const gridWidth = Math.ceil(width / cellSize)
  const gridHeight = Math.ceil(height / cellSize)
  
  const grid = Array(gridWidth * gridHeight).fill(null)
  const active = []
  const points = []
  
  // Helper: add point to grid
  const addPoint = (x, y) => {
    const point = { x, y }
    points.push(point)
    active.push(point)
    
    const gridX = Math.floor(x / cellSize)
    const gridY = Math.floor(y / cellSize)
    grid[gridY * gridWidth + gridX] = point
    
    return point
  }
  
  // Helper: check if point is valid
  const isValid = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false
    
    const gridX = Math.floor(x / cellSize)
    const gridY = Math.floor(y / cellSize)
    
    // Check neighboring cells
    const searchRadius = 2
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const nx = gridX + dx
        const ny = gridY + dy
        
        if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
          const neighbor = grid[ny * gridWidth + nx]
          if (neighbor) {
            const dist = Math.sqrt(
              Math.pow(x - neighbor.x, 2) + Math.pow(y - neighbor.y, 2)
            )
            if (dist < minDist) return false
          }
        }
      }
    }
    
    return true
  }
  
  // Start with random point
  addPoint(Math.random() * width, Math.random() * height)
  
  // Generate points
  while (active.length > 0) {
    const idx = Math.floor(Math.random() * active.length)
    const point = active[idx]
    let found = false
    
    for (let i = 0; i < maxAttempts; i++) {
      const angle = Math.random() * 2 * Math.PI
      const radius = minDist + Math.random() * minDist
      const x = point.x + radius * Math.cos(angle)
      const y = point.y + radius * Math.sin(angle)
      
      if (isValid(x, y)) {
        addPoint(x, y)
        found = true
        break
      }
    }
    
    if (!found) {
      active.splice(idx, 1)
    }
  }
  
  return points
}

// ============================================================================
// COLOR BLINDNESS SIMULATION
// ============================================================================

/**
 * Simulate color blindness by transforming RGB values
 * Uses confusion line projection
 */
export function simulateColorBlindness(hex, type) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  
  let rOut, gOut, bOut
  
  switch (type) {
    case 'protan': // Red deficiency
      rOut = 0.56667 * r + 0.43333 * g + 0.00000 * b
      gOut = 0.55833 * r + 0.44167 * g + 0.00000 * b
      bOut = 0.00000 * r + 0.24167 * g + 0.75833 * b
      break
      
    case 'deutan': // Green deficiency
      rOut = 0.625 * r + 0.375 * g + 0.0 * b
      gOut = 0.70 * r + 0.30 * g + 0.0 * b
      bOut = 0.0 * r + 0.30 * g + 0.70 * b
      break
      
    case 'tritan': // Blue deficiency
      rOut = 0.95 * r + 0.05 * g + 0.0 * b
      gOut = 0.0 * r + 0.433 * g + 0.567 * b
      bOut = 0.0 * r + 0.475 * g + 0.525 * b
      break
      
    default:
      return hex
  }
  
  const toHex = (n) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0')
  return `#${toHex(rOut)}${toHex(gOut)}${toHex(bOut)}`
}

/**
 * Validate plate: check if number vanishes for target deficiency
 */
export function validatePlate(numberColor, bgColor, deficiencyType) {
  const numSim = simulateColorBlindness(numberColor, deficiencyType)
  const bgSim = simulateColorBlindness(bgColor, deficiencyType)
  
  // Calculate color difference in simulated vision
  const numLab = hexToLab(numSim)
  const bgLab = hexToLab(bgSim)
  
  const deltaE = Math.sqrt(
    Math.pow(numLab.L - bgLab.L, 2) +
    Math.pow(numLab.a - bgLab.a, 2) +
    Math.pow(numLab.b - bgLab.b, 2)
  )
  
  // For vanishing plates: deltaE should be small (<15) for deficient viewers
  // For normal vision: deltaE should be large (>30)
  return {
    deltaE,
    shouldVanish: deltaE < 15,
    clearForNormal: deltaE > 30
  }
}

// ============================================================================
// PLATE GENERATION
// ============================================================================

/**
 * Generate a complete Ishihara-style plate with proper color science
 */
export function generateScientificPlate(plateConfig) {
  const {
    number,
    type = 'vanishing', // vanishing, transformation, hidden, demonstration, control
    deficiency = 'protan', // protan, deutan, tritan
    brightness = 70, // L* value (50-80 recommended)
    dotCount = 400,
    radius = 190
  } = plateConfig
  
  // Generate colors based on type
  let colors
  if (type === 'demonstration') {
    colors = generateDeficiencyColors('normal', brightness)
  } else {
    colors = generateDeficiencyColors(deficiency, brightness)
  }
  
  // Generate dot positions using Poisson disk sampling
  const minDist = (radius * 2) / Math.sqrt(dotCount) // Ensure ~dotCount dots
  const dots = poissonDiskSampling(radius * 2, radius * 2, minDist)
  
  // Filter to circle
  const centerX = radius
  const centerY = radius
  const circularDots = dots.filter(dot => {
    const dist = Math.sqrt(
      Math.pow(dot.x - centerX, 2) + Math.pow(dot.y - centerY, 2)
    )
    return dist <= radius - 5
  })
  
  return {
    dots: circularDots,
    colors,
    number,
    type,
    deficiency,
    validation: validatePlate(colors.number[0], colors.background[0], deficiency)
  }
}
