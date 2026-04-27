import { http, createPublicClient } from 'viem'
import { z } from 'zod'
import IdentityRegistryABI from '../../../lib/abis/IdentityRegistry.json' with { type: 'json' }
import { SUPPORTED_CHAINS, resolveChain } from '../../../lib/registry.js'
import { RPC_OPTION_DESCRIPTION, resolveRpcUrl } from '../../../lib/rpc.js'

export const queryCommand = {
  description: 'Query agent identity on ERC-8004 registry',
  args: z.object({
    agentId: z.string().describe('Agent token ID'),
  }),
  options: z.object({
    chainName: z
      .enum(SUPPORTED_CHAINS)
      .default('mainnet')
      .describe('Chain name (e.g. mainnet, base, arbitrum, optimism)'),
    rpc: z.string().optional().describe(RPC_OPTION_DESCRIPTION),
  }),
  async run(c: { args: { agentId: string }; options: { chainName: string; rpc?: string } }) {
    const { chain, registryAddress } = resolveChain(c.options.chainName)
    const rpcUrl = resolveRpcUrl(chain.id, c.options)
    const client = createPublicClient({ chain, transport: http(rpcUrl) })
    const tokenId = BigInt(c.args.agentId)

    const [owner, uri] = await Promise.all([
      client.readContract({
        address: registryAddress,
        abi: IdentityRegistryABI,
        functionName: 'ownerOf',
        args: [tokenId],
      }),
      client.readContract({
        address: registryAddress,
        abi: IdentityRegistryABI,
        functionName: 'tokenURI',
        args: [tokenId],
      }),
    ])

    return {
      chain: c.options.chainName,
      registry: registryAddress,
      tokenId: tokenId.toString(),
      owner: owner as `0x${string}`,
      agentUri: uri as string,
    }
  },
}
