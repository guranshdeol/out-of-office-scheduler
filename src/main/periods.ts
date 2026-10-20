import { addDays, isWeekend, stretchEndMs, stretchStartMs } from '@shared/dates'
import type { Account, DateKey, Stretch, StretchState, TimeOfDay } from '@shared/types'

export interface DayRange {
  startDate: DateKey
  endDate: DateKey
}

/** True when every day strictly between `afterDay` and `beforeDay` is a Saturday or Sunday. */
export function onlyWeekendBetween(afterDay: DateKey, beforeDay: DateKey): boolean {
  for (let k = addDays(afterDay, 1); k < beforeDay; k = addDays(k, 1)) {
    if (!isWeekend(k)) return false
  }
  return true
}

/** Groups picked days into ranges, joining consecutive days and days separated only by a weekend. */
export function groupDays(days: DateKey[]): DayRange[] {
  const sorted = [...new Set(days)].sort()
  const ranges: DayRange[] = []
  for (const day of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && onlyWeekendBetween(last.endDate, day)) {
      last.endDate = day
    } else {
      ranges.push({ startDate: day, endDate: day })
    }
  }
  return ranges
}

export function newStretch(
  range: DayRange,
  times: { customTimes: boolean; startTime: TimeOfDay; endTime: TimeOfDay },
  id: string,
  now = Date.now()
): Stretch {
  return {
    id,
    startDate: range.startDate,
    endDate: range.endDate,
    customTimes: times.customTimes,
    startTime: times.customTimes ? times.startTime : '00:00',
    endTime: times.customTimes ? times.endTime : '00:00',
    results: {},
    createdAt: now
  }
}

function shouldMerge(a: Stretch, b: Stretch): boolean {
  if (stretchStartMs(b) <= stretchEndMs(a)) return true
  return b.startDate > a.endDate && onlyWeekendBetween(a.endDate, b.startDate)
}

function sameWindow(a: Stretch, b: Stretch): boolean {
  return stretchStartMs(a) === stretchStartMs(b) && stretchEndMs(a) === stretchEndMs(b)
}

/**
 * Sorts stretches and merges any that overlap, touch, or are separated only by a weekend.
 * A merged stretch keeps its apply results only if its window did not change.
 */
export function normalize(stretches: Stretch[]): Stretch[] {
  const sorted = [...stretches].sort((x, y) => stretchStartMs(x) - stretchStartMs(y))
  const out: Stretch[] = []
  for (const s of sorted) {
    const prev = out[out.length - 1]
    if (!prev || !shouldMerge(prev, s)) {
      out.push({ ...s })
      continue
    }
    const before = { ...prev }
    if (stretchEndMs(s) > stretchEndMs(prev)) {
      prev.endDate = s.endDate
      prev.endTime = s.endTime
    }
    prev.customTimes = prev.customTimes || s.customTimes
    prev.createdAt = Math.min(prev.createdAt, s.createdAt)
    if (!sameWindow(before, prev)) prev.results = {}
  }
  return out
}

export function isDone(s: Stretch, now: number): boolean {
  return stretchEndMs(s) <= now
}

/** The stretch that should currently be applied in Outlook: the earliest one that hasn't ended. */
export function currentStretch(stretches: Stretch[], now: number): Stretch | undefined {
  return [...stretches]
    .filter((s) => !isDone(s, now))
    .sort((x, y) => stretchStartMs(x) - stretchStartMs(y))[0]
}

export function deriveState(
  s: Stretch,
  opts: { now: number; isCurrent: boolean; accounts: Account[]; applying: boolean }
): StretchState {
  if (isDone(s, opts.now)) return 'done'
  if (!opts.isCurrent) return 'queued'
  if (opts.applying) return 'applying'
  const enabled = opts.accounts.filter((a) => a.enabled)
  if (enabled.length === 0) return 'queued'
  const results = enabled.map((a) => s.results[a.id])
  const ok = results.filter((r) => r?.status === 'ok').length
  const failed = results.filter((r) => r?.status === 'failed').length
  if (ok === enabled.length) return 'live'
  if (ok > 0) return 'partial'
  if (failed > 0) return 'failed'
  return 'queued'
}
