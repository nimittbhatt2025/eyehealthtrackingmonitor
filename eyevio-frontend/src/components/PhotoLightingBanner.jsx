import { Sun, AlertTriangle, CheckCircle2, ScanFace } from 'lucide-react'
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

  const isNormal = lighting.status === 'normal' && lighting.stable
  const isFraming = lighting.status === 'framing_problem' && lighting.stable
  const isExtreme = lighting.status === 'extreme_problem' && lighting.stable
  const showTips = (isExtreme || isFraming) && lighting.recommendations?.length > 0
  const Icon = isFraming ? ScanFace : isExtreme ? AlertTriangle : isNormal ? CheckCircle2 : Sun
  const iconClass = isNormal
    ? 'text-emerald-600'
    : isFraming
      ? 'text-amber-700'
      : isExtreme
        ? 'text-red-600'
        : 'text-gray-500'

  return (
    <div className={`text-sm border rounded-lg px-3 py-3 ${getLightingStatusClasses(lighting)}`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconClass}`} aria-hidden />
        <div className="space-y-1.5">
          <p className="font-semibold">{getLightingStatusLabel(lighting)}</p>
          <p>{lighting.message}</p>
          {showTips && (
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
