/**
 * Quick CSF (qCSF) — Bayesian adaptive estimation of the contrast sensitivity
 * function (Lesmes, Lu, Baek & Albright, 2010).
 *
 * The CSF is a truncated log-parabola with four parameters:
 *   peakGain    log10 peak sensitivity
 *   peakFreq    log10 frequency of the peak (cycles/degree)
 *   bandwidth   full width at half maximum, in octaves
 *   truncation  low-frequency plateau, in log10 units below the peak
 *
 * A posterior over a parameter grid is updated after every trial, and the next
 * stimulus (frequency × contrast) is drawn from the top 10% by expected
 * information gain. All sensitivities are log10(1 / Michelson contrast).
 */

const KAPPA = Math.log10(2)

export const QCSF_PARAMETER_GRID = {
  peakGain: range(0.2, 2.6, 0.1),
  peakFreq: range(Math.log10(0.5), Math.log10(12), 0.1),
  bandwidth: [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6],
  truncation: [0, 0.25, 0.5, 0.75, 1, 1.5, 2],
}

// Broad priors centred on a typical healthy adult.
const PRIOR = {
  peakGain: { mean: 1.9, sd: 0.6 },
  peakFreq: { mean: Math.log10(3), sd: 0.35 },
  bandwidth: { mean: 3, sd: 1.5 },
  truncation: { mean: 0.5, sd: 0.7 },
}

/** Approximate healthy young-adult CSF used only to express results as a percentage. */
export const REFERENCE_CSF = { peakGain: 2.1, peakFreq: Math.log10(3), bandwidth: 3, truncation: 0.5 }

export const QCSF_FREQUENCIES = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24]

function range(start, stop, step) {
  const out = []
  for (let v = start; v <= stop + 1e-9; v += step) out.push(Number(v.toFixed(4)))
  return out
}

/** Log10 sensitivity of a CSF at log10 frequency `logF`. */
export function csfLogSensitivity(logF, { peakGain, peakFreq, bandwidth, truncation }) {
  const halfWidth = (bandwidth * KAPPA) / 2
  const s = peakGain - KAPPA * ((logF - peakFreq) / halfWidth) ** 2
  return logF < peakFreq ? Math.max(s, peakGain - truncation) : s
}

/** Highest frequency (log10 cpd) where sensitivity reaches 0, i.e. 100% contrast. */
export function csfCutoffLogFreq({ peakGain, peakFreq, bandwidth }) {
  if (peakGain <= 0) return peakFreq
  return peakFreq + ((bandwidth * KAPPA) / 2) * Math.sqrt(peakGain / KAPPA)
}

/** Area under the log CSF (positive part) between two log10 frequencies. */
export function aulcsf(params, logFmin, logFmax, steps = 40) {
  const dx = (logFmax - logFmin) / steps
  let area = 0
  for (let i = 0; i <= steps; i++) {
    const s = Math.max(0, csfLogSensitivity(logFmin + i * dx, params))
    area += (i === 0 || i === steps ? 0.5 : 1) * s
  }
  return area * dx
}

/**
 * Highest grating frequency (cpd) this screen can draw with at least
 * `minDevicePxPerCycle` device pixels per cycle at the viewing distance.
 */
export function maxRenderableFrequency(distanceMm, pxPerMm, devicePixelRatio = 1, minDevicePxPerCycle = 6) {
  const mmPerDegree = distanceMm * Math.tan(Math.PI / 180)
  return (mmPerDegree * pxPerMm * devicePixelRatio) / minDevicePxPerCycle
}

function psychometricTables({ guessRate, lapseRate, slope }) {
  const xMin = -4
  const step = 0.01
  const n = Math.round(8 / step) + 1
  const p = new Float64Array(n)
  const h = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const x = xMin + i * step
    const pc = guessRate + (1 - guessRate - lapseRate) * (1 - Math.exp(-(10 ** (slope * x))))
    p[i] = pc
    h[i] = entropy(pc)
  }
  const index = (x) => Math.max(0, Math.min(n - 1, Math.round((x - xMin) / step)))
  return { p, h, index }
}

function entropy(p) {
  if (p <= 0 || p >= 1) return 0
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p)
}

/**
 * @param {object} opts
 * @param {number[]} opts.frequencies  cpd values that can be shown
 * @param {number[]} [opts.contrastsLog] stimulus log sensitivities (−log10 contrast)
 * @param {number}   [opts.guessRate]  1 / number of choices
 * @param {function} [opts.random]     RNG in [0, 1), injectable for tests
 */
export function createQcsf({
  frequencies,
  contrastsLog = range(0, 2.4, 0.05),
  guessRate = 0.25,
  lapseRate = 0.04,
  slope = 3,
  random = Math.random,
} = {}) {
  const G = QCSF_PARAMETER_GRID
  const params = []
  for (const peakGain of G.peakGain)
    for (const peakFreq of G.peakFreq)
      for (const bandwidth of G.bandwidth)
        for (const truncation of G.truncation) params.push({ peakGain, peakFreq, bandwidth, truncation })

  const nTheta = params.length
  const logFreqs = frequencies.map((f) => Math.log10(f))
  const nF = logFreqs.length
  const S = new Float32Array(nTheta * nF)
  const logPost = new Float64Array(nTheta)
  const logFmin = Math.min(...logFreqs)
  const logFmax = Math.max(...logFreqs)
  const area = new Float32Array(nTheta)
  const cutoff = new Float32Array(nTheta)

  params.forEach((th, t) => {
    for (let j = 0; j < nF; j++) S[t * nF + j] = csfLogSensitivity(logFreqs[j], th)
    area[t] = aulcsf(th, logFmin, logFmax, 24)
    cutoff[t] = csfCutoffLogFreq(th)
    let lp = 0
    for (const key of Object.keys(PRIOR)) lp += -0.5 * ((th[key] - PRIOR[key].mean) / PRIOR[key].sd) ** 2
    logPost[t] = lp
  })

  const table = psychometricTables({ guessRate, lapseRate, slope })
  const history = []

  const weights = () => {
    let peak = -Infinity
    for (let t = 0; t < nTheta; t++) if (logPost[t] > peak) peak = logPost[t]
    const w = new Float64Array(nTheta)
    let total = 0
    for (let t = 0; t < nTheta; t++) {
      w[t] = Math.exp(logPost[t] - peak)
      total += w[t]
    }
    for (let t = 0; t < nTheta; t++) w[t] /= total
    return w
  }

  return {
    /** Next stimulus: { frequency, freqIndex, logCS }. */
    next() {
      const w = weights()
      const active = []
      for (let t = 0; t < nTheta; t++) if (w[t] > 1e-6) active.push(t)
      const scored = []
      for (let j = 0; j < nF; j++) {
        for (const c of contrastsLog) {
          let pBar = 0
          let hBar = 0
          for (const t of active) {
            const k = table.index(S[t * nF + j] - c)
            pBar += w[t] * table.p[k]
            hBar += w[t] * table.h[k]
          }
          scored.push({ j, c, gain: entropy(pBar) - hBar })
        }
      }
      scored.sort((a, b) => b.gain - a.gain)
      const top = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.1)))
      const pick = top[Math.floor(random() * top.length)]
      return { frequency: frequencies[pick.j], freqIndex: pick.j, logCS: pick.c }
    },

    update({ freqIndex, logCS }, correct) {
      for (let t = 0; t < nTheta; t++) {
        const p = table.p[table.index(S[t * nF + freqIndex] - logCS)]
        logPost[t] += Math.log(correct ? p : 1 - p)
      }
      history.push({ frequency: frequencies[freqIndex], logCS, correct })
    },

    /**
     * Posterior summaries. `evalFrequencies` defaults to the tested set.
     * AULCSF is integrated over the tested frequency range (log10 cpd units).
     */
    estimate(evalFrequencies = frequencies) {
      const w = weights()
      const mean = (fn) => {
        let m = 0
        for (let t = 0; t < nTheta; t++) if (w[t] > 1e-9) m += w[t] * fn(t)
        return m
      }
      const meanSd = (fn) => {
        const m = mean(fn)
        return { mean: m, sd: Math.sqrt(Math.max(0, mean((t) => (fn(t) - m) ** 2))) }
      }
      const curve = evalFrequencies.map((f) => {
        const lf = Math.log10(f)
        const { mean: logCS, sd } = meanSd((t) => csfLogSensitivity(lf, params[t]))
        return { frequency: f, logCS, sd }
      })
      const area_ = meanSd((t) => area[t])
      const cutoff_ = meanSd((t) => cutoff[t])
      const paramMeans = Object.fromEntries(Object.keys(PRIOR).map((key) => [key, mean((t) => params[t][key])]))
      return {
        curve,
        aulcsf: area_.mean,
        aulcsfSd: area_.sd,
        cutoffFrequency: 10 ** cutoff_.mean,
        cutoffLogSd: cutoff_.sd,
        params: paramMeans,
        range: { minFrequency: 10 ** logFmin, maxFrequency: 10 ** logFmax },
        trials: history.length,
      }
    },

    history: () => [...history],
  }
}

/** AULCSF as a percentage of the reference CSF's area over the same range, capped at 100. */
export function aulcsfPercentOfReference(area, minFrequency, maxFrequency) {
  const ref = aulcsf(REFERENCE_CSF, Math.log10(minFrequency), Math.log10(maxFrequency))
  if (!ref) return null
  return Math.max(0, Math.min(100, Math.round((area / ref) * 100)))
}
