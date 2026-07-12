import { Sun, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getLightingStatusClasses, getLightingStatusLabel } from '../utils/photoLightingCheck'

export default function PhotoLightingBanner({ lighting }) {
  if (!lighting) {
    return (
      <div className="text-sm border rounded-lg px-3 py-2 bg-gray-50 border-gray-200 text-gray-600 flex items-center gap-2">
        <Sun className="w-4 h-4 shrink-0" aria-hidden />
        Checking lighting…
      </div>
    )
  }

  const Icon = !lighting.acceptable
    ? AlertTriangle
    : lighting.quality === 'fair'
      ? Sun
      : CheckCircle2

  return (
    <div className={`text-sm border rounded-lg px-3 py-3 ${getLightingStatusClasses(lighting)}`}>
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-1.5">
          <p className="font-semibold">{getLightingStatusLabel(lighting)}</p>
          <p>{lighting.message}</p>
          {lighting.recommendations?.length > 0 && !lighting.acceptable && (
            <ul className="list-disc pl-4 space-y-0.5 text-xs opacity-90">
              {lighting.recommendations.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
