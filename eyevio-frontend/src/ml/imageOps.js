/**
 * Image primitives for on-device eye analysis, written to reproduce the
 * OpenCV / Pillow operations the server pipeline uses (same fixed-point
 * arithmetic where it changes thresholded results).
 *
 * Images are { width, height, data: Uint8Array } with interleaved RGB.
 * Pure functions, no DOM: shared by the Web Worker and the Node parity test.
 */

export function makeImage(width, height, data = new Uint8Array(width * height * 3)) {
  return { width, height, data }
}

export function rgbaToRgb(rgba, width, height) {
  const out = new Uint8Array(width * height * 3)
  for (let i = 0, j = 0; i < out.length; i += 3, j += 4) {
    out[i] = rgba[j]
    out[i + 1] = rgba[j + 1]
    out[i + 2] = rgba[j + 2]
  }
  return makeImage(width, height, out)
}

export function rgbToRgba(img) {
  const out = new Uint8ClampedArray(img.width * img.height * 4)
  for (let i = 0, j = 0; i < img.data.length; i += 3, j += 4) {
    out[j] = img.data[i]
    out[j + 1] = img.data[i + 1]
    out[j + 2] = img.data[i + 2]
    out[j + 3] = 255
  }
  return out
}

/** numpy-style slice img[y0:y1, x0:x1] (ends exclusive, clamped). */
export function crop(img, x0, y0, x1, y1) {
  x0 = Math.max(0, Math.min(img.width, x0))
  x1 = Math.max(x0, Math.min(img.width, x1))
  y0 = Math.max(0, Math.min(img.height, y0))
  y1 = Math.max(y0, Math.min(img.height, y1))
  const w = x1 - x0
  const h = y1 - y0
  const out = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * img.width + x0) * 3
    out.set(img.data.subarray(src, src + w * 3), y * w * 3)
  }
  return makeImage(w, h, out)
}

/** cv2.COLOR_BGR2GRAY on 8-bit (fixed point, 14-bit coefficients). */
export function toGray(img) {
  const n = img.width * img.height
  const out = new Uint8Array(n)
  const d = img.data
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    out[i] = (d[p] * 4899 + d[p + 1] * 9617 + d[p + 2] * 1868 + 8192) >> 14
  }
  return out
}

const SDIV = new Int32Array(256)
for (let i = 1; i < 256; i++) SDIV[i] = Math.round((255 << 12) / i)

/** OpenCV 8-bit HSV saturation and value planes (H is not needed). */
export function hsvSV(img) {
  const n = img.width * img.height
  const s = new Uint8Array(n)
  const v = new Uint8Array(n)
  const d = img.data
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    const r = d[p]
    const g = d[p + 1]
    const b = d[p + 2]
    const mx = r > g ? (r > b ? r : b) : g > b ? g : b
    const mn = r < g ? (r < b ? r : b) : g < b ? g : b
    v[i] = mx
    s[i] = ((mx - mn) * SDIV[mx] + 2048) >> 12
  }
  return { s, v }
}

// 3×3 MORPH_ELLIPSE is a cross. OpenCV's default morphology border never wins:
// out-of-image neighbours are ignored for both erode and dilate.
function morph(mask, w, h, isErode) {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let m = mask[i]
      if (isErode) {
        if (x > 0 && mask[i - 1] < m) m = mask[i - 1]
        if (x < w - 1 && mask[i + 1] < m) m = mask[i + 1]
        if (y > 0 && mask[i - w] < m) m = mask[i - w]
        if (y < h - 1 && mask[i + w] < m) m = mask[i + w]
      } else {
        if (x > 0 && mask[i - 1] > m) m = mask[i - 1]
        if (x < w - 1 && mask[i + 1] > m) m = mask[i + 1]
        if (y > 0 && mask[i - w] > m) m = mask[i - w]
        if (y < h - 1 && mask[i + w] > m) m = mask[i + w]
      }
      out[i] = m
    }
  }
  return out
}

export const erodeCross = (mask, w, h) => morph(mask, w, h, true)
export const dilateCross = (mask, w, h) => morph(mask, w, h, false)
export const openCross = (mask, w, h) => dilateCross(erodeCross(mask, w, h), w, h)
export const closeCross = (mask, w, h) => erodeCross(dilateCross(mask, w, h), w, h)

function cubicCoeffs(x) {
  const A = -0.75
  const c0 = ((A * (x + 1) - 5 * A) * (x + 1) + 8 * A) * (x + 1) - 4 * A
  const c1 = ((A + 2) * x - (A + 3)) * x * x + 1
  const c2 = ((A + 2) * (1 - x) - (A + 3)) * (1 - x) * (1 - x) + 1
  return [c0, c1, c2, 1 - c0 - c1 - c2]
}

function cubicTable(srcSize, dstSize) {
  const scale = srcSize / dstSize
  const idx = new Int32Array(dstSize * 4)
  const w = new Int32Array(dstSize * 4)
  for (let d = 0; d < dstSize; d++) {
    let f = Math.fround((d + 0.5) * scale - 0.5)
    const s = Math.floor(f)
    f -= s
    const c = cubicCoeffs(f)
    for (let k = 0; k < 4; k++) {
      idx[d * 4 + k] = Math.min(srcSize - 1, Math.max(0, s - 1 + k))
      w[d * 4 + k] = Math.round(c[k] * 2048)
    }
  }
  return { idx, w }
}

/** cv2.resize(..., interpolation=cv2.INTER_CUBIC) for 8-bit RGB (11-bit fixed-point coefficients). */
export function resizeCubicCV(img, dstW, dstH) {
  const { width: sw, height: sh, data } = img
  const tx = cubicTable(sw, dstW)
  const ty = cubicTable(sh, dstH)
  const rows = new Int32Array(sh * dstW * 3)
  for (let y = 0; y < sh; y++) {
    const rowBase = y * sw * 3
    for (let x = 0; x < dstW; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0
        for (let k = 0; k < 4; k++) acc += data[rowBase + tx.idx[x * 4 + k] * 3 + c] * tx.w[x * 4 + k]
        rows[(y * dstW + x) * 3 + c] = acc
      }
    }
  }
  const out = new Uint8Array(dstW * dstH * 3)
  const half = 1 << 21
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0
        for (let k = 0; k < 4; k++) acc += rows[(ty.idx[y * 4 + k] * dstW + x) * 3 + c] * ty.w[y * 4 + k]
        const v = Math.floor((acc + half) / 4194304)
        out[(y * dstW + x) * 3 + c] = v < 0 ? 0 : v > 255 ? 255 : v
      }
    }
  }
  return makeImage(dstW, dstH, out)
}

const PIL_PRECISION_BITS = 22
const PIL_ONE = 2 ** PIL_PRECISION_BITS

function pilCoeffs(inSize, outSize) {
  const scale = inSize / outSize
  const filterscale = Math.max(scale, 1)
  const support = 1.0 * filterscale
  const bounds = []
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale
    const ss = 1 / filterscale
    let xmin = Math.trunc(center - support + 0.5)
    if (xmin < 0) xmin = 0
    let xmax = Math.trunc(center + support + 0.5)
    if (xmax > inSize) xmax = inSize
    xmax -= xmin
    const k = new Float64Array(xmax)
    let ww = 0
    for (let x = 0; x < xmax; x++) {
      const t = Math.abs((x + xmin - center + 0.5) * ss)
      const w = t < 1 ? 1 - t : 0
      k[x] = w
      ww += w
    }
    const ki = new Array(xmax)
    for (let x = 0; x < xmax; x++) {
      const v = ww !== 0 ? k[x] / ww : k[x]
      ki[x] = v < 0 ? Math.trunc(-0.5 + v * PIL_ONE) : Math.trunc(0.5 + v * PIL_ONE)
    }
    bounds.push({ xmin, k: ki })
  }
  return bounds
}

function clip8(acc) {
  const v = Math.floor(acc / PIL_ONE)
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/** PIL Image.resize(..., BILINEAR) — torchvision Resize on PIL images (antialiased on downscale). */
export function resizeBilinearPIL(img, dstW, dstH) {
  const { width: sw, height: sh } = img
  let cur = img
  const init = PIL_ONE / 2
  if (dstW !== sw) {
    const cx = pilCoeffs(sw, dstW)
    const out = new Uint8Array(dstW * sh * 3)
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < dstW; x++) {
        const { xmin, k } = cx[x]
        for (let c = 0; c < 3; c++) {
          let acc = init
          for (let i = 0; i < k.length; i++) acc += cur.data[(y * sw + xmin + i) * 3 + c] * k[i]
          out[(y * dstW + x) * 3 + c] = clip8(acc)
        }
      }
    }
    cur = makeImage(dstW, sh, out)
  }
  if (dstH !== sh) {
    const cy = pilCoeffs(sh, dstH)
    const w = cur.width
    const out = new Uint8Array(w * dstH * 3)
    for (let y = 0; y < dstH; y++) {
      const { xmin: ymin, k } = cy[y]
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let acc = init
          for (let i = 0; i < k.length; i++) acc += cur.data[((ymin + i) * w + x) * 3 + c] * k[i]
          out[(y * w + x) * 3 + c] = clip8(acc)
        }
      }
    }
    cur = makeImage(w, dstH, out)
  }
  return cur
}

/** torchvision ToTensor + Normalize → Float32 NCHW (batch 1). */
export function toNormalizedTensor(img, mean, std) {
  const n = img.width * img.height
  const out = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * n + i] = (img.data[i * 3 + c] / 255 - mean[c]) / std[c]
    }
  }
  return out
}

function reflect101(i, n) {
  if (n === 1) return 0
  while (i < 0 || i >= n) {
    if (i < 0) i = -i
    if (i >= n) i = 2 * n - 2 - i
  }
  return i
}

/** cv2.GaussianBlur(gray, (5, 5), 0) on 8-bit: kernel [1 4 6 4 1]/16, bit-exact rounding, BORDER_REFLECT_101. */
export function gaussianBlur5(gray, w, h) {
  const K = [1, 4, 6, 4, 1]
  const tmp = new Int32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let k = -2; k <= 2; k++) acc += K[k + 2] * gray[y * w + reflect101(x + k, w)]
      tmp[y * w + x] = acc
    }
  }
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let k = -2; k <= 2; k++) acc += K[k + 2] * tmp[reflect101(y + k, h) * w + x]
      out[y * w + x] = Math.floor((acc + 128) / 256)
    }
  }
  return out
}

/** cv2.Laplacian(gray, cv2.CV_64F) (ksize=1, BORDER_REFLECT_101) → { mean, variance }. */
export function laplacianStats(gray, w, h) {
  const n = w * h
  if (!n) return { mean: 0, variance: 0 }
  const vals = new Float64Array(n)
  let sum = 0
  for (let y = 0; y < h; y++) {
    const yu = reflect101(y - 1, h)
    const yd = reflect101(y + 1, h)
    for (let x = 0; x < w; x++) {
      const xl = reflect101(x - 1, w)
      const xr = reflect101(x + 1, w)
      const v = gray[yu * w + x] + gray[yd * w + x] + gray[y * w + xl] + gray[y * w + xr] - 4 * gray[y * w + x]
      vals[y * w + x] = v
      sum += v
    }
  }
  const mean = sum / n
  let sq = 0
  for (let i = 0; i < n; i++) sq += (vals[i] - mean) ** 2
  return { mean, variance: sq / n }
}

/** F.interpolate(..., mode='bilinear', align_corners=False) for a single-channel float map. */
export function upsampleBilinear(map, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh)
  const axis = (d, s, dstSize) => {
    let src = (d + 0.5) * (s / dstSize) - 0.5
    if (src < 0) src = 0
    const i0 = Math.min(Math.floor(src), s - 1)
    const i1 = Math.min(i0 + 1, s - 1)
    return [i0, i1, src - i0]
  }
  for (let y = 0; y < dh; y++) {
    const [y0, y1, ly] = axis(y, sh, dh)
    for (let x = 0; x < dw; x++) {
      const [x0, x1, lx] = axis(x, sw, dw)
      const top = map[y0 * sw + x0] * (1 - lx) + map[y0 * sw + x1] * lx
      const bot = map[y1 * sw + x0] * (1 - lx) + map[y1 * sw + x1] * lx
      out[y * dw + x] = top * (1 - ly) + bot * ly
    }
  }
  return out
}

export function roundTo(value, digits) {
  if (value == null || !Number.isFinite(value)) return value
  const f = 10 ** digits
  return Math.round(value * f) / f
}
