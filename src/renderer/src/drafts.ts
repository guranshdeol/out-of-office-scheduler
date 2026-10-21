/** Unsaved message edits, keyed by editor, kept in App so they survive switching tabs. */
export type Drafts = Record<string, string>

export type SetDraft = (key: string, value: string, saved: string) => void

/** Returns `drafts` with `value` stored under `key`, or without `key` once `value` matches what is saved. */
export function withDraft(drafts: Drafts, key: string, value: string, saved: string): Drafts {
  if (value === saved) {
    if (!(key in drafts)) return drafts
    const { [key]: _, ...rest } = drafts
    return rest
  }
  return drafts[key] === value ? drafts : { ...drafts, [key]: value }
}
