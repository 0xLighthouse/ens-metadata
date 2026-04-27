import { SCHEMA_MAP } from '@ensmetadata/schemas'
import { metadataReader } from '@ensmetadata/sdk'
import { z } from 'zod'
import { clientFromContext, globalEnv, globalOptions, validateName } from '../../lib/context.js'
import { queryDomain } from '../../lib/subgraph.js'

export const viewCommand = {
  description: 'View ENS node metadata',
  args: z.object({
    name: z.string().describe('ENS name (e.g. myagent.eth)'),
  }),
  options: globalOptions,
  env: globalEnv,
  async run(c: {
    args: { name: string }
    options: z.infer<typeof globalOptions>
    env: z.infer<typeof globalEnv>
  }) {
    const ensName = validateName(c.args.name)
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
        properties: {},
      }
    }

    const metadata = await reader.getMetadata({
      name: ensName,
      ...(textKeys ? { keys: textKeys } : {}),
    })

    const cls = metadata.class
    const matchedSchema = cls && SCHEMA_MAP[cls] ? cls : null

    return {
      name: metadata.name,
      resolver: metadata.resolver ?? null,
      address: metadata.address ?? null,
      class: metadata.class ?? null,
      schema: metadata.schema ?? null,
      ...(matchedSchema ? { matchedSchema } : {}),
      properties: metadata.properties,
    }
  },
}
