/**
 * FDA Software as a Medical Device (SaMD) framing for EyeVio.
 * Wellness / educational software — not a diagnostic device.
 */

export const SAMD_HEADLINE = 'Not a diagnostic device'

export const SAMD_SHORT =
  'Not a diagnostic device. EyeVio is wellness software, not FDA-cleared SaMD, and does not diagnose eye disease.'

export const SAMD_BODY =
  'EyeVio is wellness and educational software. It is not FDA-cleared or FDA-approved, is not Software as a Medical Device (SaMD) intended to diagnose, treat, cure, or prevent any disease, and is not a substitute for a comprehensive eye examination. Home scores depend on your screen, lighting, and distance.'

/** Extra qualification when a test sits next to a disease name. */
export const TEST_QUALIFIERS = {
  visual_acuity:
    'This is a home letter-chart check. It is not a refraction and does not prescribe glasses or contacts.',
  color_vision:
    'This is a home color-pattern check. It is not a clinical Ishihara exam and is not valid for occupational or legal certification.',
  amsler_grid:
    'This is a home grid check of central vision. Distortion reports are not a diagnosis of macular degeneration or any retinal disease.',
  contrast_sensitivity:
    'This is a home faint-shape check. It is not a clinical Pelli-Robson exam and does not diagnose cataract, glaucoma, or retinal disease.',
  glaucoma_neural:
    'This is a home side-vision exercise. It is not a visual-field test, does not measure eye pressure, and does not screen for or diagnose glaucoma.',
  cataract_glare:
    'This is a home glare-tolerance exercise. It does not measure lens opacity (not LOCS) and does not diagnose cataract.',
  dry_eye:
    'This is a home symptom-and-photo check. It is not a dry-eye disease diagnosis and is not DEWS or clinical OSDI scoring.',
  red_reflex:
    'This is a home camera check of pupil glow. It is not a clinical red-reflex exam and does not diagnose cataract, leukocoria, or other disease.',
  peripheral_awareness:
    'This is a reaction game for side awareness. It is not a visual-field test and does not screen for or diagnose glaucoma.',
  accommodative_lag:
    'This is a home comfort estimate from near work. It is not a diagnosis of accommodative dysfunction.',
  ocular_ergonomics:
    'This is a posture and lighting comfort check. It is not a medical assessment of myopia or eye disease.',
  eye_tracking:
    'This is a home blink-and-fatigue session. It is not a medical diagnosis of dry eye or any ocular disease.',
  cataract:
    'Anterior selfies estimate cloudiness for between-visit trends only. They are not LOCS grading and do not diagnose cataract.',
  glaucoma:
    'Front-facing photos cannot assess the optic nerve or eye pressure and do not screen for or diagnose glaucoma.',
  cornea_scar:
    'Surface appearance from a selfie is not a slit-lamp exam and does not diagnose corneal disease.',
  myopia:
    'Logged prescriptions and lifestyle are educational tracking only. They are not a pediatric diagnosis or treatment plan.',
}

export function getTestQualifier(testType) {
  if (!testType) return null
  return TEST_QUALIFIERS[testType] || null
}
