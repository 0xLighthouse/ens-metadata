import { findBadgeholderRow } from '@/lib/badgeholders'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { fetchBadgeholders, fetchBadgeholderRecords } = vi.hoisted(() => ({
  fetchBadgeholders: vi.fn(),
  fetchBadgeholderRecords: vi.fn(),
}))

vi.mock('@/lib/dune', () => ({ fetchBadgeholders }))
vi.mock('@/lib/rcrds', () => ({
  fetchBadgeholderRecords,
  EMPTY_PROFILE: { ensName: null, records: {} },
}))

const HOLDER = '0xabcdef0000000000000000000000000000000001'

afterEach(() => {
  fetchBadgeholders.mockReset()
  fetchBadgeholderRecords.mockReset()
})

describe('findBadgeholderRow', () => {
  it('resolves a checksummed address to the lowercased row', async () => {
    fetchBadgeholders.mockResolvedValue([{ address: HOLDER, tokenId: '1', issuedAt: 'x' }])
    fetchBadgeholderRecords.mockResolvedValue(new Map())

    const row = await findBadgeholderRow('0xAbCdEf0000000000000000000000000000000001')
    expect(row?.address).toBe(HOLDER)
  })

  it('yields undefined for an address that does not hold the badge', async () => {
    fetchBadgeholders.mockResolvedValue([{ address: HOLDER, tokenId: '1', issuedAt: 'x' }])
    fetchBadgeholderRecords.mockResolvedValue(new Map())

    await expect(
      findBadgeholderRow('0x0000000000000000000000000000000000000002'),
    ).resolves.toBeUndefined()
  })

  it('yields undefined for a malformed address without fetching', async () => {
    await expect(findBadgeholderRow('nonsense')).resolves.toBeUndefined()
    expect(fetchBadgeholders).not.toHaveBeenCalled()
  })
})
