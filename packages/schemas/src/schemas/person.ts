import type { Schema } from "../types";
import { GITHUB_URL } from "../config/constants";

const PERSON_SCHEMA_VERSION = '3.0.0';

export const PERSON_SCHEMA: Schema = {
  $id: `${GITHUB_URL}/tree/main/packages/schemas/published/person/versions/${PERSON_SCHEMA_VERSION}`,
  source: GITHUB_URL,
  title: 'Person',
  version: PERSON_SCHEMA_VERSION,
  description: 'A person.',
  type: 'object' as const,
  properties: {
    class: {
      type: 'string',
      default: 'Person',
      description: 'Class identifier for this node',
      examples: ['Person', 'Human', 'Signer', 'Signatory', 'Officer', 'Employee', 'Secretary'],
    },
    schema: {
      type: 'string',
      format: 'uri',
      description: 'URI pointing to the person schema',
    },
    alias: {
      type: 'string',
      description: 'Display name of the person',
    },
    description: {
      type: 'string',
      description: 'Profile or introduction of the person',
      examples: ['John Doe is a software engineer at Example Inc.'],
    },
    avatar: {
      type: 'string',
      description: 'URI pointing to the person\'s avatar'
    },
    'legal-name': {
      type: 'string',
      description: 'Legal name of the person',
      examples: ['John Doe'],
    },
    title: {
      type: 'string',
      description: 'Title or role of the person',
      examples: ['CEO', 'CFO', 'Director', 'Company Secretary', 'Treasurer', 'Officer', 'Employee'],
    },
    email: {
      type: 'string',
      format: 'email',
      description: 'Email address of the person',
      examples: ['john.doe@example.com'],
    },
    phone: {
      type: 'string',
      format: 'tel',
      description: 'Phone number of the person',
      examples: ['+1234567890'],
    },
    mail: {
      type: 'string',
      description: 'Mailing address where the person can be reached',
      examples: ['123 Main St, Anytown, USA'],
    },

  },
  required: ['class', 'schema'],
  recommended: ['alias', 'legal-name', 'title']
}
