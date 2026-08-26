import { Info } from 'lucide-react'

/** Honest static reminder — user confirmation is the eyewear gate, not CV. */
export default function EyewearReminderBanner() {
  return (
    <div className="text-sm border rounded-lg px-3 py-3 bg-blue-50 border-blue-200 text-blue-900">
      <div className="flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-1">
          <p className="font-semibold">You confirmed removal — camera cannot verify this</p>
          <p>
            Webcam heuristics cannot reliably detect eyeglass frames or contact lenses.
            This photo relies on your confirmation in the prior step.
          </p>
        </div>
      </div>
    </div>
  )
}
