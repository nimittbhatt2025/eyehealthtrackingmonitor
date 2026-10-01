/**
 * Vernier (line-alignment) hyperacuity.
 *
 * Two short vertical segments, one above the other; the lower one is shifted
 * left or right by a few arcseconds. The observer reports the direction. A
 * two-parameter Bayesian adaptive method (psi method, Kontsevich & Tyler 1999)
 * estimates, per retinal location:
 *   - threshold σ: the offset needed for ~84% "right" answers above the bias
 *   - bias μ: the offset that looks aligned — non-zero bias at one location is
 *     how metamorphopsia (local retinal distortion) shows up.
 */

import { linearToSrgb } from './psychophysics.js'

const OFFSET_MAGNITUDES = [2, 3, 5, 7, 10, 14, 20, 28, 40, 56, 80, 112, 160, 225, 300]
export const VERNIER_OFFSETS = [...OFFSET_MAGNITUDES.map((m) => -m).reverse(), ...OFFSET_MAGNITUDES]

function erf(x) {
  const s = Math.sign(x)
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)
  return s * y
}

export const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2))

export function pRight(offset, bias, sigma, lapse = 0.04) {
  return lapse / 2 + (1 - lapse) * normalCdf((offset - bias) / sigma)
}

/**
 * @param {object} opts
 * @param {number[]} [opts.offsets] candidate offsets in arcsec (signed; + = lower segment to the right)
 */
export function createVernierPsi({
  offsets = VERNIER_OFFSETS,
  biasMin = -150,
  biasMax = 150,
  biasStep = 5,
  sigmaMin = 3,
  sigmaMax = 300,
  sigmaSteps = 25,
  lapse = 0.04,
  random = Math.random,
} = {}) {
  const biases = []
  for (let b = biasMin; b <= biasMax + 1e-9; b += biasStep) biases.push(b)
  const logSigmas = Array.from({ length: sigmaSteps }, (_, i) => Math.log10(sigmaMin) + (i * Math.log10(sigmaMax / sigmaMin)) / (sigmaSteps - 1))
  const params = []
  for (const b of biases) for (const ls of logSigmas) params.push({ b, ls, s: 10 ** ls })

  // Weak prior: bias near 0, threshold around 30″.
  let logPost = params.map((p) => -0.5 * (p.b / 60) ** 2 - 0.5 * ((p.ls - Math.log10(30)) / 0.6) ** 2)
  const likeRight = offsets.map((x) => params.map((p) => pRight(x, p.b, p.s, lapse)))
  const history = []

  const posterior = () => {
    const peak = Math.max(...logPost)
    const w = logPost.map((lp) => Math.exp(lp - peak))
    const total = w.reduce((a, v) => a + v, 0)
    return w.map((v) => v / total)
  }

  const entropy = (w) => -w.reduce((a, v) => (v > 0 ? a + v * Math.log(v) : a), 0)

  return {
    /** Offset (arcsec) that minimises expected posterior entropy; random among near-ties. */
    next() {
      const w = posterior()
      const scores = offsets.map((_, k) => {
        const lr = likeRight[k]
        let pR = 0
        for (let i = 0; i < w.length; i++) pR += w[i] * lr[i]
        const postR = w.map((v, i) => (v * lr[i]) / pR)
        const postL = w.map((v, i) => (v * (1 - lr[i])) / (1 - pR))
        return pR * entropy(postR) + (1 - pR) * entropy(postL)
      })
      const best = Math.min(...scores)
      const near = offsets.filter((_, k) => scores[k] <= best + 0.01)
      return near[Math.floor(random() * near.length)]
    },
    /**
     * `respondedRight` true / false, or null for "looks aligned", which counts as
     * half a right and half a left answer: it favours biases near this offset
     * without pushing the estimate either way.
     */
    update(offset, respondedRight) {
      const k = offsets.indexOf(offset)
      const lr = k >= 0 ? likeRight[k] : params.map((p) => pRight(offset, p.b, p.s, lapse))
      const logLike =
        respondedRight == null
          ? (p) => 0.5 * (Math.log(p) + Math.log(1 - p))
          : (p) => Math.log(respondedRight ? p : 1 - p)
      logPost = logPost.map((lp, i) => lp + logLike(lr[i]))
      history.push({ offset, respondedRight })
    },
    estimate() {
      const w = posterior()
      let mb = 0
      let mls = 0
      w.forEach((v, i) => {
        mb += v * params[i].b
        mls += v * params[i].ls
      })
      let vb = 0
      let vls = 0
      w.forEach((v, i) => {
        vb += v * (params[i].b - mb) ** 2
        vls += v * (params[i].ls - mls) ** 2
      })
      return { bias: mb, biasSd: Math.sqrt(vb), threshold: 10 ** mls, thresholdLogSd: Math.sqrt(vls), trials: history.length }
    },
    history: () => [...history],
  }
}

/** Device pixels per arcminute at a viewing distance. */
export function pxPerArcmin(distanceMm, pxPerMm, dpr = 1) {
  return distanceMm * Math.tan(Math.PI / (180 * 60)) * pxPerMm * dpr
}

/**
 * Draw two dark vertical segments on white with a Gaussian cross-section, so
 * the line centre can sit between pixels (offsets finer than one pixel).
 */
export function paintVernier(canvas, { cx, cy, offsetPx, lengthPx, gapPx, sigmaPx, fixation = null }) {
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(w, h)
  img.data.fill(255)
  const segments = [
    { xc: cx - offsetPx / 2, y0: cy - gapPx / 2 - lengthPx, y1: cy - gapPx / 2 },
    { xc: cx + offsetPx / 2, y0: cy + gapPx / 2, y1: cy + gapPx / 2 + lengthPx },
  ]
  const reach = Math.ceil(sigmaPx * 3.5)
  for (const s of segments) {
    const x0 = Math.max(0, Math.floor(s.xc - reach))
    const x1 = Math.min(w - 1, Math.ceil(s.xc + reach))
    for (let x = x0; x <= x1; x++) {
      const g = Math.exp(-((x + 0.5 - s.xc) ** 2) / (2 * sigmaPx * sigmaPx))
      const v = Math.round(255 * linearToSrgb(1 - 0.92 * g))
      for (let y = Math.max(0, Math.round(s.y0)); y < Math.min(h, Math.round(s.y1)); y++) {
        const i = (y * w + x) * 4
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  if (fixation) {
    ctx.fillStyle = '#e11d48'
    ctx.beginPath()
    ctx.arc(fixation.x, fixation.y, fixation.r, 0, 2 * Math.PI)
    ctx.fill()
  }
}

export const VERNIER_LIMITS = { minBiasArcsec: 60, biasToThreshold: 1.5, thresholdRatio: 3, maxBiasSdArcsec: 35, maxUncertainLocations: 1 }

/**
 * Flag locations whose perceived alignment is shifted (bias) or whose
 * threshold is far above the other parafoveal locations (experimental: with 8–12
 * trials the threshold posterior barely narrows from its prior, log SD ≈ 0.4 vs 0.49).
 *
 * Reliability: a location is uncertain when its bias posterior SD exceeds
 * maxBiasSdArcsec (attentive observers ≈ 15–25″, random responders ≈ 30–45″);
 * uncertain locations are never flagged. The eye's result is reliable when at most
 * maxUncertainLocations locations are uncertain.
 */
export function summarizeVernier(locations) {
  const entries = Object.entries(locations)
  const uncertain = entries.filter(([, v]) => v.biasSd > VERNIER_LIMITS.maxBiasSdArcsec).map(([k]) => k)
  const parafoveal = entries.filter(([k]) => k !== 'center').map(([, v]) => v.threshold).sort((a, b) => a - b)
  const median = parafoveal.length ? parafoveal[Math.floor(parafoveal.length / 2)] : null
  const flags = []
  for (const [loc, v] of entries) {
    if (uncertain.includes(loc)) continue
    const biasLimit = Math.max(VERNIER_LIMITS.minBiasArcsec, VERNIER_LIMITS.biasToThreshold * v.threshold)
    if (Math.abs(v.bias) > biasLimit && Math.abs(v.bias) > 2 * v.biasSd) flags.push({ location: loc, kind: 'bias' })
    if (loc !== 'center' && median && v.threshold > VERNIER_LIMITS.thresholdRatio * median) flags.push({ location: loc, kind: 'threshold' })
  }
  return {
    flags,
    parafovealMedianThreshold: median,
    centerThreshold: locations.center?.threshold ?? null,
    uncertainLocations: uncertain,
    reliable: uncertain.length <= VERNIER_LIMITS.maxUncertainLocations,
  }
}
