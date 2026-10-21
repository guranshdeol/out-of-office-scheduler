import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig, OooSnapshot } from '../src/shared/types'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0', isPackaged: false },
  Notification: { isSupported: () => false },
  powerMonitor: { on: vi.fn() }
}))

const fresh = (): AppConfig => ({
  accounts: [{ id: 'a1', email: 'megan@contoso.com', nickname: 'Contoso', enabled: true, homeAccountId: 'h1' }],
  message: 'Back on {end}.',
  settings: { launchAtLogin: false, calendarSubject: 'Out of office', createCalendarEvent: true, checkForUpdates: false },
  stretches: [],
  calendarCleanups: []
})

vi.mock('../src/main/store', () => ({ loadConfig: () => fresh(), saveConfig: () => undefined }))

vi.mock('../src/main/auth', () => ({
  NeedsSignInError: class extends Error {},
  getToken: async () => 'token',
  signIn: vi.fn(),
  signOut: vi.fn()
}))

const iso = (ms: number): { iso: string; kind: string } => ({ iso: new Date(ms).toISOString(), kind: 'Utc' })

const exo = vi.hoisted(() => ({
  setOoo: vi.fn(),
  clearOoo: vi.fn(),
  testAccount: vi.fn()
}))

vi.mock('../src/main/exo', () => ({ ExoError: class extends Error {}, ...exo }))

const { initState, getConfig, getAccountStatus, setRuntime } = await import('../src/main/state')
const { requestCheck } = await import('../src/main/scheduler')
const { applyDays, cancelStretch } = await import('../src/main/actions')

const at = (day: string, time = '10:00'): Date => new Date(`${day}T${time}:00`)
const leave = (...days: string[]): Promise<void> => applyDays({ days, customTimes: false, startTime: '09:00', endTime: '17:00' })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // 2026-11-02 is a Monday.
  vi.setSystemTime(at('2026-11-02'))
  exo.setOoo.mockImplementation(
    async (r: { startMs: number; endMs: number }): Promise<OooSnapshot> => ({ state: 'Scheduled', start: iso(r.startMs), end: iso(r.endMs) })
  )
  exo.clearOoo.mockResolvedValue({ state: 'Disabled' })
  initState()
  setRuntime({ phase: 'ready', message: '' })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('applying leave', () => {
  it("updates the account's Outlook status from Exchange's read-back", async () => {
    await leave('2026-11-02', '2026-11-03')
    const outlook = getAccountStatus('a1').outlook
    expect(outlook?.snapshot.state).toBe('Scheduled')
    expect(outlook?.snapshot.start?.iso).toBe(at('2026-11-02', '00:00').toISOString())
    expect(outlook?.snapshot.end?.iso).toBe(at('2026-11-04', '00:00').toISOString())
    expect(outlook?.at).toBe(Date.now())
  })

  it('records the block Exchange is tracking', async () => {
    await leave('2026-11-02')
    const s = getConfig().stretches[0]
    expect(getConfig().accounts[0].oofBlock).toEqual({
      stretchId: s.id,
      startMs: at('2026-11-02', '00:00').getTime(),
      endMs: at('2026-11-03', '00:00').getTime()
    })
    await requestCheck('user')
    expect(exo.setOoo).toHaveBeenCalledTimes(1)
  })
})

describe('cancelling leave', () => {
  const block = (startDay: string, endDay: string): { startMs: number; endMs: number } => ({
    startMs: at(startDay, '00:00').getTime(),
    endMs: at(endDay, '00:00').getTime()
  })

  async function cancelLiveLeave(): Promise<void> {
    await leave('2026-11-02', '2026-11-03', '2026-11-04')
    expect(await cancelStretch(getConfig().stretches[0].id)).toEqual({ ok: true })
  }

  it('turns the auto-reply off, asks for the block to be deleted and keeps tracking it', async () => {
    await cancelLiveLeave()
    expect(exo.clearOoo).toHaveBeenCalledTimes(1)
    expect(getAccountStatus('a1').outlook?.snapshot.state).toBe('Disabled')
    expect(getConfig().calendarCleanups).toMatchObject([{ accountId: 'a1', ...block('2026-11-02', '2026-11-05') }])
    expect(getConfig().accounts[0].oofBlock).toMatchObject(block('2026-11-02', '2026-11-05'))
  })

  it('drops the cleanup when the next leave makes Exchange replace the unfinished block', async () => {
    await cancelLiveLeave()
    await leave('2026-11-16')
    expect(getConfig().calendarCleanups).toEqual([])
    expect(getConfig().accounts[0].oofBlock).toMatchObject(block('2026-11-16', '2026-11-17'))
  })

  it('keeps the cleanup when the cancelled block is already over, because Exchange keeps it', async () => {
    await cancelLiveLeave()
    vi.setSystemTime(at('2026-11-06'))
    await leave('2026-11-16')
    expect(exo.clearOoo).toHaveBeenCalledTimes(2)
    expect(getConfig().calendarCleanups).toMatchObject([block('2026-11-02', '2026-11-05')])
    expect(getConfig().accounts[0].oofBlock).toMatchObject(block('2026-11-16', '2026-11-17'))
  })
})
