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
 * Approximate upper limits of normal Trivector thresholds for young adults,
 * in 10⁻⁴ u'v' units. Tritan limits rise with age (lens yellowing).
 */
export const TYPICAL_UPPER_LIMIT = { protan: 100, deutan: 100, tritan: 150 }

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

/**
 * Score one axis: 100 at or below the typical limit, falling linearly in log
 * units to 0 at the screen's maximum displacement.
 */
export function axisScore(threshold, axis, maxDistance) {
  const limit = TYPICAL_UPPER_LIMIT[axis] * 1e-4
  if (threshold <= limit) return 100
  if (maxDistance <= limit) return 0
  const frac = Math.log10(threshold / limit) / Math.log10(maxDistance / limit)
  return Math.round(100 * Math.max(0, Math.min(1, 1 - frac)))
}

/**
 * @param {Record<string, {threshold:number, sd:number, maxDistance:number, beyondGamut:boolean}>} axes
 */
export function summarizeColorThresholds(axes) {
  const perAxis = {}
  for (const axis of COLOR_AXES) {
    const a = axes[axis]
    if (!a) continue
    perAxis[axis] = {
      ...a,
      units: Math.round(toUnits(a.threshold)),
      limitUnits: TYPICAL_UPPER_LIMIT[axis],
      raised: a.beyondGamut || a.threshold > TYPICAL_UPPER_LIMIT[axis] * 1e-4,
      score: axisScore(a.threshold, axis, a.maxDistance),
    }
  }
  const tested = Object.values(perAxis)
  const score = tested.length ? Math.min(...tested.map((a) => a.score)) : 0
  const raised = (axis) => perAxis[axis]?.raised
  const rg = raised('protan') || raised('deutan')
  const allBeyond = tested.length === COLOR_AXES.length && tested.every((a) => a.beyondGamut)

  let pattern = 'none'
  if (allBeyond) pattern = 'unreliable'
  else if (rg && raised('tritan')) pattern = 'generalised'
  else if (rg) pattern = 'red_green'
  else if (raised('tritan')) pattern = 'tritan'

  let leadingAxis = null
  if (pattern === 'red_green' && perAxis.protan && perAxis.deutan) {
    const ratio = perAxis.protan.threshold / perAxis.deutan.threshold
    if (ratio > 1.3) leadingAxis = 'protan'
    else if (ratio < 1 / 1.3) leadingAxis = 'deutan'
  }

  return { perAxis, score, pattern, leadingAxis }
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
  const hour = new Date().getHours()
  return {
    platform,
    forcedColors: mq('(forced-colors: active)'),
    invertedColors: mq('(inverted-colors: inverted)'),
    monochrome: mq('(monochrome)'),
    highContrast: mq('(prefers-contrast: more)'),
    wideGamut: mq('(color-gamut: p3)'),
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
