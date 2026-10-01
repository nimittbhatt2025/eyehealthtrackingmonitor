/**
 * Geometry shared by a stimulus and the answer buttons that describe it.
 * Kept out of the JSX so tests can rasterize exactly what the user sees
 * (tests/stimuli.test.mjs).
 *
 * Screen convention: y points down, so an angle a (degrees) points along
 * (cos a, sin a) and positive angles turn clockwise, as in SVG rotate().
 */

/** Tumbling E directions = the way the E's bars point. */
export const E_DIRECTIONS = ['up', 'right', 'down', 'left']
export const E_ROTATION = { right: 0, down: 90, left: 180, up: 270 }
// Three bars and the spine are 1 unit thick with 1-unit gaps on a 5×5 grid; unrotated, the bars point right.
export const E_PATH = 'M0 0.5 H5 M0 2.5 H5 M0 4.5 H5 M0.5 0 V5'

/** Landolt C gap positions for the colour test (angle in the screen convention above). */
export const LANDOLT_GAPS = [
  { id: 'up', label: 'Up', key: 'ArrowUp', angle: -90 },
  { id: 'right', label: 'Right', key: 'ArrowRight', angle: 0 },
  { id: 'down', label: 'Down', key: 'ArrowDown', angle: 90 },
  { id: 'left', label: 'Left', key: 'ArrowLeft', angle: 180 },
]

// Answer-button icon on a -10…10 viewBox: an arc whose opening faces +x before rotate(angle).
export const C_ICON_PATH = 'M 6.2 -2 A 6.5 6.5 0 1 0 6.2 2'

/**
 * True when (x, y), relative to the stimulus centre, lies on the C's ring but
 * not in its gap. R is the stimulus radius in the same units.
 */
export function inLandoltC(x, y, R, gapAngle) {
  const r = Math.hypot(x, y)
  const outer = 0.6 * R
  const inner = 0.32 * R
  if (r < inner || r > outer) return false
  const a = (gapAngle * Math.PI) / 180
  const along = x * Math.cos(a) + y * Math.sin(a)
  const across = -x * Math.sin(a) + y * Math.cos(a)
  return !(along > 0 && Math.abs(across) < (outer - inner) / 2)
}
