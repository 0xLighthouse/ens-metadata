import {
  DRAFT_TTL_MS,
  type EditDraft,
  draftKey,
  parseDraft,
  serializeDraft,
} from '@/lib/edit-draft'
import { KEEP_ALL_SOCIALS } from '@/lib/profile-records'
import { describe, expect, it } from 'vitest'

const NOW = 1_700_000_000_000

const draft: EditDraft = {
  form: { name: 'Alice', description: '', avatar: '', email: 'a@b.co' },
  socials: { ...KEEP_ALL_SOCIALS, 'org.telegram': { kind: 'remove' } },
  pendingLink: 'com.x',
  savedAt: NOW,
}

describe('edit draft persistence', () => {
  it('keys by lowercased address', () => {
    expect(draftKey('0xABC')).toBe('esb:edit-draft:0xabc')
  })

  it('round-trips through serialize and parse', () => {
    expect(parseDraft(serializeDraft(draft), NOW)).toEqual(draft)
  })

  it('rejects missing, malformed and expired drafts', () => {
    expect(parseDraft(null, NOW)).toBeNull()
    expect(parseDraft('{not json', NOW)).toBeNull()
    expect(parseDraft(JSON.stringify({ form: {} }), NOW)).toBeNull()
    expect(parseDraft(serializeDraft(draft), NOW + DRAFT_TTL_MS + 1)).toBeNull()
  })

  it('falls back to keep-all socials when the stored ones are unusable', () => {
    const raw = JSON.stringify({ ...draft, socials: { 'com.x': { kind: 'bogus' } } })
    expect(parseDraft(raw, NOW)?.socials).toEqual(KEEP_ALL_SOCIALS)
  })
})
