import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaTimes } from 'react-icons/fa'

export function useVisionTestExit() {
  const navigate = useNavigate()

  return useCallback((options = {}) => {
    const { confirm = true, message } = options
    const goBack = () => navigate('/vision-tests')

    if (confirm) {
      if (window.confirm(message || 'Exit this test? Your progress will be lost.')) {
        goBack()
      }
      return
    }

    goBack()
  }, [navigate])
}

export function TestExitButton({ onExit, label = 'Exit test', className = '' }) {
  return (
    <button
      type="button"
      onClick={onExit}
      className={`test-exit-btn ${className}`}
      aria-label={label}
    >
      <FaTimes className="w-4 h-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </button>
  )
}

/**
 * Side-by-side active test layout — stimulus left, controls right, no page scroll.
 */
export function VisionTestShell({
  title,
  subtitle,
  onExit,
  statusBar,
  stimulus,
  controls,
  className = '',
}) {
  return (
    <div className={`vision-test-shell ${className}`}>
      <header className="vision-test-header">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {onExit && <TestExitButton onExit={onExit} className="shrink-0" />}
          <div className="min-w-0">
            {title && <h2 className="vision-test-title">{title}</h2>}
            {subtitle && <p className="vision-test-subtitle">{subtitle}</p>}
          </div>
        </div>
        {statusBar && <div className="vision-test-status shrink-0">{statusBar}</div>}
      </header>

      <div className="vision-test-split">
        <div className="vision-test-stimulus">{stimulus}</div>
        <div className="vision-test-controls">{controls}</div>
      </div>
    </div>
  )
}

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
