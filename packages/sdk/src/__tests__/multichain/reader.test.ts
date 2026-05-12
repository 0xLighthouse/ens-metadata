import type { PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { BASE_REGISTRY } from '../../chains/base'
import { multichainMetadataReader } from '../../multichain/reader'
import { MissingChainClientError } from '../../multichain/routing'

const L2_RESOLVER = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as `0x${string}`
const L1_RESOLVER = '0xRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR' as `0x${string}`

type ReadCall = {
  address: string
  functionName: string
  args: readonly unknown[]
}

function makeMainnetClient(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    extend: vi.fn(function (this: unknown, ext: (c: unknown) => unknown) {
      return { ...(this as Record<string, unknown>), ...(ext(this) as Record<string, unknown>) }
    }),
    getEnsResolver: vi.fn(async () => L1_RESOLVER),
    getEnsText: vi.fn(async ({ key }: { key: string }) => `mainnet:${key}`),
    readContract: vi.fn(),
    ...overrides,
  } as unknown as PublicClient
}

function makeBaseClient(textsByKey: Record<string, string> = {}): {
  client: PublicClient
  read: ReturnType<typeof vi.fn>
} {
  const read = vi.fn(async (call: ReadCall) => {
    if (call.functionName === 'resolver' && call.address.toLowerCase() === BASE_REGISTRY) {
      return L2_RESOLVER
    }
    if (call.functionName === 'text') {
      const key = call.args[1] as string
      return textsByKey[key] ?? ''
    }
    return ''
  })
  return {
    client: { readContract: read } as unknown as PublicClient,
    read,
  }
}

describe('multichainMetadataReader — basenames', () => {
  it('routes a *.base.eth name to the Base client and reads via the L2 registry', async () => {
    const mainnet = makeMainnetClient()
    const { client: baseClient, read } = makeBaseClient({
      description: 'on base',
      avatar: 'ipfs://avatar',
    })

    const reader = multichainMetadataReader({ mainnet, base: baseClient })
    const result = await reader.getMetadata({
      name: 'foo.base.eth',
      keys: ['description', 'avatar'],
    })

    expect(result.properties).toEqual({ description: 'on base', avatar: 'ipfs://avatar' })

    expect(mainnet.getEnsResolver).not.toHaveBeenCalled()
    expect(mainnet.getEnsText).not.toHaveBeenCalled()

    const fns = read.mock.calls.map((c: unknown[]) => (c[0] as ReadCall).functionName)
    expect(fns).toContain('resolver')
    expect(fns).toContain('text')
  })

  it('returns an empty result when the Base registry has no resolver set', async () => {
    const mainnet = makeMainnetClient()
    const baseClient = {
      readContract: vi.fn(async (call: ReadCall) => {
        if (call.functionName === 'resolver') return '0x0000000000000000000000000000000000000000'
        return ''
      }),
    } as unknown as PublicClient
    const reader = multichainMetadataReader({ mainnet, base: baseClient })
    const result = await reader.getMetadata({ name: 'foo.base.eth', keys: ['description'] })
    expect(result.properties).toEqual({ description: null })
  })

  it('handles deeper subnames like team.foo.base.eth', async () => {
    const mainnet = makeMainnetClient()
    const { client: baseClient } = makeBaseClient({ description: 'deep' })
    const reader = multichainMetadataReader({ mainnet, base: baseClient })
    const result = await reader.getMetadata({
      name: 'team.foo.base.eth',
      keys: ['description'],
    })
    expect(result.properties.description).toBe('deep')
  })

  it('throws MissingChainClientError when a basename is queried but no Base client is provided', async () => {
    const mainnet = makeMainnetClient()
    const reader = multichainMetadataReader({ mainnet })

    await expect(
      reader.getMetadata({ name: 'foo.base.eth', keys: ['description'] }),
    ).rejects.toBeInstanceOf(MissingChainClientError)
  })

  it('getSchema also routes basenames through the Base client', async () => {
    const mainnet = makeMainnetClient()
    const { client: baseClient } = makeBaseClient({ schema: 'ipfs://Qm', class: 'Agent' })
    const reader = multichainMetadataReader({ mainnet, base: baseClient })
    const result = await reader.getSchema({ name: 'foo.base.eth' })
    expect(result.schema).toBe('ipfs://Qm')
    expect(result.class).toBe('Agent')
    expect(mainnet.getEnsText).not.toHaveBeenCalled()
  })
})

describe('multichainMetadataReader — mainnet', () => {
  it('routes plain *.eth names to the mainnet client', async () => {
    const mainnet = makeMainnetClient({
      getEnsText: vi.fn(async ({ key }: { key: string }) =>
        key === 'description' ? 'mainnet desc' : null,
      ),
    })
    const baseRead = vi.fn()
    const baseClient = { readContract: baseRead } as unknown as PublicClient

    const reader = multichainMetadataReader({ mainnet, base: baseClient })
    const result = await reader.getMetadata({ name: 'alice.eth', keys: ['description'] })

    expect(result.properties.description).toBe('mainnet desc')
    expect(baseRead).not.toHaveBeenCalled()
  })

  it('treats base.eth itself as a mainnet name', async () => {
    const mainnet = makeMainnetClient({
      getEnsText: vi.fn(async () => null),
    })
    const baseRead = vi.fn()
    const baseClient = { readContract: baseRead } as unknown as PublicClient
    const reader = multichainMetadataReader({ mainnet, base: baseClient })
    await reader.getMetadata({ name: 'base.eth', keys: ['description'] })
    expect(mainnet.getEnsText).toHaveBeenCalled()
    expect(baseRead).not.toHaveBeenCalled()
  })
})
