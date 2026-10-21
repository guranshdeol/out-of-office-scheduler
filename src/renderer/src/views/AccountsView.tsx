import { useRef, useState } from 'react'
import type { Account, AccountStatus, AppState } from '@shared/types'
import { errorText, formatExchangeTime, timeAgo } from '../util'
import { MessagePreview, PlaceholderButtons } from './Placeholders'

const AUTH_LABEL: Record<AccountStatus['auth'], [string, string]> = {
  connected: ['Connected', 'ok'],
  'needs-signin': ['Needs sign-in', 'bad'],
  checking: ['Checking…', 'muted'],
  unknown: ['Status unknown', 'muted']
}

function AddAccount(): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const r = await window.ooo.addAccount({ email, nickname })
      if (r.ok) {
        setEmail('')
        setNickname('')
      } else setError(r.error)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card add-account" onSubmit={submit}>
      <h3>Connect an account</h3>
      <p className="hint">
        Any Microsoft 365 work account: your employer or a customer. Your browser opens once to sign in through that
        company's usual login (Okta, Microsoft, and so on). After that, the app stays signed in.
      </p>
      <div className="row">
        <input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={busy}
        />
        <input
          placeholder="Nickname (e.g. Customer X)"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          disabled={busy}
        />
        <button className="btn primary" disabled={busy || !email}>
          {busy ? 'Waiting for browser sign-in…' : 'Connect'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  )
}

function AccountCard({ account, status, ready, state }: { account: Account; status: AccountStatus; ready: boolean; state: AppState }): React.JSX.Element {
  const [error, setError] = useState<string>()
  const [editingMessage, setEditingMessage] = useState(false)
  const [override, setOverride] = useState(account.messageOverride ?? '')
  const [nickname, setNickname] = useState(account.nickname)
  const overrideBox = useRef<HTMLTextAreaElement>(null)
  const [label, tone] = AUTH_LABEL[status.auth]
  const test = status.test
  const outlook = status.outlook

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setError(undefined)
    try {
      const r = (await fn()) as { ok?: boolean; error?: string } | undefined
      if (r && r.ok === false) setError(r.error)
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <div className={account.enabled ? 'card account' : 'card account disabled'}>
      <div className="account-head">
        <div>
          <input
            className="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onBlur={() => nickname !== account.nickname && void window.ooo.updateAccount(account.id, { nickname })}
          />
          <div className="email">{account.email}</div>
        </div>
        <div className="account-actions">
          <span className={`badge ${tone}`} title={status.authError}>
            {label}
          </span>
          <label className="switch" title={account.enabled ? 'Included when applying' : 'Paused'}>
            <input
              type="checkbox"
              checked={account.enabled}
              onChange={(e) => void window.ooo.updateAccount(account.id, { enabled: e.target.checked })}
            />
            <span>{account.enabled ? 'On' : 'Paused'}</span>
          </label>
        </div>
      </div>

      {status.busy && <p className="hint">{status.busy}</p>}

      {test && (
        <div className={test.ok ? 'test ok' : 'test bad'}>
          <strong>{test.ok ? 'Test passed' : 'Test failed'}</strong> · {timeAgo(test.at)}
          {test.error && <div>{test.error}</div>}
        </div>
      )}

      {outlook && (
        <p className="hint">
          In Outlook: {outlook.snapshot.state}
          {outlook.snapshot.state !== 'Disabled' &&
            ` (${formatExchangeTime(outlook.snapshot.start?.iso)} → ${formatExchangeTime(outlook.snapshot.end?.iso)})`}
          {' · '}checked {timeAgo(outlook.at)}
        </p>
      )}

      <div className="row actions">
        <button className="btn small" disabled={!!status.busy || !ready} onClick={() => void run(() => window.ooo.testAccount(account.id))}>
          Test connection
        </button>
        <button className="btn small" disabled={!!status.busy} onClick={() => void run(() => window.ooo.reconnectAccount(account.id))}>
          Reconnect
        </button>
        <button className="btn small" onClick={() => setEditingMessage((v) => !v)}>
          {account.messageOverride ? 'Custom message ✓' : 'Custom message'}
        </button>
        <span className="spacer" />
        <button
          className="btn small danger"
          onClick={() => {
            if (confirm(`Remove ${account.nickname} (${account.email})? Its saved sign-in will be deleted.`)) {
              void run(() => window.ooo.removeAccount(account.id))
            }
          }}
        >
          Remove
        </button>
      </div>

      {editingMessage && (
        <div className="override">
          <p className="hint">Leave empty to use the default message. Use this for a different backup contact per customer, for example.</p>
          <textarea ref={overrideBox} rows={5} value={override} onChange={(e) => setOverride(e.target.value)} />
          <PlaceholderButtons textarea={overrideBox} value={override} onChange={setOverride} />
          <MessagePreview text={override} state={state} />
          <div className="row">
            <button
              className="btn small primary"
              onClick={() =>
                void run(async () => {
                  await window.ooo.updateAccount(account.id, { messageOverride: override })
                  setEditingMessage(false)
                })
              }
            >
              Save message
            </button>
          </div>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  )
}

export function AccountsView({ state }: { state: AppState }): React.JSX.Element {
  const ready = state.runtime.phase === 'ready'
  return (
    <div className="accounts">
      <AddAccount />
      {state.config.accounts.length === 0 ? (
        <p className="empty">No accounts yet. Connect your employer account and each customer account you work for.</p>
      ) : (
        state.config.accounts.map((a) => (
          <AccountCard key={a.id} account={a} status={state.accountStatus[a.id] ?? { auth: 'unknown' }} ready={ready} state={state} />
        ))
      )}
    </div>
  )
}
