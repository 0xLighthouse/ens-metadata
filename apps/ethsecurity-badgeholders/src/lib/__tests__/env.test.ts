import { badgeholdersDuneQueryId, parseDuneQueryId } from '@/lib/env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('parseDuneQueryId', () => {
  it('accepts a positive whole number', () => {
    expect(parseDuneQueryId('8607855')).toBe(8607855)
    expect(parseDuneQueryId('1')).toBe(1)
  })

  it('ignores surrounding whitespace', () => {
    expect(parseDuneQueryId('  1234567\n')).toBe(1234567)
  })

  it('returns null when unset or blank', () => {
    expect(parseDuneQueryId(undefined)).toBeNull()
    expect(parseDuneQueryId('')).toBeNull()
    expect(parseDuneQueryId('   ')).toBeNull()
  })

  it('returns null for anything that is not a bare positive integer', () => {
    for (const raw of [
      'https://dune.com/queries/8607855',
      'abc',
      '0',
      '-5',
      '12.5',
      '1e6',
      '0x10',
      '12 34',
      '99999999999999999999',
    ]) {
      expect(parseDuneQueryId(raw), raw).toBeNull()
    }
  })
})

describe('badgeholdersDuneQueryId', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  // A literal, not the constant: asserting against the same constant cannot catch a wrong one.
  it('defaults to query 8607855 without warning when the variable is unset', () => {
    vi.stubEnv('DUNE_BADGELIST_QUERY_ID', '')

    expect(badgeholdersDuneQueryId()).toBe(8607855)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('uses the configured id', () => {
    vi.stubEnv('DUNE_BADGELIST_QUERY_ID', '1234567')

    expect(badgeholdersDuneQueryId()).toBe(1234567)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('falls back to the default and warns on an invalid value', () => {
    vi.stubEnv('DUNE_BADGELIST_QUERY_ID', 'https://dune.com/queries/1234567')

    expect(badgeholdersDuneQueryId()).toBe(8607855)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('"https://dune.com/queries/1234567"'),
    )
  })
})
