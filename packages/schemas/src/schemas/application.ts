import type { Schema } from "../types";
import { GITHUB_URL } from "../config/constants";

const APPLICATION_SCHEMA_VERSION = '3.0.0';

export const APPLICATION_SCHEMA: Schema = {
  $id: `${GITHUB_URL}/tree/main/packages/schemas/published/application/versions/${APPLICATION_SCHEMA_VERSION}`,
  source: GITHUB_URL,
  title: 'Application',
  version: APPLICATION_SCHEMA_VERSION,
  description: 'A software application, service, or website.',
  type: 'object' as const,
  properties: {
    class: {
      type: 'string',
      default: 'Application',
      description: 'Class identifier for this node',
      examples: ['Application', 'Service', 'Website', 'API'],
    },
    schema: {
      type: 'string',
      format: 'uri',
      description: 'URI pointing to the application schema',
    },
    alias: {
      type: 'string',
      description: 'Display name of the application',
    },
    description: {
      type: 'string',
      description: 'Description of the application',
    },
    avatar: {
      type: 'string',
      description: 'URI pointing to the application\'s avatar',
      // NOTE: Can inherit the logo of the organization
      inherit: true
    },
    url: {
      type: 'string',
      format: 'uri',
      description: 'URL where the application is hosted or accessed',
      examples: ['https://example.com', 'https://app.example.com'],
    },
    repository: {
      type: 'string',
      description: 'URL pointing to the source code repository',
      examples: ['https://github.com/example/example'],
      inherit: true
    },
    version: {
      type: 'string',
      description: 'Current version of the application',
    },
    status: {
      type: 'string',
      description: 'The current status of the application',
      enum: ['Active', 'Development', 'Deprecated'],
    },
  },
  required: ['class', 'schema'],
  recommended: ['alias', 'description', 'url']
}
