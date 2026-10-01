/**
 * Regression tests for every rendered stimulus.
 *
 * Until 27 Sep 2026 the glare test drew horizontal stripes when it meant
 * vertical (and vice versa), so answers were scored against the wrong
 * orientation. Each stimulus is now checked two ways:
 *  - a property test that measures the image (stripe direction, contrast,
 *    spatial frequency, gap side, line offset) against what the answer
 *    buttons claim — this is what would have caught that bug;
 *  - a golden image, so any unreviewed change to the pixels fails.
 *
 * Run: npm test   ·   Accept intended changes: npm run test:update-golden
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { GRATING_ORIENTATIONS, paintBlob, paintGrating, srgbToLinear } from '../src/utils/psychophysics.js'
import { paintVernier } from '../src/utils/vernier.js'
import { C_ICON_PATH, E_DIRECTIONS, E_PATH, E_ROTATION, LANDOLT_GAPS, inLandoltC } from '../src/utils/stimulusGeometry.js'
import {
  DIRECTION_VECTORS,
  angleDiff,
  crossings,
  expectGolden,
  fakeCanvas,
  meanStepChange,
  openSide,
  rasterizeStrokePath,
  stripeOrientation,
  withSeededRandom,
} from './helpers/stimulus.mjs'

// One-pixel steps along and across the stripes, in screen pixels (y down).
const STEPS = {
  0: { along: [1, 0], across: [0, 1] },
  90: { along: [0, 1], across: [1, 0] },
  45: { along: [1, -1], across: [1, 1] },
  135: { along: [1, 1], across: [1, -1] },
}
const SYMBOL_ANGLE = { '—': 0, '|': 90, '/': 45, '\\': 135 }

// Stimulus configurations as the tests draw them (see the page components).
const GRATINGS = {
  // ContrastSensitivityTest: 5° patch at 2 cpd, 0.6° soft edge, luminance-linear contrast.
  contrast: (canvas, angle) =>
    paintGrating(canvas, angle, 2 * 5, 0.5, {
      apertureRadius: canvas.width / 2, softEdge: (0.6 / 5) * canvas.width, linearize: true, dither: false,
    }),
  // CataractTest (glare): 12 cycles across a 400 px canvas, 120 px aperture.
  glare: (canvas, angle) => paintGrating(canvas, angle, 12, 0.5, { apertureRadius: (120 / 400) * canvas.width, dither: false }),
  // GratingSwatch: the answer-button icon.
  swatch: (canvas, angle) => paintGrating(canvas, angle, 4, 1, { dither: false }),
}

function render(kind, size, angle) {
  const canvas = fakeCanvas(size, size)
  GRATINGS[kind](canvas, angle)
  return canvas.gray()
}

describe('grating orientation (the glare stripe bug)', () => {
  it('every answer option labels its angle consistently', () => {
    assert.deepEqual(GRATING_ORIENTATIONS.map((o) => o.angle).sort((a, b) => a - b), [0, 45, 90, 135])
    for (const o of GRATING_ORIENTATIONS) {
      assert.equal(SYMBOL_ANGLE[o.symbol], o.angle, `${o.name}: symbol ${o.symbol} vs angle ${o.angle}`)
      const expected = { 0: 'horizontal', 90: 'vertical', 45: 'diagonal-right', 135: 'diagonal-left' }[o.angle]
      assert.equal(o.direction, expected, `${o.name}: direction id`)
    }
  })

  for (const kind of Object.keys(GRATINGS)) {
    for (const o of GRATING_ORIENTATIONS) {
      it(`${kind}: "${o.name}" stripes run ${o.symbol} on screen`, () => {
        const size = kind === 'swatch' ? 44 : 256
        const gray = render(kind, size, o.angle)
        const { along, across } = STEPS[o.angle]
        const a = meanStepChange(gray, size, size, ...along)
        const x = meanStepChange(gray, size, size, ...across)
        assert.ok(a < 0.15 * x, `brightness should stay constant along the stripes (along ${a.toFixed(2)} vs across ${x.toFixed(2)})`)

        const { angle, coherence } = stripeOrientation(gray, size, size)
        assert.ok(angleDiff(angle, o.angle) < 2, `structure tensor says ${angle.toFixed(1)}°, label says ${o.angle}°`)
        // The glare aperture's hard circular edge adds some gradient energy in every direction.
        assert.ok(coherence > 0.75, `single clear orientation (coherence ${coherence.toFixed(2)})`)
      })
    }
  }
})

const michelson = (values) => {
  let max = -Infinity
  let min = Infinity
  for (const v of values) {
    if (v > max) max = v
    if (v < min) min = v
  }
  return (max - min) / (max + min)
}

describe('grating contrast, frequency and aperture', () => {
  it('Michelson contrast of pixel values matches the request', () => {
    const c = fakeCanvas(400, 400)
    paintGrating(c, 90, 12, 0.5, { dither: false })
    const m = michelson(c.gray())
    assert.ok(Math.abs(m - 0.5) < 0.01, `contrast ${m.toFixed(3)}`)
  })

  it('linearized contrast is Michelson contrast of screen luminance', () => {
    const c = fakeCanvas(400, 400)
    paintGrating(c, 0, 12, 0.3, { dither: false, linearize: true })
    const m = michelson(Array.from(c.gray(), (v) => srgbToLinear(v / 255)))
    assert.ok(Math.abs(m - 0.3) < 0.01, `luminance contrast ${m.toFixed(3)}`)
  })

  it('cycles per canvas width are what the test asked for', () => {
    for (const [angle, perRow] of [[90, 1], [45, Math.SQRT1_2]]) {
      const c = fakeCanvas(400, 400)
      paintGrating(c, angle, 12, 1, { dither: false })
      const row = Array.from(c.gray().subarray(200 * 400, 201 * 400))
      const n = crossings(row)
      assert.ok(Math.abs(n - 2 * 12 * perRow) <= 1.5, `angle ${angle}: ${n} crossings, expected ≈ ${(24 * perRow).toFixed(1)}`)
    }
    const c = fakeCanvas(400, 400)
    paintGrating(c, 0, 12, 1, { dither: false })
    const g = c.gray()
    const column = Array.from({ length: 400 }, (_, y) => g[y * 400 + 200])
    assert.ok(Math.abs(crossings(column) - 24) <= 1, 'horizontal stripes: 12 cycles down the canvas')
  })

  it('outside the aperture is plain mean grey; the soft edge only fades', () => {
    const size = 400
    const c = fakeCanvas(size, size)
    paintGrating(c, 45, 12, 1, { apertureRadius: 120, softEdge: 30, dither: false })
    const g = c.gray()
    let worstOutside = 0
    const band = Array(6).fill(0) // 5 px annuli across the 90–120 px fade
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const r = Math.hypot(x - size / 2, y - size / 2)
        const dev = Math.abs(g[y * size + x] - 127.5)
        if (r >= 120) worstOutside = Math.max(worstOutside, dev)
        else if (r >= 90) band[Math.floor((r - 90) / 5)] = Math.max(band[Math.floor((r - 90) / 5)], dev)
      }
    }
    assert.ok(worstOutside <= 0.5, `no stripes beyond the aperture (max deviation ${worstOutside})`)
    for (let i = 1; i < band.length; i++) assert.ok(band[i] <= band[i - 1] + 0.5, `fade is monotonic: ${band.map((v) => v.toFixed(1))}`)
    assert.ok(band[0] > 120 && band[5] < 10, `fade runs from full to near zero: ${band.map((v) => v.toFixed(1))}`)
  })

  it('phase π inverts the grating (used to randomise phase between trials)', () => {
    const a = fakeCanvas(64, 64)
    const b = fakeCanvas(64, 64)
    paintGrating(a, 90, 4, 0.8, { dither: false })
    paintGrating(b, 90, 4, 0.8, { dither: false, phase: Math.PI })
    const ga = a.gray()
    const gb = b.gray()
    for (let i = 0; i < ga.length; i++) assert.ok(Math.abs(ga[i] + gb[i] - 255) <= 1, `pixel ${i}`)
  })

  it('dithering keeps sub-grey-step contrast on average', () => {
    const size = 256
    const contrast = 0.004 // amplitude ≈ 0.51 grey levels, below one 8-bit step
    const c = fakeCanvas(size, size)
    withSeededRandom(3, () => paintGrating(c, 90, 8, contrast))
    const g = c.gray()
    let s = 0
    for (let x = 0; x < size; x++) {
      let col = 0
      for (let y = 0; y < size; y++) col += g[y * size + x]
      s += (col / size - 127.5) * Math.sin((2 * Math.PI * x * 8) / size)
    }
    const amplitude = (2 * s) / size
    assert.ok(Math.abs(amplitude - contrast * 127.5) < 0.06, `recovered amplitude ${amplitude.toFixed(3)} vs ${(contrast * 127.5).toFixed(3)}`)
  })
})

describe('golden images', () => {
  for (const kind of Object.keys(GRATINGS)) {
    for (const o of GRATING_ORIENTATIONS) {
      it(`grating ${kind} ${o.angle}°`, () => {
        const size = kind === 'swatch' ? 44 : 128
        expectGolden(`grating_${kind}_${o.angle}`, render(kind, size, o.angle), size, size)
      })
    }
  }

  it('side-vision blob', () => {
    const c = fakeCanvas(96, 96)
    paintBlob(c, 0.5, { background: 128, dither: false })
    expectGolden('blob_side_vision', c.gray(), 96, 96)
  })

  it('vernier pair, lower line right', () => {
    const c = fakeCanvas(96, 96)
    paintVernier(c, { cx: 48, cy: 48, offsetPx: 4, lengthPx: 30, gapPx: 6, sigmaPx: 1.2 })
    expectGolden('vernier_lower_right', c.gray(), 96, 96)
  })

  for (const direction of E_DIRECTIONS) {
    it(`tumbling E ${direction}`, () => {
      expectGolden(`tumbling_e_${direction}`, rasterizeStrokePath(E_PATH, { size: 50, rotateDeg: E_ROTATION[direction] }), 50, 50)
    })
  }

  for (const gap of LANDOLT_GAPS) {
    it(`colour-test Landolt C gap ${gap.id}`, () => {
      expectGolden(`landolt_c_${gap.id}`, landoltMask(64, gap.angle), 64, 64)
    })
  }
})

describe('side-vision blob', () => {
  it('is a centred, round luminance decrement that fades into the background', () => {
    const size = 96
    const c = fakeCanvas(size, size)
    paintBlob(c, 0.5, { background: 128, dither: false })
    const g = c.gray()
    const at = (x, y) => g[y * size + x]
    assert.ok(Math.abs(at(48, 48) - 64) <= 1, `centre = background × (1 − contrast), got ${at(48, 48)}`)
    for (const [x, y] of [[0, 0], [95, 0], [0, 95], [95, 95]]) assert.equal(at(x, y), 128, 'corners are background')
    for (const d of [5, 10, 20]) {
      const ring = [at(48 + d, 48), at(48 - d, 48), at(48, 48 + d), at(48, 48 - d)]
      assert.ok(Math.max(...ring) - Math.min(...ring) <= 1, `radially symmetric at r=${d}: ${ring}`)
    }
  })
})

describe('vernier lines', () => {
  const centroidX = (g, w, y0, y1) => {
    let m = 0
    let mx = 0
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < w; x++) {
        const ink = 255 - g[y * w + x]
        m += ink
        mx += ink * (x + 0.5)
      }
    }
    return mx / m
  }

  for (const offset of [2.6, -2.6, 0.3]) {
    it(`offset ${offset} px puts the lower line ${offset > 0 ? 'right' : 'left'} by exactly that much`, () => {
      const c = fakeCanvas(120, 120)
      paintVernier(c, { cx: 60, cy: 60, offsetPx: offset, lengthPx: 40, gapPx: 8, sigmaPx: 1.5 })
      const g = c.gray()
      const upper = centroidX(g, 120, 12, 56)
      const lower = centroidX(g, 120, 64, 104)
      // VernierTask scores offset > 0 as "lower line is right".
      assert.ok(Math.abs(lower - upper - offset) < 0.05, `measured ${(lower - upper).toFixed(3)} px`)
      assert.ok(Math.abs((upper + lower) / 2 - 60) < 0.05, 'pair is centred on cx')
    })
  }

  it('segments are vertical and the fixation dot is drawn only when asked', () => {
    const c = fakeCanvas(120, 120)
    paintVernier(c, { cx: 60, cy: 60, offsetPx: 0, lengthPx: 40, gapPx: 8, sigmaPx: 1.5 })
    const { angle } = stripeOrientation(c.gray(), 120, 120)
    assert.ok(angleDiff(angle, 90) < 2, `lines run vertically (${angle.toFixed(1)}°)`)
    assert.ok(!c.ops.some((op) => op[0] === 'arc'))
    const f = fakeCanvas(120, 120)
    paintVernier(f, { cx: 60, cy: 60, offsetPx: 0, lengthPx: 40, gapPx: 8, sigmaPx: 1.5, fixation: { x: 60, y: 60, r: 3 } })
    assert.ok(f.ops.some((op) => op[0] === 'arc'))
  })
})

describe('tumbling E (acuity)', () => {
  for (const direction of E_DIRECTIONS) {
    it(`E_ROTATION makes the bars point ${direction}`, () => {
      const g = rasterizeStrokePath(E_PATH, { size: 50, rotateDeg: E_ROTATION[direction] })
      const { side, unique, ink } = openSide(g, 50)
      assert.ok(unique, `one open side expected, ink per border strip ${JSON.stringify(ink)}`)
      assert.equal(side, direction)
    })
  }
})

function landoltMask(size, angle) {
  const R = size / 2 - 1
  const g = new Uint8Array(size * size).fill(255)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inLandoltC(x + 0.5 - size / 2, y + 0.5 - size / 2, R, angle)) g[y * size + x] = 0
    }
  }
  return g
}

describe('colour-test Landolt C', () => {
  // "M sx sy A rx ry rotation large-arc sweep ex ey"; large-arc = 1 strokes the long way, leaving the opening between the endpoints.
  const [sx, sy, , , , largeArc, , ex, ey] = C_ICON_PATH.match(/-?\d*\.?\d+/g).map(Number)

  for (const gap of LANDOLT_GAPS) {
    it(`gap "${gap.id}": stimulus and answer icon both open ${gap.id}`, () => {
      const [dx, dy] = DIRECTION_VECTORS[gap.id]
      const R = 100
      const mid = 0.46 * R
      assert.equal(inLandoltC(dx * mid, dy * mid, R, gap.angle), false, 'stimulus: no C dots in the gap')
      assert.equal(inLandoltC(-dx * mid, -dy * mid, R, gap.angle), true, 'stimulus: ring opposite the gap')
      assert.equal(inLandoltC(-dy * mid, dx * mid, R, gap.angle), true, 'stimulus: ring beside the gap')

      assert.equal(largeArc, 1)
      const a = (gap.angle * Math.PI) / 180
      const ox = (sx + ex) / 2
      const oy = (sy + ey) / 2
      const rx = ox * Math.cos(a) - oy * Math.sin(a)
      const ry = ox * Math.sin(a) + oy * Math.cos(a)
      assert.ok(rx * dx + ry * dy > 0.99 * Math.hypot(rx, ry), `icon opening points (${rx.toFixed(2)}, ${ry.toFixed(2)})`)
    })
  }
})
