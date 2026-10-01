/**
 * On-device eye analysis: the per-eye measurements the server pipeline makes
 * (eyevio/app/ai_models/ocular_ml_preprocess.py, dry_eye_analysis.py,
 * cataract_resnet.py, cnn_explain.py), ported so eye photos never have to be
 * uploaded. Only these per-eye primitives are sent to the API; the server
 * recomputes every derived field (grades, bands, findings, risk text) itself.
 *
 * `runModel(name, Float32Array) -> Promise<{ [output]: { data, dims } }>` is
 * injected so the same code runs in the Web Worker and in the Node parity test.
 */

import {
  closeCross,
  crop,
  gaussianBlur5,
  hsvSV,
  laplacianStats,
  openCross,
  resizeBilinearPIL,
  resizeCubicCV,
  roundTo,
  toGray,
  toNormalizedTensor,
  upsampleBilinear,
} from './imageOps.js'

export const PAYLOAD_VERSION = 1
export const LEFT_EYE_REGION = [33, 133, 160, 159, 158, 157, 173, 144, 145, 153]
export const RIGHT_EYE_REGION = [362, 263, 387, 386, 385, 384, 398, 373, 374, 380]

const MIN_SCLERA_BRIGHTNESS = 80
const MAX_SCLERA_SATURATION = 85
const MIN_SCLERA_MASK_COVERAGE = 0.02
const ML_MIN_PATCH_PX = 240
const HEURISTIC_PAD = { x: 0.35, y: 0.45 }
const REFERENCE_FRAME_CHROMA_BGR = [0.3, 0.325, 0.375]
const WB_GAIN_LIMITS = [0.7, 1.4]
const MAX_WB_CAST_RATIO = 1.8
const MODEL_INPUT = 224

export function landmarkBBox(landmarks, indices, width, height, padX, padY) {
  const xs = indices.map((i) => landmarks[i].x * width)
  const ys = indices.map((i) => landmarks[i].y * height)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const w = Math.max(1, xMax - xMin)
  const h = Math.max(1, yMax - yMin)
  return [
    Math.trunc(Math.max(0, xMin - w * padX)),
    Math.trunc(Math.max(0, yMin - h * padY)),
    Math.trunc(Math.min(width, xMax + w * padX)),
    Math.trunc(Math.min(height, yMax + h * padY)),
  ]
}

export function scleraMask(img, side) {
  const { width: w, height: h } = img
  const { s, v } = hsvSV(img)
  let mask = new Uint8Array(w * h)
  for (let i = 0; i < mask.length; i++) {
    mask[i] = v[i] > MIN_SCLERA_BRIGHTNESS && s[i] < MAX_SCLERA_SATURATION && v[i] < 245 ? 255 : 0
  }
  mask = closeCross(openCross(mask, w, h), w, h)
  const canthus = Math.max(2, Math.trunc(w * 0.22))
  const brow = Math.max(1, Math.trunc(h * 0.18))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const drop =
        y < brow ||
        (side === 'left' && x >= w - canthus) ||
        (side === 'right' && x < canthus)
      if (drop) mask[y * w + x] = 0
    }
  }
  return mask
}

/** ocular_ml_preprocess.prepare_ocular_patch */
export function prepareOcularPatch(eye, side) {
  let patch = eye
  if (!patch.width || !patch.height) return patch
  const mask = scleraMask(patch, side)
  let count = 0
  let x0 = Infinity
  let x1 = -1
  let y0 = Infinity
  let y1 = -1
  for (let y = 0; y < patch.height; y++) {
    for (let x = 0; x < patch.width; x++) {
      if (mask[y * patch.width + x]) {
        count++
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (count >= 10 && count / mask.length >= 0.03) {
    const { width: w, height: h } = patch
    const bw = Math.max(1, x1 - x0 + 1)
    const bh = Math.max(1, y1 - y0 + 1)
    patch = crop(
      patch,
      Math.max(0, x0 - Math.trunc(bw * 0.22)),
      Math.max(0, y0 - Math.trunc(bh * 0.18)),
      Math.min(w, x1 + Math.trunc(bw * 0.22)),
      Math.min(h, y1 + Math.trunc(bh * 0.12)),
    )
  }
  if (patch.height >= 8 && patch.width >= 8) {
    const { width: w, height: h } = patch
    patch = crop(patch, Math.trunc(w * 0.04), Math.trunc(h * 0.1), Math.trunc(w * 0.96), Math.trunc(h * 0.9))
  }
  const longest = Math.max(patch.width, patch.height)
  if (longest > 0 && longest < ML_MIN_PATCH_PX) {
    const scale = ML_MIN_PATCH_PX / longest
    patch = resizeCubicCV(
      patch,
      Math.max(1, Math.trunc(patch.width * scale)),
      Math.max(1, Math.trunc(patch.height * scale)),
    )
  }
  return patch
}

export function modelTensor(img, spec) {
  return toNormalizedTensor(resizeBilinearPIL(img, MODEL_INPUT, MODEL_INPUT), spec.mean, spec.std)
}

const POW6_F32 = Float32Array.from({ length: 256 }, (_, v) => Math.fround(Math.fround(v / 255) ** 6))

/**
 * dry_eye_analysis.estimate_white_balance. numpy's float32 mean over axis 0
 * accumulates row by row in float32; that rounding is reproduced so the
 * (4-decimal) gains match the server.
 */
export function estimateWhiteBalance(frame) {
  const d = frame.data
  let ab = 0
  let ag = 0
  let ar = 0
  let n = 0
  const f = Math.fround
  for (let p = 0; p < d.length; p += 3) {
    const r = d[p]
    const g = d[p + 1]
    const b = d[p + 2]
    const peak = Math.max(r, g, b)
    if (peak > 20 && peak < 250) {
      ab = f(ab + POW6_F32[b])
      ag = f(ag + POW6_F32[g])
      ar = f(ar + POW6_F32[r])
      n++
    }
  }
  if (n < 1000) return { available: false }
  const est = [ab, ag, ar].map((v) => f(f(v / n) ** (1 / 6)))
  const total = Math.max(est[0] + est[1] + est[2], 1e-6)
  const chroma = est.map((v) => v / total)
  let gains = REFERENCE_FRAME_CHROMA_BGR.map((ref, i) => ref / Math.max(chroma[i], 1e-6))
  gains = gains.map((g) => g / gains[1])
  const castRatio = Math.max(...gains) / Math.min(...gains)
  gains = gains.map((g) => Math.min(WB_GAIN_LIMITS[1], Math.max(WB_GAIN_LIMITS[0], g)))
  return {
    available: true,
    frame_chroma_bgr: chroma.map((v) => roundTo(v, 4)),
    gains_bgr: gains.map((v) => roundTo(v, 4)),
    cast_ratio: roundTo(castRatio, 3),
    strong_cast: castRatio > MAX_WB_CAST_RATIO,
  }
}

function applyWhiteBalance(img, wb) {
  const [gb, gg, gr] = wb.gains_bgr.map(Math.fround)
  const out = new Uint8Array(img.data.length)
  for (let p = 0; p < out.length; p += 3) {
    out[p] = Math.min(255, Math.max(0, Math.fround(img.data[p] * gr)))
    out[p + 1] = Math.min(255, Math.max(0, Math.fround(img.data[p + 1] * gg)))
    out[p + 2] = Math.min(255, Math.max(0, Math.fround(img.data[p + 2] * gb)))
  }
  return { width: img.width, height: img.height, data: out }
}

/** dry_eye_analysis.measure_sclera_redness (primitives only; the Efron-style grade is derived server-side). */
export function measureScleraRedness(eye, side, wb) {
  const empty = {
    sclera_redness: null,
    redness_rg: null,
    red_pixel_fraction: null,
    mask_coverage: 0,
    redness_reliable: false,
  }
  if (!eye.width || !eye.height) return empty
  const wbApplied = Boolean(wb?.available && !wb.strong_cast)
  const corrected = wbApplied ? applyWhiteBalance(eye, wb) : eye
  const mask = scleraMask(corrected, side)
  let count = 0
  for (let i = 0; i < mask.length; i++) if (mask[i]) count++
  const coverage = count / mask.length
  if (coverage < MIN_SCLERA_MASK_COVERAGE) return { ...empty, mask_coverage: roundTo(coverage, 4) }

  const stats = (img) => {
    let dom = 0
    let norm = 0
    let redPx = 0
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue
      const r = img.data[i * 3]
      const g = img.data[i * 3 + 1]
      const b = img.data[i * 3 + 2]
      dom += r - g
      norm += (r - g) / Math.max(r + g + b, 1)
      if (r > g + 15) redPx++
    }
    const meanDom = dom / count
    return {
      redness: Math.min(100, Math.max(0, (meanDom / 80) * 100)),
      rg: meanDom,
      normalized: norm / count,
      redFraction: redPx / count,
    }
  }
  const raw = stats(eye)
  const cur = stats(corrected)
  return {
    sclera_redness: roundTo(cur.redness, 1),
    sclera_redness_raw: roundTo(raw.redness, 1),
    white_balance_applied: wbApplied,
    redness_rg: roundTo(cur.rg, 2),
    redness_normalized: roundTo(cur.normalized, 4),
    red_pixel_fraction: roundTo(cur.redFraction, 3),
    mask_coverage: roundTo(coverage, 4),
    redness_reliable: true,
  }
}

/** dry_eye_analysis.analyze_tear_film_surface (experimental proxies). */
export function analyzeTearFilmSurface(eye) {
  const neutral = { experimental_tear_proxy: 50, experimental_texture_proxy: 50 }
  if (!eye.width || !eye.height) return neutral
  const { width: w, height: h } = eye
  const cornea = crop(eye, Math.trunc(w * 0.2), Math.trunc(h * 0.25), Math.trunc(w * 0.8), Math.trunc(h * 0.75))
  if (!cornea.width || !cornea.height) return neutral
  const gray = gaussianBlur5(toGray(cornea), cornea.width, cornea.height)
  let bright = 0
  for (let i = 0; i < gray.length; i++) if (gray[i] > 185) bright++
  const brightRatio = bright / gray.length
  const lap = laplacianStats(gray, cornea.width, cornea.height)
  const irregularity = Math.min(100, Math.max(0, brightRatio * 120 + Math.sqrt(lap.variance) * 0.8 + lap.variance * 0.015))
  const tear = Math.min(100, Math.max(0, 100 - irregularity * 0.85))
  return {
    experimental_tear_proxy: roundTo(tear, 1),
    experimental_texture_proxy: roundTo(irregularity, 1),
  }
}

async function scoreRedness(patch, runModel, spec) {
  const out = await runModel('sclera_redness', modelTensor(patch, spec))
  const raw = out.score.data[0]
  return roundTo(Math.min(4, Math.max(0, raw)), 2)
}

/**
 * Dry eye / redness photo: heuristic measurements + ML redness per eye.
 * Mirrors dry_eye_analysis._analyze_cropped_eyes for landmark captures.
 */
export async function analyzeRednessFrame(frame, landmarks, { runModel, manifest }) {
  const spec = manifest.sclera_redness.input
  const mlPad = manifest.sclera_redness.crop
  const wb = estimateWhiteBalance(frame)
  const eyes = {}
  for (const [side, indices] of [['left', LEFT_EYE_REGION], ['right', RIGHT_EYE_REGION]]) {
    const [hx0, hy0, hx1, hy1] = landmarkBBox(landmarks, indices, frame.width, frame.height, HEURISTIC_PAD.x, HEURISTIC_PAD.y)
    if (hx1 - hx0 < 20 || hy1 - hy0 < 20) {
      throw new OnDeviceError('eye_too_small', `Could not isolate ${side} eye — move closer to the camera.`)
    }
    const heuristicCrop = crop(frame, hx0, hy0, hx1, hy1)
    const [mx0, my0, mx1, my1] = landmarkBBox(landmarks, indices, frame.width, frame.height, mlPad.pad_x, mlPad.pad_y)
    const mlCrop = mx1 - mx0 >= 12 && my1 - my0 >= 12 ? crop(frame, mx0, my0, mx1, my1) : heuristicCrop
    const patch = prepareOcularPatch(mlCrop, side)
    eyes[side] = {
      redness: measureScleraRedness(heuristicCrop, side, wb),
      surface: analyzeTearFilmSurface(heuristicCrop),
      ml: { available: true, score: await scoreRedness(patch, runModel, spec) },
      bbox: [hx0, hy0, hx1, hy1],
      ml_patch_shape: [patch.height, patch.width],
    }
  }
  return {
    kind: 'redness',
    version: PAYLOAD_VERSION,
    frame: { width: frame.width, height: frame.height },
    white_balance: wb,
    eyes,
  }
}

/** cataract_opacity_analysis.pupil_image_metrics (descriptive only). */
export function pupilImageMetrics(eye) {
  const { width: w, height: h } = eye
  const roi = crop(eye, Math.trunc(w * 0.28), Math.trunc(h * 0.28), Math.trunc(w * 0.72), Math.trunc(h * 0.78))
  if (!roi.width || !roi.height) {
    return { mean_brightness: null, texture_energy: null, dark_pupil_ratio: null, red_minus_blue: null }
  }
  const gray = toGray(roi)
  let sum = 0
  let dark = 0
  let rmb = 0
  for (let i = 0; i < gray.length; i++) {
    sum += gray[i]
    if (gray[i] < 70) dark++
    rmb += roi.data[i * 3] - roi.data[i * 3 + 2]
  }
  const n = gray.length
  const lap = laplacianStats(gray, roi.width, roi.height)
  return {
    mean_brightness: roundTo(sum / n, 1),
    texture_energy: roundTo(Math.min(1, Math.max(0, lap.variance / 80)), 3),
    dark_pupil_ratio: roundTo(dark / n, 3),
    red_minus_blue: roundTo(rmb / n, 1),
  }
}

/** cnn_explain: 7×7 CAM → 224×224 map in [0, 1] + central-mass share. */
export function camToMap(cam, size = MODEL_INPUT) {
  const side = Math.round(Math.sqrt(cam.length))
  const map = upsampleBilinear(cam, side, side, size, size)
  let mn = Infinity
  let mx = -Infinity
  for (const v of map) {
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  for (let i = 0; i < map.length; i++) map[i] = (map[i] - mn) / (mx - mn + 1e-8)
  const r = 0.35 * size
  let inside = 0
  let total = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = map[y * size + x]
      total += v
      if ((x - size / 2) ** 2 + (y - size / 2) ** 2 <= r * r) inside += v
    }
  }
  return { map, size, centralMass: inside / (total + 1e-8) }
}

function jet(v) {
  const c = (x) => Math.round(255 * Math.min(1, Math.max(0, x)))
  return [c(1.5 - Math.abs(4 * v - 3)), c(1.5 - Math.abs(4 * v - 2)), c(1.5 - Math.abs(4 * v - 1))]
}

/** RGBA overlay of the crop with a jet CAM (display only, never uploaded unless photos are saved). */
export function camOverlayRgba(eye, camMap, alpha = 0.42) {
  const base = resizeBilinearPIL(eye, camMap.size, camMap.size)
  const out = new Uint8ClampedArray(camMap.size * camMap.size * 4)
  for (let i = 0; i < camMap.map.length; i++) {
    const heat = jet(Math.trunc(camMap.map[i] * 255) / 255)
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(base.data[i * 3 + c] * (1 - alpha) + heat[c] * alpha)
    out[i * 4 + 3] = 255
  }
  return { width: camMap.size, height: camMap.size, data: out }
}

/**
 * Cataract screening per eye. The browser returns the calibrated probability and
 * OOD score; the server re-applies its own OOD threshold and band cut-offs.
 */
export async function analyzeCataractFrame(frame, landmarks, { runModel, manifest, withCam = true }) {
  const m = manifest.cataract_screen
  const eyes = {}
  const overlays = {}
  for (const [side, indices] of [['left', LEFT_EYE_REGION], ['right', RIGHT_EYE_REGION]]) {
    const [x0, y0, x1, y1] = landmarkBBox(landmarks, indices, frame.width, frame.height, m.crop.pad_x, m.crop.pad_y)
    if (x1 - x0 < 24 || y1 - y0 < 18) {
      throw new OnDeviceError('eye_too_small', `Could not isolate ${side} eye. Move closer and keep the eye fully visible.`)
    }
    const eye = crop(frame, x0, y0, x1, y1)
    const out = await runModel('cataract_screen', modelTensor(eye, m.input))
    const prob = out.prob.data[0]
    const ood = out.ood_score.data[0]
    const abstain = ood > m.ood_threshold
    const screening = { prob: roundTo(prob, 6), ood_score: roundTo(ood, 6) }
    if (withCam && !abstain) {
      const camMap = camToMap(out.cam.data)
      screening.cam_central_mass = roundTo(camMap.centralMass, 3)
      overlays[side] = camOverlayRgba(eye, camMap)
    }
    eyes[side] = { screening, image_metrics: pupilImageMetrics(eye), bbox: [x0, y0, x1, y1] }
  }
  return {
    result: {
      kind: 'cataract',
      version: PAYLOAD_VERSION,
      frame: { width: frame.width, height: frame.height },
      eyes,
    },
    overlays,
  }
}

export class OnDeviceError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
