import { z } from 'zod'
import IdentityRegistryABI from '../../../lib/abis/IdentityRegistry.json' with { type: 'json' }
import { chainAwareOptions, clientFromContext, globalEnv } from '../../../lib/context.js'

export const queryCommand = {
  description: 'Query agent identity on ERC-8004 registry',
  args: z.object({
    agentId: z.string().describe('Agent token ID'),
  }),
  options: chainAwareOptions,
  env: globalEnv,
  async run(ctx: {
    args: { agentId: string }
    options: z.infer<typeof chainAwareOptions>
    env: z.infer<typeof globalEnv>
  }) {
    const { client, registryAddress } = clientFromContext(ctx)
    const tokenId = BigInt(ctx.args.agentId)

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
      chain: ctx.options.chain,
      registry: registryAddress,
      tokenId: tokenId.toString(),
      owner: owner as `0x${string}`,
      agentUri: uri as string,
    }
  },
}
