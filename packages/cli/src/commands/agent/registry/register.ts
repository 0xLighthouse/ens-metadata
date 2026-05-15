import { z } from 'zod'
import { chainAwareOptions, globalEnv } from '../../../lib/context.js'
import { executeRegistryCall } from '../../../lib/registry-tx.js'

const registerOptions = chainAwareOptions.extend({
  privateKey: z.string().describe('Private key for signing (hex, prefixed with 0x)'),
  broadcast: z
    .boolean()
    .default(false)
    .describe('Broadcast the transaction on-chain (default: dry run)'),
})

export const registerCommand = {
  description: 'Register agent identity on ERC-8004 registry',
  args: z.object({
    agentUri: z.string().describe('Agent URI (e.g. ipfs://...)'),
  }),
  options: registerOptions,
  env: globalEnv,
  async run(ctx: {
    args: { agentUri: string }
    options: z.infer<typeof registerOptions>
    env: z.infer<typeof globalEnv>
  }) {
    return executeRegistryCall(ctx, {
      privateKey: ctx.options.privateKey,
      broadcast: ctx.options.broadcast,
      functionName: 'register',
      contractArgs: [ctx.args.agentUri],
      extraDetails: { agentUri: ctx.args.agentUri },
    })
  },
}
