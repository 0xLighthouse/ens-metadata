import type { Schema } from '@ensmetadata/schemas/types'
import type { PublicClient } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSchemaForName } from '../schema-resolve'

const sampleSchema: Schema = {
  $id: 'sample',
  source: 'test',
  title: 'Sample',
  version: '1.0.0',
  description: 'sample schema',
  type: 'object',
  properties: {
    class: { type: 'string', default: 'Sample', description: 'class id' },
  },
  required: ['class'],
}

function makeClient(getEnsText: (args: { name: string; key: string }) => Promise<unknown>) {
  return { getEnsText } as unknown as PublicClient
}

describe('resolveSchemaForName', () => {
  const fetchSpy = vi.fn()
  const realFetch = globalThis.fetch

  beforeEach(() => {
    fetchSpy.mockReset()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('uses the payload URI when present (source: payload)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(sampleSchema), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = makeClient(async () => null)
    const result = await resolveSchemaForName({
      client,
      name: 'myagent.eth',
      payloadSchemaUri: 'ipfs://QmFromPayload',
    })
    expect(result.source).toBe('payload')
    expect(result.uri).toBe('ipfs://QmFromPayload')
    expect(result.schema?.title).toBe('Sample')
  })

  it('uses ENS text when payload is missing (source: ens)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(sampleSchema), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = makeClient(async () => 'ipfs://QmFromEns')
    const result = await resolveSchemaForName({ client, name: 'myagent.eth' })
    expect(result.source).toBe('ens')
    expect(result.uri).toBe('ipfs://QmFromEns')
    expect(result.schema?.title).toBe('Sample')
  })

  it('returns source none when no URI anywhere', async () => {
    const client = makeClient(async () => null)
    const result = await resolveSchemaForName({ client, name: 'myagent.eth' })
    expect(result.source).toBe('none')
    expect(result.schema).toBeNull()
    expect(result.uri).toBeNull()
  })

  it('hard-fails when ENS read throws (does not silently degrade)', async () => {
    const client = makeClient(async () => {
      throw new Error('RPC 500 boom')
    })
    await expect(resolveSchemaForName({ client, name: 'myagent.eth' })).rejects.toThrow(
      /Failed to read 'schema' text record from ENS/,
    )
  })

  it('uses pre-fetched ensSchemaText without making an RPC call', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(sampleSchema), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const getEnsText = vi.fn(async () => null)
    const client = makeClient(getEnsText)
    const result = await resolveSchemaForName({
      client,
      name: 'myagent.eth',
      ensSchemaText: 'ipfs://QmFromCaller',
    })
    expect(result.source).toBe('ens')
    expect(result.uri).toBe('ipfs://QmFromCaller')
    expect(getEnsText).not.toHaveBeenCalled()
  })

  it('treats pre-fetched empty ensSchemaText as no record (no RPC, no fetch)', async () => {
    const getEnsText = vi.fn()
    const client = makeClient(getEnsText)
    const result = await resolveSchemaForName({
      client,
      name: 'myagent.eth',
      ensSchemaText: null,
    })
    expect(result.source).toBe('none')
    expect(getEnsText).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('forwards localResolver to fetchSchemaByUri', async () => {
    const client = makeClient(async () => null)
    const localResolver = vi.fn(async () => sampleSchema)
    const result = await resolveSchemaForName({
      client,
      name: 'myagent.eth',
      payloadSchemaUri: 'ipfs://QmFastPath',
      localResolver,
    })
    expect(result.source).toBe('payload')
    expect(result.schema?.title).toBe('Sample')
    expect(localResolver).toHaveBeenCalledWith('QmFastPath')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
