import { useMemo, useState } from 'react'
import { addDays, eachDay, formatDateTime, formatDay, fromKey, stretchEndMs, stretchStartMs, toKey, todayKey } from '@shared/dates'
import type { AppState, CalendarCleanup, DateKey, Stretch, StretchState } from '@shared/types'
import { groupDays } from '../../../main/periods'
import { errorText, formatExchangeTime } from '../util'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const STATE_LABEL: Record<StretchState, string> = {
  live: 'Set in Outlook',
  applying: 'Applying…',
  partial: 'Partly set',
  failed: 'Failed',
  queued: 'Queued',
  done: 'Done'
}

interface DayInfo {
  stretchId: string
  state: StretchState
}

function monthStart(key: DateKey): DateKey {
  return key.slice(0, 8) + '01'
}

function addMonths(key: DateKey, n: number): DateKey {
  const d = fromKey(key)
  return toKey(new Date(d.getFullYear(), d.getMonth() + n, 1))
}

function MonthGrid(props: {
  month: DateKey
  coverage: Map<DateKey, DayInfo>
  selected: Set<DateKey>
  focused?: string
  onDay: (day: DateKey) => void
}): React.JSX.Element {
  const today = todayKey()
  const first = fromKey(props.month)
  const offset = (first.getDay() + 6) % 7
  const gridStart = addDays(props.month, -offset)
  const cells = eachDay(gridStart, addDays(gridStart, 41))
  const monthIndex = first.getMonth()

  return (
    <div className="month">
      <div className="month-title">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
      <div className="grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="weekday">
            {w}
          </div>
        ))}
        {cells.map((day) => {
          const d = fromKey(day)
          const inMonth = d.getMonth() === monthIndex
          const past = day < today
          const info = props.coverage.get(day)
          const selected = props.selected.has(day)
          const weekend = d.getDay() === 0 || d.getDay() === 6
          const cls = [
            'day',
            !inMonth && 'outside',
            past && 'past',
            weekend && 'weekend',
            day === today && 'today',
            info && `covered state-${info.state}`,
            info && info.stretchId === props.focused && 'focused',
            selected && 'selected'
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button key={day} className={cls} disabled={!inMonth || (past && !info)} onClick={() => props.onDay(day)}>
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StretchEditor({ stretch, onClose }: { stretch: Stretch; onClose: () => void }): React.JSX.Element {
  const [startDate, setStartDate] = useState(stretch.startDate)
  const [endDate, setEndDate] = useState(stretch.endDate)
  const [customTimes, setCustomTimes] = useState(stretch.customTimes)
  const [startTime, setStartTime] = useState(stretch.customTimes ? stretch.startTime : '12:00')
  const [endTime, setEndTime] = useState(stretch.customTimes ? stretch.endTime : '12:00')
  const [error, setError] = useState<string>()

  const save = async (): Promise<void> => {
    try {
      await window.ooo.editStretch(stretch.id, { startDate, endDate, customTimes, startTime, endTime })
      onClose()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <div className="editor">
      <div className="row">
        <label>
          First day
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          Last day
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      <TimesControl
        customTimes={customTimes}
        setCustomTimes={setCustomTimes}
        startTime={startTime}
        setStartTime={setStartTime}
        endTime={endTime}
        setEndTime={setEndTime}
      />
      <div className="row">
        <button className="btn small primary" onClick={() => void save()}>
          Save
        </button>
        <button className="btn small" onClick={onClose}>
          Close
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}

function TimesControl(p: {
  customTimes: boolean
  setCustomTimes: (v: boolean) => void
  startTime: string
  setStartTime: (v: string) => void
  endTime: string
  setEndTime: (v: string) => void
}): React.JSX.Element {
  return (
    <div className="times">
      <label className="switch">
        <input type="checkbox" checked={p.customTimes} onChange={(e) => p.setCustomTimes(e.target.checked)} />
        <span>Use custom times</span>
      </label>
      {p.customTimes ? (
        <div className="row">
          <label>
            Starts at (first day)
            <input type="time" value={p.startTime} onChange={(e) => p.setStartTime(e.target.value)} />
          </label>
          <label>
            Ends at (day after last day)
            <input type="time" value={p.endTime} onChange={(e) => p.setEndTime(e.target.value)} />
          </label>
        </div>
      ) : (
        <p className="hint">From 12:00 AM on the first day until 12:00 AM after the last day, in your local time.</p>
      )}
    </div>
  )
}

function StretchRow(props: {
  stretch: Stretch
  state: StretchState
  isCurrent: boolean
  appState: AppState
  focused: boolean
  onFocus: () => void
  goToAccounts: () => void
}): React.JSX.Element {
  const { stretch: s, state, appState } = props
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const accounts = appState.config.accounts.filter((a) => a.enabled || s.results[a.id])
  const appliedSomewhere = Object.values(s.results).some((r) => r.status === 'ok')

  const cancel = async (): Promise<void> => {
    const text =
      state === 'done'
        ? 'Remove this past leave from the list?'
        : appliedSomewhere
          ? 'Cancel this leave? If another leave is queued it is set straight away and replaces the calendar block. Otherwise the auto-reply is turned off and you will be shown which calendar blocks to delete in Outlook.'
          : 'Remove this queued leave?'
    if (!confirm(text)) return
    setBusy(true)
    setError(undefined)
    try {
      const r = await window.ooo.cancelStretch(s.id)
      if (!r.ok) setError(r.error)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const queuedNote =
    state === 'queued' && !props.isCurrent ? 'Goes live automatically after the earlier leave ends.' : undefined

  return (
    <div className={props.focused ? 'stretch focused' : 'stretch'} onClick={props.onFocus}>
      <div className="stretch-head">
        <div>
          <div className="stretch-title">
            {s.startDate === s.endDate ? formatDay(s.startDate) : `${formatDay(s.startDate)} – ${formatDay(s.endDate)}`}
          </div>
          <div className="muted small">
            {formatDateTime(stretchStartMs(s))} → {formatDateTime(stretchEndMs(s))}
            {s.customTimes && ' · custom times'}
          </div>
        </div>
        <span className={`badge state-${state}`}>{STATE_LABEL[state]}</span>
      </div>

      {queuedNote && <p className="hint">{queuedNote}</p>}

      {props.isCurrent && state !== 'done' && (
        <div className="chips">
          {accounts.map((a) => {
            const r = s.results[a.id]
            const cls = !r ? 'chip pending' : r.status === 'ok' ? (r.timeMismatch ? 'chip warn' : 'chip ok') : 'chip bad'
            const title = !r
              ? 'Not applied yet'
              : r.status === 'ok'
                ? `Outlook: ${r.readBack?.state} ${formatExchangeTime(r.readBack?.start?.iso)} → ${formatExchangeTime(r.readBack?.end?.iso)}`
                : r.error
            return (
              <span key={a.id} className={cls} title={title}>
                {!r ? '…' : r.status === 'ok' ? (r.timeMismatch ? '⚠' : '✓') : '✕'} {a.nickname}
                {r?.needsSignIn && (
                  <button
                    className="link"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.goToAccounts()
                    }}
                  >
                    Reconnect
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {props.isCurrent &&
        accounts.map((a) => {
          const r = s.results[a.id]
          if (r?.status === 'failed' && !r.needsSignIn) {
            return (
              <p key={a.id} className="error-text small">
                {a.nickname}: {r.error}
              </p>
            )
          }
          if (r?.timeMismatch) {
            return (
              <p key={a.id} className="warn-text small">
                {a.nickname}: Outlook reports {formatExchangeTime(r.readBack?.start?.iso)} → {formatExchangeTime(r.readBack?.end?.iso)}.
                Check the times in Outlook; the mailbox may use a different time zone.
              </p>
            )
          }
          return null
        })}

      {editing ? (
        <StretchEditor stretch={s} onClose={() => setEditing(false)} />
      ) : (
        <div className="row actions" onClick={(e) => e.stopPropagation()}>
          {state !== 'done' && (
            <button className="btn small" onClick={() => setEditing(true)} disabled={busy}>
              Edit
            </button>
          )}
          <button className="btn small danger" onClick={() => void cancel()} disabled={busy || state === 'applying'}>
            {busy ? 'Working…' : state === 'done' ? 'Remove' : appliedSomewhere ? 'Cancel leave' : 'Remove'}
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}

function outlookDayUrl(ms: number, email: string): string {
  const d = new Date(ms)
  return `https://outlook.office.com/calendar/view/day/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}?login_hint=${encodeURIComponent(email)}`
}

function CleanupCard({ cleanups }: { cleanups: CalendarCleanup[] }): React.JSX.Element | null {
  if (cleanups.length === 0) return null
  return (
    <div className="card cleanup">
      <h3>Calendar blocks to delete</h3>
      <p className="hint">
        Exchange doesn't let the app delete calendar items, so these out-of-office blocks from cancelled leave are
        still in Outlook. Open the day, delete the block, then mark it done.
      </p>
      {cleanups.map((c) => (
        <div key={c.id} className="cleanup-row">
          <div>
            <strong>{c.nickname}</strong>: "{c.subject}"
            <div className="muted small">
              {formatDateTime(c.startMs)} → {formatDateTime(c.endMs)}
            </div>
          </div>
          <div className="row">
            <a className="btn small primary" href={outlookDayUrl(c.startMs, c.email)} target="_blank" rel="noreferrer">
              Open in Outlook
            </a>
            <button className="btn small" onClick={() => void window.ooo.dismissCleanup(c.id)}>
              Done
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function CalendarView({ state, goToAccounts }: { state: AppState; goToAccounts: () => void }): React.JSX.Element {
  const [month, setMonth] = useState(monthStart(todayKey()))
  const [selected, setSelected] = useState<Set<DateKey>>(new Set())
  const [focused, setFocused] = useState<string>()
  const [customTimes, setCustomTimes] = useState(false)
  const [startTime, setStartTime] = useState('12:00')
  const [endTime, setEndTime] = useState('12:00')
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string>()

  const now = Date.now()
  const stretches = useMemo(
    () => [...state.config.stretches].sort((a, b) => stretchStartMs(a) - stretchStartMs(b)),
    [state.config.stretches]
  )
  const currentId = stretches.find((s) => stretchEndMs(s) > now)?.id
  const upcoming = stretches.filter((s) => state.stretchStates[s.id] !== 'done')
  const past = stretches.filter((s) => state.stretchStates[s.id] === 'done').reverse()

  const coverage = useMemo(() => {
    const map = new Map<DateKey, DayInfo>()
    for (const s of stretches) {
      for (const day of eachDay(s.startDate, s.endDate)) {
        map.set(day, { stretchId: s.id, state: state.stretchStates[s.id] ?? 'queued' })
      }
    }
    return map
  }, [stretches, state.stretchStates])

  const preview = useMemo(() => groupDays([...selected]), [selected])
  const enabledAccounts = state.config.accounts.filter((a) => a.enabled)

  const onDay = (day: DateKey): void => {
    const info = coverage.get(day)
    if (info) {
      setFocused(info.stretchId)
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const apply = async (): Promise<void> => {
    setApplying(true)
    setError(undefined)
    try {
      await window.ooo.applyDays({ days: [...selected], customTimes, startTime, endTime })
      setSelected(new Set())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="calendar-view">
      <section className="calendar-pane">
        <div className="month-nav">
          <button className="btn small" onClick={() => setMonth(addMonths(month, -1))}>
            ‹
          </button>
          <button className="btn small" onClick={() => setMonth(monthStart(todayKey()))}>
            Today
          </button>
          <button className="btn small" onClick={() => setMonth(addMonths(month, 1))}>
            ›
          </button>
        </div>
        <div className="months">
          <MonthGrid month={month} coverage={coverage} selected={selected} focused={focused} onDay={onDay} />
          <MonthGrid month={addMonths(month, 1)} coverage={coverage} selected={selected} focused={focused} onDay={onDay} />
        </div>
        <div className="legend">
          <span className="key selected" /> Selected
          <span className="key state-live" /> Set in Outlook
          <span className="key state-queued" /> Queued
          <span className="key state-failed" /> Needs attention
        </div>
      </section>

      <aside className="side-pane">
        <CleanupCard cleanups={state.config.calendarCleanups} />
        <div className="card">
          <h3>New leave</h3>
          {selected.size === 0 ? (
            <p className="hint">Click the days you'll be away, even separate weeks. Weekends in between are included automatically.</p>
          ) : (
            <>
              <ul className="preview">
                {preview.map((r) => (
                  <li key={r.startDate}>
                    {r.startDate === r.endDate ? formatDay(r.startDate) : `${formatDay(r.startDate)} – ${formatDay(r.endDate)}`}
                  </li>
                ))}
              </ul>
              <TimesControl
                customTimes={customTimes}
                setCustomTimes={setCustomTimes}
                startTime={startTime}
                setStartTime={setStartTime}
                endTime={endTime}
                setEndTime={setEndTime}
              />
              {preview.length > 1 && (
                <p className="hint">
                  Outlook holds one out-of-office period at a time. The first one is set now; the others are applied
                  automatically as each one ends.
                </p>
              )}
              {enabledAccounts.length === 0 && (
                <p className="warn-text">
                  {state.config.accounts.length === 0
                    ? 'No accounts connected yet. Leave is saved and applied once you connect one.'
                    : 'All accounts are paused. Leave is saved and applied once you switch one on.'}{' '}
                  <button className="link" onClick={goToAccounts}>
                    Accounts
                  </button>
                </p>
              )}
              <div className="row">
                <button className="btn primary" disabled={applying} onClick={() => void apply()}>
                  {applying ? 'Applying…' : `Apply to ${enabledAccounts.length} account${enabledAccounts.length === 1 ? '' : 's'}`}
                </button>
                <button className="btn" onClick={() => setSelected(new Set())} disabled={applying}>
                  Clear
                </button>
              </div>
            </>
          )}
          {error && <p className="error-text">{error}</p>}
        </div>

        <div className="card">
          <div className="list-head">
            <h3>Your leave</h3>
            <button className="btn small" disabled={state.schedulerBusy} onClick={() => void window.ooo.runCheckNow()}>
              {state.schedulerBusy ? 'Checking…' : 'Check now'}
            </button>
          </div>
          {upcoming.length === 0 && <p className="hint">Nothing scheduled.</p>}
          {upcoming.map((s) => (
            <StretchRow
              key={s.id}
              stretch={s}
              state={state.stretchStates[s.id] ?? 'queued'}
              isCurrent={s.id === currentId}
              appState={state}
              focused={s.id === focused}
              onFocus={() => setFocused(s.id)}
              goToAccounts={goToAccounts}
            />
          ))}
          {past.length > 0 && (
            <details className="past">
              <summary>Past leave ({past.length})</summary>
              {past.map((s) => (
                <StretchRow
                  key={s.id}
                  stretch={s}
                  state="done"
                  isCurrent={false}
                  appState={state}
                  focused={false}
                  onFocus={() => undefined}
                  goToAccounts={goToAccounts}
                />
              ))}
            </details>
          )}
        </div>
      </aside>
    </div>
  )
}
