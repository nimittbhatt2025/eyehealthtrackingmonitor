/**
 * Compact test prep shell — keeps Start/Continue visible with minimal scrolling.
 */
export function TestPrepLayout({
  title,
  subtitle,
  steps = [],
  children,
  onBack,
  onPrimary,
  primaryLabel = 'Start Test',
  primaryDisabled = false,
  footerNote,
}) {
  return (
    <div className="test-prep">
      <div className="test-prep-scroll">
        <div className="test-panel-compact">
          <header className="test-prep-header">
            <h1 className="test-prep-title">{title}</h1>
            {subtitle && <p className="test-prep-subtitle">{subtitle}</p>}
          </header>

          {steps.length > 0 && (
            <ol className="test-prep-steps">
              {steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}

          {children}
        </div>
        {footerNote && (
          <p className="test-prep-footnote">{footerNote}</p>
        )}
      </div>

      <div className="test-prep-bar">
        {onBack && (
          <button type="button" onClick={onBack} className="btn-secondary flex-1 min-h-[44px]">
            Back
          </button>
        )}
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled}
          className="btn-primary flex-1 min-h-[44px]"
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  )
}

export function TestDetails({ summary, children }) {
  return (
    <details className="test-details">
      <summary>{summary}</summary>
      <div className="test-details-body">{children}</div>
    </details>
  )
}

export function TestActiveBar({ left, center, right }) {
  return (
    <div className="test-active-bar">
      <div className="text-sm font-medium text-gray-600">{left}</div>
      <div className="flex-1 px-3">{center}</div>
      <div className="text-sm font-medium text-gray-600 text-right">{right}</div>
    </div>
  )
}
