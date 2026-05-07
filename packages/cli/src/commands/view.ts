import { fetchSchemaByUri, metadataReader, validateMetadataSchema } from '@ensmetadata/sdk'
import { z } from 'zod'
import { bundledSchemaResolver } from '../lib/bundled-schemas.js'
import { clientFromContext, globalEnv, globalOptions, validateName } from '../lib/context.js'
import { queryDomain } from '../lib/subgraph.js'

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
 * If a `schema` URI is set on the name, fetch the schema document and validate
 * the name's properties against it. Returns `null` when no URI is declared.
 *
 * Fetch failures are surfaced as a soft failure (`valid: false` with an
 * `error` string) rather than throwing, so a `view` call still returns the
 * rest of the metadata even if IPFS is unreachable.
 */
async function buildMatchedSchema(
  schemaUri: string | undefined | null,
  properties: Record<string, unknown>,
  ipfsGateway: string | undefined,
): Promise<MatchedSchema | null> {
  if (!schemaUri) return null

  let schema: Awaited<ReturnType<typeof fetchSchemaByUri>>
  try {
    schema = await fetchSchemaByUri(schemaUri, {
      localResolver: bundledSchemaResolver,
      ...(ipfsGateway ? { ipfsGateway } : {}),
    })
  } catch (err) {
    return {
      uri: schemaUri,
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const result = validateMetadataSchema(properties, schema)
  if (result.success) {
    return { title: schema.title, version: schema.version, uri: schemaUri, valid: true }
  }
  return {
    title: schema.title,
    version: schema.version,
    uri: schemaUri,
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
    const reader = client.extend(metadataReader())

    const domain = await queryDomain(ensName)
    if (domain && !domain.resolver) {
      throw new Error(`No resolver set for ${ensName}`)
    }

    const textKeys = domain?.resolver?.texts
    if (domain && textKeys && textKeys.length === 0) {
      return {
        name: ensName,
        resolver: domain.resolver?.address ?? null,
        address: domain.resolvedAddress?.id ?? null,
        class: null,
        schema: null,
        matchedSchema: null,
        properties: {},
      }
    }

    const metadata = await reader.getMetadata({
      name: ensName,
      ...(textKeys ? { keys: textKeys } : {}),
    })

    const matchedSchema = await buildMatchedSchema(
      metadata.schema,
      metadata.properties,
      ipfsGateway,
    )

    return {
      name: metadata.name,
      resolver: metadata.resolver ?? null,
      address: metadata.address ?? null,
      class: metadata.class ?? null,
      schema: metadata.schema ?? null,
      matchedSchema,
      properties: metadata.properties,
    }
  },
}
