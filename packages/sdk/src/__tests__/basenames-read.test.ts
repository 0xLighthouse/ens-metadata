import type { PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { metadataReader } from '../read'

const L1_RESOLVER = '0xRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR' as `0x${string}`

function makeMainnetClient(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    getEnsResolver: vi.fn(async () => L1_RESOLVER),
    getEnsText: vi.fn(async ({ key }: { key: string }) => `mainnet:${key}`),
    readContract: vi.fn(),
    ...overrides,
  } as unknown as PublicClient
}

// TODO: basename routing has moved to `multichainMetadataReader`. These cases
// are rewritten against the new factory in `multichain/reader.test.ts`.
describe.skip('metadataReader.getMetadata for *.base.eth', () => {
  it('reads from the L2 resolver and never from the mainnet universal resolver', async () => {
    // Skipped: superseded by multichain/reader.test.ts.
  })

  it('falls back to empty result when the registry has no resolver set', async () => {
    // Skipped: superseded by multichain/reader.test.ts.
  })

  it('handles deeper subnames like team.foo.base.eth', async () => {
    // Skipped: superseded by multichain/reader.test.ts.
  })
})

describe('metadataReader.getMetadata for mainnet names', () => {
  it('reads text records via the supplied mainnet client', async () => {
    const mainnet = makeMainnetClient({
      getEnsText: vi.fn(async ({ key }: { key: string }) =>
        key === 'description' ? 'mainnet desc' : null,
      ),
    })

    const reader = metadataReader()(mainnet)
    const result = await reader.getMetadata({ name: 'alice.eth', keys: ['description'] })

    expect(result.properties.description).toBe('mainnet desc')
    expect(mainnet.getEnsText).toHaveBeenCalled()
  })
})

describe('metadataReader paired with a Base client', () => {
  it('reads basename text records when the caller pairs a Base client themselves', async () => {
    // Single-chain core: the caller is responsible for pairing the right
    // client with the name. When the client is a Base client, basename reads
    // hit Base's text-record path and Just Work without any basename-specific
    // logic in the core.
    const baseAsClient = {
      getEnsText: vi.fn(async ({ key }: { key: string }) =>
        key === 'description' ? 'on base' : null,
      ),
    } as unknown as PublicClient

    const reader = metadataReader()(baseAsClient)
    const result = await reader.getMetadata({
      name: 'alice.base.eth',
      keys: ['description'],
    })

    expect(result.properties.description).toBe('on base')
  })
})
