import { z } from 'zod'

/**
 * Derived from <https://best-practices.8004scan.io/docs/01-agent-metadata-standard.html>
 */
function buildTemplate() {
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
        endpoint: 'eip155:1:0x0000000000000000000000000000000000000000',
      },
    ],
    registrations: [
      {
        agentId: 0,
        agentRegistry: 'eip155:1:0x8004a6090Cd10A7288092483047B097295Fb8847',
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
  options: z.object({}),
  run() {
    return buildTemplate()
  },
}
