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
  async run(c: {
    args: { agentUri: string }
    options: z.infer<typeof registerOptions>
    env: z.infer<typeof globalEnv>
  }) {
    return executeRegistryCall(c, {
      privateKey: c.options.privateKey,
      broadcast: c.options.broadcast,
      functionName: 'register',
      contractArgs: [c.args.agentUri],
      extraDetails: { agentUri: c.args.agentUri },
    })
  },
}
