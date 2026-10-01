/** Headless canvas stub, golden-image comparison and image measurements for stimulus tests. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { decodeGrayPng, encodeGrayPng } from './png.mjs'

const GOLDEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'golden')
const DIFF_DIR = path.join(GOLDEN_DIR, '__diff__')
const UPDATE = process.env.UPDATE_GOLDEN === '1'

/** Enough of HTMLCanvasElement for the ImageData painters (arc/fill are recorded, not drawn). */
export function fakeCanvas(width, height) {
  let image = null
  const ops = []
  const ctx = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img) => {
      image = img
    },
    beginPath: () => ops.push('beginPath'),
    arc: (...args) => ops.push(['arc', ...args]),
    fill: () => ops.push('fill'),
    set fillStyle(v) {
      ops.push(['fillStyle', v])
    },
  }
  return {
    width,
    height,
    getContext: () => ctx,
    ops,
    /** Red channel of the painted image (the painters write grey pixels). */
    gray() {
      const g = new Uint8Array(width * height)
      for (let i = 0; i < g.length; i++) g[i] = image.data[i * 4]
      return g
    },
  }
}

/** Seeded Math.random for the dithered paths, restored afterwards. */
export function withSeededRandom(seed, fn) {
  const original = Math.random
  let s = seed
  Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  try {
    return fn()
  } finally {
    Math.random = original
  }
}

/**
 * Compare against tests/golden/<name>.png. UPDATE_GOLDEN=1 rewrites the file.
 * Allows ±1 grey level on ≤0.5% of pixels (rounding at exact .5 boundaries).
 */
export function expectGolden(name, gray, width, height) {
  const file = path.join(GOLDEN_DIR, `${name}.png`)
  if (UPDATE || !fs.existsSync(file)) {
    if (!UPDATE) assert.fail(`missing golden ${name}.png — run: npm run test:update-golden, then review the image`)
    fs.mkdirSync(GOLDEN_DIR, { recursive: true })
    fs.writeFileSync(file, encodeGrayPng(gray, width, height))
    return
  }
  const golden = decodeGrayPng(fs.readFileSync(file))
  assert.equal(`${golden.width}x${golden.height}`, `${width}x${height}`, `${name}: size changed`)
  let off1 = 0
  let worst = 0
  const diff = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    const d = Math.abs(gray[i] - golden.gray[i])
    if (d > 0) off1 += 1
    worst = Math.max(worst, d)
    diff[i] = Math.min(255, d * 32)
  }
  const ok = worst <= 1 && off1 <= gray.length * 0.005
  if (!ok) {
    fs.mkdirSync(DIFF_DIR, { recursive: true })
    fs.writeFileSync(path.join(DIFF_DIR, `${name}.actual.png`), encodeGrayPng(gray, width, height))
    fs.writeFileSync(path.join(DIFF_DIR, `${name}.diff.png`), encodeGrayPng(diff, width, height))
  }
  assert.ok(ok, `${name}: ${off1} pixels differ from the golden image (max ${worst} grey levels). See tests/golden/__diff__/`)
}

/**
 * Dominant stripe direction from the structure tensor, in the on-screen
 * convention of GRATING_ORIENTATIONS: 0 = —, 45 = /, 90 = |, 135 = \.
 * Coherence is 1 for a perfect single orientation, 0 for isotropic images.
 */
export function stripeOrientation(gray, width, height) {
  let jxx = 0
  let jyy = 0
  let jxy = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx = gray[y * width + x + 1] - gray[y * width + x - 1]
      const gy = gray[(y + 1) * width + x] - gray[(y - 1) * width + x]
      jxx += gx * gx
      jyy += gy * gy
      jxy += gx * gy
    }
  }
  // Flip y so angles are counter-clockwise on screen, then stripes run perpendicular to the gradient.
  const gradientDeg = (0.5 * Math.atan2(-2 * jxy, jxx - jyy) * 180) / Math.PI
  const stripe = (((gradientDeg + 90) % 180) + 180) % 180
  const coherence = Math.hypot(jxx - jyy, 2 * jxy) / (jxx + jyy || 1)
  return { angle: stripe, coherence }
}

export const angleDiff = (a, b) => {
  const d = Math.abs(a - b) % 180
  return Math.min(d, 180 - d)
}

/** Mean absolute difference between each pixel and its neighbour one step along (dx, dy). */
export function meanStepChange(gray, width, height, dx, dy) {
  let sum = 0
  let n = 0
  for (let y = Math.max(0, -dy); y < height - Math.max(0, dy); y++) {
    for (let x = Math.max(0, -dx); x < width - Math.max(0, dx); x++) {
      sum += Math.abs(gray[y * width + x] - gray[(y + dy) * width + x + dx])
      n += 1
    }
  }
  return sum / n
}

/** Sign changes of (value − mid) along a pixel run: ≈ 2 per cycle. */
export function crossings(values, mid = 127.5) {
  let n = 0
  let prev = null
  for (const v of values) {
    const s = Math.sign(v - mid)
    if (s === 0) continue
    if (prev !== null && s !== prev) n += 1
    prev = s
  }
  return n
}

/** Rasterize a stroked SVG path made of absolute M/H/V commands (butt caps), rotated about (cx, cy). */
export function rasterizeStrokePath(d, { size, viewBox = 5, strokeWidth = 1, rotateDeg = 0, cx = 2.5, cy = 2.5 }) {
  const tokens = d.match(/[MHVmhv]|-?\d*\.?\d+/g)
  const segments = []
  let x = 0
  let y = 0
  for (let i = 0; i < tokens.length; ) {
    const cmd = tokens[i++]
    if (cmd === 'M') {
      x = Number(tokens[i++])
      y = Number(tokens[i++])
    } else if (cmd === 'H') {
      const nx = Number(tokens[i++])
      segments.push({ x0: Math.min(x, nx), x1: Math.max(x, nx), y0: y, y1: y })
      x = nx
    } else if (cmd === 'V') {
      const ny = Number(tokens[i++])
      segments.push({ x0: x, x1: x, y0: Math.min(y, ny), y1: Math.max(y, ny) })
      y = ny
    } else {
      throw new Error(`rasterizeStrokePath supports absolute M/H/V only, got ${cmd}`)
    }
  }
  const half = strokeWidth / 2
  const a = (-rotateDeg * Math.PI) / 180
  const out = new Uint8Array(size * size).fill(255)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Undo the SVG rotate() to find the point in the path's own coordinates.
      const ux = ((px + 0.5) / size) * viewBox - cx
      const uy = ((py + 0.5) / size) * viewBox - cy
      const sx = ux * Math.cos(a) - uy * Math.sin(a) + cx
      const sy = ux * Math.sin(a) + uy * Math.cos(a) + cy
      const inked = segments.some((s) =>
        s.y0 === s.y1
          ? sx >= s.x0 && sx <= s.x1 && Math.abs(sy - s.y0) <= half
          : sy >= s.y0 && sy <= s.y1 && Math.abs(sx - s.x0) <= half
      )
      if (inked) out[py * size + px] = 0
    }
  }
  return out
}

export const DIRECTION_VECTORS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }

/** Which border strip (1/5 of the size) has the least ink: the side an E's bars open towards. */
export function openSide(gray, size) {
  const strip = Math.round(size / 5)
  const ink = { up: 0, down: 0, left: 0, right: 0 }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (gray[y * size + x] > 127) continue
      if (y < strip) ink.up += 1
      if (y >= size - strip) ink.down += 1
      if (x < strip) ink.left += 1
      if (x >= size - strip) ink.right += 1
    }
  }
  const sorted = Object.entries(ink).sort((p, q) => p[1] - q[1])
  return { side: sorted[0][0], unique: sorted[0][1] < sorted[1][1], ink }
}
