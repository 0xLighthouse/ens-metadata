import { rowLabel, sortIdentity } from '@/lib/identity'
import { DEFAULT_SORT, SORT_OPTIONS, sortDescription, sortRows } from '@/lib/sort'
import type { BadgeholderRecords, BadgeholderRow } from '@/lib/types'
import { shortenAddress } from '@/lib/utils'
import { describe, expect, it } from 'vitest'

const EMPTY: BadgeholderRecords = {
  name: null,
  description: null,
  avatar: null,
  email: { state: 'empty' },
  x: { state: 'empty' },
  telegram: { state: 'empty' },
}

const row = (
  address: string,
  overrides: { tokenId?: string; ensName?: string | null; name?: string | null } = {},
): BadgeholderRow => ({
  address,
  tokenId: overrides.tokenId ?? '1',
  issuedAt: '2026-04-22T06:30:47.000Z',
  ensName: overrides.ensName ?? null,
  records: { ...EMPTY, name: overrides.name ?? null },
})

describe('sortRows: badge', () => {
  it('sorts numerically ascending, not lexicographically', () => {
    const rows = [
      row('0xaaaa', { tokenId: '10' }),
      row('0xbbbb', { tokenId: '1' }),
      row('0xcccc', { tokenId: '2' }),
    ]
    expect(sortRows(rows, 'badge', 'asc').map((r) => r.tokenId)).toEqual(['1', '2', '10'])
  })

  it('descending is the exact reverse', () => {
    const rows = [
      row('0xaaaa', { tokenId: '10' }),
      row('0xbbbb', { tokenId: '1' }),
      row('0xcccc', { tokenId: '2' }),
    ]
    expect(sortRows(rows, 'badge', 'desc').map((r) => r.tokenId)).toEqual(['10', '2', '1'])
  })

  it('orders a uint256-scale pair correctly, where Number() would tie', () => {
    const rows = [
      row('0xaaaa', { tokenId: '9007199254740993' }),
      row('0xbbbb', { tokenId: '9007199254740992' }),
    ]
    expect(sortRows(rows, 'badge', 'asc').map((r) => r.tokenId)).toEqual([
      '9007199254740992',
      '9007199254740993',
    ])
  })
})

describe('sortRows: name', () => {
  it('prefers the display name over the ENS name', () => {
    // Addresses run opposite to the expected result, so an address-keyed sort would fail this.
    const rows = [
      row('0xbbbb', { name: 'Alice', ensName: 'zzzz.eth' }),
      row('0xaaaa', { name: 'Bob', ensName: 'aaaa.eth' }),
    ]
    expect(sortRows(rows, 'name', 'asc').map((r) => r.address)).toEqual(['0xbbbb', '0xaaaa'])
  })

  it('falls back to the ENS name without consulting the address', () => {
    // Addresses again run opposite to the expected result.
    const rows = [row('0xbbbb', { ensName: 'alice.eth' }), row('0xaaaa', { ensName: 'bob.eth' })]
    expect(sortRows(rows, 'name', 'asc').map((r) => r.address)).toEqual(['0xbbbb', '0xaaaa'])
  })

  it('trails address-only rows behind named rows, ascending', () => {
    // 'Alice' collates after the bare string '0xaaaa', so this only passes if named rows are
    // grouped ahead of address-only ones rather than compared plain-alphabetically.
    const rows = [row('0xaaaa'), row('0xzzzz', { name: 'Alice' })]
    expect(sortRows(rows, 'name', 'asc').map((r) => r.address)).toEqual(['0xzzzz', '0xaaaa'])
  })

  it('still trails address-only rows behind named rows, descending', () => {
    const rows = [
      row('0xnamed1', { name: 'Alice' }),
      row('0xnamed2', { name: 'Bob' }),
      row('0xaaaa'),
      row('0xbbbb'),
    ]
    // Both groups reverse internally, but the address-only group never jumps ahead of the named one.
    expect(sortRows(rows, 'name', 'desc').map((r) => r.address)).toEqual([
      '0xnamed2',
      '0xnamed1',
      '0xbbbb',
      '0xaaaa',
    ])
  })

  it('folds case', () => {
    const rows = [row('0x1', { name: 'Bob' }), row('0x2', { name: 'alice' })]
    expect(sortRows(rows, 'name', 'asc').map((r) => r.records.name)).toEqual(['alice', 'Bob'])
  })

  it('breaks a name tie by address, in both directions', () => {
    const rows = [row('0xbbbb', { name: 'Alice' }), row('0xaaaa', { name: 'Alice' })]
    expect(sortRows(rows, 'name', 'asc').map((r) => r.address)).toEqual(['0xaaaa', '0xbbbb'])
    expect(sortRows(rows, 'name', 'desc').map((r) => r.address)).toEqual(['0xaaaa', '0xbbbb'])
  })
})

describe('sortRows: address', () => {
  it('sorts hex-lexicographically, not numerically', () => {
    // Under numeric collation the digit run "10" outweighs "9", putting 0x10... after 0x9f...;
    // plain hex ordering must put it first.
    const rows = [
      row('0x9fbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      row('0x10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ]
    expect(sortRows(rows, 'address', 'asc').map((r) => r.address)).toEqual([
      '0x10aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0x9fbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ])
  })

  it('ignores casing', () => {
    const rows = [
      row('0xBBBBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      row('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ]
    expect(sortRows(rows, 'address', 'asc').map((r) => r.address)).toEqual([
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0xBBBBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ])
  })
})

describe('sortRows', () => {
  it('does not mutate its input', () => {
    const rows = [row('0xcccc'), row('0xaaaa'), row('0xbbbb')]
    const snapshot = [...rows]
    sortRows(rows, 'address', 'asc')
    expect(rows).toEqual(snapshot)
  })
})

describe('sortDescription', () => {
  it('describes badge sort', () => {
    expect(sortDescription({ key: 'badge', direction: 'asc' })).toBe(
      'Sorted by badge number, lowest first',
    )
    expect(sortDescription({ key: 'badge', direction: 'desc' })).toBe(
      'Sorted by badge number, highest first',
    )
  })

  it('describes name sort', () => {
    expect(sortDescription({ key: 'name', direction: 'asc' })).toBe('Sorted by name, A to Z')
    expect(sortDescription({ key: 'name', direction: 'desc' })).toBe('Sorted by name, Z to A')
  })

  it('describes address sort', () => {
    expect(sortDescription({ key: 'address', direction: 'asc' })).toBe('Sorted by address, A to Z')
    expect(sortDescription({ key: 'address', direction: 'desc' })).toBe('Sorted by address, Z to A')
  })
})

describe('defaults', () => {
  it('defaults to badge, ascending', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'badge', direction: 'asc' })
  })

  it('offers exactly the three sort keys', () => {
    expect(SORT_OPTIONS.map((option) => option.value).sort()).toEqual(['address', 'badge', 'name'])
  })
})

describe('sortIdentity', () => {
  it('uses the display name when set', () => {
    expect(sortIdentity(row('0xaaaa', { name: 'Alice', ensName: 'alice.eth' }))).toBe('Alice')
  })

  it('falls back to the ENS name without a display name', () => {
    expect(sortIdentity(row('0xaaaa', { ensName: 'alice.eth' }))).toBe('alice.eth')
  })

  it('falls back to the address without a display or ENS name', () => {
    expect(sortIdentity(row('0xaaaa'))).toBe('0xaaaa')
  })
})

describe('rowLabel', () => {
  it('uses the display name as primary and the ENS name as secondary', () => {
    const r = row('0xaaaa', { name: 'Alice', ensName: 'alice.eth' })
    expect(rowLabel(r)).toEqual({ primary: 'Alice', secondary: 'alice.eth' })
  })

  it('uses the ENS name as primary with no secondary', () => {
    const r = row('0xaaaa', { ensName: 'alice.eth' })
    expect(rowLabel(r)).toEqual({ primary: 'alice.eth', secondary: null })
  })

  it('uses the shortened address as primary with no secondary', () => {
    const r = row('0x1234567890abcdef1234567890abcdef12345678')
    expect(rowLabel(r)).toEqual({ primary: shortenAddress(r.address), secondary: null })
  })
})
