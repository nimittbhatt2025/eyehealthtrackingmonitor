/**
 * Sloan optotypes drawn on a 5×5 grid with 1-unit strokes, so the letter's
 * height is exactly the rendered size and stroke width is height / 5.
 * T is included for the HOTV chart; it is not a Sloan letter.
 */
const PATHS = {
  C: 'M4.23 1.5 A2 2 0 1 0 4.23 3.5',
  D: 'M0.5 0.5 H2.5 A2 2 0 0 1 2.5 4.5 H0.5 Z',
  H: 'M0.5 0 V5 M4.5 0 V5 M0.5 2.5 H4.5',
  K: 'M0.5 0 V5 M4.7 0.2 L0.9 3.1 M2.1 2.2 L4.7 4.8',
  N: 'M0.5 5 V0 M4.5 5 V0 M0.7 0.3 L4.3 4.7',
  O: 'M2.5 0.5 A2 2 0 1 1 2.49 0.5 Z',
  R: 'M0.5 5 V0.5 H3 A1.25 1.25 0 0 1 3 3 H0.5 M2.6 3 L4.6 5',
  S: 'M4.4 1.3 A2 1 0 1 0 2.5 2.5 A2 1 0 1 1 0.6 3.7',
  T: 'M0 0.5 H5 M2.5 0.5 V5',
  V: 'M0.3 0 L2.5 4.8 L4.7 0',
  Z: 'M0 0.5 H5 M4.4 0.8 L0.6 4.2 M0 4.5 H5',
}

export const SLOAN_LETTERS = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z']
export const HOTV_LETTERS = ['H', 'O', 'T', 'V']

/** Tumbling E directions = the way the E's bars point. */
export const E_DIRECTIONS = ['up', 'right', 'down', 'left']
const E_ROTATION = { right: 0, down: 90, left: 180, up: 270 }
// Three bars and the spine are 1 unit thick with 1-unit gaps (5×5 grid).
const E_PATH = 'M0 0.5 H5 M0 2.5 H5 M0 4.5 H5 M0.5 0 V5'

const SloanLetter = ({ letter, size, color = '#111' }) => (
  <svg width={size} height={size} viewBox="0 0 5 5" aria-label={letter} role="img" style={{ display: 'block' }}>
    <path d={PATHS[letter]} fill="none" stroke={color} strokeWidth="1" strokeLinejoin="miter" strokeMiterlimit="2" />
  </svg>
)

export const TumblingE = ({ direction, size, color = '#111' }) => (
  <svg width={size} height={size} viewBox="0 0 5 5" aria-label={`E pointing ${direction}`} role="img" style={{ display: 'block' }}>
    <path
      d={E_PATH}
      transform={`rotate(${E_ROTATION[direction] ?? 0} 2.5 2.5)`}
      fill="none"
      stroke={color}
      strokeWidth="1"
      strokeLinecap="butt"
    />
  </svg>
)

export default SloanLetter
