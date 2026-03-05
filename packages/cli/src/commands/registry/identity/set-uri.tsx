import React from 'react'
import { z } from 'zod'
import { executeRegistryCall } from '../../../lib/registry-tx.js'
import { SUPPORTED_CHAINS } from '../../../lib/registry.js'
import { useCommand, CommandStatus } from '../../../lib/use-command.js'

export const description = 'Update agent URI on the ERC-8004 registry'

export const options = z.object({
  chainName: z
    .enum(SUPPORTED_CHAINS)
    .default('mainnet')
    .describe('Chain name (e.g. mainnet, base, arbitrum, optimism)'),
  privateKey: z
    .string()
    .describe('Private key for signing (hex, prefixed with 0x)'),
  broadcast: z
    .boolean()
    .default(false)
    .describe('Broadcast the transaction on-chain (default: dry run)'),
})

export const args = z.tuple([
  z.string().describe('agent-id (token ID)'),
  z.string().describe('new-uri (e.g. ipfs://...)'),
])

type Props = {
  options: z.infer<typeof options>
  args: z.infer<typeof args>
}

export default function SetUri({
  options: { chainName, privateKey, broadcast },
  args: [agentId, newUri],
}: Props) {
  const tokenId = BigInt(agentId)

  const state = useCommand(
    [chainName, privateKey, broadcast, agentId, newUri],
    async (setState) => {
      const result = await executeRegistryCall(
        {
          chainName,
          privateKey,
          broadcast,
          functionName: 'setAgentURI',
          contractArgs: [tokenId, newUri],
          dryRunDetails: [
            `  Agent ID:  ${tokenId.toString()}`,
            `  New URI:   ${newUri}`,
          ],
          successMessage: `✅ Agent URI updated on ${chainName}`,
          successDetails: [
            `   Agent ID: ${tokenId.toString()}`,
            `   New URI:  ${newUri}`,
          ],
          errorPrefix: 'setAgentURI',
        },
        (msg) => setState({ status: 'working', message: msg }),
      )
      setState({ status: result.status, message: result.message })
    },
  )

  return <CommandStatus state={state} />
}
