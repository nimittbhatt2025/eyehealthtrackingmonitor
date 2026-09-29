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
    'This is a home ETDRS-style chart check (letters, HOTV or tumbling E). Home results typically read 0.05–0.1 logMAR (about half to one line) worse than a clinic chart. It is not a refraction and does not prescribe glasses or contacts.',
  color_vision:
    'This is a home colour-discrimination threshold check on an uncalibrated screen. It does not diagnose colour vision deficiency, cannot confirm its type, and is not valid for occupational or legal certification.',
  amsler_grid:
    'This is a home grid and line-alignment check of central vision. Distortion reports and alignment shifts are not a diagnosis of macular degeneration or any retinal disease, and a normal result does not rule one out.',
  contrast_sensitivity:
    'This is a home contrast-sensitivity check on an uncalibrated screen. It is not a clinical CSF or Pelli-Robson test and does not diagnose cataract, glaucoma, or retinal disease.',
  side_vision:
    'This compares the four corners of your side vision relative to each other. It is not a visual-field test, reports no absolute sensitivity, does not measure eye pressure, and does not screen for or diagnose glaucoma.',
  glaucoma_neural:
    'This is a home side-vision exercise. It is not a visual-field test, does not measure eye pressure, and does not screen for or diagnose glaucoma.',
  cataract_glare:
    'This is a home check of contrast loss under a simulated or phone-torch glare source. A screen cannot reproduce real headlight glare, it does not measure lens opacity (not LOCS), and it does not diagnose cataract.',
  dry_eye:
    'This home check combines the OSDI questionnaire, a self-reported tear break-up proxy, and a photo. It is not a dry-eye disease diagnosis, not a DEWS II workup, and not a clinical tear break-up time.',
  red_reflex:
    'This compares the pupil glow between your two eyes using a phone flashlight. It is not a clinical red-reflex exam, cannot detect problems that affect both eyes equally, and does not diagnose cataract, leukocoria, retinoblastoma, or other disease.',
  peripheral_awareness:
    'This is a reaction game for side awareness. It is not a visual-field test and does not screen for or diagnose glaucoma.',
  accommodative_lag:
    'This is a near-blur tolerance comfort index. It does not measure accommodation or accommodative lag and is not a diagnosis of accommodative dysfunction.',
  near_point_convergence:
    'This is a camera-assisted estimate of your near point of convergence. It is not a binocular vision exam and does not diagnose convergence insufficiency.',
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
