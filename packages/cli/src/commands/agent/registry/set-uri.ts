import { z } from 'zod'
import { chainAwareOptions, globalEnv } from '../../../lib/context.js'
import { executeRegistryCall } from '../../../lib/registry-tx.js'

const setUriOptions = chainAwareOptions.extend({
  privateKey: z.string().describe('Private key for signing (hex, prefixed with 0x)'),
  broadcast: z
    .boolean()
    .default(false)
    .describe('Broadcast the transaction on-chain (default: dry run)'),
})

export const setUriCommand = {
  description: 'Update agent URI on the ERC-8004 registry',
  args: z.object({
    agentId: z.string().describe('Agent token ID'),
    newUri: z.string().describe('New agent URI (e.g. ipfs://...)'),
  }),
  options: setUriOptions,
  env: globalEnv,
  async run(c: {
    args: { agentId: string; newUri: string }
    options: z.infer<typeof setUriOptions>
    env: z.infer<typeof globalEnv>
  }) {
    const tokenId = BigInt(c.args.agentId)
    return executeRegistryCall(c, {
      privateKey: c.options.privateKey,
      broadcast: c.options.broadcast,
      functionName: 'setAgentURI',
      contractArgs: [tokenId, c.args.newUri],
      extraDetails: { agentId: tokenId.toString(), newUri: c.args.newUri },
    })
  },
}
