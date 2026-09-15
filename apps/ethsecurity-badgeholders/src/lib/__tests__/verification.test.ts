import type { BadgeholderRecords, BadgeholderRow, HandleField, PlainField } from '@/lib/types'
import { isProfileVerified } from '@/lib/verification'
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
  overrides: { email?: PlainField; x?: HandleField; telegram?: HandleField } = {},
): BadgeholderRow => ({
  address: '0x1234567890abcdef1234567890abcdef12345678',
  tokenId: '1',
  issuedAt: '2026-04-22T06:30:47.000Z',
  ensName: 'alice.eth',
  records: { ...EMPTY, ...overrides },
})

const attested = (handle: string): HandleField => ({ state: 'attested', handle })
const unattested = (handle: string): HandleField => ({ state: 'unattested', handle })

describe('isProfileVerified', () => {
  it('is verified when only X is attested', () => {
    expect(isProfileVerified(row({ x: attested('alice_x') }))).toBe(true)
  })

  it('is verified when only Telegram is attested', () => {
    expect(isProfileVerified(row({ telegram: attested('alice_tg') }))).toBe(true)
  })

  it('is verified when both socials are attested', () => {
    expect(isProfileVerified(row({ x: attested('alice_x'), telegram: attested('alice_tg') }))).toBe(
      true,
    )
  })

  it('is not verified when both socials are unattested', () => {
    expect(
      isProfileVerified(row({ x: unattested('alice_x'), telegram: unattested('alice_tg') })),
    ).toBe(false)
  })

  it('is not verified when both socials are empty', () => {
    expect(isProfileVerified(row())).toBe(false)
  })

  it('does not count an email, whatever the socials', () => {
    const email: PlainField = { state: 'unverifiable', handle: 'alice@example.com' }
    expect(isProfileVerified(row({ email }))).toBe(false)
    expect(
      isProfileVerified(row({ email, x: unattested('alice_x'), telegram: unattested('alice_tg') })),
    ).toBe(false)
  })
})
