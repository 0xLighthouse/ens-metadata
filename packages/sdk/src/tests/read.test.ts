import type { Schema } from '@ensmetadata/schemas/types'
import type { PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
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
