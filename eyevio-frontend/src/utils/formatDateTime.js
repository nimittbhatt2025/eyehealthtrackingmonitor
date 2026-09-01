/**
 * Parse API datetimes. Backend stores UTC; older responses may omit the "Z" suffix.
 */
export function parseApiDate(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return value

  const text = String(value).trim()
  if (!text) return null

  const hasTimezone =
    text.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(text) || /[+-]\d{4}$/.test(text)

  const parsed = new Date(hasTimezone ? text : `${text}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatLocalDate(value, options) {
  const date = parseApiDate(value)
  if (!date) return ''
  return date.toLocaleDateString(undefined, options)
}

export function formatLocalDateTime(value, options) {
  const date = parseApiDate(value)
  if (!date) return ''
  return date.toLocaleString(undefined, options)
}

/** YYYY-MM-DD in the user's local timezone (for capture payloads). */
export function getClientLocalDateString(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
