import { z } from 'zod'
import { SUPPORTED_CHAINS, resolveChain } from '../../../lib/registry.js'

const templateOptions = z.object({
  chain: z
    .enum(SUPPORTED_CHAINS)
    .default('mainnet')
    .describe(
      'Chain the agent will be registered on. Determines the agentRegistry CAIP-10 address.',
    ),
})

/**
 * Derived from <https://best-practices.8004scan.io/docs/01-agent-metadata-standard.html>.
 * The `agentRegistry` CAIP-10 string is computed from the canonical IdentityRegistry
 * address for the selected chain (see `src/lib/registry.ts`), so the template stays in
 * sync with what `agent registry register --chain <name>` will actually use.
 */
function buildTemplate(chainName: string) {
  const { chain, registryAddress } = resolveChain(chainName)
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'My Agent',
    description: 'A short description of what this agent does and its capabilities.',
    image: 'https://example.com/agent-avatar.png',
    services: [
      {
        name: 'MCP',
        endpoint: 'https://api.example.com/mcp',
        version: '2025-11-25',
        mcpTools: [],
        capabilities: [],
      },
      {
        name: 'A2A',
        endpoint: 'https://example.com/.well-known/agent-card.json',
        version: '0.3.0',
      },
      {
        name: 'agentWallet',
        endpoint: `eip155:${chain.id}:0x0000000000000000000000000000000000000000`,
      },
    ],
    registrations: [
      {
        agentId: 0,
        agentRegistry: `eip155:${chain.id}:${registryAddress}`,
      },
    ],
    supportedTrust: ['reputation'],
    active: false,
    x402Support: false,
    updatedAt: Math.floor(Date.now() / 1000),
  }
}

export const templateCommand = {
  description: 'Generate empty ERC-8004 v2.0 registration file template',
  args: z.object({}),
  options: templateOptions,
  run(c: { options: z.infer<typeof templateOptions> }) {
    return buildTemplate(c.options.chain)
  },
}
