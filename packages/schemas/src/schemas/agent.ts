import type { Schema } from '../types'
import { GITHUB_URL } from '../config/constants'

const AGENT_SCHEMA_VERSION = '4.0.0'

export const AGENT_SCHEMA: Schema = {
  $id: `${GITHUB_URL}/tree/main/packages/schemas/published/agent/versions/${AGENT_SCHEMA_VERSION}`,
  source: GITHUB_URL,
  title: 'Agent',
  version: AGENT_SCHEMA_VERSION,
  description: 'An AI agent with ERC-8004 metadata.',
  type: 'object' as const,
  properties: {
    class: {
      type: 'string',
      default: 'Agent',
      description: 'Class identifier for this node',
    },
    schema: {
      type: 'string',
      format: 'uri',
      description: 'URI pointing to the agent schema',
    },
    'agent-uri': {
      type: 'string',
      format: 'uri',
      description: 'URI pointing to an ERC-8004 registration file',
    },
    alias: {
      type: 'string',
      description:
        'Display name of the agent, equivalent to the `name` field in an ERC-8004 registration file',
    },
    description: {
      type: 'string',
      description: 'Natural-language description of the agent',
    },
    avatar: {
      type: 'string',
      format: 'uri',
      description:
        "URI pointing to the agent's avatar image, equivalent to the `image` field in an ERC-8004 registration file",
    },
    services: {
      type: 'string',
      format: 'uri',
      description: "URI pointing to a payload containing the agent's services",
    },
    'x402-support': {
      type: 'string',
      format: 'boolean',
      description: 'Indicates whether or not the agent supports x402 payments',
    },
    active: {
      type: 'string',
      format: 'boolean',
      description: 'Indicates whether or not the agent is currently active',
    },
    registrations: {
      type: 'string',
      format: 'uri',
      description:
        "URI pointing to a payload containing the agent's cross-chain identity registrations",
    },
    'supported-trust': {
      type: 'string',
      description: 'Trust models supported by the agent',
    },
    'agent-wallet': {
      type: 'string',
      description: 'The address where the agent receives payments',
    },
  },
  patternProperties: {
    '^registrations(\\[[^\\]]+\\])?$': {
      type: 'string',
      // format: 'caip-29', // TODO: Research adding custom `format` values, like CAIP-29
      parameterType: 'array',
      description:
        'An array of ERC-8004 registrations belonging to the agent, following CAIP-19 format',
      examples: ['eip155:1/erc721:0x1111111111111111111111111111111111111111/0'],
    },
    '^services(\\[[^\\]]+\\])?$': {
      type: 'string',
      parameterType: 'map',
      format: 'uri',
      description: 'A map of service names to their endpoints',
    },
    '^supported-trust(\\[[^\\]]+\\])?$': {
      type: 'string',
      parameterType: 'array',
      description: 'An array of trust models supported by the agent',
    },
    '^social-proofs(\\[[^\\]]+\\])?$': {
      type: 'string',
      parameterType: 'map',
      description:
        'An attestation of ownership for a social media account',
    },
  },
  required: ['class', 'schema'],
  recommended: ['agent-uri', 'alias', 'description', 'avatar'],
}
