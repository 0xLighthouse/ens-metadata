import { BADGEHOLDERS_DUNE_QUERY_ID } from '@/lib/constants'
import { fetchBadgeholders } from '@/lib/dune'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getLatestResult } = vi.hoisted(() => ({ getLatestResult: vi.fn() }))

vi.mock('@duneanalytics/client-sdk', () => ({
  DuneClient: vi.fn(() => ({ getLatestResult })),
}))

// `unstable_cache` needs a Next runtime; pass the loader straight through instead.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
}))

const resultWith = (rows: Record<string, unknown>[]) => ({ result: { rows } })

beforeEach(() => {
  getLatestResult.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchBadgeholders', () => {
  it('reads the latest result of the badgeholder query', async () => {
    getLatestResult.mockResolvedValue(resultWith([]))

    await expect(fetchBadgeholders()).resolves.toEqual([])
    expect(getLatestResult).toHaveBeenCalledWith({ queryId: BADGEHOLDERS_DUNE_QUERY_ID })
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

  it('returns an empty list and logs when no column resolves to an address', async () => {
    getLatestResult.mockResolvedValue(resultWith([{ ens_name: 'nick.eth', count: 3 }]))

    await expect(fetchBadgeholders()).resolves.toEqual([])
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('no address column'))
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
