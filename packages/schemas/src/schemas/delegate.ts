import type { Schema } from "../types";
import { GITHUB_URL } from "../config/constants";

const DELEGATE_SCHEMA_VERSION = '2.0.0';

export const DELEGATE_SCHEMA: Schema = {
  $id: `${GITHUB_URL}/tree/main/packages/schemas/published/delegate/versions/${DELEGATE_SCHEMA_VERSION}`,
  source: GITHUB_URL,
  title: 'Delegate',
  version: DELEGATE_SCHEMA_VERSION,
  description: 'A voter who has been delegated voting power.',
  type: 'object' as const,
  properties: {
    class: {
      type: 'string',
      default: 'Delegate',
      description: 'Class identifier for this node',
    },
    schema: {
      type: 'string',
      format: 'uri',
      description: 'URI pointing to the delegate schema',
    },
    'legal-name': {
      type: 'string',
      description: 'The full name of the delegate',
      examples: ['John Doe'],
    },
    'display-name': {
      type: 'string',
      description: 'Display name or username of the delegate',
      examples: ['JDoe'],
    },
    statement: {
      type: 'string',
      description: 'The delegate\'s general-purpose delegate statement',
    },
    'conflict-of-interest': {
      type: 'string',
      description: 'The delegate\'s general-purpose conflict of interest declaration',
    },
    'forum-handle': {
      type: 'string',
      description: 'The delegate\'s default forum handle',
      examples: ['johndoe'],
    },
  },
  patternProperties: {
    '^statement(\\[[^\\]]+\\])?$': {
      type: 'string',
      description: 'Delegate statements written for specific organizations, labeled by the organization\'s ENS name',
      examples: ['statement[dao.eth] = "I am a delegate for the DAO"'],
    },
    '^conflict-of-interest(\\[[^\\]]+\\])?$': {
      type: 'string',
      description: 'Conflict of interest declarations written for specific organizations, labeled by the organization\'s ENS name',
      examples: ['conflict-of-interest[dao.eth] = "I have no conflicts of interest"'],
    },
    '^forum-handle(\\[[^\\]]+\\])?$': {
      type: 'string',
      description: 'Specific forum handles the delegate uses for each organization, labeled by the organization\'s ENS name',
      examples: ['forum-handle[dao.eth] = "johndoe"'],
    },
  },
  required: ['class', 'schema'],
  recommended: ['display-name', 'statement', 'conflict-of-interest', 'forum-handle']
}
