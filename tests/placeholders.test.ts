import { describe, expect, it } from 'vitest'
import { fillPlaceholders, formatLeaveDate, hasPlaceholders, insertPlaceholder } from '../src/shared/placeholders'

const now = new Date(2026, 9, 20)

describe('formatLeaveDate', () => {
  it('writes the date out in full', () => {
    expect(formatLeaveDate('2026-10-24', now)).toBe('Saturday, 24 October')
  })

  it('adds the year when it is not the current year', () => {
    expect(formatLeaveDate('2027-01-04', now)).toBe('Monday, 4 January 2027')
  })
})

describe('fillPlaceholders', () => {
  const leave = { startDate: '2026-11-02', endDate: '2026-11-06' }

  it('replaces {start} and {end} with the leave dates', () => {
    expect(fillPlaceholders('Away {start} to {end}.', leave, now)).toBe('Away Monday, 2 November to Friday, 6 November.')
  })

  it('ignores letter case and replaces every occurrence', () => {
    expect(fillPlaceholders('{END}, really {end}', leave, now)).toBe('Friday, 6 November, really Friday, 6 November')
  })

  it('leaves other braces and text untouched', () => {
    expect(fillPlaceholders('{name} is away', leave, now)).toBe('{name} is away')
  })
})

describe('hasPlaceholders', () => {
  it('detects placeholders', () => {
    expect(hasPlaceholders('until {End}')).toBe(true)
    expect(hasPlaceholders('until Friday')).toBe(false)
  })
})

describe('insertPlaceholder', () => {
  it('adds spaces where the placeholder would touch a word', () => {
    expect(insertPlaceholder('and may', 4, 4, '{end}')).toEqual({ text: 'and {end} may', cursor: 10 })
    expect(insertPlaceholder('until.', 5, 5, '{end}')).toEqual({ text: 'until {end}.', cursor: 11 })
  })

  it('adds no extra spaces where there already are some', () => {
    expect(insertPlaceholder('until  now', 6, 6, '{end}')).toEqual({ text: 'until {end} now', cursor: 11 })
    expect(insertPlaceholder('', 0, 0, '{end}')).toEqual({ text: '{end}', cursor: 5 })
    expect(insertPlaceholder('(', 1, 1, '{end}')).toEqual({ text: '({end}', cursor: 6 })
  })

  it('replaces a selection', () => {
    expect(insertPlaceholder('until Friday.', 6, 12, '{end}')).toEqual({ text: 'until {end}.', cursor: 11 })
  })
})
