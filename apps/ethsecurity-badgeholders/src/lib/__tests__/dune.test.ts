import { fetchBadgeholders } from '@/lib/dune'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getLatestResult, unstableCache } = vi.hoisted(() => ({
  getLatestResult: vi.fn(),
  unstableCache: vi.fn((fn: () => unknown) => fn),
}))

vi.mock('@duneanalytics/client-sdk', () => ({
  DuneClient: vi.fn(() => ({ getLatestResult })),
}))

// `unstable_cache` needs a Next runtime; pass the loader straight through instead. The call is
// still recorded so the cache key and TTL stay asserted.
vi.mock('next/cache', () => ({ unstable_cache: unstableCache }))

const resultWith = (rows: Record<string, unknown>[]) => ({ result: { rows } })

// Captured at import time: `dune.ts` wraps its loader once, at module scope, and the hooks below
// reset every mock before the first test runs.
const cacheCall = unstableCache.mock.calls[0]

beforeEach(() => {
  getLatestResult.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchBadgeholders', () => {
  // Literals, not the constants the code reads: asserting against the same constant cannot
  // catch a wrong constant, and both values are acceptance criteria for ENS-4.
  it('reads the latest result of Dune query 8607855', async () => {
    getLatestResult.mockResolvedValue(resultWith([]))

    await expect(fetchBadgeholders()).resolves.toEqual([])
    expect(getLatestResult).toHaveBeenCalledWith({ queryId: 8607855 })
  })

  it('caches the loader under a stable key for one hour', () => {
    expect(cacheCall).toEqual([
      expect.any(Function),
      ['ethsecurity-badgeholders'],
      { revalidate: 3600 },
    ])
  })

  it('maps rows onto badgeholders and lowercases every address', async () => {
    getLatestResult.mockResolvedValue(
      resultWith([
        { address: '0xAbCdEf0000000000000000000000000000000001', token_id: 1 },
        { address: '0x0000000000000000000000000000000000000002', token_id: 2 },
      ]),
    )

    await expect(fetchBadgeholders()).resolves.toEqual([
      { address: '0xabcdef0000000000000000000000000000000001', tokenId: '1' },
      { address: '0x0000000000000000000000000000000000000002', tokenId: '2' },
    ])
  })

  it('de-duplicates addresses that differ only in case', async () => {
    getLatestResult.mockResolvedValue(
      resultWith([
        { address: '0xAAAA000000000000000000000000000000000001' },
        { address: '0xaaaa000000000000000000000000000000000001' },
        { address: '0xBBBB000000000000000000000000000000000002' },
      ]),
    )

    await expect(fetchBadgeholders()).resolves.toEqual([
      { address: '0xaaaa000000000000000000000000000000000001' },
      { address: '0xbbbb000000000000000000000000000000000002' },
    ])
  })

  it('accepts the alternate column spellings', async () => {
    getLatestResult.mockResolvedValue(
      resultWith([{ Holder_Address: '0xCCCC000000000000000000000000000000000003', tokenId: '7' }]),
    )

    await expect(fetchBadgeholders()).resolves.toEqual([
      { address: '0xcccc000000000000000000000000000000000003', tokenId: '7' },
    ])
  })

  it('omits tokenId when the query exposes no token id column', async () => {
    getLatestResult.mockResolvedValue(
      resultWith([{ owner: '0xDDDD000000000000000000000000000000000004' }]),
    )

    await expect(fetchBadgeholders()).resolves.toEqual([
      { address: '0xdddd000000000000000000000000000000000004' },
    ])
  })

  it('skips rows whose address is missing or not a string', async () => {
    getLatestResult.mockResolvedValue(
      resultWith([
        { address: '0xEEEE000000000000000000000000000000000005' },
        { address: null },
        { address: '' },
      ]),
    )

    await expect(fetchBadgeholders()).resolves.toEqual([
      { address: '0xeeee000000000000000000000000000000000005' },
    ])
  })

  // A mismatch throws rather than returning `[]` from inside the cached loader, so it takes the
  // same uncached retry path as an outage instead of pinning an empty list for the whole TTL.
  it('returns an empty list and logs when no column resolves to an address', async () => {
    getLatestResult.mockResolvedValue(resultWith([{ ens_name: 'nick.eth', count: 3 }]))

    await expect(fetchBadgeholders()).resolves.toEqual([])
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch ETHSecurity badgeholders'),
      expect.objectContaining({ message: expect.stringContaining('no address column') }),
    )
  })

  it('returns an empty list and logs when the Dune request rejects', async () => {
    getLatestResult.mockRejectedValue(new Error('503 Service Unavailable'))

    await expect(fetchBadgeholders()).resolves.toEqual([])
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch ETHSecurity badgeholders'),
      expect.any(Error),
    )
  })

  it('returns an empty list and logs when Dune answers with an error payload', async () => {
    getLatestResult.mockResolvedValue({ error: { type: 'server', message: 'query failed' } })

    await expect(fetchBadgeholders()).resolves.toEqual([])
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch ETHSecurity badgeholders'),
      expect.any(Error),
    )
  })
})
