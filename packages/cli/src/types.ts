/**
 * Zod schema for ERC-8004 v2.0 agent registration files.
 * @see https://best-practices.8004scan.io/docs/01-agent-metadata-standard.html
 */
import { z } from 'zod'

// ─── Service schemas (discriminated on `name`) ───────────────────────────────

const McpServiceSchema = z.object({
  name: z.literal('MCP'),
  endpoint: z.string().url().describe('MCP server URL'),
  version: z.string().describe('MCP protocol version date (e.g. 2025-11-25)'),
  mcpTools: z.array(z.string()).optional().describe('Tool names exposed by this MCP server'),
  capabilities: z.array(z.string()).optional().describe('MCP capability identifiers'),
})

const A2AServiceSchema = z.object({
  name: z.literal('A2A'),
  endpoint: z.string().url().describe('URL to the agent card JSON (e.g. /.well-known/agent-card.json)'),
  version: z.string().describe('A2A protocol version (e.g. 0.3.0)'),
})

const OasfServiceSchema = z.object({
  name: z.literal('OASF'),
  endpoint: z.string().url().describe('OASF schema endpoint URL'),
  version: z.string().describe('OASF version (e.g. 0.8.0)'),
  skills: z.array(z.string()).optional().describe('Skill paths (e.g. analytical_skills/data_analysis/blockchain_analysis)'),
  domains: z.array(z.string()).optional().describe('Domain paths (e.g. technology/blockchain)'),
})

const AgentWalletServiceSchema = z.object({
  name: z.literal('agentWallet'),
  endpoint: z.string().describe('CAIP-10 wallet address (e.g. eip155:1:0x...)'),
})

const WebServiceSchema = z.object({
  name: z.literal('web'),
  endpoint: z.string().url().describe('Human-facing web UI URL'),
})

const EmailServiceSchema = z.object({
  name: z.literal('email'),
  endpoint: z.string().email().describe('Support email address'),
})

const EnsServiceSchema = z.object({
  name: z.literal('ENS'),
  endpoint: z.string().describe('ENS name (e.g. myagent.eth)'),
  version: z.string().optional().describe('ENS version (e.g. v1)'),
})

const DidServiceSchema = z.object({
  name: z.literal('DID'),
  endpoint: z.string().describe('Decentralized identifier (e.g. did:ethr:0x... or did:web:example.com)'),
  version: z.string().optional().describe('DID version'),
})

// Catch-all for custom/future service types not yet defined in the spec.
// ERC-8004 explicitly states "the number and type of endpoints are fully
// customizable", so we must not reject unknown names.
// Known names are explicitly excluded so their stricter schemas still apply —
// without this, the passthrough would silently accept e.g. malformed email endpoints.
const KNOWN_SERVICE_NAMES = ['MCP', 'A2A', 'OASF', 'agentWallet', 'web', 'email', 'ENS', 'DID'] as const
const UnknownServiceSchema = z.object({
  name: z.string().refine(
    (n) => !(KNOWN_SERVICE_NAMES as readonly string[]).includes(n),
    { message: 'Use the typed schema for known service names' }
  ).describe('Custom service type name'),
  endpoint: z.string().describe('Service endpoint'),
}).passthrough()

// ─── Main schema ─────────────────────────────────────────────────────────────

export const SCHEMA_8004_V2 = z.object({
  type: z
    .literal('https://eips.ethereum.org/EIPS/eip-8004#registration-v1')
    .describe('ERC-8004 registration type identifier — must be this exact URI'),

  name: z
    .string().min(3).max(200)
    .describe('Agent display name (3–200 characters)'),

  description: z
    .string().min(10)
    .describe('Natural language explanation of what the agent does and its capabilities'),

  image: z
    .string().url().optional()
    .describe('Avatar or logo URI — PNG, SVG, WebP, or JPG; 512×512px minimum recommended'),

  services: z
    .array(
      z.discriminatedUnion('name', [
        McpServiceSchema,
        A2AServiceSchema,
        OasfServiceSchema,
        AgentWalletServiceSchema,
        WebServiceSchema,
        EmailServiceSchema,
        EnsServiceSchema,
        DidServiceSchema,
      ]).or(UnknownServiceSchema)
    )
    .describe('Communication endpoints — MCP, A2A, OASF, agentWallet, web, email, ENS, DID, or any custom type'),

  registrations: z
    .array(z.object({
      agentId: z.union([z.number().int(), z.string()])
        .describe('Agent token ID in the on-chain registry'),
      agentRegistry: z.string()
        .describe('CAIP-10 formatted registry contract address (e.g. eip155:1:0x...)'),
    }))
    .optional()
    .describe('On-chain NFT identity links to agent registries'),

  supportedTrust: z
    .array(z.enum(['reputation', 'crypto-economic', 'tee-attestation']))
    .optional()
    .describe('Trust models supported by this agent'),

  active: z
    .boolean().default(false)
    .describe('Whether the agent is production-ready and accepting requests (default: false)'),

  x402Support: z
    .boolean().default(false)
    .describe('Whether the agent supports the HTTP 402 / x402 micro-payment protocol'),

  updatedAt: z
    .number().int().optional()
    .describe('Unix timestamp (seconds) of the last metadata update'),
})

export type AgentRegistrationFile = z.infer<typeof SCHEMA_8004_V2>
