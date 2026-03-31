import { GITHUB_URL } from "../config/constants";
import type { Schema } from "../types";

const CONTRACT_SCHEMA_VERSION = '3.0.0';

export const CONTRACT_SCHEMA: Schema = {
  $id: `${GITHUB_URL}/tree/main/packages/schemas/published/contract/versions/${CONTRACT_SCHEMA_VERSION}`,
  source: GITHUB_URL,
  title: 'Contract',
  version: CONTRACT_SCHEMA_VERSION,
  description: 'An on-chain smart contract found at this node\'s resolved address.',
  type: 'object' as const,
  properties: {
    class: {
      type: 'string',
      default: 'Contract',
      description: 'Class identifier for this node'
    },
    schema: {
      type: 'string',
      format: 'uri',
      description: 'URI pointing to the contract schema',
    },
    alias: {
      type: 'string',
      description: 'Display name of the contract',
    },
    description: {
      type: 'string',
      description: 'Brief description of what the contract does',
    },
    avatar: {
      type: 'string',
      description: 'URI pointing to the contract\'s or owner\'s avatar',
      inherit: true
    },
    url: {
      type: 'string',
      format: 'uri',
      description: 'URL pointing to the project\'s website',
      inherit: true
    },
    category: {
      type: 'string',
      description: 'The category of the contract',
      examples: ['defi', 'gaming', 'dao', 'utility', 'proxy', 'factory'],
      inherit: true
    },
    license: {
      type: 'string',
      description: 'Software license for the source code in SPDX format',
      examples: ['MIT', 'GPL-3.0-only', 'Apache-2.0'],
      inherit: true
    },
    docs: {
      type: 'string',
      description: 'Primary documentation URL for developers and users',
      format: 'uri',
      inherit: true
    },
    audits: {
      type: 'string',
      description: 'URI pointing to third-party audit reports',
      inherit: true
    },
    "com.github": {
      type: 'string',
      description: 'GitHub repository',
      inherit: true
    },
    'com.twitter': {
      type: 'string',
      description: 'X/Twitter handle',
      inherit: true
    },
    'org.telegram': {
      type: 'string',
      description: 'Telegram handle',
      inherit: true
    }
  },
  patternProperties: {
    '^audits(\[[^\]]+\])?$': {
      type: 'string',
      parameterType: 'array',
      description: 'A URI pointing to an audit report',
      inherit: true
    },
  },
  required: ['class', 'schema'],
  recommended: ['alias', 'description']
};
