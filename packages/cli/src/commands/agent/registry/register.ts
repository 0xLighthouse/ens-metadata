import { z } from 'zod'
import { executeRegistryCall } from '../../../lib/registry-tx.js'
import { SUPPORTED_CHAINS, resolveChain } from '../../../lib/registry.js'
import { RPC_OPTION_DESCRIPTION, resolveRpcUrl } from '../../../lib/rpc.js'

export const registerCommand = {
  description: 'Register agent identity on ERC-8004 registry',
  args: z.object({
    agentUri: z.string().describe('Agent URI (e.g. ipfs://...)'),
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
    rpc: z.string().optional().describe(RPC_OPTION_DESCRIPTION),
  }),
  async run(c: {
    args: { agentUri: string }
    options: { chainName: string; privateKey: string; broadcast: boolean; rpc?: string }
  }) {
    const { chain } = resolveChain(c.options.chainName)
    const rpcUrl = resolveRpcUrl(chain.id, c.options)
    return executeRegistryCall({
      chainName: c.options.chainName,
      privateKey: c.options.privateKey,
      broadcast: c.options.broadcast,
      rpcUrl,
      functionName: 'register',
      contractArgs: [c.args.agentUri],
      extraDetails: { agentUri: c.args.agentUri },
    })
  },
}
