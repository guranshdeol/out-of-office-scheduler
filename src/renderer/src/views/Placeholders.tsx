import { addDays, stretchEndMs, stretchStartMs, todayKey } from '@shared/dates'
import { fillPlaceholders, formatLeaveDate, hasPlaceholders, insertPlaceholder, PLACEHOLDERS } from '@shared/placeholders'
import type { AppState, DateKey } from '@shared/types'

/** Buttons that insert {start} / {end} at the cursor in a message box. */
export function PlaceholderButtons(props: {
  textarea: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const insert = (token: string): void => {
    const el = props.textarea.current
    const start = el?.selectionStart ?? props.value.length
    const end = el?.selectionEnd ?? props.value.length
    const next = insertPlaceholder(props.value, start, end, token)
    props.onChange(next.text)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(next.cursor, next.cursor)
    })
  }
  return (
    <div className="row placeholders">
      <span className="muted small">Insert:</span>
      {PLACEHOLDERS.map((p) => (
        <button key={p.token} type="button" className="btn small" title={p.label} onClick={() => insert(p.token)}>
          {p.name} <span className="muted">{p.token}</span>
        </button>
      ))}
    </div>
  )
}

/** The next leave that hasn't ended, or a sample week if there's none. */
function previewLeave(state: AppState): { startDate: DateKey; endDate: DateKey; sample: boolean } {
  const now = Date.now()
  const next = [...state.config.stretches]
    .filter((s) => stretchEndMs(s) > now)
    .sort((a, b) => stretchStartMs(a) - stretchStartMs(b))[0]
  if (next) return { startDate: next.startDate, endDate: next.endDate, sample: false }
  const today = todayKey()
  const toMonday = (8 - new Date().getDay()) % 7 || 7
  const monday = addDays(today, toMonday)
  return { startDate: monday, endDate: addDays(monday, 4), sample: true }
}

/**
 * Shows how a message with placeholders will read: for the given leave, or else for the next
 * leave (or an example week if none is scheduled).
 */
export function MessagePreview(props: {
  text: string
  state: AppState
  leave?: { startDate: DateKey; endDate: DateKey }
  title?: string
}): React.JSX.Element | null {
  const { text, state } = props
  if (!hasPlaceholders(text)) return null
  const leave = props.leave ? { ...props.leave, sample: false } : previewLeave(state)
  const range =
    leave.startDate === leave.endDate
      ? formatLeaveDate(leave.startDate)
      : `${formatLeaveDate(leave.startDate)} – ${formatLeaveDate(leave.endDate)}`
  const title =
    props.title ?? (leave.sample ? `Preview for an example week (${range})` : `Preview for your next leave (${range})`)
  return (
    <div className="message-preview">
      <div className="muted small">{title}</div>
      <div className="message-preview-text">{fillPlaceholders(text, leave)}</div>
    </div>
  )
}
