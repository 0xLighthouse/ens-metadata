import { readFileSync } from 'node:fs'
import { fetchSchema, flatten, validateMetadata } from '@ensmetadata/sdk'
import { z } from 'zod'
import { bundledSchemaResolver } from '../lib/bundled-schemas.js'
import { assertNestedPayload } from '../lib/shape.js'

const validateOptions = z.object({
  ipfsGateway: z
    .string()
    .optional()
    .describe(
      'IPFS gateway origin used to fetch the schema declared in the payload (defaults to https://ipfs.io, env: IPFS_GATEWAY).',
    ),
})

const validateEnv = z.object({
  IPFS_GATEWAY: z.string().optional().describe('IPFS gateway origin (e.g. https://ipfs.io)'),
})

export const validateCommand = {
  description:
    'Validate a metadata payload against the schema it declares (the `schema` field at the top level — generate one with `ens-metadata template <type>`).',
  args: z.object({
    file: z.string().describe('Path to payload.json'),
  }),
  options: validateOptions,
  env: validateEnv,
  async run(ctx: {
    args: { file: string }
    options: z.infer<typeof validateOptions>
    env: z.infer<typeof validateEnv>
  }) {
    const raw: unknown = JSON.parse(readFileSync(ctx.args.file, 'utf8'))
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error('Payload must be a JSON object.')
    }
    const rawRecord = raw as Record<string, unknown>

    const schemaUri =
      typeof rawRecord.schema === 'string' && rawRecord.schema.length > 0 ? rawRecord.schema : null
    if (!schemaUri) {
      throw new Error(
        'Payload has no `schema` field. Run `ens-metadata template <type>` to generate a payload with the schema URI pre-filled.',
      )
    }

    const ipfsGateway = ctx.options.ipfsGateway ?? ctx.env.IPFS_GATEWAY
    const schema = await fetchSchema(schemaUri, {
      resolver: bundledSchemaResolver,
      ...(ipfsGateway ? { ipfsGateway } : {}),
    })

    const hydrated = assertNestedPayload(rawRecord, schema)
    const flat = flatten(hydrated)
    const result = validateMetadata(flat, schema)

    if (result.success) {
      return {
        valid: true,
        recordCount: Object.keys(result.data).length,
        schema: { title: schema.title, version: schema.version, uri: schemaUri },
      }
    }
    process.exitCode = 1
    return {
      valid: false,
      schema: { title: schema.title, version: schema.version, uri: schemaUri },
      errors: result.errors.map(({ key, message }) => ({ key, message })),
    }
  },
}
