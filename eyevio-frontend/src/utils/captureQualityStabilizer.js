/**
 * EMA + hysteresis + minimum-duration stabilizer for live capture-quality signals.
 * Raw confidence 0–1 → stable UI state without frame-to-frame flicker.
 */

export class QualityStabilizer {
  /**
   * @param {object} opts
   * @param {number} opts.enterEnter - enter "positive" state when EMA crosses above (0–1)
   * @param {number} opts.exitEnter - remain positive until EMA drops below
   * @param {number} opts.alpha - EMA smoothing (lower = smoother)
   * @param {number} opts.minPositiveFrames - consecutive positive EMA frames before entering
   * @param {number} opts.minNegativeFrames - consecutive negative EMA frames before exiting
   * @param {string} opts.positiveState
   * @param {string} opts.negativeState
   * @param {string} opts.initialState
   */
  constructor(opts = {}) {
    this.enterThreshold = opts.enterThreshold ?? 0.72
    this.exitThreshold = opts.exitThreshold ?? 0.50
    this.alpha = opts.alpha ?? 0.22
    this.minPositiveFrames = opts.minPositiveFrames ?? 5
    this.minNegativeFrames = opts.minNegativeFrames ?? 3
    this.positiveState = opts.positiveState ?? 'positive'
    this.negativeState = opts.negativeState ?? 'negative'
    this.initialState = opts.initialState ?? 'checking'

    this.ema = null
    this.state = this.initialState
    this.positiveStreak = 0
    this.negativeStreak = 0
    this.frameCount = 0
  }

  reset() {
    this.ema = null
    this.state = this.initialState
    this.positiveStreak = 0
    this.negativeStreak = 0
    this.frameCount = 0
  }

  /**
   * @param {number} rawConfidence 0–1
   * @returns {{ state: string, ema: number, raw: number }}
   */
  push(rawConfidence) {
    const raw = Math.max(0, Math.min(1, rawConfidence))
    this.frameCount += 1

    if (this.ema == null) {
      this.ema = raw
    } else {
      this.ema = this.alpha * raw + (1 - this.alpha) * this.ema
    }

    if (this.frameCount < 3) {
      return { state: this.initialState, ema: this.ema, raw }
    }

    const aboveEnter = this.ema >= this.enterThreshold
    const belowExit = this.ema <= this.exitThreshold

    if (this.state === this.positiveState) {
      if (belowExit) {
        this.negativeStreak += 1
        this.positiveStreak = 0
        if (this.negativeStreak >= this.minNegativeFrames) {
          this.state = this.negativeState
        }
      } else {
        this.negativeStreak = 0
      }
    } else if (this.state === this.negativeState || this.state === this.initialState) {
      if (aboveEnter) {
        this.positiveStreak += 1
        this.negativeStreak = 0
        if (this.positiveStreak >= this.minPositiveFrames) {
          this.state = this.positiveState
        } else if (this.frameCount >= 3) {
          this.state = this.negativeState === 'checking' ? 'fair' : this.negativeState
        }
      } else if (this.ema <= this.exitThreshold) {
        this.state = this.negativeState === 'checking' ? 'fair' : this.negativeState
        this.positiveStreak = 0
      } else {
        this.state = 'fair'
      }
    }

    return { state: this.state, ema: this.ema, raw }
  }
}

export default QualityStabilizer
