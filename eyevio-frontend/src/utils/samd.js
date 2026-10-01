/**
 * Positioning and regulatory wording shown with every result. Keep in sync with
 * docs/APPLICATION_CAPABILITIES.md and the clinician PDF footer.
 */

export const POSITIONING =
  'EyeVio is a research and educational prototype. It has not been clinically validated, reviewed, cleared, or approved as a medical device. Its outputs must not be used to diagnose, exclude, monitor, or treat an eye condition.'

export const REGULATORY_NOTE =
  'The project reviews general-wellness and software-as-a-medical-device principles, but no regulatory classification has been obtained.'

export const SAMD_HEADLINE = 'Research prototype — not clinically validated'

export const SAMD_SHORT = `${SAMD_HEADLINE}. ${POSITIONING}`

export const SAMD_BODY = `${POSITIONING} It is not a substitute for a comprehensive eye examination. Home results depend on your screen, lighting, and distance. ${REGULATORY_NOTE}`

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
    'This compares four small corner spots of your side vision relative to each other. It is not a visual-field test and reports no absolute sensitivity. It samples only a small part of the field, and loss that is the same in all corners or in both eyes may not be detected, so it cannot detect or rule out any eye or neurological condition.',
  side_vision_legacy:
    'This is an earlier home side-vision exercise. It is not a visual-field test and cannot detect or rule out any eye or neurological condition.',
  cataract_glare:
    'This is a home check of contrast loss under a simulated or phone-torch glare source. A screen cannot reproduce real headlight glare, it does not measure lens opacity (not LOCS), and it does not diagnose cataract.',
  dry_eye:
    'This home check reports the OSDI questionnaire, blinking while reading, a self-reported blur-report time, and an optional experimental photo redness index, each separately. It is not a dry-eye disease diagnosis, not a DEWS II workup, and the blur-report time is not a clinical tear break-up time.',
  red_reflex:
    'This compares the pupil glow between your two eyes using a phone flashlight. It is not a clinical red-reflex exam, cannot detect problems that affect both eyes equally, and does not diagnose cataract, leukocoria, retinoblastoma, or other disease.',
  peripheral_awareness:
    'This is a reaction game for side awareness. It is not a visual-field test and cannot detect or rule out any eye or neurological condition.',
  accommodative_lag:
    'This measures how much on-screen blur you notice on near letters. It does not measure accommodation or accommodative lag, depends on your screen, distance and reaction time, and is not a diagnosis of accommodative dysfunction.',
  near_point_convergence:
    'This is a camera-assisted estimate of your near point of convergence. It is not a binocular vision exam and does not diagnose convergence insufficiency.',
  ocular_ergonomics:
    'This is a posture and lighting comfort check. It is not a medical assessment of myopia or eye disease.',
  eye_tracking:
    'This is a home blink-and-fatigue session. It is not a medical diagnosis of dry eye or any ocular disease.',
  cataract:
    'Photos are checked for capture quality only. The experimental cataract model does not return a result here: it is not LOCS grading, is not clinically interpretable, and is being evaluated for dataset shortcuts in the AI Research Lab.',
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
