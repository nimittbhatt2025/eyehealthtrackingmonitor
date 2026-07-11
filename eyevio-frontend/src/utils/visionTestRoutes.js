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
  glaucoma_neural: '/vision-tests/glaucoma_neural',
  cataract_glare: '/vision-tests/cataract_glare',
  red_reflex: '/vision-tests/red_reflex',
  accommodative_lag: '/vision-tests/accommodative_lag',
  peripheral_awareness: '/vision-tests/peripheral_awareness',
  ocular_ergonomics: '/vision-tests/ocular_ergonomics',
  eye_tracking: '/eye-tracking-analysis',
  accommodative_lag_webcam: '/vision-tests/accommodative_lag',
}

export const TEST_INFO = {
  dry_eye: {
    title: 'Dry Eye Screening',
    description: 'Symptom check plus photo analysis for dryness signs',
  },
  visual_acuity: {
    title: 'Clear Vision Test',
    description: 'Letter chart test for visual acuity',
  },
  color_vision: {
    title: 'Color Vision Test',
    description: 'Check how well you distinguish colors',
  },
  amsler_grid: {
    title: 'Straight-Line Test',
    description: 'Amsler grid for center vision changes',
  },
  contrast_sensitivity: {
    title: 'Faint Shapes Test',
    description: 'Contrast sensitivity in dim conditions',
  },
  cataract_glare: {
    title: 'Glare Sensitivity Test',
    description: 'How bright light affects your vision',
  },
  eye_tracking: {
    title: 'Eye Tracking Analysis',
    description: 'Blink patterns and eye fatigue monitoring',
  },
  accommodative_lag: {
    title: 'Eye Tiredness Meter',
    description: 'Screen strain and near-work fatigue',
  },
  ocular_ergonomics: {
    title: 'Posture & Lighting Check',
    description: 'Screen distance, glare, and posture',
  },
  glaucoma_neural: {
    title: 'Side Vision Test',
    description: 'Peripheral vision screening',
  },
  red_reflex: {
    title: 'Eye Glow Test',
    description: 'Red reflex screening via camera',
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
