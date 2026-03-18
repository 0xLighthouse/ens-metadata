import type { Schema } from "../types";
import { GITHUB_URL } from "../config/constants";

const PERSON_SCHEMA_VERSION = '2.0.0';

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
    'full-name': {
      type: 'string',
      description: 'Full legal or preferred name of the person',
      examples: ['John Doe'],
    },
    'title': {
      type: 'string',
      description: 'Title or role of the person',
      examples: ['CEO', 'CFO', 'Director', 'Company Secretary', 'Treasurer', 'Officer', 'Employee'],
    },
  },
  required: ['class', 'schema'],
  recommended: ['full-name', 'title']
}
