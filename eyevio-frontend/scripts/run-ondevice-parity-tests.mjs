/**
 * On-device parity: runs the browser pipeline (src/ml/ocularAnalysis.js) with
 * onnxruntime-web under Node on fixtures produced by scripts/make_ondevice_fixtures.py
 * and compares against the server pipeline's numbers.
 *
 *   node scripts/run-ondevice-parity-tests.mjs            committed synthetic fixtures
 *   node scripts/run-ondevice-parity-tests.mjs --local    + real dataset fixtures, if generated
 *
 * Model files are read from ../onnx_models (regenerate with scripts/export_onnx.py);
 * the model checks are skipped with a notice when they are absent (e.g. in CI).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

import { crop, makeImage } from '../src/ml/imageOps.js'
import {
  LEFT_EYE_REGION,
  RIGHT_EYE_REGION,
  analyzeCataractFrame,
  analyzeRednessFrame,
  analyzeTearFilmSurface,
  estimateWhiteBalance,
  landmarkBBox,
  measureScleraRedness,
  prepareOcularPatch,
  pupilImageMetrics,
} from '../src/ml/ocularAnalysis.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const modelDir = join(root, '..', 'onnx_models')
const manifest = JSON.parse(readFileSync(join(root, 'public', 'models', 'manifest.json'), 'utf8'))

const TOL = {
  redness: 0.15, // 0–100 scale, values rounded to 0.1
  surface: 0.15,
  coverage: 0.002,
  gains: 0.0015,
  patchMeanAbs: 0.5, // mean |Δ| per uint8 channel of the prepared ML patch
  patchMaxAbs: 3,
  // Browser vs Python ORT on the same graph: preprocessing error only. OpenCV's SIMD cubic
  // resize rounds some pixels ±1 differently from its scalar path (CPU-dependent), and the
  // int8 graph amplifies that slightly.
  mlVsOrt: 0.03,
  mlVsTorch: 0.35, // int8 browser graph vs fp32 PyTorch (eval max diff 0.32)
  catProb: 2e-3,
  catOod: 2e-3,
  camMass: 0.01,
  pupil: { mean_brightness: 0.15, texture_energy: 0.002, dark_pupil_ratio: 0.002, red_minus_blue: 0.15 },
}

let failures = 0
let checks = 0
const worst = {}
const gradeVsTorch = { agree: 0, total: 0 }

function check(label, ok, detail) {
  checks++
  if (!ok) {
    failures++
    console.log(`  FAIL ${label}: ${detail}`)
  }
}

function near(label, actual, expected, tol) {
  if (expected == null || actual == null) {
    check(label, expected == null && actual == null, `expected ${expected}, got ${actual}`)
    return
  }
  const diff = Math.abs(actual - expected)
  const key = label.replace(/^[^ ]+ /, '')
  worst[key] = Math.max(worst[key] ?? 0, diff)
  check(label, diff <= tol, `expected ${expected}, got ${actual} (|Δ|=${diff.toFixed(5)} > ${tol})`)
}

function loadFixtures(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const meta = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      const data = new Uint8Array(gunzipSync(readFileSync(join(dir, `${meta.name}.rgb.gz`))))
      const patches = {}
      for (const side of ['left', 'right']) {
        const p = join(dir, `${meta.name}.${side}.patch.rgb.gz`)
        if (existsSync(p)) patches[side] = new Uint8Array(gunzipSync(readFileSync(p)))
      }
      return {
        ...meta,
        frame: makeImage(meta.width, meta.height, data),
        landmarks: meta.landmarks.map(([x, y]) => ({ x, y })),
        patches,
      }
    })
}

async function makeRunner() {
  const files = Object.fromEntries(
    Object.entries(manifest).map(([name, e]) => [name, join(modelDir, e.files[e.browser_variant].file)]),
  )
  if (!Object.values(files).every(existsSync)) return null
  const ort = await import('onnxruntime-web')
  ort.env.wasm.numThreads = 1
  const sessions = {}
  for (const [name, path] of Object.entries(files)) {
    sessions[name] = await ort.InferenceSession.create(readFileSync(path))
  }
  return async (name, tensorData) => {
    const s = sessions[name]
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', tensorData, [1, 3, 224, 224]) })
    return Object.fromEntries(Object.entries(out).map(([k, t]) => [k, { data: t.data, dims: t.dims }]))
  }
}

function comparePatch(label, patch, expected, shape) {
  check(`${label} patch shape`, patch.height === shape[0] && patch.width === shape[1],
    `expected ${shape.join('×')}, got ${patch.height}×${patch.width}`)
  if (!expected || patch.data.length !== expected.length) return
  let sum = 0
  let max = 0
  for (let i = 0; i < expected.length; i++) {
    const d = Math.abs(patch.data[i] - expected[i])
    sum += d
    if (d > max) max = d
  }
  near(`${label} patch mean|Δ|`, sum / expected.length, 0, TOL.patchMeanAbs)
  near(`${label} patch max|Δ|`, max, 0, TOL.patchMaxAbs)
}

async function runFixture(fx, runModel) {
  const { frame, landmarks, expected } = fx
  const wb = estimateWhiteBalance(frame)
  near(`${fx.name} wb.cast_ratio`, wb.cast_ratio, expected.white_balance.cast_ratio, 0.002)
  wb.gains_bgr.forEach((g, i) => near(`${fx.name} wb.gain[${i}]`, g, expected.white_balance.gains_bgr[i], TOL.gains))

  for (const [side, indices] of [['left', LEFT_EYE_REGION], ['right', RIGHT_EYE_REGION]]) {
    const ref = expected.redness[side]
    const box = landmarkBBox(landmarks, indices, frame.width, frame.height, 0.35, 0.45)
    check(`${fx.name} ${side} heuristic bbox`, box.join() === ref.bbox.join(), `expected ${ref.bbox}, got ${box}`)
    const eye = crop(frame, ...box)
    const r = measureScleraRedness(eye, side, wb)
    check(`${fx.name} ${side} redness_reliable`, r.redness_reliable === ref.redness.redness_reliable,
      `expected ${ref.redness.redness_reliable}, got ${r.redness_reliable}`)
    near(`${fx.name} ${side} mask_coverage`, r.mask_coverage, ref.redness.mask_coverage, TOL.coverage)
    near(`${fx.name} ${side} sclera_redness`, r.sclera_redness, ref.redness.sclera_redness, TOL.redness)
    near(`${fx.name} ${side} sclera_redness_raw`, r.sclera_redness_raw ?? null, ref.redness.sclera_redness_raw ?? null, TOL.redness)
    const s = analyzeTearFilmSurface(eye)
    near(`${fx.name} ${side} tear_proxy`, s.experimental_tear_proxy, ref.surface.experimental_tear_proxy, TOL.surface)
    near(`${fx.name} ${side} texture_proxy`, s.experimental_texture_proxy, ref.surface.experimental_texture_proxy, TOL.surface)

    const mlBox = landmarkBBox(landmarks, indices, frame.width, frame.height, 0.1, 0.15)
    comparePatch(`${fx.name} ${side}`, prepareOcularPatch(crop(frame, ...mlBox), side), fx.patches[side], ref.patch_shape)

    const cref = expected.cataract[side]
    const cbox = landmarkBBox(landmarks, indices, frame.width, frame.height, 0.45, 0.55)
    check(`${fx.name} ${side} cataract bbox`, cbox.join() === cref.bbox.join(), `expected ${cref.bbox}, got ${cbox}`)
    const pm = pupilImageMetrics(crop(frame, ...cbox))
    for (const [k, tol] of Object.entries(TOL.pupil)) near(`${fx.name} ${side} pupil.${k}`, pm[k], cref.image_metrics[k], tol)
  }

  if (!runModel) return
  const redness = await analyzeRednessFrame(frame, landmarks, { runModel, manifest })
  const cataract = await analyzeCataractFrame(frame, landmarks, { runModel, manifest, withCam: true })
  const oodThr = manifest.cataract_screen.ood_threshold
  for (const side of ['left', 'right']) {
    const ref = expected.redness[side]
    const score = redness.eyes[side].ml.score
    near(`${fx.name} ${side} ml_score vs python-ort`, score, ref.score_ort, TOL.mlVsOrt)
    near(`${fx.name} ${side} ml_score vs torch`, score, ref.score_torch, TOL.mlVsTorch)
    const nearBoundary = Math.abs((ref.score_ort % 1) - 0.5) < TOL.mlVsOrt
    check(`${fx.name} ${side} ml grade vs python-ort`, nearBoundary || Math.round(score) === Math.round(ref.score_ort),
      `grade ${Math.round(score)} vs ${Math.round(ref.score_ort)} (scores ${score} / ${ref.score_ort})`)
    gradeVsTorch.total++
    if (Math.round(score) === Math.round(ref.score_torch)) gradeVsTorch.agree++

    const cref = expected.cataract[side]
    const s = cataract.result.eyes[side].screening
    near(`${fx.name} ${side} cataract prob`, s.prob, cref.prob, TOL.catProb)
    near(`${fx.name} ${side} cataract ood`, s.ood_score, cref.ood_score, TOL.catOod)
    const browserAbstains = s.ood_score > oodThr
    check(`${fx.name} ${side} cataract abstain decision`, browserAbstains === (cref.server_status === 'cannot_assess'),
      `browser ${browserAbstains ? 'abstains' : 'assesses'}, server ${cref.server_status}`)
    if (!browserAbstains && s.cam_central_mass != null) {
      near(`${fx.name} ${side} cam_central_mass`, s.cam_central_mass, cref.cam_central_mass, TOL.camMass)
    }
    if (!browserAbstains && cref.server_likelihood != null) {
      near(`${fx.name} ${side} cataract prob vs server torch`, s.prob, cref.server_likelihood, 0.01)
    }
  }
}

const dirs = [join(root, 'tests', 'fixtures', 'ondevice')]
if (process.argv.includes('--local')) dirs.push(join(root, 'tests', 'fixtures', 'ondevice-local'))
const fixtures = dirs.flatMap(loadFixtures)
if (!fixtures.length) {
  console.log('No fixtures found — run scripts/make_ondevice_fixtures.py')
  process.exit(1)
}

const runModel = await makeRunner()
if (!runModel) console.log('ONNX models not found in ../onnx_models — skipping model checks (preprocessing checks still run)')

const t0 = performance.now()
for (const fx of fixtures) {
  await runFixture(fx, runModel)
}
const ms = performance.now() - t0

console.log(`\nWorst-case |Δ| per check:`)
for (const [k, v] of Object.entries(worst).sort()) console.log(`  ${k.padEnd(42)} ${v.toFixed(5)}`)
if (gradeVsTorch.total) {
  console.log(`\nRedness grade agreement, browser int8 vs server PyTorch fp32: ${gradeVsTorch.agree}/${gradeVsTorch.total} (informational)`)
}
console.log(`\n${fixtures.length} fixtures, ${checks} checks, ${failures} failures (${Math.round(ms)} ms)`)
process.exit(failures ? 1 : 0)
