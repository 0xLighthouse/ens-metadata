import React from 'react'
import { z } from 'zod'
import { executeRegistryCall } from '../../../lib/registry-tx.js'
import { SUPPORTED_CHAINS } from '../../../lib/registry.js'
import { useCommand, CommandStatus } from '../../../lib/use-command.js'

export const description = 'Register agent identity on ERC-8004 registry'

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

export const args = z.tuple([z.string().describe('agent-uri (e.g. ipfs://...)')])

type Props = {
  options: z.infer<typeof options>
  args: z.infer<typeof args>
}

export default function Register({
  options: { chainName, privateKey, broadcast },
  args: [agentUri],
}: Props) {
  const state = useCommand(
    [chainName, privateKey, broadcast, agentUri],
    async (setState) => {
      const result = await executeRegistryCall(
        {
          chainName,
          privateKey,
          broadcast,
          functionName: 'register',
          contractArgs: [agentUri],
          dryRunDetails: [`  Agent URI: ${agentUri}`],
          successMessage: `✅ Agent registered on ${chainName}`,
          successDetails: [`   Agent URI: ${agentUri}`],
          errorPrefix: 'Registration',
        },
        (msg) => setState({ status: 'working', message: msg }),
      )
      setState({ status: result.status, message: result.message })
    },
  )

  return <CommandStatus state={state} />
}
