/**
 * Physical screen scale (CSS px per mm) for optotype sizing.
 * Set by matching an ID-1 card (85.6 mm wide) on screen.
 */

const STORAGE_KEY = 'eyevio_screen_px_per_mm'
export const CARD_WIDTH_MM = 85.6
const DEFAULT_PX_PER_MM = 96 / 25.4

function screenSignature() {
  return `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}`
}

export function getScreenScale() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved?.pxPerMm > 0 && saved.signature === screenSignature()) {
      return { pxPerMm: saved.pxPerMm, source: 'card' }
    }
    const legacy = JSON.parse(localStorage.getItem('eyevio_calibration') || 'null')
    const legacyPx = legacy?.screenSize?.pixelsPerMM
    if (legacyPx > 0 && legacy?.device?.screenWidth === window.screen.width) {
      return { pxPerMm: legacyPx, source: 'card' }
    }
  } catch {
    /* fall through to default */
  }
  return { pxPerMm: DEFAULT_PX_PER_MM, source: 'default' }
}

export function saveScreenScale(pxPerMm) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ pxPerMm, signature: screenSignature(), savedAt: Date.now() }))
}

/** Optotype height in mm: 5 arcmin at logMAR 0, scaled by 10^logMAR. */
export function optotypeHeightMm(logMAR, distanceMm) {
  const arcmin = 5 * 10 ** logMAR
  return 2 * distanceMm * Math.tan(((arcmin / 60) * Math.PI) / 180 / 2)
}

export function optotypeHeightPx(logMAR, distanceMm, pxPerMm) {
  return optotypeHeightMm(logMAR, distanceMm) * pxPerMm
}

/**
 * Smallest logMAR line this screen can draw faithfully: a Sloan letter is a
 * 5×5 stroke grid, so it needs ≥ 5 device pixels of height.
 */
export function smallestRenderableLogMAR(lines, distanceMm, pxPerMm, devicePixelRatio = window.devicePixelRatio || 1) {
  const ok = lines.filter((l) => optotypeHeightPx(l, distanceMm, pxPerMm) * devicePixelRatio >= 5)
  return ok.length ? Math.min(...ok) : Math.max(...lines)
}
