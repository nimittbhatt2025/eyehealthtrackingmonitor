/**
 * Ocular Surface Disease Index (OSDI), full 12 items. Schiffman et al., Arch Ophthalmol 2000.
 *
 * OSDI is a copyrighted instrument (rights holder: AbbVie, formerly Allergan). Permission and
 * applicable conditions of use must be confirmed with the rights holder or authorized licensing
 * organization before public deployment or distribution. Until confirmed, the questionnaire
 * should be used only within the scope expressly permitted by its license. The confirmation must
 * cover electronic reproduction, automated scoring, translation, modification (including the
 * N/A handling below), and inclusion in a publicly available app.
 *
 * Frequency 0–4; items 6–12 allow "N/A". Score = (sum × 25) / answered (0–100).
 * Bands: 0–12 normal, 13–22 mild, 23–32 moderate, 33–100 severe.
 */

export const OSDI_LICENCE_NOTE =
  'The Ocular Surface Disease Index (OSDI) is a copyrighted instrument (AbbVie, formerly Allergan). EyeVio uses it for research and education only, within the scope permitted by its license; terms for public distribution have not yet been confirmed.'

export const FREQUENCY_OPTIONS = [
  { value: 4, label: 'All of the time' },
  { value: 3, label: 'Most of the time' },
  { value: 2, label: 'Half of the time' },
  { value: 1, label: 'Some of the time' },
  { value: 0, label: 'None of the time' },
]

export const NOT_APPLICABLE = 'na'

export const OSDI_SECTIONS = [
  {
    id: 'symptoms',
    title: 'Have you experienced any of the following during the last week?',
    allowNA: false,
    questions: [
      { id: 'light_sensitivity', text: 'Eyes that are sensitive to light?' },
      { id: 'gritty', text: 'Eyes that feel gritty?' },
      { id: 'pain', text: 'Painful or sore eyes?' },
      { id: 'blurred_vision', text: 'Blurred vision?' },
      { id: 'poor_vision', text: 'Poor vision?' },
    ],
  },
  {
    id: 'function',
    title: 'Have problems with your eyes limited you in performing any of the following during the last week?',
    allowNA: true,
    questions: [
      { id: 'reading', text: 'Reading?' },
      { id: 'night_driving', text: 'Driving at night?' },
      { id: 'screen_use', text: 'Working with a computer or bank machine (ATM)?' },
      { id: 'watching_tv', text: 'Watching TV?' },
    ],
  },
  {
    id: 'environment',
    title: 'Have your eyes felt uncomfortable in any of the following situations during the last week?',
    allowNA: true,
    questions: [
      { id: 'windy', text: 'Windy conditions?' },
      { id: 'low_humidity', text: 'Places or areas with low humidity (very dry)?' },
      { id: 'air_conditioned', text: 'Areas that are air conditioned?' },
    ],
  },
]

export const OSDI_QUESTIONS = OSDI_SECTIONS.flatMap((section) =>
  section.questions.map((q) => ({ ...q, section: section.id, allowNA: section.allowNA }))
)

export function emptyOsdiAnswers() {
  return Object.fromEntries(OSDI_QUESTIONS.map((q) => [q.id, null]))
}

export function osdiComplete(answers) {
  return OSDI_QUESTIONS.every((q) => answers[q.id] !== null && answers[q.id] !== undefined)
}

export function osdiSeverity(score) {
  if (score >= 33) return { severity: 'severe', severityLabel: 'Severe symptoms' }
  if (score >= 23) return { severity: 'moderate', severityLabel: 'Moderate symptoms' }
  if (score >= 13) return { severity: 'mild', severityLabel: 'Mild symptoms' }
  return { severity: 'normal', severityLabel: 'Normal' }
}

export function calculateOsdi(answers) {
  const scored = OSDI_QUESTIONS
    .map((q) => answers[q.id])
    .filter((v) => v !== null && v !== undefined && v !== NOT_APPLICABLE)
    .map(Number)

  // OSDI is not interpretable without the core symptom items.
  const symptomsAnswered = OSDI_SECTIONS[0].questions.every((q) => Number.isFinite(Number(answers[q.id])) && answers[q.id] !== null)
  if (scored.length === 0 || !symptomsAnswered) {
    return {
      osdiScore: null,
      symptomHealthScore: null,
      severity: 'incomplete',
      severityLabel: 'Questionnaire incomplete',
      answeredCount: scored.length,
      responses: [],
    }
  }

  const sum = scored.reduce((acc, v) => acc + v, 0)
  const osdiScore = Math.round(((sum * 25) / scored.length) * 10) / 10
  const subscale = (sectionId) => {
    const vals = OSDI_QUESTIONS
      .filter((q) => q.section === sectionId)
      .map((q) => answers[q.id])
      .filter((v) => v !== null && v !== undefined && v !== NOT_APPLICABLE)
      .map(Number)
    return vals.length ? Math.round(((vals.reduce((a, b) => a + b, 0) * 25) / vals.length) * 10) / 10 : null
  }

  return {
    osdiScore,
    symptomHealthScore: Math.max(0, Math.round(100 - osdiScore)),
    ...osdiSeverity(osdiScore),
    answeredCount: scored.length,
    subscales: {
      symptoms: subscale('symptoms'),
      function: subscale('function'),
      environment: subscale('environment'),
    },
    responses: OSDI_QUESTIONS.map((q) => ({
      id: q.id,
      section: q.section,
      question: q.text,
      value: answers[q.id] ?? null,
      label:
        answers[q.id] === NOT_APPLICABLE
          ? 'N/A'
          : FREQUENCY_OPTIONS.find((o) => o.value === answers[q.id])?.label ?? null,
    })),
  }
}

/**
 * Blur-report time: median seconds from a forced blink to the moment the user
 * reports blur (or blinks involuntarily, or reaches the cap). It is a subjective
 * report, not a tear break-up time, and has no validated cut-offs, so no bands
 * or score are derived from it. Raw seconds and how each hold ended are kept.
 */
export function summarizeBlurReportTime(trials) {
  const secs = trials.map((t) => t.seconds).filter(Number.isFinite).sort((a, b) => a - b)
  if (secs.length === 0) return null
  const median = secs[Math.floor(secs.length / 2)]
  const endedBy = (reason) => trials.filter((t) => t.endedBy === reason).length
  return {
    medianSeconds: Math.round(median * 10) / 10,
    trials,
    endedByBlur: endedBy('blur'),
    endedByBlink: endedBy('blink'),
    endedByCap: endedBy('cap'),
  }
}
