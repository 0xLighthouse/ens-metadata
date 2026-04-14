import type { Schema } from "../types";
import { GITHUB_URL } from "../config/constants";

const WALLET_SCHEMA_VERSION = '3.0.1';

export const WALLET_SCHEMA: Schema = {
  $id: `${GITHUB_URL}/tree/main/packages/schemas/published/wallet/versions/${WALLET_SCHEMA_VERSION}`,
  source: GITHUB_URL,
  title: 'Wallet',
  version: WALLET_SCHEMA_VERSION,
  description: 'A wallet for holding or managing assets.',
  type: 'object' as const,
  properties: {
    class: {
      type: 'string',
      default: 'Wallet',
      description: 'Class identifier for this node',
      examples: ['Wallet', 'Account'],
    },
    schema: {
      type: 'string',
      format: 'uri',
      description: 'URI pointing to the wallet schema',
    },
    alias: {
      type: 'string',
      description: 'Display name of the wallet',
    },
    description: {
      type: 'string',
      description: 'Description of the wallet\'s purpose',
    },
  },
  required: ['class', 'schema'],
  recommended: ['alias', 'description']
}
