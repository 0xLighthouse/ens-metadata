import type { Schema } from '@ensmetadata/schemas/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMetadataMock = vi.fn()
const metadataReaderConfigMock = vi.fn()
const publicClientForNameMock = vi.fn()

vi.mock('@ensmetadata/sdk', async () => {
  const actual = await vi.importActual<typeof import('@ensmetadata/sdk')>('@ensmetadata/sdk')
  return {
    ...actual,
    metadataReader: (config?: unknown) => {
      metadataReaderConfigMock(config)
      return () => ({
        getMetadata: (opts: unknown) => getMetadataMock(opts),
      })
    },
  }
})

vi.mock('../lib/context.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/context.js')>('../lib/context.js')
  return {
    ...actual,
    publicClientForName: (...args: unknown[]) => {
      publicClientForNameMock(...args)
      return {
        // The SDK boundary is mocked, so a stub client is sufficient.
        client: {},
        chain: { id: 1, name: 'mainnet' },
      }
    },
  }
})

vi.mock('../lib/bundled-schemas.js', () => ({
  bundledSchemaResolver: vi.fn(async () => null),
}))

import { viewCommand } from '../commands/view.js'
import { bundledSchemaResolver } from '../lib/bundled-schemas.js'

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

const baseRun = (name = 'myagent.eth') =>
  viewCommand.run({
    args: { name },
    options: {},
    env: {},
  })

describe('viewCommand.run', () => {
  beforeEach(() => {
    getMetadataMock.mockReset()
    metadataReaderConfigMock.mockReset()
    publicClientForNameMock.mockReset()
  })

  it('happy path: validates returned properties against the returned schema', async () => {
    const schemaUri = 'ipfs://QmSchema'
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

    expect(getMetadataMock).toHaveBeenCalledTimes(1)
    expect(getMetadataMock).toHaveBeenCalledWith({ name: 'myagent.eth' })
    expect(metadataReaderConfigMock).toHaveBeenCalledWith({
      schemaResolver: bundledSchemaResolver,
    })
    expect(out).toEqual({
      name: 'myagent.eth',
      class: 'Sample',
      schemaDetails: {
        title: 'Sample',
        version: '1.0.0',
        uri: schemaUri,
      },
      validation: { passed: true },
      properties: {
        class: 'Sample',
        schema: schemaUri,
        description: 'hello',
      },
    })
  })

  it('reports required-missing errors when the returned properties violate the schema', async () => {
    const schemaUri = 'ipfs://QmSchema'
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
    expect(out.schemaDetails).toEqual({
      title: 'Sample',
      version: '1.0.0',
      uri: schemaUri,
    })
    expect(out.validation).toEqual({
      passed: false,
      errors: ['description: Required field "description" is missing'],
    })
  })

  it('flattens each per-key validation error into a single "{key}: {message}" string', async () => {
    const schemaUri = 'ipfs://QmSchema'
    getMetadataMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: { schema: schemaUri },
      schema: sampleSchema,
    })

    const out = await baseRun()

    expect(out.validation).toEqual({
      passed: false,
      errors: [
        'class: Required field "class" is missing',
        'description: Required field "description" is missing',
      ],
    })
  })

  it('errors out when the SDK cannot resolve a schema for the name', async () => {
    getMetadataMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: {
        description: 'default-keys read',
      },
      schema: null,
    })

    await expect(baseRun()).rejects.toThrow(/No schema is set on myagent\.eth/)
  })

  it('propagates errors from getMetadata (no fallback when schema fetch fails)', async () => {
    getMetadataMock.mockRejectedValue(new Error('gateway down'))
    await expect(baseRun()).rejects.toThrow('gateway down')
  })

  it('forwards ipfsGateway from --ipfs-gateway option', async () => {
    getMetadataMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: { class: 'Sample', description: 'x' },
      schema: sampleSchema,
    })

    await viewCommand.run({
      args: { name: 'myagent.eth' },
      options: { ipfsGateway: 'https://gw.test/ipfs' },
      env: {},
    })

    expect(getMetadataMock).toHaveBeenCalledWith({
      name: 'myagent.eth',
      ipfsGateway: 'https://gw.test/ipfs',
    })
  })

  it('forwards ipfsGateway from IPFS_GATEWAY env when the option is unset', async () => {
    getMetadataMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: { class: 'Sample', description: 'x' },
      schema: sampleSchema,
    })

    await viewCommand.run({
      args: { name: 'myagent.eth' },
      options: {},
      env: { IPFS_GATEWAY: 'https://env.test/ipfs' },
    })

    expect(getMetadataMock).toHaveBeenCalledWith({
      name: 'myagent.eth',
      ipfsGateway: 'https://env.test/ipfs',
    })
  })

  it('uses a mainnet client for *.base.eth (CCIP-Read handles L2 lookup)', async () => {
    getMetadataMock.mockResolvedValue({
      name: 'alice.base.eth',
      properties: {
        class: 'Sample',
        schema: 'ipfs://QmBaseSchema',
        description: 'hello from base',
      },
      schema: sampleSchema,
    })

    await baseRun('alice.base.eth')

    expect(publicClientForNameMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock.mock.calls[0][1]).toBe('alice.base.eth')
  })

  it('unflattens array-pattern entries into a nested array in the output', async () => {
    const schemaWithArray: Schema = {
      ...sampleSchema,
      patternProperties: {
        '^audits(\\[[^\\]]+\\])?$': {
          type: 'string',
          parameterType: 'array',
          description: 'audit URIs',
        },
      },
    }
    getMetadataMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: {
        class: 'Sample',
        description: 'hello',
        'audits[0]': 'ipfs://a0',
        'audits[1]': 'ipfs://a1',
      },
      schema: schemaWithArray,
    })

    const out = await baseRun()

    expect(out.properties).toEqual({
      class: 'Sample',
      description: 'hello',
      audits: ['ipfs://a0', 'ipfs://a1'],
    })
    // validation still runs on the flat shape — passes here
    expect(out.validation).toEqual({ passed: true })
  })

  it('uses a mainnet client for mainnet names', async () => {
    getMetadataMock.mockResolvedValue({
      name: 'myagent.eth',
      properties: { class: 'Sample', description: 'mainnet only' },
      schema: sampleSchema,
    })

    await baseRun()

    expect(publicClientForNameMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock.mock.calls[0][1]).toBe('myagent.eth')
  })
})
