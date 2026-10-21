import { Notification, powerMonitor } from 'electron'
import { formatDateTime, stretchEndMs, stretchStartMs } from '@shared/dates'
import { fillPlaceholders } from '@shared/placeholders'
import type { Account, ApplyResult, OooSnapshot, OooTime, Stretch } from '@shared/types'
import { getToken, NeedsSignInError } from './auth'
import { clearOoo, ExoError, setOoo } from './exo'
import { textToHtml } from './message'
import { currentStretch, isDone } from './periods'
import { getConfig, getRuntime, mutateConfig, setAccountStatus, setApplying, setSchedulerBusy } from './state'

const CHECK_INTERVAL_MS = 15 * 60_000
const AUTH_REFRESH_MS = 4 * 60 * 60_000
const KEEP_DONE_MS = 60 * 24 * 60 * 60_000
const MISMATCH_TOLERANCE_MS = 2 * 60_000

export type CheckReason = 'user' | 'timer'

let running: Promise<void> | undefined
let queued: Promise<void> | undefined
let queuedReason: CheckReason = 'timer'
let endTimer: NodeJS.Timeout | undefined
let onNotificationClick: (view: string) => void = () => undefined

const windowOf = (s: Stretch): string => `${stretchStartMs(s)}-${stretchEndMs(s)}`

export function describeStretch(s: Stretch): string {
  return `${formatDateTime(stretchStartMs(s))} → ${formatDateTime(stretchEndMs(s))}`
}

function notifyUser(title: string, body: string, view = 'calendar'): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body })
  n.on('click', () => onNotificationClick(view))
  n.show()
}

/** The account's message for this leave, with {start} and {end} filled in from the leave's dates. */
export const messageFor = (account: Account, s: Stretch): string =>
  fillPlaceholders(account.messageOverride?.trim() || getConfig().message, s)

function parseOooTime(t: OooTime | null | undefined): number | undefined {
  if (!t?.iso) return undefined
  const ms = Date.parse(t.iso)
  return Number.isNaN(ms) ? undefined : ms
}

function mismatched(readBack: OooSnapshot, s: Stretch): boolean {
  const start = parseOooTime(readBack.start)
  const end = parseOooTime(readBack.end)
  if (start === undefined || end === undefined) return false
  return Math.abs(start - stretchStartMs(s)) > MISMATCH_TOLERANCE_MS || Math.abs(end - stretchEndMs(s)) > MISMATCH_TOLERANCE_MS
}

/**
 * Exchange deletes the block it is tracking whenever a new block is created, unless the auto-reply
 * was turned off in between and that block is already in the past. A finished leave keeps its block
 * that way; edits and cancellations of unfinished leave still replace it.
 */
const keepsPreviousBlock = (s: Stretch, account: Account, createEvent: boolean): boolean =>
  createEvent && !!account.oofBlock && account.oofBlock.stretchId !== s.id && account.oofBlock.endMs <= Date.now()

async function applyToAccount(s: Stretch, account: Account): Promise<ApplyResult> {
  const { settings } = getConfig()
  try {
    const token = await getToken(account.homeAccountId)
    const keptPrevious = keepsPreviousBlock(s, account, settings.createCalendarEvent)
    if (keptPrevious) await clearOoo(account.email, token)
    const readBack = await setOoo({
      upn: account.email,
      token,
      startMs: stretchStartMs(s),
      endMs: stretchEndMs(s),
      html: textToHtml(messageFor(account, s)),
      createEvent: settings.createCalendarEvent,
      subject: settings.calendarSubject || 'Out of office'
    })
    setAccountStatus(account.id, { auth: 'connected', authError: undefined })
    return {
      status: 'ok',
      at: Date.now(),
      readBack,
      timeMismatch: mismatched(readBack, s),
      eventCreated: settings.createCalendarEvent,
      keptPrevious
    }
  } catch (err) {
    const needsSignIn = err instanceof NeedsSignInError || (err instanceof ExoError && err.authRejected)
    if (needsSignIn) setAccountStatus(account.id, { auth: 'needs-signin', authError: (err as Error).message })
    return { status: 'failed', at: Date.now(), error: (err as Error).message, needsSignIn }
  }
}

/** Results only belong to the stretch that is currently in Outlook; queued stretches must not keep stale ones. */
function clearStaleResults(now: number, currentId: string | undefined): void {
  const stale = getConfig().stretches.filter(
    (s) => s.id !== currentId && !isDone(s, now) && Object.keys(s.results).length > 0
  )
  if (stale.length === 0) return
  mutateConfig((c) => {
    for (const s of c.stretches) if (stale.some((x) => x.id === s.id)) s.results = {}
  })
}

function pruneOld(now: number): void {
  const old = getConfig().stretches.filter((s) => stretchEndMs(s) < now - KEEP_DONE_MS)
  if (old.length === 0) return
  mutateConfig((c) => {
    c.stretches = c.stretches.filter((s) => !old.includes(s))
  })
}

function needsApply(s: Stretch, account: Account): boolean {
  const r = s.results[account.id]
  if (!r) return true
  if (r.status === 'ok') return false
  return !r.needsSignIn
}

async function check(reason: CheckReason): Promise<void> {
  if (getRuntime().phase !== 'ready') return
  setSchedulerBusy(true)
  try {
    const now = Date.now()
    pruneOld(now)
    const current = currentStretch(getConfig().stretches, now)
    clearStaleResults(now, current?.id)
    scheduleEndTimer(current)
    if (!current) return

    const targets = getConfig().accounts.filter((a) => a.enabled && needsApply(current, a))
    if (targets.length === 0) return

    const window = windowOf(current)
    setApplying(current.id, true)
    const results = await Promise.all(targets.map(async (a) => [a, await applyToAccount(current, a)] as const))
    setApplying(current.id, false)

    const failures: string[] = []
    let successes = 0
    mutateConfig((c) => {
      for (const [account, result] of results) {
        const a = c.accounts.find((x) => x.id === account.id)
        if (!a || result.status !== 'ok' || !result.eventCreated) continue
        const replaced = a.oofBlock && !result.keptPrevious ? a.oofBlock : undefined
        if (replaced) {
          c.calendarCleanups = c.calendarCleanups.filter(
            (x) => !(x.accountId === a.id && x.startMs === replaced.startMs && x.endMs === replaced.endMs)
          )
        }
        a.oofBlock = { stretchId: current.id, startMs: stretchStartMs(current), endMs: stretchEndMs(current) }
      }
      const s = c.stretches.find((x) => x.id === current.id)
      if (!s || windowOf(s) !== window) return
      for (const [account, result] of results) {
        if (!c.accounts.some((a) => a.id === account.id)) continue
        const prev = s.results[account.id]
        if (result.status === 'failed') {
          result.notified = prev?.status === 'failed' && prev.notified
          if (!result.notified) failures.push(`${account.nickname}: ${result.error}`)
          result.notified = true
        } else {
          successes++
        }
        s.results[account.id] = result
      }
    })

    if (failures.length) {
      notifyUser('Out-of-office could not be set', failures.join('\n'), 'accounts')
    } else if (successes && reason === 'timer') {
      notifyUser('Next leave scheduled', `${describeStretch(current)} on ${successes} account(s).`)
    }
  } finally {
    setSchedulerBusy(false, Date.now())
  }
}

/**
 * Runs a check now. Requests made while a check is running are coalesced into one follow-up run,
 * and the returned promise resolves only after a run that started after the request.
 */
export function requestCheck(reason: CheckReason = 'user'): Promise<void> {
  if (!running) {
    running = check(reason)
      .catch((err) => console.error('Scheduler check failed', err))
      .finally(() => {
        running = undefined
      })
    return running
  }
  if (queued) {
    if (reason === 'user') queuedReason = 'user'
    return queued
  }
  queuedReason = reason
  queued = running.then(() => {
    queued = undefined
    return requestCheck(queuedReason)
  })
  return queued
}

function scheduleEndTimer(current: Stretch | undefined): void {
  if (endTimer) clearTimeout(endTimer)
  endTimer = undefined
  if (!current) return
  const delay = stretchEndMs(current) - Date.now() + 60_000
  if (delay > 0 && delay < CHECK_INTERVAL_MS * 4) {
    endTimer = setTimeout(() => void requestCheck('timer'), delay)
  }
}

export async function refreshAuthStatuses(): Promise<void> {
  await Promise.all(
    getConfig().accounts.map(async (a) => {
      setAccountStatus(a.id, { auth: 'checking' })
      try {
        await getToken(a.homeAccountId)
        setAccountStatus(a.id, { auth: 'connected', authError: undefined })
      } catch (err) {
        if (err instanceof NeedsSignInError) setAccountStatus(a.id, { auth: 'needs-signin', authError: err.message })
        else setAccountStatus(a.id, { auth: 'unknown', authError: (err as Error).message })
      }
    })
  )
}

export function startScheduler(clickHandler: (view: string) => void): void {
  onNotificationClick = clickHandler
  setInterval(() => void requestCheck('timer'), CHECK_INTERVAL_MS)
  setInterval(() => void refreshAuthStatuses(), AUTH_REFRESH_MS)
  const soon = (): void => {
    setTimeout(() => void requestCheck('timer'), 15_000)
  }
  powerMonitor.on('resume', soon)
  powerMonitor.on('unlock-screen', soon)
}
