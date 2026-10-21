import { describe, expect, it } from 'vitest'
import { isNewerVersion } from '../src/shared/version'

describe('isNewerVersion', () => {
  it('compares each number, not the text', () => {
    expect(isNewerVersion('v0.10.0', '0.9.3')).toBe(true)
    expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true)
  })

  it('is false for the same or an older version', () => {
    expect(isNewerVersion('v0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.0.9', '0.1.0')).toBe(false)
  })

  it('treats missing numbers as zero and ignores suffixes', () => {
    expect(isNewerVersion('0.2', '0.2.0')).toBe(false)
    expect(isNewerVersion('0.2.0-beta', '0.1.9')).toBe(true)
  })
})
