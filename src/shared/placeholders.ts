import { fromKey } from './dates'
import type { DateKey } from './types'

/** Placeholders a message can use; each is replaced with that leave's date when it's applied. */
export const PLACEHOLDERS = [
  { token: '{end}', name: 'End date', label: 'Last day of leave' },
  { token: '{start}', name: 'Start date', label: 'First day of leave' }
] as const

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * A date written out in full, e.g. "Friday, 24 October", so it can't be misread by recipients
 * in other countries. The year is added when it isn't the current year. Built from fixed names
 * rather than the system locale, so every machine writes the same text.
 */
export function formatLeaveDate(key: DateKey, now = new Date()): string {
  const d = fromKey(key)
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`
}

/** Replaces {start} and {end} (any letter case) with the leave's dates. Other text is left as typed. */
export function fillPlaceholders(text: string, leave: { startDate: DateKey; endDate: DateKey }, now = new Date()): string {
  return text
    .replace(/\{start\}/gi, formatLeaveDate(leave.startDate, now))
    .replace(/\{end\}/gi, formatLeaveDate(leave.endDate, now))
}

/** True if the text uses any placeholder. */
export const hasPlaceholders = (text: string): boolean => /\{(start|end)\}/i.test(text)
