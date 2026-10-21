import { useEffect, useState } from 'react'
import type { AppState } from '@shared/types'
import { AppIcon } from './AppIcon'
import { AccountsView } from './views/AccountsView'
import { CalendarView } from './views/CalendarView'
import { MessageView } from './views/MessageView'
import { SetupBanner } from './views/SetupBanner'
import { UpdateBanner } from './views/UpdateBanner'

type View = 'calendar' | 'accounts' | 'message'

const TABS: { id: View; label: string }[] = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'message', label: 'Message & settings' }
]

export function App(): React.JSX.Element {
  const [state, setState] = useState<AppState>()
  const [view, setView] = useState<View>('calendar')

  useEffect(() => {
    void window.ooo.getState().then((s) => {
      setState(s)
      if (s.config.accounts.length === 0) setView('accounts')
    })
    const offState = window.ooo.onState(setState)
    const offNav = window.ooo.onNavigate((v) => setView(v as View))
    return () => {
      offState()
      offNav()
    }
  }, [])

  if (!state) return <div className="loading">Loading…</div>

  const needsSignIn = state.config.accounts.filter((a) => state.accountStatus[a.id]?.auth === 'needs-signin').length

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <AppIcon />
          OOO Scheduler
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={view === t.id ? 'tab active' : 'tab'} onClick={() => setView(t.id)}>
              {t.label}
              {t.id === 'accounts' && needsSignIn > 0 && <span className="dot" title="An account needs sign-in" />}
            </button>
          ))}
        </nav>
      </header>
      <SetupBanner runtime={state.runtime} />
      <UpdateBanner state={state} />
      <main className="content">
        {view === 'calendar' && <CalendarView state={state} goToAccounts={() => setView('accounts')} />}
        {view === 'accounts' && <AccountsView state={state} />}
        {view === 'message' && <MessageView state={state} />}
      </main>
    </div>
  )
}
