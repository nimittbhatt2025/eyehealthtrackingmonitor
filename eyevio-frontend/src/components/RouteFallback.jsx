/** Shown while a lazily loaded page chunk downloads. */
export default function RouteFallback({ fullScreen = false }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center ${fullScreen ? 'min-h-screen bg-app-bg' : 'py-24'}`}
    >
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
