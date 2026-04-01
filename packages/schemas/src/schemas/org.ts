import type { Schema } from "../types";
import { GITHUB_URL } from "../config/constants";

const ORGANIZATION_SCHEMA_VERSION = '3.0.0';

export const ORGANIZATION_SCHEMA: Schema = {
  $id: `${GITHUB_URL}/tree/main/packages/schemas/published/org/versions/${ORGANIZATION_SCHEMA_VERSION}`,
  source: GITHUB_URL,
  title: 'Organization',
  version: ORGANIZATION_SCHEMA_VERSION,
  description: 'A legal or organizational entity.',
  type: 'object' as const,
  properties: {
    class: {
      type: 'string',
      default: 'Organization',
      description: 'Class identifier for this node',
      examples: ['Organization', 'Foundation', 'OPCo', 'DAO', 'DUNA', 'LLC'],
    },
    schema: {
      type: 'string',
      format: 'uri',
      description: 'URI pointing to the organization schema',
    },
    alias: {
      type: 'string',
      description: 'Display name of the organization',
    },
    avatar: {
      type: 'string',
      description: 'URI pointing to the organization\'s avatar',
    },
    description: {
      type: 'string',
      description: 'Description of the organization',
    },
    url: {
      type: 'string',
      format: 'uri',
      description: 'URL pointing to information about the organization',
      examples: ['https://www.example.com/'],
    },
  },
  required: ['class', 'schema'],
  recommended: ['alias', 'description', 'url']
}
