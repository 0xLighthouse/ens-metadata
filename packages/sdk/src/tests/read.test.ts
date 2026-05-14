import type { Schema } from '@ensmetadata/schemas/types'
import type { PublicClient } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMetadata, getSchema, metadataReader, readTextRecords } from '../read'

const REGISTRY = '0xb94704422c2a1e396835a571837aa5ae53285a95' as `0x${string}`
const RESOLVER = '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD' as `0x${string}`
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

/**
 * Build a stub PublicClient whose `readContract` handles the two ABIs we
 * care about: `registry.resolver(node) → address` and
 * `resolver.text(node, key) → string`. `getEnsText` is also stubbed so we
 * can assert it isn't called when `registry` is supplied.
 */
function makeDirectReadClient({
  resolver = RESOLVER,
  text = {},
}: {
  resolver?: `0x${string}`
  text?: Record<string, string>
} = {}) {
  const readContract = vi.fn(async (args: { functionName: string; args: readonly unknown[] }) => {
    if (args.functionName === 'resolver') return resolver
    if (args.functionName === 'text') {
      const key = args.args[1] as string
      return text[key] ?? ''
    }
    throw new Error(`unexpected readContract call: ${args.functionName}`)
  })
  const getEnsText = vi.fn(async () => null)
  return {
    client: { readContract, getEnsText } as unknown as PublicClient,
    readContract,
    getEnsText,
  }
}

const sampleSchema: Schema = {
  $id: 'test',
  source: 'test',
  title: 'Test',
  version: '1.0',
  description: 't',
  type: 'object',
  properties: {
    class: { type: 'string', description: 'class' },
    schema: { type: 'string', description: 'schema URI' },
    description: { type: 'string', description: 'desc' },
  },
  required: ['class'],
}

describe('readTextRecords (registry-direct path)', () => {
  it('reads via registry.resolver + resolver.text when registry is supplied', async () => {
    const { client, readContract, getEnsText } = makeDirectReadClient({
      text: { class: 'Agent', description: 'hello' },
    })

    const out = await readTextRecords({
      client,
      name: 'alice.base.eth',
      keys: ['class', 'description'],
      registry: REGISTRY,
    })

    expect(out).toEqual({ class: 'Agent', description: 'hello' })
    expect(getEnsText).not.toHaveBeenCalled()
    // One resolver lookup + one text() per key
    expect(readContract).toHaveBeenCalledTimes(3)
    expect(readContract.mock.calls[0][0]).toMatchObject({
      address: REGISTRY,
      functionName: 'resolver',
    })
  })

  it('returns nulls for every key when registry.resolver(node) is the zero address', async () => {
    const { client, readContract, getEnsText } = makeDirectReadClient({ resolver: ZERO_ADDRESS })

    const out = await readTextRecords({
      client,
      name: 'alice.base.eth',
      keys: ['class', 'avatar'],
      registry: REGISTRY,
    })

    expect(out).toEqual({ class: null, avatar: null })
    // Only the resolver lookup runs — no `text` calls when no resolver is configured.
    expect(readContract).toHaveBeenCalledTimes(1)
    expect(getEnsText).not.toHaveBeenCalled()
  })

  it('normalises empty-string text values to null', async () => {
    const { client } = makeDirectReadClient({ text: { class: 'Agent', avatar: '' } })
    const out = await readTextRecords({
      client,
      name: 'alice.base.eth',
      keys: ['class', 'avatar'],
      registry: REGISTRY,
    })
    expect(out).toEqual({ class: 'Agent', avatar: null })
  })

  it('falls back to viem getEnsText when no registry is supplied', async () => {
    const { client, readContract, getEnsText } = makeDirectReadClient()
    getEnsText.mockImplementation(async ({ key }: { key: string }) =>
      key === 'class' ? 'X' : null,
    )

    const out = await readTextRecords({
      client,
      name: 'alice.eth',
      keys: ['class', 'avatar'],
    })

    expect(out).toEqual({ class: 'X', avatar: null })
    expect(readContract).not.toHaveBeenCalled()
    expect(getEnsText).toHaveBeenCalledTimes(2)
  })
})

describe('getSchema (registry-direct path)', () => {
  it('reads class via direct path and returns null schema when no URI is set', async () => {
    const { client, readContract, getEnsText } = makeDirectReadClient({
      text: { class: 'Agent' },
    })

    const result = await getSchema(client, { name: 'alice.base.eth', registry: REGISTRY })
    expect(result.schema).toBeNull()
    expect(result.properties.class).toBe('Agent')
    expect(result.properties.schema).toBeUndefined()
    expect(getEnsText).not.toHaveBeenCalled()
    expect(readContract).toHaveBeenCalled()
  })
})

describe('getMetadata (registry-direct path)', () => {
  it('reads schema-declared keys via direct path when registry is supplied', async () => {
    const { client, getEnsText } = makeDirectReadClient({
      text: { class: 'Agent', description: 'hi' },
    })

    const result = await getMetadata(client, {
      name: 'alice.base.eth',
      schema: sampleSchema,
      registry: REGISTRY,
    })

    expect(result.properties).toMatchObject({ class: 'Agent', description: 'hi' })
    expect(getEnsText).not.toHaveBeenCalled()
  })
})

describe('metadataReader factory', () => {
  it('threads the per-call registry option through to readTextRecords', async () => {
    const { client, readContract, getEnsText } = makeDirectReadClient({
      text: { class: 'Agent' },
    })
    const reader = metadataReader()(client as PublicClient)
    await reader.getMetadata({
      name: 'alice.base.eth',
      schema: sampleSchema,
      registry: REGISTRY,
    })
    expect(getEnsText).not.toHaveBeenCalled()
    expect(readContract).toHaveBeenCalled()
  })
})

// --------------------------------------------------------------------------
// ipfsGateway plumbing
// --------------------------------------------------------------------------

describe('getSchema → fetchSchema ipfsGateway forwarding', () => {
  const fetchSpy = vi.fn()
  const realFetch = globalThis.fetch

  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  function makeIpfsClient() {
    return makeDirectReadClient({
      text: { schema: 'ipfs://QmSchemaCid', class: 'Agent' },
    }).client
  }

  beforeEach(() => {
    fetchSpy.mockReset()
    fetchSpy.mockResolvedValue(jsonResponse(sampleSchema))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('uses the per-call ipfsGateway when supplied', async () => {
    const client = makeIpfsClient()
    await getSchema(client, {
      name: 'alice.base.eth',
      registry: REGISTRY,
      ipfsGateway: 'https://gw.test/ipfs',
    })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://gw.test/ipfs/QmSchemaCid')
  })

  it('falls back to the factory-level ipfsGateway when no per-call value is set', async () => {
    const client = makeIpfsClient()
    const reader = metadataReader({ ipfsGateway: 'https://factory.test/ipfs' })(
      client as PublicClient,
    )
    await reader.getSchema({ name: 'alice.base.eth', registry: REGISTRY })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://factory.test/ipfs/QmSchemaCid')
  })

  it('per-call ipfsGateway overrides the factory-level default', async () => {
    const client = makeIpfsClient()
    const reader = metadataReader({ ipfsGateway: 'https://factory.test/ipfs' })(
      client as PublicClient,
    )
    await reader.getSchema({
      name: 'alice.base.eth',
      registry: REGISTRY,
      ipfsGateway: 'https://percall.test/ipfs',
    })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://percall.test/ipfs/QmSchemaCid')
  })

  it('falls back to DEFAULT_IPFS_GATEWAY when neither factory nor per-call is set', async () => {
    const client = makeIpfsClient()
    await getSchema(client, { name: 'alice.base.eth', registry: REGISTRY })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://ipfs.io/ipfs/QmSchemaCid')
  })
})

// --------------------------------------------------------------------------
// schemaResolver plumbing
// --------------------------------------------------------------------------

describe('getSchema → fetchSchema schemaResolver forwarding', () => {
  const fetchSpy = vi.fn()
  const realFetch = globalThis.fetch

  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  function makeIpfsClient() {
    return makeDirectReadClient({
      text: { schema: 'ipfs://QmSchemaCid', class: 'Agent' },
    }).client
  }

  beforeEach(() => {
    fetchSpy.mockReset()
    fetchSpy.mockResolvedValue(jsonResponse(sampleSchema))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('short-circuits the gateway when the per-call resolver returns a schema', async () => {
    const client = makeIpfsClient()
    const resolver = vi.fn(async (_uri: string) => sampleSchema)
    const result = await getSchema(client, {
      name: 'alice.base.eth',
      registry: REGISTRY,
      schemaResolver: resolver,
    })
    expect(resolver).toHaveBeenCalledWith('ipfs://QmSchemaCid')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.schema).toBe(sampleSchema)
  })

  it('falls through to the gateway when the resolver returns null', async () => {
    const client = makeIpfsClient()
    const resolver = vi.fn(async (_uri: string) => null)
    await getSchema(client, {
      name: 'alice.base.eth',
      registry: REGISTRY,
      schemaResolver: resolver,
    })
    expect(resolver).toHaveBeenCalledWith('ipfs://QmSchemaCid')
    expect(fetchSpy.mock.calls[0][0]).toBe('https://ipfs.io/ipfs/QmSchemaCid')
  })

  it('uses the factory-level schemaResolver when no per-call resolver is set', async () => {
    const client = makeIpfsClient()
    const resolver = vi.fn(async (_uri: string) => sampleSchema)
    const reader = metadataReader({ schemaResolver: resolver })(client as PublicClient)
    await reader.getSchema({ name: 'alice.base.eth', registry: REGISTRY })
    expect(resolver).toHaveBeenCalledWith('ipfs://QmSchemaCid')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('per-call schemaResolver overrides the factory-level default', async () => {
    const client = makeIpfsClient()
    const factoryResolver = vi.fn(async (_uri: string) => sampleSchema)
    const perCallResolver = vi.fn(async (_uri: string) => sampleSchema)
    const reader = metadataReader({ schemaResolver: factoryResolver })(client as PublicClient)
    await reader.getSchema({
      name: 'alice.base.eth',
      registry: REGISTRY,
      schemaResolver: perCallResolver,
    })
    expect(perCallResolver).toHaveBeenCalledWith('ipfs://QmSchemaCid')
    expect(factoryResolver).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
