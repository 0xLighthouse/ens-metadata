import { z } from 'zod'
import { chainAwareOptions, globalEnv } from '../../../lib/context.js'
import { executeRegistryCall } from '../../../lib/registry-tx.js'

const unsetWalletOptions = chainAwareOptions.extend({
  privateKey: z.string().describe('Private key for signing (hex, prefixed with 0x)'),
  broadcast: z
    .boolean()
    .default(false)
    .describe('Broadcast the transaction on-chain (default: dry run)'),
})

export const unsetWalletCommand = {
  description: 'Clear the verified wallet from an agent',
  args: z.object({
    agentId: z.string().describe('Agent token ID'),
  }),
  options: unsetWalletOptions,
  env: globalEnv,
  async run(ctx: {
    args: { agentId: string }
    options: z.infer<typeof unsetWalletOptions>
    env: z.infer<typeof globalEnv>
  }) {
    const tokenId = BigInt(ctx.args.agentId)
    return executeRegistryCall(ctx, {
      privateKey: ctx.options.privateKey,
      broadcast: ctx.options.broadcast,
      functionName: 'unsetAgentWallet',
      contractArgs: [tokenId],
      extraDetails: { agentId: tokenId.toString() },
    })
  },
}
