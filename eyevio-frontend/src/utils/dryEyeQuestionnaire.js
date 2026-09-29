/**
 * Ocular Surface Disease Index (OSDI), full 12 items.
 * Schiffman et al., Arch Ophthalmol 2000. © Allergan — commercial use needs a licence.
 *
 * Frequency 0–4; items 6–12 allow "N/A". Score = (sum × 25) / answered (0–100).
 * Bands: 0–12 normal, 13–22 mild, 23–32 moderate, 33–100 severe.
 */

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
 * Symptomatic tear break-up proxy: median seconds from a forced blink to the
 * first reported blur (or an involuntary blink). Clinical fluorescein TBUT
 * < 10 s is commonly treated as unstable; this proxy is not equivalent.
 */
export function summarizeTearBreakup(trials) {
  const secs = trials.map((t) => t.seconds).filter(Number.isFinite).sort((a, b) => a - b)
  if (secs.length === 0) return null
  const median = secs[Math.floor(secs.length / 2)]
  let band = 'typical'
  if (median < 5) band = 'short'
  else if (median < 10) band = 'borderline'
  const score = Math.round(Math.max(0, Math.min(100, (median / 15) * 100)))
  return { medianSeconds: Math.round(median * 10) / 10, band, score, trials }
}

/**
 * Weights: photo 0.4, symptoms 0.4, tear break-up proxy 0.2 (when measured).
 * Without the break-up proxy, photo 0.5 / symptoms 0.5.
 */
export function combineDryEyeScores(cvScore, symptomHealthScore, tearScore = null) {
  const parts = [
    [cvScore, tearScore != null ? 0.4 : 0.5],
    [symptomHealthScore, tearScore != null ? 0.4 : 0.5],
  ]
  if (tearScore != null) parts.push([tearScore, 0.2])
  const combined = Math.round(parts.reduce((acc, [v, w]) => acc + v * w, 0))

  let riskLevel = 'low'
  let riskMessage = 'No significant dryness signs detected in symptoms, photo, or tear break-up check.'
  if (combined < 50 || (cvScore < 55 && symptomHealthScore < 55)) {
    riskLevel = 'elevated'
    riskMessage = 'Your symptoms and home checks suggest possible dry eye signs. Consider an eye exam.'
  } else if (combined < 70 || cvScore < 65 || symptomHealthScore < 65 || (tearScore != null && tearScore < 34)) {
    riskLevel = 'moderate'
    riskMessage = 'Some dryness signs noted. Artificial tears and screen breaks may help.'
  }

  return { combinedScore: combined, riskLevel, riskMessage }
}
