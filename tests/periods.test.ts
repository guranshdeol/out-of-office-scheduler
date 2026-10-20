import { describe, expect, it } from 'vitest'
import { atTime, stretchEndMs, stretchStartMs } from '../src/shared/dates'
import { currentStretch, deriveState, groupDays, newStretch, normalize } from '../src/main/periods'
import type { Account, Stretch } from '../src/shared/types'

const defaults = { customTimes: false, startTime: '00:00', endTime: '00:00' }
let seq = 0
const mk = (startDate: string, endDate: string, extra: Partial<Stretch> = {}): Stretch => ({
  ...newStretch({ startDate, endDate }, defaults, `s${++seq}`, 0),
  ...extra
})

// 2026-11-02 is a Monday.
describe('groupDays', () => {
  it('joins consecutive days into one range', () => {
    expect(groupDays(['2026-11-03', '2026-11-02', '2026-11-04'])).toEqual([
      { startDate: '2026-11-02', endDate: '2026-11-04' }
    ])
  })

  it('keeps separate weeks apart', () => {
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-16', '2026-11-17']
    expect(groupDays(days)).toEqual([
      { startDate: '2026-11-02', endDate: '2026-11-06' },
      { startDate: '2026-11-16', endDate: '2026-11-17' }
    ])
  })

  it('bridges a weekend between Friday and Monday', () => {
    expect(groupDays(['2026-11-06', '2026-11-09'])).toEqual([{ startDate: '2026-11-06', endDate: '2026-11-09' }])
  })

  it('does not bridge a working day', () => {
    expect(groupDays(['2026-11-05', '2026-11-09'])).toHaveLength(2)
  })

  it('removes duplicates', () => {
    expect(groupDays(['2026-11-02', '2026-11-02'])).toEqual([{ startDate: '2026-11-02', endDate: '2026-11-02' }])
  })
})

describe('stretch times', () => {
  it('defaults to midnight on the first day until midnight after the last day', () => {
    const s = mk('2026-11-02', '2026-11-06')
    expect(stretchStartMs(s)).toBe(atTime('2026-11-02', '00:00'))
    expect(stretchEndMs(s)).toBe(atTime('2026-11-07', '00:00'))
  })

  it('uses custom times when enabled', () => {
    const s = newStretch({ startDate: '2026-11-02', endDate: '2026-11-02' }, { customTimes: true, startTime: '12:00', endTime: '12:00' }, 'x')
    expect(stretchStartMs(s)).toBe(atTime('2026-11-02', '12:00'))
    expect(stretchEndMs(s)).toBe(atTime('2026-11-03', '12:00'))
  })

  it('ignores custom time values when custom times are off', () => {
    const s = newStretch({ startDate: '2026-11-02', endDate: '2026-11-02' }, { customTimes: false, startTime: '09:00', endTime: '17:00' }, 'x')
    expect(s.startTime).toBe('00:00')
    expect(s.endTime).toBe('00:00')
  })
})

describe('normalize', () => {
  it('merges touching stretches and resets results when the window changes', () => {
    const a = mk('2026-11-02', '2026-11-03', { results: { acc: { status: 'ok', at: 1 } } })
    const b = mk('2026-11-04', '2026-11-05')
    const out = normalize([b, a])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: a.id, startDate: '2026-11-02', endDate: '2026-11-05', results: {} })
  })

  it('keeps results when a contained stretch is merged', () => {
    const a = mk('2026-11-02', '2026-11-06', { results: { acc: { status: 'ok', at: 1 } } })
    const b = mk('2026-11-03', '2026-11-04')
    const out = normalize([a, b])
    expect(out).toHaveLength(1)
    expect(out[0].results.acc?.status).toBe('ok')
  })

  it('merges across a weekend', () => {
    expect(normalize([mk('2026-11-02', '2026-11-06'), mk('2026-11-09', '2026-11-10')])).toHaveLength(1)
  })

  it('keeps stretches with working days between them separate and sorted', () => {
    const later = mk('2026-11-16', '2026-11-20')
    const earlier = mk('2026-11-02', '2026-11-06')
    expect(normalize([later, earlier]).map((s) => s.id)).toEqual([earlier.id, later.id])
  })
})

describe('currentStretch and deriveState', () => {
  const accounts: Account[] = [
    { id: 'a', email: 'a@x.com', nickname: 'A', enabled: true },
    { id: 'b', email: 'b@y.com', nickname: 'B', enabled: true },
    { id: 'c', email: 'c@z.com', nickname: 'C', enabled: false }
  ]
  const first = mk('2026-11-02', '2026-11-06')
  const second = mk('2026-11-16', '2026-11-20')

  it('picks the earliest stretch that has not ended', () => {
    expect(currentStretch([second, first], atTime('2026-10-20', '10:00'))?.id).toBe(first.id)
    expect(currentStretch([second, first], atTime('2026-11-07', '00:00'))?.id).toBe(second.id)
    expect(currentStretch([second, first], atTime('2026-11-21', '00:00'))).toBeUndefined()
  })

  it('derives states from per-account results, ignoring disabled accounts', () => {
    const now = atTime('2026-10-20', '10:00')
    const base = { now, isCurrent: true, accounts, applying: false }
    expect(deriveState(first, base)).toBe('queued')
    expect(deriveState({ ...first, results: { a: { status: 'ok', at: 1 } } }, base)).toBe('partial')
    expect(deriveState({ ...first, results: { a: { status: 'ok', at: 1 }, b: { status: 'ok', at: 1 } } }, base)).toBe('live')
    expect(deriveState({ ...first, results: { a: { status: 'failed', at: 1 } } }, base)).toBe('failed')
    expect(deriveState(second, { ...base, isCurrent: false })).toBe('queued')
    expect(deriveState(first, { ...base, now: atTime('2026-11-08', '00:00') })).toBe('done')
    expect(deriveState(first, { ...base, applying: true })).toBe('applying')
  })
})
