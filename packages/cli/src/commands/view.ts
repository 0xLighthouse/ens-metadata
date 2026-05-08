import type { Schema } from '@ensmetadata/schemas/types'
import { fetchSchemaByUri, metadataReader, validateMetadataSchema } from '@ensmetadata/sdk'
import { z } from 'zod'
import { bundledSchemaResolver } from '../lib/bundled-schemas.js'
import {
  baseClientForName,
  clientFromContext,
  globalEnv,
  globalOptions,
  validateName,
} from '../lib/context.js'

const viewOptions = globalOptions.extend({
  ipfsGateway: z
    .string()
    .optional()
    .describe(
      'IPFS gateway origin used to fetch the schema document declared on the name (defaults to https://ipfs.io, env: IPFS_GATEWAY).',
    ),
})

const viewEnv = globalEnv.extend({
  IPFS_GATEWAY: z.string().optional().describe('IPFS gateway origin (e.g. https://ipfs.io)'),
})

type MatchedSchema =
  | { title: string; version: string; uri: string; valid: true }
  | {
      title: string
      version: string
      uri: string
      valid: false
      errors: { key: string; message: string }[]
    }
  | { uri: string; valid: false; error: string }

/**
 * Build the validation outcome for the schema URI declared on the name.
 * Returns `null` when no URI is declared. The schema document is fetched
 * upstream so a fetch failure can degrade gracefully without losing the
 * rest of the metadata read.
 */
function buildMatchedSchema(
  uri: string | null,
  schema: Schema | null,
  fetchError: string | null,
  payload: Record<string, string>,
): MatchedSchema | null {
  if (!uri) return null
  if (fetchError) return { uri, valid: false, error: fetchError }
  if (!schema) return { uri, valid: false, error: 'schema not loaded' }

  const result = validateMetadataSchema(payload, schema)
  if (result.success) {
    return { title: schema.title, version: schema.version, uri, valid: true }
  }
  return {
    title: schema.title,
    version: schema.version,
    uri,
    valid: false,
    errors: result.errors.map(({ key, message }) => ({ key, message })),
  }
}

export const viewCommand = {
  description: 'View ENS node metadata',
  args: z.object({
    name: z.string().describe('ENS name (e.g. myagent.eth)'),
  }),
  options: viewOptions,
  env: viewEnv,
  async run(c: {
    args: { name: string }
    options: z.infer<typeof viewOptions>
    env: z.infer<typeof viewEnv>
  }) {
    const ensName = validateName(c.args.name)
    const ipfsGateway = c.options.ipfsGateway ?? c.env.IPFS_GATEWAY
    const { client } = clientFromContext(c, 'mainnet')
    const basePublicClient = baseClientForName(c, ensName)
    const reader = client.extend(metadataReader(basePublicClient ? { basePublicClient } : {}))

    const schemaInfo = await reader.getSchema({ name: ensName })

    let schema: Schema | null = null
    let schemaError: string | null = null
    if (schemaInfo.schema) {
      try {
        schema = await fetchSchemaByUri(schemaInfo.schema, {
          localResolver: bundledSchemaResolver,
          ...(ipfsGateway ? { ipfsGateway } : {}),
        })
      } catch (err) {
        schemaError = err instanceof Error ? err.message : String(err)
      }
    }

    const metadata = await reader.getMetadata({
      name: ensName,
      ...(schema ? { schema } : {}),
    })

    if (metadata.resolver === null) {
      throw new Error(`No resolver set for ${ensName}`)
    }

    const payload: Record<string, string> = {}
    for (const [k, v] of Object.entries(metadata.properties)) {
      if (typeof v === 'string' && v.length > 0) payload[k] = v
    }

    const matchedSchema = buildMatchedSchema(schemaInfo.schema, schema, schemaError, payload)

    return {
      name: metadata.name,
      resolver: metadata.resolver,
      address: metadata.address ?? null,
      class: metadata.class ?? null,
      schema: metadata.schema ?? null,
      matchedSchema,
      properties: payload,
    }
  },
}
