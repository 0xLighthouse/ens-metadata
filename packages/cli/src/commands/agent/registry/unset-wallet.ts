import { z } from 'zod'
import { executeRegistryCall } from '../../../lib/registry-tx.js'
import { SUPPORTED_CHAINS } from '../../../lib/registry.js'

export const unsetWalletCommand = {
  description: 'Clear the verified wallet from an agent',
  args: z.object({
    agentId: z.string().describe('Agent token ID'),
  }),
  options: z.object({
    chainName: z
      .enum(SUPPORTED_CHAINS)
      .default('mainnet')
      .describe('Chain name (e.g. mainnet, base, arbitrum, optimism)'),
    privateKey: z.string().describe('Private key for signing (hex, prefixed with 0x)'),
    broadcast: z
      .boolean()
      .default(false)
      .describe('Broadcast the transaction on-chain (default: dry run)'),
  }),
  async run(c: {
    args: { agentId: string }
    options: { chainName: string; privateKey: string; broadcast: boolean }
  }) {
    const tokenId = BigInt(c.args.agentId)
    return executeRegistryCall({
      chainName: c.options.chainName,
      privateKey: c.options.privateKey,
      broadcast: c.options.broadcast,
      functionName: 'unsetAgentWallet',
      contractArgs: [tokenId],
      extraDetails: { agentId: tokenId.toString() },
    })
  },
}
