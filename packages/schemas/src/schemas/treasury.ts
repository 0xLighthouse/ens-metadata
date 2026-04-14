import type { Schema } from "../types";
import { GITHUB_URL } from "../config/constants";

const TREASURY_SCHEMA_VERSION = '3.0.1';

export const TREASURY_SCHEMA: Schema = {
  $id: `${GITHUB_URL}/tree/main/packages/schemas/published/treasury/versions/${TREASURY_SCHEMA_VERSION}`,
  source: GITHUB_URL,
  title: 'Treasury',
  version: TREASURY_SCHEMA_VERSION,
  description: 'Funds and assets managed by a collective of individuals or entities.',
  type: 'object' as const,
  properties: {
    class: {
      type: 'string',
      default: 'Treasury',
      description: 'Class identifier for this node',
      examples: ['Treasury', 'Vault'],
    },
    schema: {
      type: 'string',
      format: 'uri',
      description: 'URI pointing to the treasury schema',
    },
    alias: {
      type: 'string',
      description: 'Display name of the treasury',
    },
    description: {
      type: 'string',
      description: 'Description of the treasury',
    },
  },
  required: ['class', 'schema'],
  recommended: ['alias', 'description']
}
