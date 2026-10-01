/**
 * Colour discrimination thresholds along cone-confusion axes.
 *
 * A Landolt C made of dots differs from its surround only in chromaticity,
 * displaced from the white point along a protan, deutan or tritan confusion
 * line in CIE 1976 u'v'. Every dot takes a random luminance from the same set
 * for target and surround, so the C cannot be found by brightness. Thresholds
 * are distances in u'v' (reported in units of 10⁻⁴, as in the Cambridge Colour
 * Test Trivector) — Mollon & Reffin 1989; Regan, Reffin & Mollon 1994.
 *
 * Colours are computed for an sRGB display (D65 white). Uncalibrated screens
 * shift the axes a little; results are comparable on the same screen.
 */

export const COLOR_AXES = ['protan', 'deutan', 'tritan']

export const AXIS_LABELS = {
  protan: 'Protan (red) axis',
  deutan: 'Deutan (green) axis',
  tritan: 'Tritan (blue–yellow) axis',
}

export const WHITE_UV = { u: 0.1978, v: 0.4683 }

export const COPUNCTAL_UV = {
  protan: { u: 0.678, v: 0.501 },
  deutan: { u: -1.217, v: 0.782 },
  tritan: { u: 0.257, v: 0.0 },
}

/**
 * Provisional research reference values, in 10⁻⁴ u'v' units, taken from published
 * Cambridge Colour Test Trivector limits for young adults. They are not EyeVio
 * norms: no EyeVio-specific reference data exist yet. Tritan values rise with age.
 */
export const PROVISIONAL_REFERENCE = { protan: 100, deutan: 100, tritan: 150 }

/** An axis can only be tested if the screen reaches well beyond its reference value. */
export const GAMUT_ADEQUACY_FACTOR = 4
/** Posterior SD (log units) above which an axis threshold is reported as uncertain. */
export const MAX_AXIS_SD = 0.3
/** Luminance-defined catch trials, visible regardless of colour vision. */
export const CATCH_TRIALS = 4
export const CATCH_MIN_CORRECT = 3
export const CATCH_LUMINANCE_GAIN = 2.2

export const DOT_LUMINANCES = [0.13, 0.16, 0.19, 0.22, 0.25, 0.28]

export function uvYToXyz(u, v, Y) {
  const den = 6 * u - 16 * v + 12
  const x = (9 * u) / den
  const y = (4 * v) / den
  return { X: (x * Y) / y, Y, Z: ((1 - x - y) * Y) / y }
}

export function xyzToLinearRgb({ X, Y, Z }) {
  return [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z,
  ]
}

export function linearRgbToXyz([r, g, b]) {
  return {
    X: 0.4124 * r + 0.3576 * g + 0.1805 * b,
    Y: 0.2126 * r + 0.7152 * g + 0.0722 * b,
    Z: 0.0193 * r + 0.1192 * g + 0.9505 * b,
  }
}

export function xyzToUv({ X, Y, Z }) {
  const den = X + 15 * Y + 3 * Z
  return { u: (4 * X) / den, v: (9 * Y) / den }
}

const inGamut = (rgb, margin = 0) => rgb.every((c) => c >= margin && c <= 1 - margin)

/** Unit vector in u'v' from the white point along an axis (sign ±1). */
export function axisDirection(axis, sign = 1, white = WHITE_UV) {
  const cp = COPUNCTAL_UV[axis]
  const du = cp.u - white.u
  const dv = cp.v - white.v
  const len = Math.hypot(du, dv)
  return { du: (sign * du) / len, dv: (sign * dv) / len }
}

export function displacedUv(dir, distance, white = WHITE_UV) {
  return { u: white.u + dir.du * distance, v: white.v + dir.dv * distance }
}

/** Largest u'v' displacement along `dir` that stays inside the sRGB gamut at every luminance. */
export function maxDisplacement(dir, luminances = DOT_LUMINANCES, white = WHITE_UV) {
  const ok = (d) =>
    luminances.every((Y) => {
      const { u, v } = displacedUv(dir, d, white)
      return inGamut(xyzToLinearRgb(uvYToXyz(u, v, Y)), 0.002)
    })
  let lo = 0
  let hi = 0.3
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (ok(mid)) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * For each axis, the direction along the confusion line (towards or away from
 * the copunctal point) with more room inside the screen gamut.
 */
export function axisPlan(luminances = DOT_LUMINANCES) {
  return Object.fromEntries(
    COLOR_AXES.map((axis) => {
      const options = [1, -1].map((sign) => {
        const dir = axisDirection(axis, sign)
        return { sign, dir, max: maxDisplacement(dir, luminances) }
      })
      const best = options[0].max >= options[1].max ? options[0] : options[1]
      return [axis, best]
    })
  )
}

const srgbEncode = (l) => (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055)

/**
 * 8-bit sRGB for a dot, with stochastic rounding so the average over many dots
 * reproduces chromatic steps finer than one code value.
 */
export function dotRgb(uv, Y, random = Math.random) {
  const lin = xyzToLinearRgb(uvYToXyz(uv.u, uv.v, Y))
  return lin.map((c) => {
    const v = 255 * srgbEncode(Math.min(1, Math.max(0, c)))
    const base = Math.floor(v)
    return Math.min(255, base + (random() < v - base ? 1 : 0))
  })
}

/** Threshold grid is in "log sensitivity" = −log10(u'v' distance), so larger = finer discrimination. */
export const distanceToLogSens = (d) => -Math.log10(d)
export const logSensToDistance = (s) => 10 ** -s
export const toUnits = (d) => d * 1e4

export function gamutAdequate(axis, maxDistance, displayCoversSrgb = true) {
  return displayCoversSrgb && maxDistance >= GAMUT_ADEQUACY_FACTOR * PROVISIONAL_REFERENCE[axis] * 1e-4
}

/**
 * Per-axis thresholds against provisional research reference values. There is no
 * 0–100 score: reference data for one do not exist.
 *
 * Reliability: the eye is unreliable when fewer than CATCH_MIN_CORRECT of the catch trials
 * were right (a guesser passes with p ≈ 0.05), or when nothing was seen on any axis. An axis
 * is `uncertain` when its posterior SD exceeds MAX_AXIS_SD, and `testable: false` when the
 * screen cannot show a large enough difference along it. Neither counts towards a pattern.
 *
 * @param {Record<string, {threshold:number, sd:number, maxDistance:number, beyondGamut:boolean}>} axes
 * @param {{catchCorrect?: number, catchTotal?: number, displayCoversSrgb?: boolean}} [opts]
 */
export function summarizeColorThresholds(axes, { catchCorrect = null, catchTotal = 0, displayCoversSrgb = true } = {}) {
  const perAxis = {}
  for (const axis of COLOR_AXES) {
    const a = axes[axis]
    if (!a) continue
    const testable = gamutAdequate(axis, a.maxDistance, displayCoversSrgb)
    const uncertain = a.sd > MAX_AXIS_SD
    perAxis[axis] = {
      ...a,
      units: Math.round(toUnits(a.threshold)),
      maxUnits: Math.round(toUnits(a.maxDistance)),
      referenceUnits: PROVISIONAL_REFERENCE[axis],
      testable,
      uncertain,
      aboveReference: testable && !uncertain && (a.beyondGamut || a.threshold > PROVISIONAL_REFERENCE[axis] * 1e-4),
    }
  }
  const tested = Object.values(perAxis)
  const above = (axis) => perAxis[axis]?.aboveReference
  const rg = above('protan') || above('deutan')
  const allBeyond = tested.length === COLOR_AXES.length && tested.every((a) => a.beyondGamut)
  const catchFailed = catchTotal > 0 && catchCorrect < Math.min(CATCH_MIN_CORRECT, catchTotal)
  const reliable = !catchFailed && !allBeyond

  let pattern = 'none'
  if (!reliable) pattern = 'unreliable'
  else if (rg && above('tritan')) pattern = 'generalised'
  else if (rg) pattern = 'red_green'
  else if (above('tritan')) pattern = 'tritan'

  let leadingAxis = null
  if (pattern === 'red_green' && perAxis.protan && perAxis.deutan) {
    const ratio = perAxis.protan.threshold / perAxis.deutan.threshold
    if (ratio > 1.3) leadingAxis = 'protan'
    else if (ratio < 1 / 1.3) leadingAxis = 'deutan'
  }

  return {
    perAxis,
    pattern,
    leadingAxis,
    reliable,
    reliability: {
      catch_correct: catchCorrect,
      catch_total: catchTotal,
      catch_min_correct: catchTotal > 0 ? Math.min(CATCH_MIN_CORRECT, catchTotal) : null,
      catch_failed: catchFailed,
      nothing_seen_on_any_axis: allBeyond,
      max_axis_sd: MAX_AXIS_SD,
    },
  }
}

/**
 * Stable identifier for "this screen in this browser", so colour results are only ever
 * compared with results from the same display. Not a person identifier.
 */
export function displayId(state, screenInfo = typeof screen !== 'undefined' ? screen : {}, dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1) {
  const parts = [
    state.platform, state.browser, screenInfo.width, screenInfo.height, Math.round((dpr || 1) * 100),
    state.colorGamut, state.hdr ? 'hdr' : 'sdr', state.colorDepth,
  ].join('|')
  let h = 2166136261
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

const mq = (query) => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches

/** Display settings a web page can see. Night Shift / True Tone / Night Light are not exposed to browsers. */
export function detectDisplayState() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const platform = /iPhone|iPad|iPod/.test(ua)
    ? 'ios'
    : /Android/.test(ua)
      ? 'android'
      : /Mac/.test(ua)
        ? 'mac'
        : /Windows/.test(ua)
          ? 'windows'
          : 'other'
  const browser = /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other'
  const hour = new Date().getHours()
  // Reported by the browser (CSS media queries), not measured: the browser's description of the display.
  const gamutQuerySupported = typeof window !== 'undefined' && window.matchMedia?.('(color-gamut: srgb)').media !== 'not all'
  const colorGamut = !gamutQuerySupported
    ? 'not_reported'
    : mq('(color-gamut: rec2020)') ? 'rec2020' : mq('(color-gamut: p3)') ? 'p3' : mq('(color-gamut: srgb)') ? 'srgb' : 'below_srgb'
  return {
    platform,
    browser,
    forcedColors: mq('(forced-colors: active)'),
    invertedColors: mq('(inverted-colors: inverted)'),
    monochrome: mq('(monochrome)'),
    highContrast: mq('(prefers-contrast: more)'),
    colorGamut,
    wideGamut: colorGamut === 'p3' || colorGamut === 'rec2020',
    coversSrgb: colorGamut !== 'below_srgb',
    hdr: mq('(dynamic-range: high)'),
    colorDepth: typeof screen !== 'undefined' ? screen.colorDepth : null,
    localHour: hour,
    evening: hour >= 18 || hour < 7,
  }
}

export function blockingDisplayIssues(state) {
  const issues = []
  if (state.forcedColors) issues.push('High-contrast / forced colours mode is on.')
  if (state.invertedColors) issues.push('Inverted colours are on.')
  if (state.monochrome) issues.push('The display is reporting greyscale (monochrome) mode.')
  if (state.colorDepth && state.colorDepth < 24) issues.push(`The display is in ${state.colorDepth}-bit colour.`)
  return issues
}

export const NIGHT_MODE_HELP = {
  mac: 'System Settings → Displays: turn off Night Shift and True Tone.',
  ios: 'Settings → Display & Brightness: turn off Night Shift and True Tone.',
  windows: 'Settings → System → Display: turn off Night light (and any HDR or colour filters).',
  android: 'Quick settings: turn off Night Light / Eye comfort / Blue-light filter.',
  other: 'Turn off any night mode, blue-light filter or automatic colour adjustment.',
}
