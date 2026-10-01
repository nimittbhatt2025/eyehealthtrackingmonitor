/**
 * Optotype sequences for the acuity chart.
 *
 * Every session draws a new seed, so repeated tests use a different chart. Within the seeded
 * sequence a row is rejected if it repeats a row shown earlier in the session or in the
 * previous sessions on this device (`recent`), or if it matches the row before it in more
 * than one position. The seed is saved with the result, so the chart can be reproduced.
 */

export const RECENT_ROWS_KEY = 'eyevio_acuity_recent_rows_v1'
export const RECENT_ROWS_LIMIT = 60
const MAX_POSITION_MATCHES = 1
const MAX_ATTEMPTS = 200

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function newChartSeed() {
  const c = globalThis.crypto
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0]
  return Math.floor(Math.random() * 2 ** 32)
}

function shuffled(items, rand) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** One candidate row: distinct symbols when there are enough, otherwise no symbol twice in a row. */
function candidateRow(options, count, rand) {
  if (options.length >= count) return shuffled(options, rand).slice(0, count)
  const out = []
  while (out.length < count) {
    const pool = options.filter((s) => s !== out[out.length - 1])
    out.push(pool[Math.floor(rand() * pool.length)])
  }
  return out
}

const positionMatches = (a, b) => (b ? a.filter((s, i) => s === b[i]).length : 0)

export function createRowGenerator({ options, count = 5, seed, recent = [] }) {
  const rand = mulberry32(seed)
  const used = new Set(recent)
  const shown = []
  return {
    shown,
    next() {
      const prev = shown[shown.length - 1]
      let fallback = null
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const row = candidateRow(options, count, rand)
        if (used.has(row.join(''))) continue
        fallback ??= row
        if (positionMatches(row, prev) <= MAX_POSITION_MATCHES) {
          fallback = row
          break
        }
      }
      const row = fallback ?? candidateRow(options, count, rand)
      used.add(row.join(''))
      shown.push(row)
      return row
    },
  }
}

export function loadRecentRows(storage, chartType) {
  try {
    const all = JSON.parse(storage?.getItem(RECENT_ROWS_KEY) || '{}')
    return Array.isArray(all[chartType]) ? all[chartType] : []
  } catch {
    return []
  }
}

export function saveRecentRows(storage, chartType, rows) {
  try {
    const all = JSON.parse(storage?.getItem(RECENT_ROWS_KEY) || '{}')
    const keys = [...(all[chartType] || []), ...rows.map((r) => r.join(''))]
    all[chartType] = keys.slice(-RECENT_ROWS_LIMIT)
    storage?.setItem(RECENT_ROWS_KEY, JSON.stringify(all))
  } catch {
    // storage unavailable: the next session still gets a new seed
  }
}
