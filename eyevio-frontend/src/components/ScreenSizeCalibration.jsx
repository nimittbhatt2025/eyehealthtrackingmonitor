import { useState } from 'react'
import { CARD_WIDTH_MM, getScreenScale, saveScreenScale } from '../utils/screenScale'

/** Match an on-screen rectangle to a bank card to measure CSS px per mm. */
const ScreenSizeCalibration = ({ onDone, onSkip }) => {
  const [widthPx, setWidthPx] = useState(() => Math.round(getScreenScale().pxPerMm * CARD_WIDTH_MM))
  const heightPx = Math.round(widthPx * (53.98 / CARD_WIDTH_MM))

  return (
    <div className="max-w-2xl mx-auto card text-center space-y-5">
      <h2 className="text-2xl font-bold text-gray-900">Measure your screen</h2>
      <p className="text-sm text-gray-600">
        Letter sizes must be exact for the score to mean anything. Hold any bank card or ID card flat against
        the screen and drag the slider until the blue card matches its <strong>width</strong>.
      </p>

      <div className="flex justify-center py-4">
        <div
          className="rounded-xl bg-accent-500/80 border-2 border-accent-700 flex items-center justify-center text-white text-xs font-semibold"
          style={{ width: widthPx, height: heightPx }}
        >
          Card width {CARD_WIDTH_MM} mm
        </div>
      </div>

      <input
        type="range"
        min={150}
        max={900}
        value={widthPx}
        onChange={(e) => setWidthPx(Number(e.target.value))}
        className="w-full"
        aria-label="Card width in pixels"
      />
      <div className="flex justify-center gap-2">
        <button type="button" onClick={() => setWidthPx((w) => w - 1)} className="btn-secondary px-4 min-h-[40px]">−</button>
        <button type="button" onClick={() => setWidthPx((w) => w + 1)} className="btn-secondary px-4 min-h-[40px]">+</button>
      </div>

      <div className="flex gap-3">
        {onSkip && (
          <button type="button" onClick={onSkip} className="flex-1 btn-secondary min-h-[44px]">
            Skip (sizes will be approximate)
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            saveScreenScale(widthPx / CARD_WIDTH_MM)
            onDone?.(widthPx / CARD_WIDTH_MM)
          }}
          className="flex-1 btn-primary min-h-[44px]"
        >
          It matches — save
        </button>
      </div>
    </div>
  )
}

export default ScreenSizeCalibration
