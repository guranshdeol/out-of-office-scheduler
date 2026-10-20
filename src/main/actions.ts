import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { stretchEndMs, stretchStartMs, todayKey } from '@shared/dates'
import type { Account, ApplyDaysInput, ApplyResult, NewAccountInput, Settings, Stretch, StretchEdit } from '@shared/types'
import { getToken, NeedsSignInError, signIn, signOut } from './auth'
import { clearOoo, ExoError, testAccount } from './exo'
import { currentStretch, groupDays, isDone, newStretch, normalize } from './periods'
import { requestCheck } from './scheduler'
import { getAccountStatus, getConfig, getRuntime, mutateConfig, setAccountStatus } from './state'

type Outcome = { ok: boolean; error?: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const findAccount = (id: string): Account => {
  const a = getConfig().accounts.find((x) => x.id === id)
  if (!a) throw new Error('Account not found.')
  return a
}

/** Forces the stretch that is live in Outlook to be re-applied, e.g. after the message changes. */
function invalidateCurrent(accountId?: string): void {
  const current = currentStretch(getConfig().stretches, Date.now())
  if (!current) return
  mutateConfig((c) => {
    const s = c.stretches.find((x) => x.id === current.id)
    if (!s) return
    if (accountId) delete s.results[accountId]
    else s.results = {}
  })
  void requestCheck('user')
}

export async function runAccountTest(id: string): Promise<void> {
  const account = findAccount(id)
  setAccountStatus(id, { busy: 'Testing connection…' })
  try {
    const token = await getToken(account.homeAccountId)
    setAccountStatus(id, { auth: 'connected', authError: undefined })
    const r = await testAccount(account.email, token)
    const ok = r.canSet && r.canCreateEvent
    setAccountStatus(id, {
      test: {
        ok,
        at: Date.now(),
        canSet: r.canSet,
        canCreateEvent: r.canCreateEvent,
        snapshot: r.snapshot,
        error: ok
          ? undefined
          : r.canSet
            ? 'Auto-replies can be set, but this tenant does not allow creating the calendar block.'
            : 'This tenant does not let you change auto-replies through Exchange Online PowerShell.'
      }
    })
  } catch (err) {
    const message = (err as Error).message
    if (err instanceof NeedsSignInError || (err instanceof ExoError && err.authRejected)) {
      setAccountStatus(id, { auth: 'needs-signin', authError: message })
    }
    setAccountStatus(id, { test: { ok: false, at: Date.now(), error: message } })
  } finally {
    setAccountStatus(id, { busy: undefined })
  }
}

/** Tests accounts that haven't been tested since the app started, e.g. ones added before setup finished. */
export async function testUntestedAccounts(): Promise<void> {
  const untested = getConfig().accounts.filter((a) => !getAccountStatus(a.id).test && getAccountStatus(a.id).auth === 'connected')
  await Promise.all(untested.map((a) => runAccountTest(a.id)))
}

export async function addAccount(input: NewAccountInput): Promise<Outcome> {
  const email = input.email.trim().toLowerCase()
  const nickname = input.nickname.trim() || email.split('@')[1]
  if (!EMAIL.test(email)) return { ok: false, error: 'Enter a valid email address.' }
  if (getConfig().accounts.some((a) => a.email === email)) return { ok: false, error: 'This account is already added.' }
  try {
    const result = await signIn(email)
    const account: Account = {
      id: randomUUID(),
      email,
      nickname,
      enabled: true,
      homeAccountId: result.homeAccountId,
      tenantId: result.tenantId
    }
    mutateConfig((c) => c.accounts.push(account))
    setAccountStatus(account.id, { auth: 'connected' })
    if (getRuntime().phase === 'ready') await runAccountTest(account.id)
    void requestCheck('user')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function reconnectAccount(id: string): Promise<Outcome> {
  const account = findAccount(id)
  setAccountStatus(id, { busy: 'Waiting for sign-in in your browser…' })
  try {
    const result = await signIn(account.email)
    mutateConfig((c) => {
      const a = c.accounts.find((x) => x.id === id)
      if (a) Object.assign(a, { homeAccountId: result.homeAccountId, tenantId: result.tenantId })
      for (const s of c.stretches) {
        if (s.results[id]?.needsSignIn) delete s.results[id]
      }
    })
    setAccountStatus(id, { auth: 'connected', authError: undefined, busy: undefined })
    if (getRuntime().phase === 'ready') await runAccountTest(id)
    void requestCheck('user')
    return { ok: true }
  } catch (err) {
    setAccountStatus(id, { busy: undefined })
    return { ok: false, error: (err as Error).message }
  }
}

export async function updateAccount(
  id: string,
  patch: Partial<Pick<Account, 'nickname' | 'enabled' | 'messageOverride'>>
): Promise<void> {
  const before = findAccount(id)
  const messageChanged = patch.messageOverride !== undefined && patch.messageOverride !== (before.messageOverride ?? '')
  mutateConfig((c) => {
    const a = c.accounts.find((x) => x.id === id)
    if (!a) return
    if (patch.nickname !== undefined) a.nickname = patch.nickname.trim() || a.nickname
    if (patch.enabled !== undefined) a.enabled = patch.enabled
    if (patch.messageOverride !== undefined) a.messageOverride = patch.messageOverride.trim() || undefined
  })
  if (messageChanged) invalidateCurrent(id)
  else if (patch.enabled) void requestCheck('user')
}

export async function removeAccount(id: string): Promise<void> {
  const account = findAccount(id)
  await signOut(account.homeAccountId).catch(() => undefined)
  mutateConfig((c) => {
    c.accounts = c.accounts.filter((a) => a.id !== id)
    for (const s of c.stretches) delete s.results[id]
  })
}

export async function saveMessage(message: string): Promise<void> {
  if (message.trim() === getConfig().message.trim()) return
  mutateConfig((c) => (c.message = message))
  invalidateCurrent()
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const before = { ...getConfig().settings }
  if (before.createCalendarEvent && patch.createCalendarEvent === false) {
    const current = currentStretch(getConfig().stretches, Date.now())
    if (current) {
      for (const a of getConfig().accounts) if (createdBlock(current.results[a.id])) addCleanup(a, current)
    }
  }
  mutateConfig((c) => Object.assign(c.settings, patch))
  const after = getConfig().settings
  if (patch.launchAtLogin !== undefined) applyLoginItem(after.launchAtLogin)
  if (before.calendarSubject !== after.calendarSubject || before.createCalendarEvent !== after.createCalendarEvent) {
    invalidateCurrent()
  }
}

export function applyLoginItem(enabled: boolean): void {
  if (process.platform === 'linux' || !app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
}

function validateTimes(customTimes: boolean, startTime: string, endTime: string): void {
  if (customTimes && (!TIME.test(startTime) || !TIME.test(endTime))) throw new Error('Times must be in HH:mm format.')
}

export async function applyDays(input: ApplyDaysInput): Promise<void> {
  validateTimes(input.customTimes, input.startTime, input.endTime)
  const today = todayKey()
  const days = input.days.filter((d) => d >= today)
  if (days.length === 0) throw new Error('Pick at least one day from today onwards.')
  const now = Date.now()
  mutateConfig((c) => {
    const added = groupDays(days).map((r) => newStretch(r, input, randomUUID(), now))
    const done = c.stretches.filter((s) => isDone(s, now))
    const active = c.stretches.filter((s) => !isDone(s, now))
    c.stretches = [...done, ...normalize([...active, ...added])]
  })
  await requestCheck('user')
}

export async function editStretch(id: string, edit: StretchEdit): Promise<void> {
  validateTimes(edit.customTimes, edit.startTime, edit.endTime)
  if (edit.endDate < edit.startDate) throw new Error('The last day must be on or after the first day.')
  const now = Date.now()
  const existing = getConfig().stretches.find((x) => x.id === id)
  if (!existing) throw new Error('Leave period not found.')
  const updated = {
    ...existing,
    startDate: edit.startDate,
    endDate: edit.endDate,
    customTimes: edit.customTimes,
    startTime: edit.customTimes ? edit.startTime : '00:00',
    endTime: edit.customTimes ? edit.endTime : '00:00'
  }
  if (stretchEndMs(updated) <= stretchStartMs(updated)) throw new Error('The end must be after the start.')
  if (stretchEndMs(updated) <= now) throw new Error('That leave period would already be over.')
  const windowChanged =
    stretchStartMs(updated) !== stretchStartMs(existing) || stretchEndMs(updated) !== stretchEndMs(existing)
  if (windowChanged) updated.results = {}
  mutateConfig((c) => {
    c.stretches = c.stretches.map((x) => (x.id === id ? updated : x))
    const done = c.stretches.filter((x) => isDone(x, now))
    const active = c.stretches.filter((x) => !isDone(x, now))
    c.stretches = [...done, ...normalize(active)]
  })
  await requestCheck('user')
}

function addCleanup(account: Account, s: Stretch): void {
  const startMs = stretchStartMs(s)
  const endMs = stretchEndMs(s)
  mutateConfig((c) => {
    if (c.calendarCleanups.some((x) => x.accountId === account.id && x.startMs === startMs && x.endMs === endMs)) return
    c.calendarCleanups.push({
      id: randomUUID(),
      accountId: account.id,
      nickname: account.nickname,
      email: account.email,
      subject: c.settings.calendarSubject || 'Out of office',
      startMs,
      endMs,
      createdAt: Date.now()
    })
  })
}

const createdBlock = (r: ApplyResult | undefined): boolean => r?.status === 'ok' && r.eventCreated !== false

async function turnOff(a: Account): Promise<string | undefined> {
  try {
    await clearOoo(a.email, await getToken(a.homeAccountId))
    return undefined
  } catch (err) {
    return `${a.nickname}: ${(err as Error).message}`
  }
}

/**
 * Removes a leave period. If it is set in Outlook and another leave is queued, the next leave is
 * applied straight away, which makes Exchange replace the old calendar block. Otherwise the
 * auto-reply is turned off and the user is reminded to delete the leftover block in Outlook.
 */
export async function cancelStretch(id: string): Promise<Outcome> {
  const config = getConfig()
  const s = config.stretches.find((x) => x.id === id)
  if (!s) return { ok: true }
  const now = Date.now()
  const applied = config.accounts.filter((a) => s.results[a.id]?.status === 'ok')
  const removeIt = (): void =>
    mutateConfig((c) => {
      c.stretches = c.stretches.filter((x) => x.id !== id)
    })

  if (isDone(s, now) || applied.length === 0) {
    removeIt()
    await requestCheck('user')
    return { ok: true }
  }

  const hasNext = config.stretches.some((x) => x.id !== id && !isDone(x, now))
  const handOver = hasNext ? applied.filter((a) => a.enabled) : []
  const errors: string[] = []

  if (handOver.length < applied.length) {
    const direct = applied.filter((a) => !handOver.includes(a))
    const results = await Promise.all(direct.map(turnOff))
    errors.push(...results.filter((e): e is string => !!e))
    if (errors.length) return { ok: false, error: `Could not turn off the auto-reply on: ${errors.join('; ')}` }
    for (const a of direct) if (createdBlock(s.results[a.id])) addCleanup(a, s)
  }

  removeIt()
  await requestCheck('user')

  if (handOver.length) {
    const next = currentStretch(getConfig().stretches, Date.now())
    for (const a of handOver) {
      const r = next?.results[a.id]
      if (r?.status === 'ok' && r.eventCreated !== false) continue
      if (r?.status !== 'ok') {
        const err = await turnOff(a)
        if (err) errors.push(err)
      }
      if (createdBlock(s.results[a.id])) addCleanup(a, s)
    }
  }

  if (errors.length) {
    return {
      ok: false,
      error: `The leave was removed, but the auto-reply could not be turned off on: ${errors.join('; ')}. Turn it off in Outlook.`
    }
  }
  return { ok: true }
}

export async function dismissCleanup(id: string): Promise<void> {
  mutateConfig((c) => {
    c.calendarCleanups = c.calendarCleanups.filter((x) => x.id !== id)
  })
}
