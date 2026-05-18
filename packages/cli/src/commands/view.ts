import type { Schema } from '@ensmetadata/schemas/types'
import { metadataReader, validateMetadata } from '@ensmetadata/sdk'
import { z } from 'zod'
import { bundledSchemaResolver } from '../lib/bundled-schemas.js'
import { globalEnv, globalOptions, publicClientForName, validateName } from '../lib/context.js'

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

export const viewCommand = {
  description: 'View ENS node metadata',
  args: z.object({
    name: z.string().describe('ENS name (e.g. myagent.eth)'),
  }),
  options: viewOptions,
  env: viewEnv,
  async run(ctx: {
    args: { name: string }
    options: z.infer<typeof viewOptions>
    env: z.infer<typeof viewEnv>
  }) {
    const ensName = validateName(ctx.args.name)
    const ipfsGateway = ctx.options.ipfsGateway ?? ctx.env.IPFS_GATEWAY
    const { client, chain } = publicClientForName(ctx, ensName)
    const reader = metadataReader({ schemaResolver: bundledSchemaResolver })(client)

    const metadata = await reader.getMetadata({
      name: ensName,
      ...(chain.ensRegistry ? { registry: chain.ensRegistry } : {}),
      ...(ipfsGateway ? { ipfsGateway } : {}),
    })

    if (!metadata.schema) {
      throw new Error(
        `No schema is set on ${ensName}. Cannot read metadata without a schema record.`,
      )
    }

    const properties: Record<string, string> = { ...metadata.properties }
    const schemaUri = properties.schema ?? null

    const result = validateMetadata(properties, metadata.schema)
    const validation = result.success
      ? { passed: true }
      : { passed: false, errors: result.errors.map(({ key, message }) => `${key}: ${message}`) }

    return {
      name: metadata.name,
      class: properties.class ?? null,
      schemaDetails: {
        title: metadata.schema.title,
        version: metadata.schema.version,
        uri: schemaUri,
      },
      validation,
      properties,
    }
  },
}
