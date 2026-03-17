import React from 'react'
import { z } from 'zod'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { SCHEMA_MAP } from '@ens-node-metadata/schemas'
import { ensMetadataActions, type GetMetadataResult } from '@ens-node-metadata/sdk'
import { queryDomain } from '../../lib/subgraph.js'
import { useCommand, CommandStatus } from '../../lib/use-command.js'

export const description = 'View ENS node metadata'

export const args = z.tuple([z.string().describe('ENS name')])

export const options = z.object({
  json: z.boolean().default(false).describe('Output as JSON'),
})

type Props = {
  args: z.infer<typeof args>
  options: z.infer<typeof options>
}

function formatOutput(metadata: GetMetadataResult): string {
  const cls = metadata.class
  const matchedSchemaName = cls && SCHEMA_MAP[cls] ? cls : null

  const lines: string[] = [
    `Metadata for ${metadata.name}`,
    '',
    `  Resolver:  ${metadata.resolver ?? '(none)'}`,
    `  Address:   ${metadata.address ?? '(none)'}`,
    `  Class:     ${metadata.class ?? '(none)'}`,
    `  Schema:    ${metadata.schema ?? '(none)'}`,
    ...(matchedSchemaName ? [`  Matched:   ${matchedSchemaName}`] : []),
    '',
    '  Properties:',
  ]

  const entries = Object.entries(metadata.properties)
  if (entries.length === 0) {
    lines.push('    (none)')
  } else {
    for (const [key, value] of entries) {
      lines.push(`    ${key}: ${value ?? '(not set)'}`)
    }
  }

  return lines.join('\n')
}

export default function View({ args: [ensName], options }: Props) {
  const state = useCommand([ensName, options], async (setState) => {
    setState({ status: 'working', message: `Fetching metadata for ${ensName}…` })

    const client = createPublicClient({
      chain: mainnet,
      transport: http(undefined, { batch: { batchSize: 128 } }),
    }).extend(ensMetadataActions())

    // Query subgraph for fast key discovery
    const domain = await queryDomain(ensName)

    if (domain && !domain.resolver) {
      setState({ status: 'error', message: `No resolver set for ${ensName}` })
      return
    }

    const textKeys = domain?.resolver?.texts

    if (domain && textKeys && textKeys.length === 0) {
      setState({
        status: 'done',
        message: [
          `Metadata for ${ensName}`,
          '',
          `  Resolver:  ${domain.resolver!.address}`,
          `  Address:   ${domain.resolvedAddress?.id ?? '(none)'}`,
          '',
          '  No text records set.',
        ].join('\n'),
      })
      return
    }

    // Fetch metadata using known keys from subgraph
    const metadata = await client.getMetadata({
      name: ensName,
      ...(textKeys ? { keys: textKeys } : {}),
    })

    if (options.json) {
      process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`)
      setState({ status: 'done', message: '' })
      return
    }

    setState({ status: 'done', message: formatOutput(metadata) })
  })

  if (options.json) return state.status === 'error' ? <CommandStatus state={state} /> : null
  return <CommandStatus state={state} />
}
