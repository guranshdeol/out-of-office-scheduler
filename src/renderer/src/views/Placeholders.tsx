import { addDays, formatDay, stretchEndMs, stretchStartMs, todayKey } from '@shared/dates'
import { fillPlaceholders, hasPlaceholders, PLACEHOLDERS } from '@shared/placeholders'
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
    props.onChange(props.value.slice(0, start) + token + props.value.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
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

/** Shows how a message with placeholders will read for the next leave. */
export function MessagePreview({ text, state }: { text: string; state: AppState }): React.JSX.Element | null {
  if (!hasPlaceholders(text)) return null
  const leave = previewLeave(state)
  const range = `${formatDay(leave.startDate)} – ${formatDay(leave.endDate)}`
  return (
    <div className="message-preview">
      <div className="muted small">
        Preview for {leave.sample ? `an example week (${range})` : `your next leave (${range})`}
      </div>
      <div className="message-preview-text">{fillPlaceholders(text, leave)}</div>
    </div>
  )
}
