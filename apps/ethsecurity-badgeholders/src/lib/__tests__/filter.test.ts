import { filterRows, rowMatches } from '@/lib/filter'
import type { BadgeholderRecords, BadgeholderRow, HandleField } from '@/lib/types'
import { describe, expect, it } from 'vitest'

const EMPTY: BadgeholderRecords = {
  alias: null,
  description: null,
  avatar: null,
  email: { state: 'empty' },
  x: { state: 'empty' },
  telegram: { state: 'empty' },
}

const row = (
  address: string,
  overrides: {
    ensName?: string | null
    alias?: string | null
    description?: string | null
    x?: HandleField
    telegram?: HandleField
  } = {},
): BadgeholderRow => ({
  address,
  tokenId: '1',
  issuedAt: '2026-04-22T06:30:47.000Z',
  ensName: overrides.ensName ?? null,
  records: {
    ...EMPTY,
    alias: overrides.alias ?? null,
    description: overrides.description ?? null,
    x: overrides.x ?? EMPTY.x,
    telegram: overrides.telegram ?? EMPTY.telegram,
  },
})

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'

describe('rowMatches', () => {
  it('matches the display name', () => {
    expect(rowMatches(row(ADDRESS, { alias: 'Alice' }), 'lic')).toBe(true)
  })

  it('matches the ENS name, including when a display name takes the primary slot', () => {
    expect(rowMatches(row(ADDRESS, { ensName: 'alice.eth' }), 'alice.eth')).toBe(true)
    expect(rowMatches(row(ADDRESS, { alias: 'Alice', ensName: 'wonder.eth' }), 'wonder')).toBe(true)
  })

  it('matches anywhere in the full address, not just the shortened form', () => {
    expect(rowMatches(row(ADDRESS), '90abcdef1234')).toBe(true)
  })

  it('matches X and Telegram handles, with or without a leading @', () => {
    const r = row(ADDRESS, {
      x: { state: 'attested', handle: 'alice_x' },
      telegram: { state: 'unattested', handle: 'alice_tg' },
    })
    expect(rowMatches(r, 'alice_x')).toBe(true)
    expect(rowMatches(r, '@alice_tg')).toBe(true)
  })

  it('is case-insensitive in both directions', () => {
    expect(rowMatches(row(ADDRESS, { alias: 'Alice' }), 'ALICE')).toBe(true)
    expect(rowMatches(row(ADDRESS, { ensName: 'ALICE.ETH' }), 'alice.eth')).toBe(true)
    expect(rowMatches(row(ADDRESS), '0X1234567890ABCDEF')).toBe(true)
  })

  it('ignores surrounding whitespace', () => {
    expect(rowMatches(row(ADDRESS, { alias: 'Alice' }), '  alice  ')).toBe(true)
  })

  it('matches every row on a blank query', () => {
    expect(rowMatches(row(ADDRESS), '')).toBe(true)
    expect(rowMatches(row(ADDRESS), '   ')).toBe(true)
  })

  it('does not match fields outside the list', () => {
    expect(rowMatches(row(ADDRESS, { description: 'security researcher' }), 'researcher')).toBe(
      false,
    )
  })
})

describe('filterRows', () => {
  const rows = [
    row('0xaaaa', { alias: 'Alice' }),
    row('0xbbbb', { ensName: 'bob.eth' }),
    row('0xcccc', { alias: 'Alicia', ensName: 'carol.eth' }),
  ]

  it('keeps matching rows in their original order', () => {
    expect(filterRows(rows, 'ali').map((r) => r.address)).toEqual(['0xaaaa', '0xcccc'])
  })

  it('returns every row on a blank query', () => {
    expect(filterRows(rows, ' ')).toEqual(rows)
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterRows(rows, 'zzz')).toEqual([])
  })
})
