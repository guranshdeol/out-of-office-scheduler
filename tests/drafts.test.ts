import { describe, expect, it } from 'vitest'
import { withDraft } from '../src/renderer/src/drafts'

describe('withDraft', () => {
  it('keeps an edit that differs from the saved text', () => {
    expect(withDraft({}, 'message', 'Back Monday.', 'Back soon.')).toEqual({ message: 'Back Monday.' })
  })

  it('drops the draft once it matches the saved text again', () => {
    expect(withDraft({ message: 'Back Monday.', 'override:a1': 'Ask Fabrikam' }, 'message', 'Back soon.', 'Back soon.')).toEqual({
      'override:a1': 'Ask Fabrikam'
    })
  })

  it('returns the same object when nothing changes', () => {
    const drafts = { message: 'Back Monday.' }
    expect(withDraft(drafts, 'message', 'Back Monday.', 'Back soon.')).toBe(drafts)
    expect(withDraft(drafts, 'override:a1', '', '')).toBe(drafts)
  })
})
