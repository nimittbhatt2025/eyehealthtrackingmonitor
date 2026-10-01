/**
 * Blink-rate biofeedback and 20-20-20 break timing.
 *
 * Relaxed blink rate is roughly 15–20 per minute and typically falls by half
 * or more during screen work (Patel et al. 1991; Tsubota & Nakamori 1993),
 * which dries the tear film. The categories below describe the observed rate
 * for coaching only; they are not health classifications and camera blink
 * counts vary with lighting, glasses and face angle.
 */

export const BLINK_BANDS = { lowerBelow: 8, higherFrom: 12 }
export const BLINK_WARMUP_MS = 30000
export const BLINK_WINDOW_MS = 60000
export const BLINK_NUDGE_COOLDOWN_MS = 120000

export const BREAK_INTERVAL_OPTIONS = [
  { id: '20', label: 'Every 20 min (20-20-20)', ms: 20 * 60 * 1000 },
  { id: '30', label: 'Every 30 min', ms: 30 * 60 * 1000 },
  { id: '1', label: 'Every 1 min (try it out)', ms: 60 * 1000 },
]
export const BREAK_SECONDS = 20
export const SNOOZE_MS = 5 * 60 * 1000

/**
 * Blinks per minute over the last `windowMs` (or since `startedAt` if shorter).
 * Returns null until `warmupMs` of data exist.
 */
export function rollingBlinkRate(timestamps, nowMs, { startedAt, windowMs = BLINK_WINDOW_MS, warmupMs = BLINK_WARMUP_MS } = {}) {
  const elapsed = nowMs - startedAt
  if (!(elapsed >= warmupMs)) return null
  const span = Math.min(windowMs, elapsed)
  const count = timestamps.filter((t) => t > nowMs - span && t <= nowMs).length
  return Math.round((count / span) * 60000 * 10) / 10
}

export function blinkBand(rate) {
  if (rate == null) return 'warming_up'
  if (rate < BLINK_BANDS.lowerBelow) return 'lower'
  if (rate < BLINK_BANDS.higherFrom) return 'intermediate'
  return 'higher'
}

/** Whether a 20-20-20 break is due, given active (unpaused) time since the last break. */
export function breakDue(activeMsSinceBreak, intervalMs) {
  return activeMsSinceBreak >= intervalMs
}

/** Session summary of blink-rate samples taken once per second. */
export function summarizeBlinkSession(samples, blinkCount, activeMs) {
  const rated = samples.filter((s) => s.rate != null)
  const lowSeconds = rated.filter((s) => s.rate < BLINK_BANDS.lowerBelow).length
  return {
    blinkCount,
    meanRatePerMin: activeMs > BLINK_WARMUP_MS ? Math.round((blinkCount / activeMs) * 60000 * 10) / 10 : null,
    lowRateFraction: rated.length ? Math.round((lowSeconds / rated.length) * 100) / 100 : null,
    ratedSeconds: rated.length,
  }
}
