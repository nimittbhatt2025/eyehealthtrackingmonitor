/**
 * Maps app test IDs to frontend routes and display labels.
 */

const TEST_ROUTES = {
  dry_eye: '/vision-tests/dry_eye',
  dry_eye_assessment: '/vision-tests/dry_eye',
  dry_eye_test: '/vision-tests/dry_eye',
  dry_eye_workup: '/vision-tests/dry_eye',
  comprehensive_dry_eye_workup: '/vision-tests/dry_eye',
  visual_acuity: '/vision-tests/visual_acuity',
  color_vision: '/vision-tests/color_vision',
  amsler_grid: '/vision-tests/amsler_grid',
  contrast_sensitivity: '/vision-tests/contrast_sensitivity',
  side_vision: '/vision-tests/side_vision',
  side_vision_legacy: '/vision-tests/side_vision',
  cataract_glare: '/vision-tests/cataract_glare',
  red_reflex: '/vision-tests/red_reflex',
  accommodative_lag: '/vision-tests/accommodative_lag',
  near_point_convergence: '/vision-tests/near_point_convergence',
  peripheral_awareness: '/vision-tests/peripheral_awareness',
  ocular_ergonomics: '/vision-tests/ocular_ergonomics',
  eye_tracking: '/eye-tracking-analysis',
  tracking: '/eye-tracking-analysis',
  acuity: '/vision-tests/visual_acuity',
  accommodative_lag_webcam: '/vision-tests/accommodative_lag',
}

export const TEST_INFO = {
  dry_eye: {
    title: 'Dry Eye Check',
    description: 'OSDI-12, blur-report time, and optional experimental photo index — not a diagnosis',
  },
  visual_acuity: {
    title: 'Clear Vision Test',
    description: 'ETDRS-style chart at 1 m (Sloan, HOTV or tumbling E)',
  },
  color_vision: {
    title: 'Color Vision Test',
    description: 'Color thresholds on red, green and blue–yellow axes',
  },
  amsler_grid: {
    title: 'Straight-Line Test',
    description: 'Amsler grid (full + 5% contrast) and line-alignment hyperacuity',
  },
  contrast_sensitivity: {
    title: 'Faint Shapes Test',
    description: 'Contrast sensitivity curve (qCSF gratings at 1 m)',
  },
  cataract_glare: {
    title: 'Glare Test',
    description: 'Contrast loss under glare (Δ logCS) — not a cataract exam',
  },
  eye_tracking: {
    title: 'Eye Tracking Analysis',
    description: 'Quick 90s blink screen or extended 5-min coaching session',
  },
  accommodative_lag: {
    title: 'Near Blur Tolerance',
    description: 'Blur detection threshold on near letters at 40 cm (arcmin)',
  },
  near_point_convergence: {
    title: 'Convergence Near Point',
    description: 'Camera-assisted near point of convergence (cm)',
  },
  ocular_ergonomics: {
    title: 'Posture & Lighting Check',
    description: 'Screen distance, glare, blink rate and 20-20-20 breaks',
  },
  side_vision: {
    title: 'Side Vision Test',
    description: 'Relative four-corner comparison with reliability checks — not a visual-field test',
  },
  side_vision_legacy: {
    title: 'Side Vision Test (earlier version)',
    description: 'Earlier side-vision exercise — not a visual-field test',
  },
  red_reflex: {
    title: 'Eye Glow Test',
    description: 'Phone-flashlight left/right glow comparison — not a clinical red-reflex exam',
  },
  peripheral_awareness: {
    title: 'Side Vision Game',
    description: 'Gamified peripheral vision check',
  },
}

export function getVisionTestRoute(testId) {
  if (TEST_ROUTES[testId]) return TEST_ROUTES[testId]
  return `/vision-tests/${testId}`
}

export function getVisionTestInfo(testId) {
  return TEST_INFO[testId] || {
    title: testId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: 'Available in Vision Tests',
  }
}

export function resolveAppTests(appTests = []) {
  const seen = new Set()
  const resolved = []

  for (const testId of appTests) {
    const route = getVisionTestRoute(testId)
    if (seen.has(route)) continue
    seen.add(route)

    const info = getVisionTestInfo(testId)

    resolved.push({
      id: testId,
      route,
      title: info.title,
      description: info.description,
      implemented: Boolean(TEST_ROUTES[testId]),
    })
  }

  return resolved
}
