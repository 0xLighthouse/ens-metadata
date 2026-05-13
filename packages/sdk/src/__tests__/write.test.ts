import type { Schema } from '@ensmetadata/schemas/types'
import type { PublicClient, WalletClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { metadataEstimator, metadataWriter } from '../write'

const RESOLVER = '0xRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR' as `0x${string}`

const sampleSchema: Schema = {
  $id: 'sample',
  source: 'test',
  title: 'Sample',
  version: '1.0.0',
  description: 'sample',
  type: 'object',
  properties: {
    description: { type: 'string', description: 'desc' },
  },
  required: [],
}

function makePublicClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getEnsResolver: async () => RESOLVER,
    getEnsText: async () => null,
    estimateGas: async () => 50_000n,
    estimateFeesPerGas: async () => ({ maxFeePerGas: 2_000_000_000n }),
    getBalance: async () => 1_000_000_000_000_000_000n,
    ...overrides,
  } as unknown as PublicClient
}

describe('prepareSetMetadata', () => {
  it('reads existing when not provided', async () => {
    const reads: string[] = []
    const client = makePublicClient({
      getEnsText: async ({ key }: { key: string }) => {
        reads.push(key)
        return key === 'description' ? 'old' : null
      },
    })
    const writer = metadataEstimator({ publicClient: client })
    const prepared = await writer.prepareSetMetadata({
      name: 'myagent.eth',
      desired: { description: 'new', avatar: 'ipfs://a' },
    })
    expect(reads.sort()).toEqual(['avatar', 'description'])
    expect(prepared.existing).toEqual({ description: 'old', avatar: null })
    expect(prepared.delta.changes).toEqual({ description: 'new', avatar: 'ipfs://a' })
    expect(prepared.calldata).toMatch(/^0x/)
    expect(prepared.to).toBe(RESOLVER)
  })

  it('skips reading when existing is supplied', async () => {
    const getEnsText = vi.fn()
    const client = makePublicClient({ getEnsText })
    const writer = metadataEstimator({ publicClient: client })
    const prepared = await writer.prepareSetMetadata({
      name: 'myagent.eth',
      desired: { description: 'new' },
      existing: { description: 'old' },
    })
    expect(getEnsText).not.toHaveBeenCalled()
    expect(prepared.delta.changes).toEqual({ description: 'new' })
  })

  it('throws the validation result when validation fails', async () => {
    const client = makePublicClient()
    const writer = metadataEstimator({ publicClient: client })
    const strictSchema: Schema = {
      ...sampleSchema,
      properties: {
        description: { type: 'string', description: 'desc' },
      },
    }
    await expect(
      writer.prepareSetMetadata({
        name: 'myagent.eth',
        desired: { description: 'new', notARealKey: 'oops' },
        existing: {},
        schema: strictSchema,
      }),
    ).rejects.toMatchObject({
      success: false,
      errors: expect.any(Array),
    })
  })

  it('returns null calldata when delta is a no-op', async () => {
    const client = makePublicClient()
    const writer = metadataEstimator({ publicClient: client })
    const prepared = await writer.prepareSetMetadata({
      name: 'myagent.eth',
      desired: { description: 'same' },
      existing: { description: 'same' },
    })
    expect(prepared.delta.changes).toEqual({})
    expect(prepared.delta.deleted).toEqual([])
    expect(prepared.calldata).toBeNull()
  })

  it('produces single-call calldata for one record', async () => {
    const client = makePublicClient()
    const writer = metadataEstimator({ publicClient: client })
    const single = await writer.prepareSetMetadata({
      name: 'myagent.eth',
      desired: { description: 'new' },
      existing: { description: null },
    })
    const multi = await writer.prepareSetMetadata({
      name: 'myagent.eth',
      desired: { description: 'new', avatar: 'ipfs://a' },
      existing: { description: null, avatar: null },
    })
    expect(single.calldata).toMatch(/^0x/)
    expect(multi.calldata).toMatch(/^0x/)
    // Multicall encoding is longer than a single setText call.
    expect((multi.calldata as string).length).toBeGreaterThan((single.calldata as string).length)
  })

  it('reuses a supplied resolverAddress without an RPC call', async () => {
    const getEnsResolver = vi.fn()
    const client = makePublicClient({ getEnsResolver })
    const writer = metadataEstimator({ publicClient: client })
    const prepared = await writer.prepareSetMetadata({
      name: 'myagent.eth',
      desired: { description: 'new' },
      existing: { description: null },
      resolverAddress: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    })
    expect(getEnsResolver).not.toHaveBeenCalled()
    expect(prepared.resolverAddress).toBe('0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC')
  })
})

describe('estimateSetMetadata', () => {
  it('returns gas/fee/balance derived from the public client', async () => {
    const client = makePublicClient()
    const writer = metadataEstimator({ publicClient: client })
    const est = await writer.estimateSetMetadata({
      name: 'myagent.eth',
      desired: { description: 'new' },
      existing: { description: 'old' },
      account: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    })
    expect(est.gas).toBe(50_000n)
    expect(est.maxFeePerGas).toBe(2_000_000_000n)
    expect(est.costWei).toBe(50_000n * 2_000_000_000n)
    expect(est.balance).toBe(1_000_000_000_000_000_000n)
  })

  it('returns zero gas when delta is a no-op', async () => {
    const estimateGas = vi.fn()
    const client = makePublicClient({ estimateGas })
    const writer = metadataEstimator({ publicClient: client })
    const est = await writer.estimateSetMetadata({
      name: 'myagent.eth',
      desired: { description: 'same' },
      existing: { description: 'same' },
      account: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    })
    expect(estimateGas).not.toHaveBeenCalled()
    expect(est.gas).toBe(0n)
    expect(est.costWei).toBe(0n)
  })
})

describe('setMetadataWithDelta', () => {
  it('throws when delta is empty', async () => {
    const client = makePublicClient()
    const wallet = {
      account: { address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    } as unknown as WalletClient
    const writer = metadataWriter({ publicClient: client })(wallet)
    await expect(
      writer.setMetadataWithDelta({
        name: 'myagent.eth',
        desired: { description: 'same' },
        existing: { description: 'same' },
      }),
    ).rejects.toThrow(/No records to write/)
  })
})
