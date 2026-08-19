import { Glasses, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react'
import { getEyewearStatusClasses, getEyewearStatusLabel } from '../utils/eyewearDetection'

export default function EyewearBanner({ eyewear }) {
  if (!eyewear) {
    return (
      <div className="text-sm border rounded-lg px-3 py-2 bg-gray-50 border-gray-200 text-gray-600 flex items-center gap-2">
        <Glasses className="w-4 h-4 shrink-0" aria-hidden />
        Checking for eyeglasses…
      </div>
    )
  }

  const Icon = eyewear.status === 'likely_glasses'
    ? AlertTriangle
    : eyewear.status === 'uncertain'
      ? HelpCircle
      : eyewear.status === 'checking'
        ? Glasses
        : CheckCircle2

  return (
    <div className={`text-sm border rounded-lg px-3 py-3 ${getEyewearStatusClasses(eyewear)}`}>
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-1.5">
          <p className="font-semibold">{getEyewearStatusLabel(eyewear)}</p>
          <p>{eyewear.message}</p>
          {eyewear.recommendations?.length > 0 && (
            <ul className="list-disc pl-4 space-y-0.5 text-xs opacity-90">
              {eyewear.recommendations.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
