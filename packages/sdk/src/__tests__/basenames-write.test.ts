import type { PublicClient, WalletClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setRecordsMock } = vi.hoisted(() => ({ setRecordsMock: vi.fn() }))
vi.mock('@ensdomains/ensjs/wallet', () => ({
  setRecords: setRecordsMock,
}))

import { BASE_CHAIN_ID, BASE_REGISTRY, isBasename } from '../internal'
import { MetadataWriteError, metadataEstimator, metadataWriter } from '../write'

const L1_RESOLVER = '0xRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR' as `0x${string}`
const L2_RESOLVER = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as `0x${string}`
const ACCOUNT = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`

beforeEach(() => {
  setRecordsMock.mockReset()
  setRecordsMock.mockResolvedValue('0xfakehash')
})

describe('isBasename', () => {
  it('accepts strict subdomains of base.eth', () => {
    expect(isBasename('vitalik.base.eth')).toBe(true)
    expect(isBasename('Foo.Base.Eth')).toBe(true)
    expect(isBasename('team.foo.base.eth')).toBe(true)
  })

  it('rejects base.eth itself', () => {
    expect(isBasename('base.eth')).toBe(false)
  })

  it('rejects mainnet names', () => {
    expect(isBasename('vitalik.eth')).toBe(false)
  })

  it('rejects names that only happen to contain the substring', () => {
    expect(isBasename('foo.basesomething.eth')).toBe(false)
  })
})

function makeMainnetClient(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    getEnsResolver: vi.fn(async () => L1_RESOLVER),
    getEnsText: vi.fn(async () => null),
    getEnsAddress: vi.fn(async () => null),
    estimateGas: vi.fn(async () => 50_000n),
    estimateFeesPerGas: vi.fn(async () => ({ maxFeePerGas: 2_000_000_000n })),
    getBalance: vi.fn(async () => 1_000_000_000_000_000_000n),
    readContract: vi.fn(),
    ...overrides,
  } as unknown as PublicClient
}

function makeBaseClient(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'resolver') return L2_RESOLVER
      if (functionName === 'text') return ''
      return ''
    }),
    estimateGas: vi.fn(async () => 50_000n),
    estimateFeesPerGas: vi.fn(async () => ({ maxFeePerGas: 1_000_000n })),
    getBalance: vi.fn(async () => 1_000_000_000_000_000_000n),
    ...overrides,
  } as unknown as PublicClient
}

describe('prepareSetMetadata for *.base.eth', () => {
  it('reads resolver from the Base registry and returns it as `to`', async () => {
    const baseClient = makeBaseClient()
    const mainnetClient = makeMainnetClient()
    const estimator = metadataEstimator({
      publicClient: mainnetClient,
      basePublicClient: baseClient,
    })

    const prepared = await estimator.prepareSetMetadata({
      name: 'foo.base.eth',
      desired: { description: 'new' },
      existing: {},
    })

    expect(prepared.to).toBe(L2_RESOLVER)
    expect(prepared.resolverAddress).toBe(L2_RESOLVER)

    // Mainnet universal-resolver path is not used.
    expect(mainnetClient.getEnsResolver).not.toHaveBeenCalled()

    // The resolver is read from the Base registry.
    const calls = (baseClient.readContract as ReturnType<typeof vi.fn>).mock.calls
    const resolverCall = calls.find(
      (c: unknown[]) => (c[0] as { functionName?: string }).functionName === 'resolver',
    )
    expect(resolverCall).toBeDefined()
    expect((resolverCall?.[0] as { address: string }).address.toLowerCase()).toBe(
      BASE_REGISTRY.toLowerCase(),
    )
  })

  it('reads existing records via direct `text(node, key)` calls on the L2 resolver', async () => {
    const baseRead = vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'resolver') return L2_RESOLVER
      if (functionName === 'text') return 'old'
      return ''
    })
    const baseClient = makeBaseClient({ readContract: baseRead })
    const mainnetClient = makeMainnetClient()
    const estimator = metadataEstimator({
      publicClient: mainnetClient,
      basePublicClient: baseClient,
    })

    const prepared = await estimator.prepareSetMetadata({
      name: 'foo.base.eth',
      desired: { description: 'new' },
    })

    expect(mainnetClient.getEnsText).not.toHaveBeenCalled()
    expect(prepared.existing).toEqual({ description: 'old' })

    const textCalls = baseRead.mock.calls.filter(
      (c: unknown[]) => (c[0] as { functionName?: string }).functionName === 'text',
    )
    expect(textCalls.length).toBeGreaterThan(0)
    expect((textCalls[0]?.[0] as { address: string }).address).toBe(L2_RESOLVER)
  })

  it('skips reading existing when an explicit resolverAddress is supplied', async () => {
    const baseClient = makeBaseClient()
    const mainnetClient = makeMainnetClient()
    const estimator = metadataEstimator({
      publicClient: mainnetClient,
      basePublicClient: baseClient,
    })
    const prepared = await estimator.prepareSetMetadata({
      name: 'foo.base.eth',
      desired: { description: 'new' },
      existing: {},
      resolverAddress: L2_RESOLVER,
    })
    expect(prepared.resolverAddress).toBe(L2_RESOLVER)
    expect(baseClient.readContract).not.toHaveBeenCalled()
  })
})

describe('setMetadata wrong-chain enforcement', () => {
  it('throws MetadataWriteError with code "wrong-chain" when wallet is on chain 1 for a *.base.eth write', async () => {
    const wallet = {
      chain: { id: 1 },
      account: { address: ACCOUNT },
    } as unknown as WalletClient
    const baseClient = makeBaseClient()
    const mainnetClient = makeMainnetClient()
    const writer = metadataWriter({
      publicClient: mainnetClient,
      basePublicClient: baseClient,
    })(wallet)

    let caught: unknown = null
    try {
      await writer.setMetadata({
        name: 'foo.base.eth',
        records: { description: 'new' },
        resolverAddress: L2_RESOLVER,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(MetadataWriteError)
    expect((caught as MetadataWriteError).code).toBe('wrong-chain')
    expect(setRecordsMock).not.toHaveBeenCalled()
  })

  it('passes when wallet is on chain 8453 and forwards the L2 resolver to setRecords', async () => {
    const wallet = {
      chain: { id: BASE_CHAIN_ID },
      account: { address: ACCOUNT },
    } as unknown as WalletClient
    const baseClient = makeBaseClient()
    const mainnetClient = makeMainnetClient()
    const writer = metadataWriter({
      publicClient: mainnetClient,
      basePublicClient: baseClient,
    })(wallet)

    const result = await writer.setMetadata({
      name: 'foo.base.eth',
      records: { description: 'new' },
    })

    expect(result.txHash).toBe('0xfakehash')
    expect(setRecordsMock).toHaveBeenCalledTimes(1)
    const callArgs = setRecordsMock.mock.calls[0][1] as {
      name: string
      resolverAddress: string
    }
    expect(callArgs.name).toBe('foo.base.eth')
    expect(callArgs.resolverAddress).toBe(L2_RESOLVER)
  })
})

describe('non-Basename writes', () => {
  it('alice.eth still uses the universal-resolver path; the Base client is untouched', async () => {
    const wallet = {
      chain: { id: 1 },
      account: { address: ACCOUNT },
    } as unknown as WalletClient
    const baseClient = makeBaseClient()
    const mainnetClient = makeMainnetClient()
    const writer = metadataWriter({
      publicClient: mainnetClient,
      basePublicClient: baseClient,
    })(wallet)

    await writer.setMetadata({
      name: 'alice.eth',
      records: { description: 'hi' },
    })

    expect(mainnetClient.getEnsResolver).toHaveBeenCalled()
    expect(baseClient.readContract).not.toHaveBeenCalled()
    expect(setRecordsMock).toHaveBeenCalledTimes(1)
    const callArgs = setRecordsMock.mock.calls[0][1] as { resolverAddress: string }
    expect(callArgs.resolverAddress).toBe(L1_RESOLVER)
  })

  it('base.eth itself is treated as a mainnet name (not a Basename)', async () => {
    const wallet = {
      // No chain set; mainnet path doesn't enforce chain.
      account: { address: ACCOUNT },
    } as unknown as WalletClient
    const baseClient = makeBaseClient()
    const mainnetClient = makeMainnetClient()
    const writer = metadataWriter({
      publicClient: mainnetClient,
      basePublicClient: baseClient,
    })(wallet)

    await writer.setMetadata({
      name: 'base.eth',
      records: { description: 'hi' },
    })

    expect(mainnetClient.getEnsResolver).toHaveBeenCalled()
    expect(baseClient.readContract).not.toHaveBeenCalled()
  })
})
