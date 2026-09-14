import type { AttestationEntry } from '@/lib/attester-client'
import { PERSON_CLASS, PERSON_SCHEMA_URI } from '@/lib/constants'
import {
  KEEP_ALL_SOCIALS,
  PROFILE_EXTRA_KEYS,
  type ProfileForm,
  type RecordState,
  buildDesiredRecords,
  existingForWriter,
  formFromRecords,
  hasPendingChanges,
  onChainHandle,
  splitWriteMap,
  validateProfileForm,
} from '@/lib/profile-records'
import { attestationKeys } from '@/lib/social'
import { describe, expect, it } from 'vitest'

const X_KEYS = attestationKeys('com.x')
const TG_KEYS = attestationKeys('org.telegram')

const EXISTING: RecordState = {
  class: PERSON_CLASS,
  schema: PERSON_SCHEMA_URI,
  name: 'Alice',
  description: 'Builds things',
  email: 'alice@example.com',
  'com.x': 'alice_x',
  [X_KEYS.handle]: '0xda61747374aa',
  [X_KEYS.uid]: '0xda61747374bb',
}

const form = (overrides: Partial<ProfileForm> = {}): ProfileForm => ({
  ...formFromRecords(EXISTING),
  ...overrides,
})

const xEntry: AttestationEntry = {
  platform: 'com.x',
  handle: 'alice_new',
  attester: 'atst.lighthousegov.eth',
  signerAddress: '0x0000000000000000000000000000000000000001',
  records: {
    handle: { key: X_KEYS.handle, hex: '0xda61747374c1' },
    uid: { key: X_KEYS.uid, hex: '0xda61747374c2' },
  },
}

describe('formFromRecords', () => {
  it('maps the four text records and blanks the unset ones', () => {
    expect(formFromRecords(EXISTING)).toEqual({
      name: 'Alice',
      description: 'Builds things',
      avatar: '',
      email: 'alice@example.com',
    })
  })
})

describe('onChainHandle', () => {
  it('prefers com.x and falls back to the legacy com.twitter key', () => {
    expect(onChainHandle({ 'com.x': 'a', 'com.twitter': 'b' }, 'com.x')).toBe('a')
    expect(onChainHandle({ 'com.twitter': 'b' }, 'com.x')).toBe('b')
    expect(onChainHandle({ 'com.x': '  ' }, 'com.x')).toBeNull()
    expect(onChainHandle({ 'org.telegram': 'tg' }, 'org.telegram')).toBe('tg')
  })
})

describe('validateProfileForm', () => {
  it('passes an empty or valid form', () => {
    expect(validateProfileForm(form())).toEqual({})
    expect(validateProfileForm(form({ avatar: 'ipfs://Qm', email: '' }))).toEqual({})
  })

  it('flags a malformed email and an unsupported avatar URI', () => {
    const errors = validateProfileForm(form({ email: 'nope', avatar: 'ftp://x' }))
    expect(Object.keys(errors).sort()).toEqual(['avatar', 'email'])
  })
})

describe('hasPendingChanges', () => {
  it('is false for an untouched form, even when class and schema are missing on-chain', () => {
    const { class: _c, schema: _s, ...noSchema } = EXISTING
    expect(hasPendingChanges(noSchema, form(), KEEP_ALL_SOCIALS)).toBe(false)
  })

  it('is true for a text edit or a social draft alone', () => {
    expect(hasPendingChanges(EXISTING, form({ name: 'Alicia' }), KEEP_ALL_SOCIALS)).toBe(true)
    expect(
      hasPendingChanges(EXISTING, form(), {
        ...KEEP_ALL_SOCIALS,
        'com.x': { kind: 'link', handle: 'alice_x', uid: '1' },
      }),
    ).toBe(true)
  })

  it('treats whitespace-only input as unchanged when the record is unset', () => {
    expect(hasPendingChanges(EXISTING, form({ avatar: '   ' }), KEEP_ALL_SOCIALS)).toBe(false)
  })
})

describe('buildDesiredRecords + splitWriteMap', () => {
  const build = (overrides: Partial<Parameters<typeof buildDesiredRecords>[0]> = {}) =>
    buildDesiredRecords({ form: form(), socials: KEEP_ALL_SOCIALS, attestations: [], ...overrides })

  it('writes nothing when everything already matches', () => {
    const result = splitWriteMap(EXISTING, build())
    expect(result).toEqual({ userRecords: {}, bypassRecords: {}, hasChanges: false })
  })

  it('routes schema fields to userRecords and name to bypassRecords', () => {
    const result = splitWriteMap(
      EXISTING,
      build({ form: form({ name: 'Alicia', description: 'New bio' }) }),
    )
    expect(result.userRecords).toEqual({ description: 'New bio' })
    expect(result.bypassRecords).toEqual({ name: 'Alicia' })
    expect(result.hasChanges).toBe(true)
  })

  it('deletes a cleared or whitespace-only field that is set on-chain', () => {
    const result = splitWriteMap(EXISTING, build({ form: form({ email: '  ' }) }))
    expect(result.userRecords).toEqual({ email: '' })
  })

  it('adds class and schema when missing and replaces them when different', () => {
    const { class: _c, schema: _s, ...noSchema } = EXISTING
    expect(splitWriteMap(noSchema, build()).userRecords).toEqual({
      class: PERSON_CLASS,
      schema: PERSON_SCHEMA_URI,
    })
    expect(
      splitWriteMap({ ...EXISTING, class: 'Delegate', schema: 'ipfs://other' }, build())
        .userRecords,
    ).toEqual({ class: PERSON_CLASS, schema: PERSON_SCHEMA_URI })
  })

  it('writes the handle and both attestation records for a link, using the entry verbatim', () => {
    const result = splitWriteMap(
      EXISTING,
      build({
        socials: { ...KEEP_ALL_SOCIALS, 'com.x': { kind: 'link', handle: 'alice_new', uid: '1' } },
        attestations: [xEntry],
      }),
    )
    expect(result.userRecords).toEqual({})
    expect(result.bypassRecords).toEqual({
      'com.x': 'alice_new',
      [X_KEYS.handle]: '0xda61747374c1',
      [X_KEYS.uid]: '0xda61747374c2',
    })
  })

  it('writes only the attestation records when the linked handle already matches', () => {
    const result = splitWriteMap(
      EXISTING,
      build({
        socials: { ...KEEP_ALL_SOCIALS, 'com.x': { kind: 'link', handle: 'alice_x', uid: '1' } },
        attestations: [{ ...xEntry, handle: 'alice_x' }],
      }),
    )
    expect(Object.keys(result.bypassRecords).sort()).toEqual([X_KEYS.handle, X_KEYS.uid].sort())
  })

  it('throws when a link has no matching attestation', () => {
    expect(() =>
      build({
        socials: { ...KEEP_ALL_SOCIALS, 'com.x': { kind: 'link', handle: 'a', uid: '1' } },
      }),
    ).toThrow(/no attestation/)
  })

  it('clears the handle, the legacy key and both attestation records on remove', () => {
    const result = splitWriteMap(
      { ...EXISTING, 'com.twitter': 'alice_old' },
      build({ socials: { ...KEEP_ALL_SOCIALS, 'com.x': { kind: 'remove' } } }),
    )
    expect(result.bypassRecords).toEqual({
      'com.x': '',
      'com.twitter': '',
      [X_KEYS.handle]: '',
      [X_KEYS.uid]: '',
    })
  })

  it('skips deletions for keys that are not set on-chain', () => {
    const result = splitWriteMap(
      { ...EXISTING, 'org.telegram': 'alice_tg' },
      build({ socials: { ...KEEP_ALL_SOCIALS, 'org.telegram': { kind: 'remove' } } }),
    )
    expect(result.bypassRecords).toEqual({ 'org.telegram': '' })
    expect(TG_KEYS.handle in result.bypassRecords).toBe(false)
  })
})

describe('existingForWriter', () => {
  it('keeps only Person schema keys', () => {
    expect(existingForWriter(EXISTING)).toEqual({
      class: PERSON_CLASS,
      schema: PERSON_SCHEMA_URI,
      description: 'Builds things',
      email: 'alice@example.com',
    })
  })
})

describe('PROFILE_EXTRA_KEYS', () => {
  it('covers name, both platforms, the legacy key and every attestation key', () => {
    expect([...PROFILE_EXTRA_KEYS].sort()).toEqual(
      [
        'name',
        'com.x',
        'com.twitter',
        'org.telegram',
        X_KEYS.handle,
        X_KEYS.uid,
        TG_KEYS.handle,
        TG_KEYS.uid,
      ].sort(),
    )
  })
})
