/**
 * Shared psychophysics helpers for EyeVio vision tests.
 *
 * - QUEST-style Bayesian threshold estimation (Watson & Pelli, 1983) on a grid
 * - Weibull psychometric function in log units
 * - Dithered sine-grating rendering for sub-8-bit contrast resolution
 *
 * Threshold units are "log sensitivity" (e.g. logCS = log10(1 / contrast)).
 * Higher values = harder stimuli.
 */

/**
 * Probability of a correct response for a stimulus at `stimLog` when the true
 * threshold is `thresholdLog` (both in log-sensitivity units).
 */
export function weibullPCorrect(stimLog, thresholdLog, { beta = 3.5, guessRate = 0.25, lapseRate = 0.02 } = {}) {
  // Stimulus intensity above threshold, in log10 units (positive = easier).
  const x = thresholdLog - stimLog
  const pDetect = 1 - Math.exp(-(10 ** (beta * x)))
  return guessRate + (1 - guessRate - lapseRate) * pDetect
}

/**
 * Create a Bayesian adaptive threshold estimator.
 *
 * @param {object} opts
 * @param {number} opts.min        lowest threshold on the grid (easiest)
 * @param {number} opts.max        highest threshold on the grid (hardest)
 * @param {number} opts.step       grid resolution
 * @param {number} opts.priorMean  prior guess for the threshold
 * @param {number} opts.priorSd    prior spread
 * @param {number} opts.guessRate  chance rate (1 / number of choices)
 */
export function createQuest({
  min = 0,
  max = 2.2,
  step = 0.02,
  priorMean = 1.2,
  priorSd = 0.6,
  beta = 3.5,
  guessRate = 0.25,
  lapseRate = 0.02,
} = {}) {
  const grid = []
  for (let t = min; t <= max + 1e-9; t += step) grid.push(Number(t.toFixed(4)))

  let logPosterior = grid.map((t) => -0.5 * ((t - priorMean) / priorSd) ** 2)
  const history = []
  const fnOpts = { beta, guessRate, lapseRate }

  const normalized = () => {
    const peak = Math.max(...logPosterior)
    const weights = logPosterior.map((lp) => Math.exp(lp - peak))
    const total = weights.reduce((a, b) => a + b, 0)
    return weights.map((w) => w / total)
  }

  const mean = () => {
    const w = normalized()
    return grid.reduce((acc, t, i) => acc + t * w[i], 0)
  }

  const sd = () => {
    const w = normalized()
    const m = mean()
    return Math.sqrt(grid.reduce((acc, t, i) => acc + w[i] * (t - m) ** 2, 0))
  }

  return {
    /** Next stimulus level to present (posterior mean, clamped to the grid). */
    next() {
      return Math.max(min, Math.min(max, mean()))
    },
    update(stimLog, correct) {
      logPosterior = logPosterior.map((lp, i) => {
        const p = weibullPCorrect(stimLog, grid[i], fnOpts)
        return lp + Math.log(correct ? p : 1 - p)
      })
      history.push({ stimLog, correct })
    },
    estimate() {
      return { threshold: mean(), sd: sd(), trials: history.length }
    },
    history() {
      return [...history]
    },
  }
}

// `angle` is the on-screen direction the stripes run: 0 = —, 45 = /, 90 = |, 135 = \
export const GRATING_ORIENTATIONS = [
  { angle: 0, name: 'Horizontal', label: 'Horizontal', symbol: '—', direction: 'horizontal' },
  { angle: 90, name: 'Vertical', label: 'Vertical', symbol: '|', direction: 'vertical' },
  { angle: 45, name: 'Diagonal /', label: 'Diagonal', symbol: '/', direction: 'diagonal-right' },
  { angle: 135, name: 'Diagonal \\', label: 'Diagonal', symbol: '\\', direction: 'diagonal-left' },
]

/**
 * Paint a sine-wave grating into a canvas.
 *
 * `stripeAngleDeg` is the on-screen direction the stripes run:
 * 0 = horizontal (—), 45 = diagonal (/), 90 = vertical (|), 135 = diagonal (\).
 *
 * Random dithering before quantization lets average contrast go below one
 * 8-bit gray step (needed for contrasts under ~1%).
 *
 * If `apertureRadius` is set, the grating is shown inside a circle on a
 * mean-gray surround; `softEdge` (px) fades it out with a raised cosine so the
 * aperture edge adds no high-frequency energy.
 *
 * With `linearize`, `contrast` is Michelson contrast of screen luminance
 * assuming an sRGB display, instead of contrast of raw pixel values (which a
 * gamma-2.2 screen inflates roughly 2×).
 */
export function paintGrating(
  canvas,
  stripeAngleDeg,
  cycles,
  contrast,
  { apertureRadius = null, softEdge = 0, dither = true, linearize = false, phase: phaseOffset = 0 } = {}
) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const imageData = ctx.createImageData(width, height)
  const data = imageData.data
  const rad = (stripeAngleDeg * Math.PI) / 180
  // Screen y points down: stripes run along (cos, −sin), so brightness varies along (sin, cos).
  const nx = Math.sin(rad)
  const ny = Math.cos(rad)
  const wavelength = width / cycles
  const cx = width / 2
  const cy = height / 2
  const outer = apertureRadius
  const inner = apertureRadius != null ? Math.max(0, apertureRadius - softEdge) : null
  const meanLum = srgbToLinear(127.5 / 255)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 127.5
      let envelope = 1
      if (outer != null) {
        const r = Math.hypot(x - cx, y - cy)
        envelope = r <= inner ? 1 : r >= outer ? 0 : 0.5 * (1 + Math.cos((Math.PI * (r - inner)) / (outer - inner)))
      }
      if (envelope > 0) {
        const phase = x * nx + y * ny
        const s = Math.sin((2 * Math.PI * phase) / wavelength + phaseOffset) * contrast * envelope
        value = linearize ? linearToSrgb(meanLum * (1 + s)) * 255 : 127.5 + s * 127.5
      }
      const gray = dither ? Math.floor(value + Math.random()) : Math.round(value)
      const clamped = Math.max(0, Math.min(255, gray))
      const i = (y * width + x) * 4
      data[i] = clamped
      data[i + 1] = clamped
      data[i + 2] = clamped
      data[i + 3] = 255
    }
  }
  ctx.putImageData(imageData, 0, 0)
}

/**
 * Paint a dark Gaussian blob (luminance decrement) on a mean-gray background.
 * Edges fade into the background so the canvas border is invisible on a
 * container filled with rgb(background, background, background).
 */
export function paintBlob(canvas, contrast, { background = 128, sigmaRatio = 0.15, dither = true } = {}) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const imageData = ctx.createImageData(width, height)
  const data = imageData.data
  const cx = width / 2
  const cy = height / 2
  const sigma = width * sigmaRatio
  const twoSigma2 = 2 * sigma * sigma

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const g = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / twoSigma2)
      const value = background * (1 - contrast * g)
      const gray = dither ? Math.floor(value + Math.random()) : Math.round(value)
      const clamped = Math.max(0, Math.min(255, gray))
      const i = (y * width + x) * 4
      data[i] = clamped
      data[i + 1] = clamped
      data[i + 2] = clamped
      data[i + 3] = 255
    }
  }
  ctx.putImageData(imageData, 0, 0)
}

/** sRGB transfer functions on 0–1 values. */
export function srgbToLinear(v) {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

export function linearToSrgb(l) {
  const c = Math.max(0, Math.min(1, l))
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

/** Convert log contrast sensitivity to Michelson contrast (0–1). */
export function logCSToContrast(logCS) {
  return 10 ** -logCS
}
