/**
 * Deterministic retrieval index over the condition library (BM25F).
 *
 * Every answer the chatbot gives about a condition must be traceable to a
 * library entry: results carry the entry key plus the exact field items
 * (symptom, warning sign, risk factor…) that matched the query. When the
 * query does not match the library well enough, the index abstains instead
 * of returning a weak guess.
 *
 * BM25F: Robertson, Zaragoza & Taylor (2004), "Simple BM25 extension to
 * multiple weighted fields".
 */

import { EYE_CONDITIONS } from './comprehensiveEyeConditions.js'

export const FIELD_WEIGHTS = {
  name: 3.0,
  symptoms: 2.0,
  warningSigns: 1.5,
  description: 1.5,
  riskFactors: 1.0,
  prevention: 0.6,
}

const FIELD_LABELS = {
  name: 'name',
  symptoms: 'symptom',
  warningSigns: 'warning sign',
  description: 'description',
  riskFactors: 'risk factor',
  prevention: 'prevention',
}

const K1 = 1.2
const B = 0.75
// Bonus for query terms that co-occur inside one library item (e.g. both
// "screen" and "headache" in the entry name), scaled by that field's weight.
const PROXIMITY_WEIGHT = 0.3
const MAX_FIELD_WEIGHT = Math.max(...Object.values(FIELD_WEIGHTS))

// A result is only returned when the query is about eyes (an eye-context word
// or an eye-symptom term), the best score clears MIN_SCORE and at least
// MIN_COVERAGE of the query's content terms appear in the entry. Absolute
// BM25 scores alone do not separate short symptom queries ("eye strain")
// from off-topic ones that hit a rare library word ("weather like…"). Tuned
// against the fixtures in scripts/run-condition-retrieval-tests.mjs.
export const MIN_SCORE = 0.6
export const MIN_COVERAGE = 0.34

const EYE_CONTEXT_WORDS = new Set(
  'eye eyes eyelid eyelids lid lids vision visual sight see seeing glasses spectacles contacts lens lenses pupil pupils tear tears'.split(' ')
)

// Stemmed/synonym-mapped forms, i.e. the output of tokenize().
export const EYE_SYMPTOM_TERMS = new Set(
  `blur cloud itch grit red water dry burn sting halo glare floater doubl diplopia myopia hyperopia astigmatism
presbyopia squint photophobia strain headach sensitiv twitch crust discharg swell print focu refocu blink
misalign convergenc amblyopia cataract glaucoma macular retina conjunctiviti`.split(/\s+/)
)
export const MAX_RESULTS = 5

const STOPWORDS = new Set(`a about after again all also am an and any are as at be because been before being
between both but by can could did do does doing down during each eye eyes few for from further had has have
having he her here hers him his how i if in into is it its just me more most my myself no nor not now of off
on once only or other our out over own same she should so some such than that the their them then there these
they this those through to too under until up very was we were what when where which while who whom why will
with would you your yours feel feeling get getting got im ive really lot lots bit kind sort thing things
since keep keeps kept seem seems today recently sometimes always often use used using around`.split(/\s+/))

// Map lay wording onto the vocabulary the library uses. Applied after stemming.
const SYNONYMS = {
  blurry: 'blur',
  blurri: 'blur',
  fuzzy: 'blur',
  hazy: 'blur',
  cloudy: 'cloud',
  itchy: 'itch',
  itchi: 'itch',
  scratchy: 'grit',
  gritty: 'grit',
  sandy: 'grit',
  sore: 'pain',
  ache: 'pain',
  aching: 'pain',
  hurt: 'pain',
  hurts: 'pain',
  bloodshot: 'red',
  redness: 'red',
  teary: 'water',
  tearing: 'water',
  watering: 'water',
  watery: 'water',
  nearsighted: 'myopia',
  nearsightedness: 'myopia',
  shortsighted: 'myopia',
  farsighted: 'hyperopia',
  farsightedness: 'hyperopia',
  longsighted: 'hyperopia',
  screen: 'screen',
  computer: 'screen',
  phone: 'screen',
  monitor: 'screen',
  laptop: 'screen',
  headache: 'headach',
  headaches: 'headach',
  migraine: 'headach',
  tired: 'fatigu',
  tiredness: 'fatigu',
  exhausted: 'fatigu',
  strain: 'strain',
  glare: 'glare',
  halo: 'halo',
  halos: 'halo',
  haloes: 'halo',
  double: 'doubl',
  squint: 'squint',
  crossed: 'misalign',
  floater: 'floater',
  floaters: 'floater',
}

function stem(word) {
  let w = word
  if (w.length > 5 && w.endsWith('ness')) w = w.slice(0, -4)
  if (w.length > 7 && w.endsWith('ivity')) w = w.slice(0, -3)
  else if (w.length > 6 && w.endsWith('ation')) w = w.slice(0, -3)
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  if (/([^aeioulsz])\1$/.test(w)) w = w.slice(0, -1)
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`
  else if (w.length > 3 && w.endsWith('es') && /(ss|sh|ch|x)es$/.test(w)) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1)
  if (w.length > 4 && w.endsWith('y')) w = w.slice(0, -1)
  return w
}

export function tokenize(text) {
  if (!text) return []
  const out = []
  for (const raw of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue
    const mapped = SYNONYMS[raw] ?? SYNONYMS[stem(raw)] ?? stem(raw)
    if (mapped.length >= 2) out.push(mapped)
  }
  return out
}

function fieldItems(condition, field) {
  const value = condition[field]
  if (!value) return []
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        return [item.factor, item.action, item.description].filter(Boolean).join(' — ')
      }
      return ''
    })
    .filter(Boolean)
}

export function buildConditionIndex(conditions = EYE_CONDITIONS) {
  const docs = []
  const df = new Map()
  const lengthTotals = Object.fromEntries(Object.keys(FIELD_WEIGHTS).map((f) => [f, 0]))

  for (const [id, condition] of Object.entries(conditions)) {
    const fields = {}
    const docTerms = new Set()
    for (const field of Object.keys(FIELD_WEIGHTS)) {
      const items = fieldItems(condition, field).map((text) => ({ text, tokens: tokenize(text) }))
      const tf = new Map()
      let length = 0
      for (const item of items) {
        for (const t of item.tokens) {
          tf.set(t, (tf.get(t) || 0) + 1)
          docTerms.add(t)
          length += 1
        }
      }
      fields[field] = { items, tf, length }
      lengthTotals[field] += length
    }
    for (const t of docTerms) df.set(t, (df.get(t) || 0) + 1)
    docs.push({ id, condition, fields })
  }

  const n = docs.length || 1
  const avgLength = Object.fromEntries(
    Object.entries(lengthTotals).map(([f, total]) => [f, Math.max(1, total / n)])
  )
  const idf = new Map()
  for (const [term, count] of df) {
    idf.set(term, Math.log(1 + (n - count + 0.5) / (count + 0.5)))
  }
  return { docs, idf, avgLength, size: docs.length }
}

function scoreDoc(doc, queryTerms, index) {
  let score = 0
  const matched = []
  for (const term of queryTerms) {
    const idf = index.idf.get(term)
    if (!idf) continue
    let weightedTf = 0
    for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
      const f = doc.fields[field]
      const tf = f.tf.get(term)
      if (!tf) continue
      const norm = 1 - B + B * (f.length / index.avgLength[field])
      weightedTf += (weight * tf) / norm
    }
    if (weightedTf > 0) {
      score += idf * (weightedTf / (K1 + weightedTf))
      matched.push(term)
    }
  }
  if (matched.length >= 2) score += proximityBonus(doc, matched, index)
  return { score, matched }
}

function proximityBonus(doc, matched, index) {
  const matchedSet = new Set(matched)
  let best = 0
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    for (const item of doc.fields[field].items) {
      const hits = new Set(item.tokens.filter((t) => matchedSet.has(t)))
      if (hits.size < 2) continue
      let idfSum = 0
      for (const t of hits) idfSum += index.idf.get(t)
      best = Math.max(best, (weight / MAX_FIELD_WEIGHT) * idfSum)
    }
  }
  return PROXIMITY_WEIGHT * best
}

function citationsFor(doc, matchedTerms, limit = 3) {
  const matchedSet = new Set(matchedTerms)
  const candidates = []
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    for (const item of doc.fields[field].items) {
      const hits = [...new Set(item.tokens.filter((t) => matchedSet.has(t)))]
      if (hits.length) candidates.push({ field, label: FIELD_LABELS[field], text: item.text, hits, rank: hits.length * weight })
    }
  }
  candidates.sort((a, b) => b.rank - a.rank)
  const covered = new Set()
  const picked = []
  for (const c of candidates) {
    if (picked.length >= limit) break
    if (picked.length && c.hits.every((h) => covered.has(h))) continue
    c.hits.forEach((h) => covered.add(h))
    picked.push({ field: c.field, label: c.label, text: c.text })
  }
  return picked
}

function strengthFor(coverage) {
  if (coverage >= 0.75) return 'strong'
  if (coverage >= 0.5) return 'moderate'
  return 'partial'
}

/**
 * Returns { results, abstained, reason, queryTerms }. Each result carries the
 * library key, BM25F score, the fraction of query terms it covers and the
 * library items it was matched on.
 */
export function searchConditions(
  index,
  query,
  { limit = MAX_RESULTS, minScore = MIN_SCORE, minCoverage = MIN_COVERAGE } = {}
) {
  const queryTerms = [...new Set(tokenize(query))]
  const known = queryTerms.filter((t) => index.idf.has(t))
  if (!queryTerms.length || !known.length) {
    return {
      results: [],
      abstained: true,
      reason: 'no_library_terms',
      queryTerms,
    }
  }

  const scored = []
  for (const doc of index.docs) {
    const { score, matched } = scoreDoc(doc, known, index)
    if (score <= 0) continue
    const coverage = matched.length / queryTerms.length
    scored.push({ doc, score, matched, coverage })
  }
  scored.sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))

  const top = scored[0]
  const rawWords = String(query).toLowerCase().split(/[^a-z]+/)
  const eyeContext =
    rawWords.some((w) => EYE_CONTEXT_WORDS.has(w)) || known.some((t) => EYE_SYMPTOM_TERMS.has(t))
  if (!eyeContext) {
    return { results: [], abstained: true, reason: 'not_eye_related', queryTerms }
  }
  if (!top || top.score < minScore || top.coverage < minCoverage) {
    return { results: [], abstained: true, reason: 'weak_match', queryTerms }
  }

  const seenNames = new Set()
  const results = scored
    .filter((s) => s.score >= minScore && s.coverage >= minCoverage && s.score >= top.score * 0.4)
    .filter((s) => {
      const name = s.doc.condition.name
      if (seenNames.has(name)) return false
      seenNames.add(name)
      return true
    })
    .slice(0, limit)
    .map((s) => ({
      id: s.doc.id,
      condition: s.doc.condition,
      score: Number(s.score.toFixed(3)),
      coverage: Number(s.coverage.toFixed(2)),
      strength: strengthFor(s.coverage),
      matchedTerms: s.matched,
      citations: citationsFor(s.doc, s.matched),
    }))

  return { results, abstained: false, reason: null, queryTerms }
}

let defaultIndex = null

export function getConditionIndex() {
  if (!defaultIndex) defaultIndex = buildConditionIndex()
  return defaultIndex
}
