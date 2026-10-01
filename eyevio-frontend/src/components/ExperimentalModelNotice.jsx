import { Link } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'

const MODEL_NAMES = {
  cataract: 'cataract model',
  sclera_redness: 'redness model',
  pathology: 'pathology model',
}

/**
 * Shown wherever a research-only image model ran on the user's photo.
 * Expects analysis.experimental_models from the API; the model's result itself is never sent.
 */
export default function ExperimentalModelNotice({ notice, className = '' }) {
  if (!notice || notice.status !== 'withheld') return null
  const names = (notice.models_run || []).map((m) => MODEL_NAMES[m] || m)

  return (
    <div className={`rounded-lg border border-violet-200 bg-violet-50 p-3 ${className}`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-900">
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
        Experimental AI {names.length ? `(${names.join(', ')})` : ''}
      </p>
      <ul className="mt-1.5 space-y-0.5 text-sm text-violet-900">
        {(notice.messages || []).map((m) => (
          <li key={m}>• {m}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-violet-800">
        No disease likelihood, grade or class is shown. Why:{' '}
        <Link to={notice.research_lab || '/research-lab'} className="font-medium underline underline-offset-2">
          Experimental AI Research Lab
        </Link>
        .
      </p>
    </div>
  )
}
