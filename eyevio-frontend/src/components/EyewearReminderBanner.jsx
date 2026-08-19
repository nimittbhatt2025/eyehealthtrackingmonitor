import { CheckCircle2 } from 'lucide-react'

/** Honest static reminder — camera cannot reliably detect glasses or contacts. */
export default function EyewearReminderBanner() {
  return (
    <div className="text-sm border rounded-lg px-3 py-3 bg-blue-50 border-blue-200 text-blue-900">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-1">
          <p className="font-semibold">Glasses &amp; contacts — you confirmed removal</p>
          <p>
            Webcam heuristics cannot reliably detect eyeglass frames or contact lenses.
            This photo relies on your confirmation in the prior step.
          </p>
        </div>
      </div>
    </div>
  )
}
