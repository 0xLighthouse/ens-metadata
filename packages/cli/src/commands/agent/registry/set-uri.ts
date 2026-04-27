import { z } from 'zod'
import { executeRegistryCall } from '../../../lib/registry-tx.js'
import { SUPPORTED_CHAINS, resolveChain } from '../../../lib/registry.js'
import { RPC_OPTION_DESCRIPTION, resolveRpcUrl } from '../../../lib/rpc.js'

export const setUriCommand = {
  description: 'Update agent URI on the ERC-8004 registry',
  args: z.object({
    agentId: z.string().describe('Agent token ID'),
    newUri: z.string().describe('New agent URI (e.g. ipfs://...)'),
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
    args: { agentId: string; newUri: string }
    options: { chainName: string; privateKey: string; broadcast: boolean; rpc?: string }
  }) {
    const tokenId = BigInt(c.args.agentId)
    const { chain } = resolveChain(c.options.chainName)
    const rpcUrl = resolveRpcUrl(chain.id, c.options)
    return executeRegistryCall({
      chainName: c.options.chainName,
      privateKey: c.options.privateKey,
      broadcast: c.options.broadcast,
      rpcUrl,
      functionName: 'setAgentURI',
      contractArgs: [tokenId, c.args.newUri],
      extraDetails: { agentId: tokenId.toString(), newUri: c.args.newUri },
    })
  },
}
