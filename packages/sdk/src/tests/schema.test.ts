import type { Schema } from '@ensmetadata/schemas/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  extractArrayPatternBase,
  fetchSchema,
  fetchSchemaFromHttps,
  fetchSchemaFromIpfs,
  fetchSchemaFromLocal,
  getSchemaKeys,
} from '../schema'

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('getSchemaKeys', () => {
  it('returns properties keys in declaration order', () => {
    const schema: Schema = {
      $id: 'order',
      source: 'test',
      title: 'Order',
      version: '1.0.0',
      description: 'order check',
      type: 'object',
      properties: {
        zeta: { type: 'string', description: 'z' },
        alpha: { type: 'string', description: 'a' },
        mid: { type: 'string', description: 'm' },
      },
    }
    expect(getSchemaKeys(schema)).toEqual({
      keys: ['zeta', 'alpha', 'mid'],
      arrayPatterns: [],
    })
  })

  it('excludes patternProperties from keys', () => {
    const schema: Schema = {
      $id: 'pattern',
      source: 'test',
      title: 'Pattern',
      version: '1.0.0',
      description: 'pattern check',
      type: 'object',
      properties: {
        class: { type: 'string', description: 'class id' },
      },
      patternProperties: {
        '^statement(\\[[^\\]]+\\])?$': {
          type: 'string',
          description: 's',
          parameterType: 'map',
        },
      },
    }
    // Map-form pattern → not surfaced in arrayPatterns
    expect(getSchemaKeys(schema)).toEqual({ keys: ['class'], arrayPatterns: [] })
  })

  it('surfaces array-form patternProperties as arrayPatterns', () => {
    const attribute = {
      type: 'string',
      description: 'audit URI',
      parameterType: 'array' as const,
    }
    const schema: Schema = {
      $id: 'arr',
      source: 'test',
      title: 'Arr',
      version: '1.0.0',
      description: 'arr',
      type: 'object',
      properties: { class: { type: 'string', description: 'c' } },
      patternProperties: {
        '^audits(\\[[^\\]]+\\])?$': attribute,
        // map entry should be ignored
        '^services(\\[[^\\]]+\\])?$': {
          type: 'string',
          description: 's',
          parameterType: 'map',
        },
      },
    }
    expect(getSchemaKeys(schema)).toEqual({
      keys: ['class'],
      arrayPatterns: [{ pattern: '^audits(\\[[^\\]]+\\])?$', baseKey: 'audits', attribute }],
    })
  })

  it('skips array patterns whose regex shape cannot be parsed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const schema: Schema = {
        $id: 'bad',
        source: 'test',
        title: 'Bad',
        version: '1.0.0',
        description: 'bad',
        type: 'object',
        properties: {},
        patternProperties: {
          // anchors but no recognised bracket suffix
          '^weird$': { type: 'string', description: 'w', parameterType: 'array' },
        },
      }
      expect(getSchemaKeys(schema).arrayPatterns).toEqual([])
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('returns an empty array for a schema with no properties', () => {
    const schema = {
      $id: 'empty',
      source: 'test',
      title: 'Empty',
      version: '1.0.0',
      description: 'empty',
      type: 'object',
      properties: {},
    } as Schema
    expect(getSchemaKeys(schema)).toEqual({ keys: [], arrayPatterns: [] })
  })
})

describe('extractArrayPatternBase', () => {
  it('parses the optional-bracket form used by current schemas', () => {
    expect(extractArrayPatternBase('^audits(\\[[^\\]]+\\])?$')).toBe('audits')
    expect(extractArrayPatternBase('^registrations(\\[[^\\]]+\\])?$')).toBe('registrations')
  })

  it('parses the required-bracket form', () => {
    expect(extractArrayPatternBase('^member\\[[^\\]]+\\]$')).toBe('member')
  })

  it('unescapes backslash-escaped literals inside the base', () => {
    expect(extractArrayPatternBase('^foo\\-bar(\\[[^\\]]+\\])?$')).toBe('foo-bar')
    expect(extractArrayPatternBase('^foo\\.bar\\[[^\\]]+\\]$')).toBe('foo.bar')
  })

  it('returns null for shapes without a recognised bracket suffix', () => {
    expect(extractArrayPatternBase('^plain$')).toBeNull()
    expect(extractArrayPatternBase('^foo(bar)?$')).toBeNull()
  })

  it('returns null when the base contains unescaped regex metacharacters', () => {
    expect(extractArrayPatternBase('^foo.*bar\\[[^\\]]+\\]$')).toBeNull()
  })

  it('returns null for an empty base', () => {
    expect(extractArrayPatternBase('^\\[[^\\]]+\\]$')).toBeNull()
  })
})

describe('fetchSchemaFromIpfs', () => {
  const fetchSpy = vi.fn()
  const realFetch = globalThis.fetch

  beforeEach(() => {
    fetchSpy.mockReset()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('fetches a bare-CID ipfs URI through a /ipfs-prefixed gateway', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(sampleSchema))
    const result = await fetchSchemaFromIpfs('ipfs://QmDirect', {
      ipfsGateway: 'https://gw.test/ipfs',
    })
    expect(result.title).toBe('Sample')
    expect(fetchSpy.mock.calls[0][0]).toBe('https://gw.test/ipfs/QmDirect')
  })

  it('treats the gateway as a literal URL prefix (no /ipfs segment added)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(sampleSchema))
    await fetchSchemaFromIpfs('ipfs://QmDirect', { ipfsGateway: 'https://gw.test' })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://gw.test/QmDirect')
  })

  it('appends a directory sub-path to the gateway URL', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(sampleSchema))
    await fetchSchemaFromIpfs(
      'ipfs://bafybeighgfsdllcwlb7uvga5foqonx52vnoryede72jo6k2a4rtj5naq3i/schemas/agent-schema-v1.json',
      { ipfsGateway: 'https://gw.test/ipfs' },
    )
    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://gw.test/ipfs/bafybeighgfsdllcwlb7uvga5foqonx52vnoryede72jo6k2a4rtj5naq3i/schemas/agent-schema-v1.json',
    )
  })

  it('falls back to the default gateway (https://ipfs.io/ipfs)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(sampleSchema))
    await fetchSchemaFromIpfs('ipfs://QmDefault')
    expect(fetchSpy.mock.calls[0][0]).toBe('https://ipfs.io/ipfs/QmDefault')
  })

  it('strips trailing slashes from the gateway prefix', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(sampleSchema))
    await fetchSchemaFromIpfs('ipfs://QmTrail', { ipfsGateway: 'https://gw.test/ipfs/' })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://gw.test/ipfs/QmTrail')
  })

  it('rejects non-ipfs URIs', async () => {
    await expect(fetchSchemaFromIpfs('https://example.com/schema.json')).rejects.toThrow(
      /Unsupported IPFS URI/,
    )
  })

  it('rejects an empty CID', async () => {
    await expect(fetchSchemaFromIpfs('ipfs://')).rejects.toThrow(/Missing CID/)
  })

  it('hard-fails on non-2xx responses', async () => {
    fetchSpy.mockResolvedValue(new Response('not found', { status: 404 }))
    await expect(fetchSchemaFromIpfs('ipfs://QmMissing')).rejects.toThrow(/HTTP 404/)
  })

  it('hard-fails on bad JSON', async () => {
    fetchSpy.mockResolvedValue(
      new Response('not-json', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    await expect(fetchSchemaFromIpfs('ipfs://QmBad')).rejects.toThrow(/not valid JSON/)
  })

  it('rejects payloads that do not look like a Schema', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ not: 'a schema' }))
    await expect(fetchSchemaFromIpfs('ipfs://QmBadShape')).rejects.toThrow(
      /does not look like a valid Schema/,
    )
  })
})

describe('fetchSchemaFromHttps', () => {
  const fetchSpy = vi.fn()
  const realFetch = globalThis.fetch

  beforeEach(() => {
    fetchSpy.mockReset()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('fetches an https URL directly', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(sampleSchema))
    const result = await fetchSchemaFromHttps('https://example.com/schema.json')
    expect(result.title).toBe('Sample')
    expect(fetchSpy.mock.calls[0][0]).toBe('https://example.com/schema.json')
  })

  it('rejects non-https URIs', async () => {
    await expect(fetchSchemaFromHttps('ipfs://QmNope')).rejects.toThrow(/Unsupported HTTPS URI/)
    await expect(fetchSchemaFromHttps('http://insecure.example/schema.json')).rejects.toThrow(
      /Unsupported HTTPS URI/,
    )
  })

  it('hard-fails on non-2xx responses', async () => {
    fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }))
    await expect(fetchSchemaFromHttps('https://example.com/schema.json')).rejects.toThrow(
      /HTTP 500/,
    )
  })
})

describe('fetchSchemaFromLocal', () => {
  it('returns the resolver result when it produces a Schema', async () => {
    const resolver = vi.fn(async () => sampleSchema)
    const result = await fetchSchemaFromLocal('ipfs://QmFastPath', resolver)
    expect(result).toBe(sampleSchema)
    expect(resolver).toHaveBeenCalledWith('ipfs://QmFastPath')
  })

  it('returns null when the resolver declines', async () => {
    const resolver = vi.fn(async () => null)
    const result = await fetchSchemaFromLocal('ipfs://QmUnknown', resolver)
    expect(result).toBeNull()
  })

  it('forwards any URI scheme verbatim', async () => {
    const resolver = vi.fn(async (uri: string) =>
      uri.startsWith('https://') ? sampleSchema : null,
    )
    const httpsResult = await fetchSchemaFromLocal('https://example.com/schema.json', resolver)
    expect(httpsResult).toBe(sampleSchema)
    const otherResult = await fetchSchemaFromLocal('weird://thing', resolver)
    expect(otherResult).toBeNull()
  })
})

describe('fetchSchema (dispatcher)', () => {
  const fetchSpy = vi.fn()
  const realFetch = globalThis.fetch

  beforeEach(() => {
    fetchSpy.mockReset()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('short-circuits via the resolver without hitting the network', async () => {
    const resolver = vi.fn(async () => sampleSchema)
    const result = await fetchSchema('ipfs://QmFastPath', { resolver })
    expect(result).toBe(sampleSchema)
    expect(resolver).toHaveBeenCalledWith('ipfs://QmFastPath')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to the ipfs gateway when the resolver returns null', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(sampleSchema))
    const result = await fetchSchema('ipfs://QmMiss', {
      resolver: async () => null,
      ipfsGateway: 'https://example-gateway.test/ipfs',
    })
    expect(result.title).toBe('Sample')
    expect(fetchSpy.mock.calls[0][0]).toBe('https://example-gateway.test/ipfs/QmMiss')
  })

  it('dispatches to https when given an https URI', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(sampleSchema))
    const result = await fetchSchema('https://example.com/schema.json')
    expect(result.title).toBe('Sample')
    expect(fetchSpy.mock.calls[0][0]).toBe('https://example.com/schema.json')
  })

  it('runs the resolver for https URIs too', async () => {
    const resolver = vi.fn(async () => sampleSchema)
    const result = await fetchSchema('https://example.com/schema.json', { resolver })
    expect(result).toBe(sampleSchema)
    expect(resolver).toHaveBeenCalledWith('https://example.com/schema.json')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects unknown URI schemes', async () => {
    await expect(fetchSchema('ftp://example.com/schema.json')).rejects.toThrow(
      /Only ipfs:\/\/ and https:\/\/ schemes are supported/,
    )
  })
})
