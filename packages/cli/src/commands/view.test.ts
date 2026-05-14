import type { Schema } from '@ensmetadata/schemas/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSchemaMock = vi.fn()
const getMetadataMock = vi.fn()
const fetchSchemaMock = vi.fn()
const metadataReaderConfigMock = vi.fn()

vi.mock('@ensmetadata/sdk', async () => {
  const actual = await vi.importActual<typeof import('@ensmetadata/sdk')>('@ensmetadata/sdk')
  return {
    ...actual,
    metadataReader: (config?: unknown) => {
      metadataReaderConfigMock(config)
      return () => ({
        getSchema: (opts: unknown) => getSchemaMock(opts),
        getMetadata: (opts: unknown) => getMetadataMock(opts),
      })
    },
    fetchSchema: (uri: string, opts?: unknown) => fetchSchemaMock(uri, opts),
  }
})

vi.mock('../lib/context.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/context.js')>('../lib/context.js')
  return {
    ...actual,
    clientFromContext: () => ({
      // The SDK boundary is mocked, so a stub client is sufficient.
      client: { extend: (fn: (c: unknown) => unknown) => fn({}) },
      chain: { id: 1 },
      registryAddress: '0x0000000000000000000000000000000000000000',
    }),
  }
})

vi.mock('../lib/bundled-schemas.js', () => ({
  bundledSchemaResolver: vi.fn(async () => null),
}))

import { viewCommand } from './view.js'

const sampleSchema: Schema = {
  $id: 'sample',
  source: 'test',
  title: 'Sample',
  version: '1.0.0',
  description: 'sample schema',
  type: 'object',
  properties: {
    class: { type: 'string', default: 'Sample', description: 'class id' },
    schema: { type: 'string', description: 'schema URI' },
    description: { type: 'string', description: 'description' },
    avatar: { type: 'string', description: 'avatar' },
  },
  required: ['class', 'description'],
}

const patternSchema: Schema = {
  $id: 'pattern',
  source: 'test',
  title: 'Pattern',
  version: '1.0.0',
  description: 'schema with pattern properties',
  type: 'object',
  properties: {
    class: { type: 'string', description: 'class id' },
    schema: { type: 'string', description: 'schema URI' },
  },
  patternProperties: {
    '^agent-endpoint(\\[[^\\]]+\\])?$': { type: 'string', description: 'endpoint' },
  },
}

const baseRun = () =>
  viewCommand.run({
    args: { name: 'myagent.eth' },
    options: {},
    env: {},
  })

describe('viewCommand.run', () => {
  beforeEach(() => {
    getSchemaMock.mockReset()
    getMetadataMock.mockReset()
    fetchSchemaMock.mockReset()
    metadataReaderConfigMock.mockReset()
  })

  it('happy path: reads schema, fetches it, validates payload', async () => {
    const schemaUri = 'ipfs://QmSchema'
    getSchemaMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: { schema: schemaUri, class: 'Sample' },
      schema: null,
    })
    fetchSchemaMock.mockResolvedValue(sampleSchema)
    getMetadataMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: {
        class: 'Sample',
        schema: schemaUri,
        description: 'hello',
      },
      schema: sampleSchema,
    })

    const out = await baseRun()

    expect(getSchemaMock).toHaveBeenCalledTimes(1)
    expect(getSchemaMock).toHaveBeenCalledWith({ name: 'myagent.eth' })
    expect(fetchSchemaMock).toHaveBeenCalledTimes(1)
    const [calledUri, calledOpts] = fetchSchemaMock.mock.calls[0]
    expect(calledUri).toBe(schemaUri)
    expect(calledOpts).toMatchObject({ resolver: expect.any(Function) })
    expect(getMetadataMock).toHaveBeenCalledTimes(1)
    expect(getMetadataMock).toHaveBeenCalledWith({ name: 'myagent.eth', schema: sampleSchema })
    expect(out.matchedSchema).toEqual({
      title: 'Sample',
      version: '1.0.0',
      uri: schemaUri,
      valid: true,
    })
    expect(out.properties).toEqual({
      class: 'Sample',
      schema: schemaUri,
      description: 'hello',
    })
  })

  it('reports required-missing errors and omits the missing key from properties', async () => {
    const schemaUri = 'ipfs://QmSchema'
    getSchemaMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: { schema: schemaUri, class: 'Sample' },
      schema: null,
    })
    fetchSchemaMock.mockResolvedValue(sampleSchema)
    getMetadataMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: {
        class: 'Sample',
        schema: schemaUri,
      },
      schema: sampleSchema,
    })

    const out = await baseRun()

    expect(out.properties).toEqual({ class: 'Sample', schema: schemaUri })
    expect(out.matchedSchema).toMatchObject({
      title: 'Sample',
      version: '1.0.0',
      uri: schemaUri,
      valid: false,
    })
    if (out.matchedSchema && 'errors' in out.matchedSchema) {
      expect(out.matchedSchema.errors).toEqual([
        { key: 'description', message: 'Required field "description" is missing' },
      ])
    } else {
      throw new Error('expected validation errors on matchedSchema')
    }
  })

  it('returns matchedSchema=null and reads DEFAULT_KEYS when no schema URI is set', async () => {
    getSchemaMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: {},
      schema: null,
    })
    getMetadataMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: {
        description: 'default-keys read',
      },
      schema: null,
    })

    const out = await baseRun()

    expect(fetchSchemaMock).not.toHaveBeenCalled()
    // Called without `schema` so getMetadata falls back to DEFAULT_KEYS.
    expect(getMetadataMock).toHaveBeenCalledWith({ name: 'myagent.eth' })
    expect(out.matchedSchema).toBeNull()
    expect(out.properties).toEqual({ description: 'default-keys read' })
  })

  it('degrades gracefully when schema fetch fails', async () => {
    const schemaUri = 'ipfs://QmBroken'
    getSchemaMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: { schema: schemaUri },
      schema: null,
    })
    fetchSchemaMock.mockRejectedValue(new Error('gateway down'))
    getMetadataMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: {
        schema: schemaUri,
        description: 'still readable',
      },
      schema: null,
    })

    const out = await baseRun()

    // Schema fetch failed → getMetadata called WITHOUT opts.schema (DEFAULT_KEYS).
    expect(getMetadataMock).toHaveBeenCalledWith({ name: 'myagent.eth' })
    expect(out.matchedSchema).toEqual({
      uri: schemaUri,
      valid: false,
      error: 'gateway down',
    })
    expect(out.properties).toEqual({
      schema: schemaUri,
      description: 'still readable',
    })
  })

  it('drops pattern-matched keys from output (we never request them)', async () => {
    const schemaUri = 'ipfs://QmPattern'
    getSchemaMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: { schema: schemaUri },
      schema: null,
    })
    fetchSchemaMock.mockResolvedValue(patternSchema)
    // Schema-driven getMetadata only asks for static `properties` keys, so
    // pattern-matched keys aren't even returned by the mocked reader.
    getMetadataMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: {
        class: 'Pattern',
        schema: schemaUri,
      },
      schema: patternSchema,
    })

    const out = await baseRun()

    expect(getMetadataMock).toHaveBeenCalledWith({ name: 'myagent.eth', schema: patternSchema })
    expect(Object.keys(out.properties).sort()).toEqual(['class', 'schema'])
    for (const key of Object.keys(out.properties)) {
      expect(key.startsWith('agent-endpoint')).toBe(false)
    }
  })

  it('routes *.base.eth through the SDK with a basePublicClient', async () => {
    const schemaUri = 'ipfs://QmBaseSchema'
    getSchemaMock.mockResolvedValue({
      name: 'alice.base.eth',
      properties: { schema: schemaUri, class: 'Sample' },
      schema: null,
    })
    fetchSchemaMock.mockResolvedValue(sampleSchema)
    getMetadataMock.mockResolvedValue({
      name: 'alice.base.eth',
      properties: {
        class: 'Sample',
        schema: schemaUri,
        description: 'hello from base',
      },
      schema: sampleSchema,
    })

    await viewCommand.run({
      args: { name: 'alice.base.eth' },
      options: {},
      env: {},
    })

    expect(metadataReaderConfigMock).toHaveBeenCalledTimes(1)
    const cfg = metadataReaderConfigMock.mock.calls[0][0] as { basePublicClient?: unknown }
    expect(cfg.basePublicClient).toBeDefined()
  })

  it('does not pass basePublicClient for mainnet names', async () => {
    getSchemaMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: {},
      schema: null,
    })
    getMetadataMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: { description: 'mainnet only' },
      schema: null,
    })

    await viewCommand.run({ args: { name: 'myagent.eth' }, options: {}, env: {} })

    expect(metadataReaderConfigMock).toHaveBeenCalledTimes(1)
    const cfg = metadataReaderConfigMock.mock.calls[0][0] as { basePublicClient?: unknown }
    expect(cfg.basePublicClient).toBeUndefined()
  })
})
