import type { Schema } from '@ensmetadata/schemas/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const readFileSyncMock = vi.fn<(path: string, enc: string) => string>()
const fetchSchemaMock = vi.fn()

vi.mock('node:fs', () => ({
  readFileSync: (path: string, enc: string) => readFileSyncMock(path, enc),
}))

vi.mock('@ensmetadata/sdk', async () => {
  const actual = await vi.importActual<typeof import('@ensmetadata/sdk')>('@ensmetadata/sdk')
  return {
    ...actual,
    fetchSchema: (...args: unknown[]) => fetchSchemaMock(...args),
  }
})

vi.mock('../lib/bundled-schemas.js', () => ({
  bundledSchemaResolver: vi.fn(async () => null),
}))

import { validateCommand } from '../commands/validate.js'

const SAMPLE_SCHEMA: Schema = {
  $id: 'sample',
  source: 'test',
  title: 'Sample',
  version: '1.0.0',
  description: 'sample',
  type: 'object',
  properties: {
    class: { type: 'string', default: 'Sample', description: 'class id' },
    schema: { type: 'string', description: 'schema URI' },
    description: { type: 'string', description: 'description' },
  },
  patternProperties: {
    '^audits(\\[[^\\]]+\\])?$': {
      type: 'string',
      parameterType: 'array',
      description: 'audit URIs',
    },
  },
  required: ['class', 'description'],
}

const runWith = (payload: unknown) => {
  readFileSyncMock.mockReturnValue(JSON.stringify(payload))
  return validateCommand.run({ args: { file: '/tmp/payload.json' }, options: {}, env: {} })
}

describe('validateCommand', () => {
  beforeEach(() => {
    readFileSyncMock.mockReset()
    fetchSchemaMock.mockReset()
    fetchSchemaMock.mockResolvedValue(SAMPLE_SCHEMA)
    process.exitCode = 0
  })

  it('fails when the payload has no schema field — points the user at `template`', async () => {
    await expect(runWith({ class: 'Sample', description: 'hi' })).rejects.toThrow(
      /no `schema` field.*ens-metadata template/,
    )
  })

  it('fetches the schema URI from the payload and validates against it', async () => {
    const out = (await runWith({
      schema: 'ipfs://QmSchema',
      class: 'Sample',
      description: 'hi',
      audits: ['ipfs://a0', 'ipfs://a1'],
    })) as { valid: boolean; recordCount: number; schema: { uri: string } }

    expect(fetchSchemaMock).toHaveBeenCalledTimes(1)
    expect(fetchSchemaMock.mock.calls[0][0]).toBe('ipfs://QmSchema')
    expect(out.valid).toBe(true)
    // schema + class + description + audits[0] + audits[1] = 5 records
    expect(out.recordCount).toBe(5)
    expect(out.schema.uri).toBe('ipfs://QmSchema')
  })

  it('rejects flat array-form keys before reaching validateMetadata', async () => {
    await expect(
      runWith({
        schema: 'ipfs://QmSchema',
        class: 'Sample',
        description: 'hi',
        'audits[0]': 'ipfs://a0',
      }),
    ).rejects.toThrow(/flat array form is not accepted/)
  })

  it('flags schema-level errors and sets exitCode to 1', async () => {
    const out = (await runWith({
      schema: 'ipfs://QmSchema',
      // missing required `class` and `description`
    })) as { valid: boolean; errors: { key: string; message: string }[] }

    expect(out.valid).toBe(false)
    expect(out.errors.map((e) => e.key).sort()).toEqual(['class', 'description'])
    expect(process.exitCode).toBe(1)
  })

  it('forwards --ipfs-gateway to fetchSchema', async () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ schema: 'ipfs://QmSchema', class: 'Sample', description: 'hi' }),
    )
    await validateCommand.run({
      args: { file: '/tmp/payload.json' },
      options: { ipfsGateway: 'https://gw.test/ipfs' },
      env: {},
    })
    expect(fetchSchemaMock.mock.calls[0][1]).toMatchObject({ ipfsGateway: 'https://gw.test/ipfs' })
  })
})
