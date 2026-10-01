/**
 * Acuity chart sequences and ETDRS scoring outputs.
 * Run: node --test tests/acuityChart.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createRowGenerator, loadRecentRows, saveRecentRows, RECENT_ROWS_LIMIT } from '../src/utils/acuityChart.js'
import { etdrsScore } from '../src/utils/visionTestScoring.js'

const SLOAN = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z']
const HOTV = ['H', 'O', 'T', 'V']

function memoryStorage() {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }
}

describe('acuity chart sequences', () => {
  it('is reproducible from its seed', () => {
    const a = createRowGenerator({ options: SLOAN, seed: 42 })
    const b = createRowGenerator({ options: SLOAN, seed: 42 })
    for (let i = 0; i < 14; i++) assert.deepEqual(a.next(), b.next())
  })

  it('never repeats a row within a session, Sloan rows have distinct letters', () => {
    const g = createRowGenerator({ options: SLOAN, seed: 7 })
    const keys = Array.from({ length: 28 }, () => g.next().join(''))
    assert.equal(new Set(keys).size, keys.length)
    for (const k of keys) assert.equal(new Set(k).size, 5)
  })

  it('four-choice rows never repeat a symbol back to back and differ from the previous row in most positions', () => {
    const g = createRowGenerator({ options: HOTV, seed: 3 })
    let prev = null
    for (let i = 0; i < 28; i++) {
      const row = g.next()
      for (let j = 1; j < row.length; j++) assert.notEqual(row[j], row[j - 1])
      if (prev) assert.ok(row.filter((s, j) => s === prev[j]).length <= 1)
      prev = row
    }
  })

  it('a new session avoids the rows shown in the previous session', () => {
    const storage = memoryStorage()
    const first = createRowGenerator({ options: HOTV, seed: 1 })
    for (let i = 0; i < 20; i++) first.next()
    saveRecentRows(storage, 'hotv', first.shown)
    const recent = loadRecentRows(storage, 'hotv')
    assert.equal(recent.length, 20)
    const second = createRowGenerator({ options: HOTV, seed: 1, recent })
    for (let i = 0; i < 20; i++) assert.ok(!recent.includes(second.next().join('')))
  })

  it('keeps only the most recent rows per chart', () => {
    const storage = memoryStorage()
    const g = createRowGenerator({ options: SLOAN, seed: 9 })
    for (let i = 0; i < RECENT_ROWS_LIMIT + 10; i++) g.next()
    saveRecentRows(storage, 'sloan', g.shown)
    assert.equal(loadRecentRows(storage, 'sloan').length, RECENT_ROWS_LIMIT)
    assert.deepEqual(loadRecentRows(storage, 'hotv'), [])
  })
})

describe('ETDRS scoring outputs', () => {
  it('reports raw and guess-adjusted logMAR and the base line', () => {
    const tested = { 6: 5, 5: 4, 4: 3, 3: 2 }
    const s = etdrsScore(tested, { passCorrect: 4, guessRate: 0.25 })
    assert.equal(s.baseTenths, 6)
    assert.equal(s.logMARRaw, 0.42)
    assert.ok(s.logMAR > s.logMARRaw)
    assert.equal(s.beyondChartTop, false)
  })

  it('raw and adjusted agree for Sloan', () => {
    const s = etdrsScore({ 6: 5, 5: 5, 4: 1 }, { passCorrect: 4 })
    assert.equal(s.logMAR, s.logMARRaw)
  })

  it('flags an eye that never reached 4 of 5', () => {
    const s = etdrsScore({ 6: 1, 7: 2, 8: 1, 9: 0, 10: 3 }, { passCorrect: 4 })
    assert.equal(s.beyondChartTop, true)
    assert.equal(s.baseTenths, 10)
  })
})
