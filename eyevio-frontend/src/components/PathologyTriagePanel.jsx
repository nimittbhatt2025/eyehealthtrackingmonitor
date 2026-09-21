/**
 * Research-only pathology triage panel (not a diagnosis).
 * Expects analysis.pathology_triage from the eye-photo / dry-eye API.
 */
export default function PathologyTriagePanel({ triage }) {
  if (!triage) return null

  if (!triage.available) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
        <p className="text-sm font-medium text-gray-800">Research pattern triage</p>
        <p className="text-xs text-gray-600 mt-1">
          {triage.disclaimer ||
            'Multi-class pathology model not available on this server.'}
        </p>
      </div>
    )
  }

  const pct = (triage.confidence != null ? Number(triage.confidence) * 100 : null)
  const probs = triage.class_probabilities || {}

  return (
    <div className="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
      <p className="text-sm font-medium text-slate-900">Research pattern triage</p>
      <p className="text-sm text-slate-800 mt-1">
        {triage.display_label || triage.predicted_label}
        {pct != null && (
          <>
            {' '}
            · confidence <strong>{pct.toFixed(0)}%</strong>
          </>
        )}
        {triage.agreement === false && (
          <span className="text-amber-800"> · left/right disagreed (showing higher-confidence eye)</span>
        )}
      </p>
      {(triage.left || triage.right) && (
        <p className="text-xs text-slate-600 mt-1">
          L: {triage.left?.predicted_label ?? '—'}
          {triage.left?.confidence != null && <> ({(triage.left.confidence * 100).toFixed(0)}%)</>}
          {' · '}
          R: {triage.right?.predicted_label ?? '—'}
          {triage.right?.confidence != null && <> ({(triage.right.confidence * 100).toFixed(0)}%)</>}
        </p>
      )}
      {Object.keys(probs).length > 0 && (
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-600">
          {Object.entries(probs).map(([label, p]) => (
            <li key={label}>
              {label}: {(Number(p) * 100).toFixed(0)}%
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-amber-900/90 mt-2">
        {triage.disclaimer ||
          'Research triage only — not a diagnosis and not part of your wellness score.'}
      </p>
    </div>
  )
}
