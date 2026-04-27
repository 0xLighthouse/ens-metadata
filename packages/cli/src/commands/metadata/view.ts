import { SCHEMA_MAP } from '@ensmetadata/schemas'
import { metadataReader } from '@ensmetadata/sdk'
import { http, createPublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import { z } from 'zod'
import { queryDomain } from '../../lib/subgraph.js'

export const viewCommand = {
  description: 'View ENS node metadata',
  args: z.object({
    name: z.string().describe('ENS name (e.g. myagent.eth)'),
  }),
  options: z.object({}),
  async run(c: { args: { name: string } }) {
    const ensName = c.args.name
    const client = createPublicClient({
      chain: mainnet,
      transport: http(undefined, { batch: { batchSize: 128 } }),
    }).extend(metadataReader())

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

    const metadata = await client.getMetadata({
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
