import { completenessScore, populatedCount } from '@/lib/completeness'
import { sortRows } from '@/lib/sort'
import type { BadgeholderRecords, BadgeholderRow } from '@/lib/types'
import { describe, expect, it } from 'vitest'

const EMPTY: BadgeholderRecords = {
  name: null,
  description: null,
  avatar: null,
  x: { state: 'empty' },
  telegram: { state: 'empty' },
}

const row = (address: string, records: Partial<BadgeholderRecords> = {}): BadgeholderRow => ({
  address,
  tokenId: '1',
  issuedAt: '2026-04-22T06:30:47.000Z',
  ensName: `${address.slice(2, 6)}.eth`,
  records: { ...EMPTY, ...records },
})

const FULL: BadgeholderRecords = {
  name: 'Alice',
  description: 'Auditor',
  avatar: 'https://example.com/a.png',
  x: { state: 'attested', handle: 'alice' },
  telegram: { state: 'attested', handle: 'alice' },
}

describe('completenessScore', () => {
  it('scores an empty profile 0 and a fully attested one 7', () => {
    expect(completenessScore(row('0xaaaa'))).toBe(0)
    expect(completenessScore(row('0xaaaa', FULL))).toBe(7)
    expect(populatedCount(row('0xaaaa', FULL))).toBe(5)
  })

  it('ranks an attested handle above an unattested one', () => {
    const attested = row('0xaaaa', { x: { state: 'attested', handle: 'a' } })
    const unattested = row('0xaaaa', { x: { state: 'unattested', handle: 'a' } })
    expect(completenessScore(attested)).toBeGreaterThan(completenessScore(unattested))
    expect(populatedCount(attested)).toBe(populatedCount(unattested))
  })
})

describe('sortRows', () => {
  it('puts the least complete badgeholder first by default, unnamed before named', () => {
    const unnamed = { ...row('0xdddd'), ensName: null }
    const empty = row('0xaaaa')
    const partial = row('0xbbbb', { avatar: 'x' })
    const full = row('0xcccc', FULL)
    expect(sortRows([full, partial, empty, unnamed], 'completeness').map((r) => r.address)).toEqual(
      ['0xdddd', '0xaaaa', '0xbbbb', '0xcccc'],
    )
  })
})
