import type { Schema } from '@ensmetadata/schemas/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSchemaByUri, parseSchemaUri } from '../schema-fetch'

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

describe('parseSchemaUri', () => {
  it('parses a bare CID ipfs:// URI', () => {
    expect(parseSchemaUri('ipfs://QmAbc123')).toEqual({ location: 'QmAbc123' })
  })

  it('preserves a directory-style sub-path', () => {
    expect(parseSchemaUri('ipfs://QmAbc123/schemas/agent-schema-v1.json')).toEqual({
      location: 'QmAbc123/schemas/agent-schema-v1.json',
    })
  })

  it('rejects non-ipfs schemes', () => {
    expect(() => parseSchemaUri('https://example.com/schema.json')).toThrow(/Only ipfs:\/\/<cid>/)
  })

  it('rejects empty CIDs', () => {
    expect(() => parseSchemaUri('ipfs://')).toThrow(/Missing CID/)
  })
})

describe('fetchSchemaByUri', () => {
  const fetchSpy = vi.fn()
  const realFetch = globalThis.fetch

  beforeEach(() => {
    fetchSpy.mockReset()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('short-circuits via localResolver without hitting the gateway', async () => {
    const localResolver = vi.fn(async () => sampleSchema)
    const result = await fetchSchemaByUri('ipfs://QmFastPath', { localResolver })
    expect(result).toBe(sampleSchema)
    expect(localResolver).toHaveBeenCalledWith('QmFastPath')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to the gateway when localResolver returns null', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(sampleSchema), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const result = await fetchSchemaByUri('ipfs://QmMiss', {
      localResolver: async () => null,
      ipfsGateway: 'https://example-gateway.test',
    })
    expect(result.title).toBe('Sample')
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(fetchSpy.mock.calls[0][0]).toBe('https://example-gateway.test/ipfs/QmMiss')
  })

  it('uses the gateway when no localResolver is supplied', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(sampleSchema), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const result = await fetchSchemaByUri('ipfs://QmDirect', {
      ipfsGateway: 'https://gw.test',
    })
    expect(result.title).toBe('Sample')
    expect(fetchSpy.mock.calls[0][0]).toBe('https://gw.test/ipfs/QmDirect')
  })

  it('appends a directory sub-path to the gateway URL', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(sampleSchema), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const localResolver = vi.fn(async () => null)
    const result = await fetchSchemaByUri(
      'ipfs://bafybeighgfsdllcwlb7uvga5foqonx52vnoryede72jo6k2a4rtj5naq3i/schemas/agent-schema-v1.json',
      { ipfsGateway: 'https://gw.test', localResolver },
    )
    expect(result.title).toBe('Sample')
    expect(localResolver).toHaveBeenCalledWith(
      'bafybeighgfsdllcwlb7uvga5foqonx52vnoryede72jo6k2a4rtj5naq3i/schemas/agent-schema-v1.json',
    )
    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://gw.test/ipfs/bafybeighgfsdllcwlb7uvga5foqonx52vnoryede72jo6k2a4rtj5naq3i/schemas/agent-schema-v1.json',
    )
  })

  it('hard-fails on non-2xx responses', async () => {
    fetchSpy.mockResolvedValue(new Response('not found', { status: 404 }))
    await expect(fetchSchemaByUri('ipfs://QmMissing')).rejects.toThrow(/HTTP 404/)
  })

  it('hard-fails on bad JSON', async () => {
    fetchSpy.mockResolvedValue(
      new Response('not-json', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    await expect(fetchSchemaByUri('ipfs://QmBad')).rejects.toThrow(/not valid JSON/)
  })

  it('rejects payloads that do not look like a Schema', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ not: 'a schema' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(fetchSchemaByUri('ipfs://QmBadShape')).rejects.toThrow(
      /does not look like a valid Schema/,
    )
  })
})
