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

import { isBasename } from '../chains/base'
import { metadataWriter } from '../write'

const L1_RESOLVER = '0xRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR' as `0x${string}`
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

// TODO: basename routing has moved to `multichainMetadataWriter`. These
// cases are rewritten against the new factory in `multichain/writer.test.ts`.
describe.skip('prepareSetMetadata for *.base.eth', () => {
  it('reads resolver from the Base registry and returns it as `to`', async () => {
    // Skipped: superseded by multichain/writer.test.ts.
  })

  it('reads existing records via direct `text(node, key)` calls on the L2 resolver', async () => {
    // Skipped: superseded by multichain/writer.test.ts.
  })

  it('skips reading existing when an explicit resolverAddress is supplied', async () => {
    // Skipped: superseded by multichain/writer.test.ts.
  })
})

describe.skip('setMetadata wrong-chain enforcement', () => {
  it('throws wrong-chain error when wallet is on chain 1 for a *.base.eth write', async () => {
    // Skipped: the wrong-chain guard now lives in the multichain wrapper. See
    // multichain/writer.test.ts.
  })

  it('passes when wallet is on chain 8453 and forwards the L2 resolver to setRecords', async () => {
    // Skipped: superseded by multichain/writer.test.ts.
  })
})

describe('non-Basename writes', () => {
  it('alice.eth uses the universal-resolver path on the supplied client', async () => {
    const wallet = {
      chain: { id: 1 },
      account: { address: ACCOUNT },
    } as unknown as WalletClient
    const mainnetClient = makeMainnetClient()
    const writer = metadataWriter({ publicClient: mainnetClient })(wallet)

    await writer.setMetadata({
      name: 'alice.eth',
      records: { description: 'hi' },
    })

    expect(mainnetClient.getEnsResolver).toHaveBeenCalled()
    expect(setRecordsMock).toHaveBeenCalledTimes(1)
    const callArgs = setRecordsMock.mock.calls[0][1] as { resolverAddress: string }
    expect(callArgs.resolverAddress).toBe(L1_RESOLVER)
  })

  it('base.eth itself is treated as a mainnet name (not a Basename)', async () => {
    const wallet = {
      // No chain set; the core writer trusts the caller-paired chain.
      account: { address: ACCOUNT },
    } as unknown as WalletClient
    const mainnetClient = makeMainnetClient()
    const writer = metadataWriter({ publicClient: mainnetClient })(wallet)

    await writer.setMetadata({
      name: 'base.eth',
      records: { description: 'hi' },
    })

    expect(mainnetClient.getEnsResolver).toHaveBeenCalled()
  })
})
