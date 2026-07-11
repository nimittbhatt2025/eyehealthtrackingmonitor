/**
 * OSDI-lite symptom questionnaire for dry eye screening.
 * 6 questions from the Ocular Surface Disease Index symptom subscale.
 * Frequency scale 0–4; OSDI score 0–100 (higher = worse symptoms).
 */

export const FREQUENCY_OPTIONS = [
  { value: 0, label: 'None of the time' },
  { value: 1, label: 'Some of the time' },
  { value: 2, label: 'Half of the time' },
  { value: 3, label: 'Most of the time' },
  { value: 4, label: 'All of the time' },
]

export const OSDI_LITE_QUESTIONS = [
  {
    id: 'light_sensitivity',
    text: 'Eyes that are sensitive to light?',
  },
  {
    id: 'gritty',
    text: 'Eyes that feel gritty?',
  },
  {
    id: 'pain',
    text: 'Painful or sore eyes?',
  },
  {
    id: 'blurred_vision',
    text: 'Blurred vision?',
  },
  {
    id: 'reading',
    text: 'Problems reading because of your eyes?',
  },
  {
    id: 'screen_use',
    text: 'Problems using a computer or phone because of your eyes?',
  },
]

export function calculateOsdiLite(answers) {
  const values = OSDI_LITE_QUESTIONS.map((q) => answers[q.id])
  const answered = values.filter((v) => v !== null && v !== undefined && v !== '')
  if (answered.length === 0) {
    return {
      osdiScore: 0,
      symptomHealthScore: 100,
      severity: 'none',
      severityLabel: 'No symptoms reported',
      answeredCount: 0,
    }
  }

  const sum = answered.reduce((acc, v) => acc + Number(v), 0)
  const osdiScore = Math.round((sum * 25) / answered.length)
  const symptomHealthScore = Math.max(0, 100 - osdiScore)

  let severity = 'normal'
  let severityLabel = 'Normal'
  if (osdiScore >= 33) {
    severity = 'severe'
    severityLabel = 'Severe symptoms'
  } else if (osdiScore >= 23) {
    severity = 'moderate'
    severityLabel = 'Moderate symptoms'
  } else if (osdiScore >= 13) {
    severity = 'mild'
    severityLabel = 'Mild symptoms'
  }

  return {
    osdiScore,
    symptomHealthScore,
    severity,
    severityLabel,
    answeredCount: answered.length,
    responses: OSDI_LITE_QUESTIONS.map((q) => ({
      id: q.id,
      question: q.text,
      value: answers[q.id] ?? null,
      label: FREQUENCY_OPTIONS.find((o) => o.value === answers[q.id])?.label ?? null,
    })),
  }
}

export function combineDryEyeScores(cvScore, symptomHealthScore, cvWeight = 0.6) {
  const symptomWeight = 1 - cvWeight
  const combined = Math.round(cvScore * cvWeight + symptomHealthScore * symptomWeight)

  let riskLevel = 'low'
  let riskMessage = 'No significant dryness signs detected in symptoms or photo.'
  if (combined < 50 || (cvScore < 55 && symptomHealthScore < 55)) {
    riskLevel = 'elevated'
    riskMessage = 'Both your symptoms and photo suggest possible dry eye signs. Consider an eye exam.'
  } else if (combined < 70 || cvScore < 65 || symptomHealthScore < 65) {
    riskLevel = 'moderate'
    riskMessage = 'Some dryness signs noted. Artificial tears and screen breaks may help.'
  }

  return { combinedScore: combined, riskLevel, riskMessage }
}
