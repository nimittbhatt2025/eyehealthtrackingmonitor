/**
 * Sliding-window stabilizer for live lighting preview.
 *
 * Fail-fast on bad lighting; recover quickly when most recent frames look good.
 * A single flicker no longer resets recovery (that was why green felt stuck after red).
 */

export class QualityStabilizer {
  /**
   * @param {object} opts
   * @param {number} opts.windowSize - recent frames kept for majority vote
   * @param {number} opts.badToExtreme - bad frames in last `failWindow` → extreme
   * @param {number} opts.failWindow - lookback for fail-fast
   * @param {number} opts.goodToNormal - good frames in last `recoverWindow` → normal
   * @param {number} opts.recoverWindow - lookback for recovery
   * @param {string} opts.positiveState
   * @param {string} opts.negativeState
   * @param {string} opts.initialState
   */
  constructor(opts = {}) {
    this.windowSize = opts.windowSize ?? 6
    this.failWindow = opts.failWindow ?? 3
    this.badToExtreme = opts.badToExtreme ?? 2
    this.recoverWindow = opts.recoverWindow ?? 4
    this.goodToNormal = opts.goodToNormal ?? 3
    this.positiveState = opts.positiveState ?? 'normal'
    this.negativeState = opts.negativeState ?? 'extreme'
    this.initialState = opts.initialState ?? 'checking'

    this.history = []
    this.state = this.initialState
    this.ema = 0.5
    this.frameCount = 0
  }

  reset() {
    this.history = []
    this.state = this.initialState
    this.ema = 0.5
    this.frameCount = 0
  }

  /**
   * @param {number} rawConfidence 1 = normal, 0 = extreme problem
   * @returns {{ state: string, ema: number, raw: number }}
   */
  push(rawConfidence) {
    const raw = Math.max(0, Math.min(1, rawConfidence))
    const good = raw >= 0.5 ? 1 : 0
    this.frameCount += 1
    this.history.push(good)
    if (this.history.length > this.windowSize) {
      this.history.shift()
    }

    const recent = this.history
    const goodCount = recent.reduce((a, b) => a + b, 0)
    this.ema = goodCount / recent.length

    const failSlice = recent.slice(-this.failWindow)
    const recoverSlice = recent.slice(-this.recoverWindow)
    const badInFail = failSlice.filter((v) => v === 0).length
    const goodInRecover = recoverSlice.filter((v) => v === 1).length

    // Need a couple samples before leaving "checking"
    if (this.frameCount < 2) {
      return { state: this.initialState, ema: this.ema, raw }
    }

    if (failSlice.length >= this.badToExtreme && badInFail >= this.badToExtreme) {
      this.state = this.negativeState
    } else if (
      recoverSlice.length >= this.recoverWindow
      && goodInRecover >= this.goodToNormal
    ) {
      this.state = this.positiveState
    } else if (this.state === this.initialState) {
      // stay checking until a clear majority appears
      if (goodCount === recent.length) this.state = this.positiveState
      else if (goodCount === 0 && recent.length >= 2) this.state = this.negativeState
    }
    // else keep current state (hysteresis) while window is mixed

    return { state: this.state, ema: this.ema, raw }
  }
}

export default QualityStabilizer
