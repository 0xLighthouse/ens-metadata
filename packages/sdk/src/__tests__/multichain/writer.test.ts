import type { PublicClient, WalletClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setRecordsMock } = vi.hoisted(() => {
  const mock = vi.fn() as ReturnType<typeof vi.fn> & {
    makeFunctionData: ReturnType<typeof vi.fn>
  }
  mock.makeFunctionData = vi.fn(
    (_wallet: unknown, args: { resolverAddress: `0x${string}` }) => ({
      to: args.resolverAddress,
      data: '0xfakedata' as `0x${string}`,
    }),
  )
  return { setRecordsMock: mock }
})
vi.mock('@ensdomains/ensjs/wallet', () => ({
  setRecords: setRecordsMock,
}))

import { BASE_CHAIN_ID, BASE_REGISTRY } from '../../chains/base'
import { multichainMetadataEstimator, multichainMetadataWriter } from '../../multichain/writer'
import { MissingChainClientError } from '../../multichain/routing'

const L1_RESOLVER = '0xRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR' as `0x${string}`
const L2_RESOLVER = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as `0x${string}`
const ACCOUNT = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`

beforeEach(() => {
  setRecordsMock.mockReset()
  setRecordsMock.mockResolvedValue('0xfakehash')
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

function makeWallet(chainId: number | undefined): WalletClient {
  const wallet: Partial<WalletClient> = {
    account: { address: ACCOUNT } as WalletClient['account'],
  }
  if (chainId !== undefined) wallet.chain = { id: chainId } as WalletClient['chain']
  return wallet as WalletClient
}

describe('multichainMetadataEstimator — basenames', () => {
  it('reads resolver from the Base registry and returns it as `to`', async () => {
    const baseClient = makeBaseClient()
    const mainnetClient = makeMainnetClient()
    const estimator = multichainMetadataEstimator({
      publicClients: { mainnet: mainnetClient, base: baseClient },
    })

    const prepared = await estimator.prepareSetMetadata({
      name: 'foo.base.eth',
      desired: { description: 'new' },
      existing: {},
    })

    expect(prepared.to).toBe(L2_RESOLVER)
    expect(prepared.resolverAddress).toBe(L2_RESOLVER)
    expect(mainnetClient.getEnsResolver).not.toHaveBeenCalled()

    const calls = (baseClient.readContract as ReturnType<typeof vi.fn>).mock.calls
    const resolverCall = calls.find(
      (c: unknown[]) => (c[0] as { functionName?: string }).functionName === 'resolver',
    )
    expect(resolverCall).toBeDefined()
    expect((resolverCall?.[0] as { address: string }).address.toLowerCase()).toBe(
      BASE_REGISTRY.toLowerCase(),
    )
  })

  it('throws MissingChainClientError when a basename is queried without a Base client', async () => {
    const mainnetClient = makeMainnetClient()
    const estimator = multichainMetadataEstimator({
      publicClients: { mainnet: mainnetClient },
    })
    await expect(
      estimator.prepareSetMetadata({
        name: 'foo.base.eth',
        desired: { description: 'new' },
        existing: {},
      }),
    ).rejects.toBeInstanceOf(MissingChainClientError)
  })
})

describe('multichainMetadataWriter — basename writes', () => {
  it('throws wrong-chain when the Base wallet is on chain 1', async () => {
    const baseClient = makeBaseClient()
    const mainnetClient = makeMainnetClient()
    const writer = multichainMetadataWriter({
      publicClients: { mainnet: mainnetClient, base: baseClient },
      walletClients: { mainnet: makeWallet(1), base: makeWallet(1) },
    })

    let caught: unknown = null
    try {
      await writer.setMetadata({
        name: 'foo.base.eth',
        records: { description: 'new' },
        resolver: L2_RESOLVER,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toMatch(/must be connected to Base/)
    expect(setRecordsMock).not.toHaveBeenCalled()
  })

  it('passes when the Base wallet is on chain 8453 and forwards the L2 resolver to setRecords', async () => {
    const baseClient = makeBaseClient()
    const mainnetClient = makeMainnetClient()
    const writer = multichainMetadataWriter({
      publicClients: { mainnet: mainnetClient, base: baseClient },
      walletClients: { mainnet: makeWallet(1), base: makeWallet(BASE_CHAIN_ID) },
    })

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

  it('throws MissingChainClientError when a basename is written without a Base wallet/client', async () => {
    const mainnetClient = makeMainnetClient()
    const writer = multichainMetadataWriter({
      publicClients: { mainnet: mainnetClient },
      walletClients: { mainnet: makeWallet(1) },
    })

    await expect(
      writer.setMetadata({
        name: 'foo.base.eth',
        records: { description: 'new' },
        resolver: L2_RESOLVER,
      }),
    ).rejects.toBeInstanceOf(MissingChainClientError)
  })
})

describe('multichainMetadataWriter — mainnet writes', () => {
  it('alice.eth uses the mainnet writer; the Base client is untouched', async () => {
    const baseClient = makeBaseClient()
    const mainnetClient = makeMainnetClient()
    const writer = multichainMetadataWriter({
      publicClients: { mainnet: mainnetClient, base: baseClient },
      walletClients: { mainnet: makeWallet(1), base: makeWallet(BASE_CHAIN_ID) },
    })

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

  it('treats base.eth itself as a mainnet name', async () => {
    const baseClient = makeBaseClient()
    const mainnetClient = makeMainnetClient()
    const writer = multichainMetadataWriter({
      publicClients: { mainnet: mainnetClient, base: baseClient },
      walletClients: { mainnet: makeWallet(undefined), base: makeWallet(BASE_CHAIN_ID) },
    })

    await writer.setMetadata({
      name: 'base.eth',
      records: { description: 'hi' },
    })

    expect(mainnetClient.getEnsResolver).toHaveBeenCalled()
    expect(baseClient.readContract).not.toHaveBeenCalled()
  })
})
