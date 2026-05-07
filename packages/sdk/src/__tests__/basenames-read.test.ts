import type { PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { BASE_REGISTRY } from '../internal'
import { metadataReader } from '../read'
import {
  getResolverAddress,
  getResolverAddressStrict,
  readTextRecords,
  readTextRecordsStrict,
} from '../read-helpers'

const L2_RESOLVER = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as `0x${string}`
const L1_RESOLVER = '0xRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR' as `0x${string}`
const L1_ADDRESS = '0x1111111111111111111111111111111111111111'
const L2_ADDRESS_BYTES = '0x2222222222222222222222222222222222222222' as `0x${string}`

type ReadCall = {
  address: string
  functionName: string
  args: readonly unknown[]
}

function makeMainnetClient(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    getEnsResolver: vi.fn(async () => L1_RESOLVER),
    getEnsText: vi.fn(async ({ key }: { key: string }) => `mainnet:${key}`),
    getEnsAddress: vi.fn(async () => L1_ADDRESS),
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
    if (call.functionName === 'addr') {
      return L2_ADDRESS_BYTES
    }
    return ''
  })
  return {
    client: { readContract: read } as unknown as PublicClient,
    read,
  }
}

describe('metadataReader.getMetadata for *.base.eth', () => {
  it('reads from the L2 resolver and never from the mainnet universal resolver', async () => {
    const mainnet = makeMainnetClient()
    const { client: baseClient, read } = makeBaseClient({
      description: 'on base',
      avatar: 'ipfs://avatar',
    })

    const reader = metadataReader({ basePublicClient: baseClient })(mainnet)
    const result = await reader.getMetadata({
      name: 'foo.base.eth',
      keys: ['description', 'avatar'],
    })

    expect(result.resolver).toBe(L2_RESOLVER)
    expect(result.address).toBe(L2_ADDRESS_BYTES)
    expect(result.properties).toEqual({ description: 'on base', avatar: 'ipfs://avatar' })

    expect(mainnet.getEnsResolver).not.toHaveBeenCalled()
    expect(mainnet.getEnsText).not.toHaveBeenCalled()
    expect(mainnet.getEnsAddress).not.toHaveBeenCalled()

    const fns = read.mock.calls.map((c: unknown[]) => (c[0] as ReadCall).functionName)
    expect(fns).toContain('resolver')
    expect(fns).toContain('text')
    expect(fns).toContain('addr')
  })

  it('falls back to empty result when the registry has no resolver set', async () => {
    const mainnet = makeMainnetClient()
    const baseClient = {
      readContract: vi.fn(async (call: ReadCall) => {
        if (call.functionName === 'resolver') return '0x0000000000000000000000000000000000000000'
        return ''
      }),
    } as unknown as PublicClient
    const reader = metadataReader({ basePublicClient: baseClient })(mainnet)
    const result = await reader.getMetadata({ name: 'foo.base.eth', keys: ['description'] })
    expect(result.resolver).toBeNull()
    expect(result.address).toBeNull()
    expect(result.properties).toEqual({ description: null })
  })

  it('handles deeper subnames like team.foo.base.eth', async () => {
    const mainnet = makeMainnetClient()
    const { client: baseClient, read } = makeBaseClient({ description: 'deep' })
    const reader = metadataReader({ basePublicClient: baseClient })(mainnet)
    const result = await reader.getMetadata({
      name: 'team.foo.base.eth',
      keys: ['description'],
    })
    expect(result.resolver).toBe(L2_RESOLVER)
    expect(result.properties.description).toBe('deep')
    expect(read).toHaveBeenCalled()
  })
})

describe('metadataReader.getMetadata for mainnet names', () => {
  it('still uses the universal-resolver path; the Base client is untouched', async () => {
    const mainnet = makeMainnetClient({
      getEnsText: vi.fn(async ({ key }: { key: string }) =>
        key === 'description' ? 'mainnet desc' : null,
      ),
      getEnsAddress: vi.fn(async () => L1_ADDRESS),
      getEnsResolver: vi.fn(async () => L1_RESOLVER),
    })
    const baseClient = { readContract: vi.fn() } as unknown as PublicClient

    const reader = metadataReader({ basePublicClient: baseClient })(mainnet)
    const result = await reader.getMetadata({ name: 'alice.eth', keys: ['description'] })

    expect(result.resolver).toBe(L1_RESOLVER)
    expect(result.address).toBe(L1_ADDRESS)
    expect(baseClient.readContract).not.toHaveBeenCalled()
    expect(mainnet.getEnsResolver).toHaveBeenCalled()
  })
})

describe('getResolverAddress / getResolverAddressStrict for Basenames', () => {
  it('returns the L2 resolver from the Base registry', async () => {
    const mainnet = makeMainnetClient()
    const { client: baseClient } = makeBaseClient()
    const out = await getResolverAddress({
      client: mainnet,
      basePublicClient: baseClient,
      name: 'foo.base.eth',
    })
    expect(out).toBe(L2_RESOLVER)
    expect(mainnet.getEnsResolver).not.toHaveBeenCalled()
  })

  it('strict variant returns the L2 resolver and does not call mainnet', async () => {
    const mainnet = makeMainnetClient()
    const { client: baseClient } = makeBaseClient()
    const out = await getResolverAddressStrict({
      client: mainnet,
      basePublicClient: baseClient,
      name: 'foo.base.eth',
    })
    expect(out).toBe(L2_RESOLVER)
    expect(mainnet.getEnsResolver).not.toHaveBeenCalled()
  })

  it('strict variant throws when the registry has no resolver', async () => {
    const mainnet = makeMainnetClient()
    const baseClient = {
      readContract: vi.fn(async () => '0x0000000000000000000000000000000000000000'),
    } as unknown as PublicClient
    await expect(
      getResolverAddressStrict({
        client: mainnet,
        basePublicClient: baseClient,
        name: 'foo.base.eth',
      }),
    ).rejects.toThrow(/No resolver set on Base registry/)
  })

  it('mainnet names still use the universal-resolver path', async () => {
    const mainnet = makeMainnetClient()
    const baseRead = vi.fn()
    const baseClient = { readContract: baseRead } as unknown as PublicClient
    const out = await getResolverAddress({
      client: mainnet,
      basePublicClient: baseClient,
      name: 'alice.eth',
    })
    expect(out).toBe(L1_RESOLVER)
    expect(baseRead).not.toHaveBeenCalled()
  })
})

describe('readTextRecords / readTextRecordsStrict for Basenames', () => {
  it('lenient variant routes through Base and returns the expected map', async () => {
    const mainnet = makeMainnetClient()
    const { client: baseClient } = makeBaseClient({
      description: 'hello',
      avatar: '',
    })
    const out = await readTextRecords({
      client: mainnet,
      basePublicClient: baseClient,
      name: 'foo.base.eth',
      keys: ['description', 'avatar', 'url'],
    })
    expect(out).toEqual({ description: 'hello', avatar: null, url: null })
    expect(mainnet.getEnsText).not.toHaveBeenCalled()
  })

  it('strict variant routes through Base', async () => {
    const mainnet = makeMainnetClient()
    const { client: baseClient } = makeBaseClient({ description: 'hi' })
    const out = await readTextRecordsStrict({
      client: mainnet,
      basePublicClient: baseClient,
      name: 'foo.base.eth',
      keys: ['description'],
    })
    expect(out).toEqual({ description: 'hi' })
    expect(mainnet.getEnsText).not.toHaveBeenCalled()
  })

  it('mainnet names still use the CCIP-Read path; Base client is never called', async () => {
    const mainnet = makeMainnetClient({
      getEnsText: vi.fn(async ({ key }: { key: string }) => `cciped:${key}`),
    })
    const baseRead = vi.fn()
    const baseClient = { readContract: baseRead } as unknown as PublicClient
    const out = await readTextRecords({
      client: mainnet,
      basePublicClient: baseClient,
      name: 'alice.eth',
      keys: ['description'],
    })
    expect(out).toEqual({ description: 'cciped:description' })
    expect(baseRead).not.toHaveBeenCalled()
  })
})
