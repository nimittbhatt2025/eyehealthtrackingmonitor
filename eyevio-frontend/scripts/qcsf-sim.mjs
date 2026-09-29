import { createQcsf, csfLogSensitivity, aulcsf, QCSF_FREQUENCIES } from '../src/utils/qcsf.js'
import { weibullPCorrect } from '../src/utils/psychophysics.js'

function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const observers = {
  normal: { peakGain: 2.0, peakFreq: Math.log10(3), bandwidth: 3, truncation: 0.5 },
  lowContrast: { peakGain: 1.3, peakFreq: Math.log10(2), bandwidth: 2.5, truncation: 0.3 },
  highFreqLoss: { peakGain: 1.9, peakFreq: Math.log10(1.5), bandwidth: 2, truncation: 0.5 },
}
const freqs = QCSF_FREQUENCIES.filter((f) => f <= 16)
const trials = Number(process.argv[2] || 25)

for (const [name, truth] of Object.entries(observers)) {
  const errs = []
  let ms = 0
  for (let seed = 1; seed <= 20; seed++) {
    const rng = mulberry32(seed)
    const q = createQcsf({ frequencies: freqs, random: rng })
    for (let i = 0; i < trials; i++) {
      const t0 = performance.now()
      const stim = q.next()
      ms += performance.now() - t0
      const thr = csfLogSensitivity(Math.log10(stim.frequency), truth)
      q.update(stim, rng() < weibullPCorrect(stim.logCS, thr, { beta: 3, guessRate: 0.25, lapseRate: 0.04 }))
    }
    const est = q.estimate()
    const trueArea = aulcsf(truth, Math.log10(freqs[0]), Math.log10(freqs.at(-1)))
    errs.push(est.aulcsf - trueArea)
  }
  const bias = errs.reduce((a, b) => a + b, 0) / errs.length
  const rmse = Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length)
  console.log(`${name}: AULCSF bias ${bias.toFixed(3)}, RMSE ${rmse.toFixed(3)}, next() ${(ms / (20 * trials)).toFixed(1)} ms`)
}
