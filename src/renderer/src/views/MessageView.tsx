import { useEffect, useRef, useState } from 'react'
import type { AppState } from '@shared/types'
import { errorText, timeAgo } from '../util'
import { MessagePreview, PlaceholderButtons } from './Placeholders'

export function MessageView({ state }: { state: AppState }): React.JSX.Element {
  const { config, runtime } = state
  const [message, setMessage] = useState(config.message)
  const [subject, setSubject] = useState(config.settings.calendarSubject)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string>()
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setSubject(config.settings.calendarSubject), [config.settings.calendarSubject])

  const save = async (): Promise<void> => {
    setError(undefined)
    try {
      await window.ooo.saveMessage(message)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <div className="message-view">
      <div className="card">
        <h3>Default out-of-office message</h3>
        <p className="hint">
          Sent to everyone who emails you, inside and outside your company, on every account that doesn't have its own
          custom message. Leave a blank line between paragraphs. {'{end}'} is replaced with the last day of each leave (and{' '}
          {'{start}'} with the first) when the leave is applied.
        </p>
        <textarea ref={textarea} rows={10} value={message} onChange={(e) => setMessage(e.target.value)} />
        <PlaceholderButtons textarea={textarea} value={message} onChange={setMessage} />
        <MessagePreview text={message} state={state} />
        <div className="row">
          <button className="btn primary" onClick={() => void save()} disabled={message === config.message}>
            Save message
          </button>
          {saved && <span className="ok-text">Saved. Any leave already set in Outlook is updated.</span>}
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card">
        <h3>Settings</h3>
        <label className="switch">
          <input
            type="checkbox"
            checked={config.settings.createCalendarEvent}
            onChange={(e) => void window.ooo.saveSettings({ createCalendarEvent: e.target.checked })}
          />
          <span>Add an out-of-office block to my calendar</span>
        </label>
        <label className="field">
          Calendar block title
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onBlur={() => subject !== config.settings.calendarSubject && void window.ooo.saveSettings({ calendarSubject: subject })}
            disabled={!config.settings.createCalendarEvent}
          />
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={config.settings.launchAtLogin}
            onChange={(e) => void window.ooo.saveSettings({ launchAtLogin: e.target.checked })}
          />
          <span>Start at login and keep running in the menu bar (needed to apply later leave automatically)</span>
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={config.settings.checkForUpdates}
            onChange={(e) => void window.ooo.saveSettings({ checkForUpdates: e.target.checked })}
          />
          <span>Check for updates once a day</span>
        </label>
      </div>

      <div className="card">
        <h3>About this setup</h3>
        <dl className="facts">
          <dt>Version</dt>
          <dd>
            {state.version}
            {' · '}
            {state.update.checking
              ? 'Checking for updates…'
              : state.update.latest
                ? `version ${state.update.latest.version} is available`
                : state.update.error
                  ? `couldn't check for updates`
                  : state.update.checkedAt
                    ? `up to date (checked ${timeAgo(state.update.checkedAt)})`
                    : 'not checked yet'}{' '}
            {state.update.latest ? (
              <a className="link" href={state.update.latest.url} target="_blank" rel="noreferrer">
                Download
              </a>
            ) : (
              <button className="link" disabled={state.update.checking} onClick={() => void window.ooo.checkForUpdates()}>
                Check now
              </button>
            )}
          </dd>
          <dt>PowerShell</dt>
          <dd>{runtime.pwshPath ?? runtime.message}</dd>
          <dt>Exchange Online module</dt>
          <dd>{runtime.moduleVersion ?? '—'}</dd>
          <dt>Last automatic check</dt>
          <dd>{timeAgo(state.lastCheckAt)}</dd>
        </dl>
      </div>
    </div>
  )
}
