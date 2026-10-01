/**
 * Fixtures for the condition-library retrieval index.
 * Run: node eyevio-frontend/scripts/run-condition-retrieval-tests.mjs [--verbose]
 */

import {
  buildConditionIndex,
  EYE_SYMPTOM_TERMS,
  searchConditions,
  tokenize,
} from '../src/utils/conditionRetrieval.js'
import { EYE_CONDITIONS } from '../src/utils/comprehensiveEyeConditions.js'

const verbose = process.argv.includes('--verbose')
const index = buildConditionIndex()
let failures = 0

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name} ${detail}`)
  }
}

console.log(`Index: ${index.size} library entries, ${index.idf.size} terms`)
check('indexes every library entry', index.size === Object.keys(EYE_CONDITIONS).length)

console.log('\nTokenizer')
const same = (a, b) => JSON.stringify(tokenize(a)) === JSON.stringify(tokenize(b))
check('blurry ~ blurred', same('blurry', 'blurred'))
check('headaches ~ headache', same('headaches', 'headache'))
check('irritated ~ irritation', same('irritated', 'irritation'))
check('sensitive ~ sensitivity', same('sensitive', 'sensitivity'))
check('nearsighted ~ myopia', same('nearsighted', 'myopia'))
check('stopwords dropped', tokenize('I have been feeling that my eyes are').length === 0)
const unindexed = [...EYE_SYMPTOM_TERMS].filter((t) => !index.idf.has(t))
if (verbose && unindexed.length) console.log(`       symptom-lexicon terms absent from library: ${unindexed.join(', ')}`)
const lexiconForms = [...EYE_SYMPTOM_TERMS].filter((t) => {
  const again = tokenize(t)
  return again.length !== 1 || again[0] !== t
})
check('symptom lexicon uses tokenizer forms', lexiconForms.length === 0, lexiconForms.join(', '))

// Each query must return the expected library key within the top N.
const RELEVANT = [
  ['my eyes feel dry and gritty after using the computer all day', ['dry_eye_disease', 'digital_eye_strain', 'evaporative_dry_eye'], 3],
  ['headaches after long screen sessions', ['screen_headaches', 'digital_eye_strain'], 3],
  ['I am nearsighted and it keeps getting worse every year', ['progressive_myopia', 'myopia'], 3],
  ['itchy watery eyes in spring', ['allergic_irritation', 'allergic_conjunctivitis_ed'], 3],
  ['halos around lights at night and cloudy vision', ['cataract_awareness', 'cataract_ed', 'glare_sensitivity', 'night_vision_difficulty'], 5],
  ['double vision when reading up close', ['diplopia_tendency', 'convergence_insufficiency', 'binocular_dysfunction'], 3],
  ['trouble reading small print, need to hold the menu farther away', ['presbyopia'], 3],
  ['astigmatism', ['astigmatism'], 1],
  ['convergence insufficiency', ['convergence_insufficiency'], 1],
  ['my eyes are red', ['chronic_redness'], 3],
  ['blurry vision', ['blurry_after_reading', 'astigmatism', 'myopia'], 5],
  ['eye strain', ['digital_eye_strain', 'screen_distance_strain', 'poor_lighting_strain', 'reading_eye_strain'], 5],
  ['light sensitivity', ['photophobia'], 3],
  ['my child is nearsighted', ['myopia_progression_children', 'myopia', 'progressive_myopia'], 3],
]

console.log('\nRelevant queries')
for (const [query, expected, topN] of RELEVANT) {
  const out = searchConditions(index, query)
  const ids = out.results.slice(0, topN).map((r) => r.id)
  const present = expected.filter((id) => id in EYE_CONDITIONS)
  const hit = ids.some((id) => present.includes(id))
  check(`"${query}" -> ${present.join('|')} in top ${topN}`, !out.abstained && hit, `got [${ids.join(', ')}] (${out.reason ?? ''})`)
  if (verbose) {
    for (const r of out.results) {
      console.log(`       ${r.id} score=${r.score} cov=${r.coverage} terms=${r.matchedTerms.join(',')}`)
      for (const c of r.citations) console.log(`         [${c.label}] ${c.text}`)
    }
  }
}

const OFF_TOPIC = [
  'what is the weather like tomorrow',
  'hello',
  'tell me a joke',
  'how do I reset my password',
  'best pizza near me',
  'asdf qwer zxcv',
  'my knee hurts when I run',
  'my back pain',
  'my screen is broken',
  'can you help me',
  'I like reading books',
]

console.log('\nOff-topic queries must abstain')
for (const query of OFF_TOPIC) {
  const out = searchConditions(index, query)
  check(`"${query}" abstains`, out.abstained, `got [${out.results.map((r) => `${r.id}:${r.score}/${r.coverage}`).join(', ')}]`)
}

console.log('\nCitations')
const cited = searchConditions(index, 'dry gritty eyes')
check('every result has at least one citation', cited.results.every((r) => r.citations.length > 0))
check(
  'citations are verbatim library text',
  cited.results.every((r) =>
    r.citations.every((c) => JSON.stringify(EYE_CONDITIONS[r.id]).includes(c.text.split(' — ')[0]))
  )
)
const again = searchConditions(index, 'dry gritty eyes')
check('deterministic', JSON.stringify(again) === JSON.stringify(cited))

console.log(failures ? `\n${failures} failure(s)` : '\nAll retrieval checks passed')
process.exit(failures ? 1 : 0)
