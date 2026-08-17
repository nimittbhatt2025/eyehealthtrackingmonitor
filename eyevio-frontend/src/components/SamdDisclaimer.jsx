import { SAMD_BODY, SAMD_HEADLINE, SAMD_SHORT, getTestQualifier } from '../utils/samd'

/**
 * Required on every test result (and photo-monitor result), not only Help/About.
 */
export default function SamdDisclaimer({ testType, variant = 'result', className = '' }) {
  const qualifier = getTestQualifier(testType)

  if (variant === 'compact') {
    return (
      <p className={`text-xs text-stone-600 leading-relaxed ${className}`} role="note">
        <span className="font-semibold text-stone-800">{SAMD_HEADLINE}. </span>
        {SAMD_SHORT.replace(`${SAMD_HEADLINE}. `, '')}
        {qualifier ? ` ${qualifier}` : ''}
      </p>
    )
  }

  return (
    <aside
      className={`rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-left ${className}`}
      role="note"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-700">{SAMD_HEADLINE}</p>
      <p className="mt-1 text-sm text-stone-700 leading-relaxed">{SAMD_BODY}</p>
      {qualifier && (
        <p className="mt-2 text-sm text-stone-800 leading-relaxed">{qualifier}</p>
      )}
    </aside>
  )
}
