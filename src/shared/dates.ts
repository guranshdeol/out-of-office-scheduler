import type { DateKey, Stretch, TimeOfDay } from './types'

const pad = (n: number): string => String(n).padStart(2, '0')

export function toKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

export function isWeekend(key: DateKey): boolean {
  const day = fromKey(key).getDay()
  return day === 0 || day === 6
}

export function todayKey(now = new Date()): DateKey {
  return toKey(now)
}

/** Local wall-clock time on the given day, as epoch milliseconds. */
export function atTime(key: DateKey, time: TimeOfDay): number {
  const [y, m, d] = key.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime()
}

export function stretchStartMs(s: Pick<Stretch, 'startDate' | 'startTime'>): number {
  return atTime(s.startDate, s.startTime)
}

export function stretchEndMs(s: Pick<Stretch, 'endDate' | 'endTime'>): number {
  return atTime(addDays(s.endDate, 1), s.endTime)
}

export function eachDay(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = []
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k)
  return out
}

export function formatDay(key: DateKey): string {
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}
