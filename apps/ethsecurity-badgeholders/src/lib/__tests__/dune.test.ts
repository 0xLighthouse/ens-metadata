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

// Rows in the shape query 8607855 returns: lowercase hex `owner`, decimal-string `tokenId`,
// and a Dune-formatted `issuedAt` timestamp.
const resultWith = (rows: Record<string, unknown>[]) => ({ result: { rows } })
const row = (owner: string, tokenId = '1', issuedAt = '2026-04-22 06:30:47.000 UTC') => ({
  owner,
  tokenId,
  issuedAt,
})

// Captured at import time: `dune.ts` wraps its loader once, at module scope, and the hooks below
// reset every mock before the first test runs.
const cacheCall = unstableCache.mock.calls[0]

beforeEach(() => {
  vi.stubEnv('DUNE_API_KEY', 'test-key')
  // Blank out any value exported in the developer's shell, so the default query id applies.
  vi.stubEnv('DUNE_BADGELIST_QUERY_ID', '')
  getLatestResult.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
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

  it('reads the query named by DUNE_BADGELIST_QUERY_ID instead of the default', async () => {
    vi.stubEnv('DUNE_BADGELIST_QUERY_ID', '1234567')
    getLatestResult.mockResolvedValue(resultWith([]))

    await fetchBadgeholders()
    expect(getLatestResult).toHaveBeenCalledWith({ queryId: 1234567 })
  })

  it('falls back to query 8607855 and warns when DUNE_BADGELIST_QUERY_ID is not numeric', async () => {
    vi.stubEnv('DUNE_BADGELIST_QUERY_ID', 'https://dune.com/queries/1234567')
    getLatestResult.mockResolvedValue(resultWith([]))

    await fetchBadgeholders()
    expect(getLatestResult).toHaveBeenCalledWith({ queryId: 8607855 })
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('DUNE_BADGELIST_QUERY_ID'))
  })

  it('names the configured query when the fetch fails', async () => {
    vi.stubEnv('DUNE_BADGELIST_QUERY_ID', '1234567')
    getLatestResult.mockRejectedValue(new Error('503 Service Unavailable'))

    await expect(fetchBadgeholders()).resolves.toEqual([])
    expect(console.error).toHaveBeenCalledWith(
      'Failed to fetch ETHSecurity badgeholders from Dune query 1234567',
      expect.any(Error),
    )
  })

  // The query id is an argument to the cached loader, and `unstable_cache` keys on its
  // arguments, so the static key parts stay stable across query ids.
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
        row('0xAbCdEf0000000000000000000000000000000001', '132'),
        row('0x0000000000000000000000000000000000000002', '193'),
      ]),
    )

    await expect(fetchBadgeholders()).resolves.toEqual([
      {
        address: '0xabcdef0000000000000000000000000000000001',
        tokenId: '132',
        issuedAt: '2026-04-22T06:30:47.000Z',
      },
      {
        address: '0x0000000000000000000000000000000000000002',
        tokenId: '193',
        issuedAt: '2026-04-22T06:30:47.000Z',
      },
    ])
  })

  it('rewrites the Dune timestamp as ISO 8601 UTC', async () => {
    getLatestResult.mockResolvedValue(
      resultWith([
        row('0xaaaa000000000000000000000000000000000001', '1', '2026-04-13 20:19:47.000 UTC'),
      ]),
    )

    const [badgeholder] = await fetchBadgeholders()
    expect(badgeholder.issuedAt).toBe('2026-04-13T20:19:47.000Z')
    expect(new Date(badgeholder.issuedAt).toISOString()).toBe(badgeholder.issuedAt)
  })

  it('de-duplicates addresses that differ only in case', async () => {
    getLatestResult.mockResolvedValue(
      resultWith([
        row('0xAAAA000000000000000000000000000000000001', '1'),
        row('0xaaaa000000000000000000000000000000000001', '2'),
        row('0xBBBB000000000000000000000000000000000002', '3'),
      ]),
    )

    const badgeholders = await fetchBadgeholders()
    expect(badgeholders.map((b) => b.address)).toEqual([
      '0xaaaa000000000000000000000000000000000001',
      '0xbbbb000000000000000000000000000000000002',
    ])
    expect(badgeholders[0].tokenId).toBe('1')
  })

  it('skips rows whose owner is missing or not a string', async () => {
    getLatestResult.mockResolvedValue(
      resultWith([
        row('0xEEEE000000000000000000000000000000000005'),
        { ...row(''), owner: null },
        row(''),
      ]),
    )

    const badgeholders = await fetchBadgeholders()
    expect(badgeholders.map((b) => b.address)).toEqual([
      '0xeeee000000000000000000000000000000000005',
    ])
  })

  // A mismatch throws rather than returning `[]` from inside the cached loader, so it takes the
  // same uncached retry path as an outage instead of pinning an empty list for the whole TTL.
  it('returns an empty list and logs when an expected column is missing', async () => {
    getLatestResult.mockResolvedValue(
      resultWith([{ owner: '0xaaaa000000000000000000000000000000000001', tokenId: '1' }]),
    )

    await expect(fetchBadgeholders()).resolves.toEqual([])
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch ETHSecurity badgeholders'),
      expect.objectContaining({ message: expect.stringContaining('missing column(s) [issuedAt]') }),
    )
  })

  it('returns an empty list and logs when DUNE_API_KEY is unset', async () => {
    vi.stubEnv('DUNE_API_KEY', '')

    await expect(fetchBadgeholders()).resolves.toEqual([])
    expect(getLatestResult).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch ETHSecurity badgeholders'),
      expect.objectContaining({ message: 'DUNE_API_KEY is not set' }),
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
