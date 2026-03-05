import React from 'react'
import { z } from 'zod'
import { executeRegistryCall } from '../../../lib/registry-tx.js'
import { SUPPORTED_CHAINS } from '../../../lib/registry.js'
import { useCommand, CommandStatus } from '../../../lib/use-command.js'

export const description = 'Clear the verified wallet from an agent'

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

export const args = z.tuple([z.string().describe('agent-id (token ID)')])

type Props = {
  options: z.infer<typeof options>
  args: z.infer<typeof args>
}

export default function UnsetWallet({
  options: { chainName, privateKey, broadcast },
  args: [agentId],
}: Props) {
  const tokenId = BigInt(agentId)

  const state = useCommand(
    [chainName, privateKey, broadcast, agentId],
    async (setState) => {
      const result = await executeRegistryCall(
        {
          chainName,
          privateKey,
          broadcast,
          functionName: 'unsetAgentWallet',
          contractArgs: [tokenId],
          dryRunDetails: [`  Agent ID:  ${tokenId.toString()}`],
          successMessage: `✅ Wallet cleared on ${chainName}`,
          successDetails: [`   Agent ID: ${tokenId.toString()}`],
          errorPrefix: 'unsetAgentWallet',
        },
        (msg) => setState({ status: 'working', message: msg }),
      )
      setState({ status: result.status, message: result.message })
    },
  )

  return <CommandStatus state={state} />
}
