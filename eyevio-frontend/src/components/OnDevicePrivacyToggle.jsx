import { onDeviceSupported } from '../ml/onDeviceInference'

/**
 * Where eye photos are analysed. Default: in the browser, nothing but scores
 * leaves the device. Opt-in: upload and keep photos for the side-by-side timeline.
 */
export default function OnDevicePrivacyToggle({ savePhotos, onChange, allowSaving = true }) {
  const supported = onDeviceSupported()
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 text-sm text-emerald-900 space-y-2">
      <p>
        {supported && !savePhotos
          ? 'Your photo is analysed on this device. Only the scores are sent to your account — the photo never leaves your browser.'
          : supported
            ? 'Photo saving is on: the photo is uploaded, analysed on the server and kept in your account.'
            : 'This browser cannot run the on-device models, so photos are analysed on the server (not stored unless you choose to save them).'}
      </p>
      {allowSaving && onChange && (
        <label className="flex items-start gap-2 text-emerald-950 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={savePhotos}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>
            Save photos to my account
            <span className="block text-xs text-emerald-800">
              Enables the side-by-side photo timeline and visual change check. You can delete saved photos at any time.
            </span>
          </span>
        </label>
      )}
    </div>
  )
}
