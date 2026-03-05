import { readFileSync } from 'node:fs'
import React from 'react'
import { z } from 'zod'
import { SCHEMA_MAP } from '@ens-node-metadata/schemas'
import { getPublishedRegistry } from '@ens-node-metadata/schemas/published'
import { validateMetadataSchema } from '@ens-node-metadata/sdk'
import { setEnsTextRecords, estimateEnsTextRecordsCost, formatCost, validateEnsTextRecordsCost } from '../../lib/ens-write.js'
import { useCommand, CommandStatus } from '../../lib/use-command.js'

export const description = 'Set ENS metadata text records from a payload file'

export const args = z.tuple([
  z.string().describe('ENS name (e.g. myagent.eth)'),
  z.string().describe('payload.json'),
])

export const options = z.object({
  privateKey: z.string().describe('Private key for signing (hex, prefixed with 0x)'),
  broadcast: z
    .boolean()
    .default(false)
    .describe('Broadcast the transaction on-chain (default: dry run)'),
})

type Props = {
  args: z.infer<typeof args>
  options: z.infer<typeof options>
}

export default function Set({ args: [ensName, payloadFile], options }: Props) {
  const state = useCommand(
    [ensName, payloadFile, options],
    async (setState) => {
      let payload: Record<string, string>
      try {
        const raw: unknown = JSON.parse(readFileSync(payloadFile, 'utf8'))
        const result = validateMetadataSchema(raw, SCHEMA_MAP.Agent)
        if (!result.success) {
          const issues = result.errors.map((e) => `[${e.key}] ${e.message}`).join('\n')
          setState({ status: 'error', message: `Invalid payload:\n${issues}` })
          return
        }
        payload = result.data
      } catch (err) {
        setState({ status: 'error', message: `Error reading payload: ${(err as Error).message}` })
        return
      }

      // Inject schema CID from the published registry
      try {
        const registry = await getPublishedRegistry()
        const agentSchema = registry.schemas['agent']
        if (agentSchema) {
          const latestVersion = agentSchema.published[agentSchema.latest]
          if (latestVersion?.cid) {
            payload['schema'] = `ipfs://${latestVersion.cid}`
          }
        }
      } catch {
        // Non-fatal — proceed without schema record
      }

      const texts = Object.entries(payload).map(([key, value]) => ({ key, value }))

      if (!options.broadcast) {
        let costLine = '  Est. Cost: unable to estimate'
        let balanceLine = ''
        try {
          const est = await estimateEnsTextRecordsCost(ensName, texts, options.privateKey)
          costLine = `  Est. Cost: ${formatCost(est)}`
          balanceLine = `  Balance:   ${est.balance}`
        } catch (err) { console.error('DEBUG estimate error:', err) }

        const lines = [
          `Dry run — would set ${texts.length} text records on ${ensName}:`,
          '',
          ...texts.map((t) => `  setText("${t.key}", "${t.value}")`),
          balanceLine,
          costLine,
          '',
          'Run with --broadcast to submit on-chain.',
        ]
        setState({ status: 'done', message: lines.join('\n') })
        return
      }

      setState({ status: 'working', message: `Setting ${texts.length} text records on ${ensName}…` })
      try {
        await validateEnsTextRecordsCost(ensName, texts, options.privateKey)
        const hash = await setEnsTextRecords(ensName, texts, options.privateKey)
        setState({ status: 'done', message: `✅ Transaction submitted: https://etherscan.io/tx/${hash}` })
      } catch (err) {
        setState({ status: 'error', message: `Transaction failed: ${(err as Error).message}` })
      }
    },
  )

  return <CommandStatus state={state} />
}
