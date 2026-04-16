import type { Schema } from '../types'
import { GITHUB_URL } from '../config/constants'

const DELEGATE_SCHEMA_VERSION = '3.0.1'

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
    alias: {
      type: 'string',
      description: 'Display name of the delegate',
      examples: ['JDoe'],
      // NOTE: Inheritance is used so the delegate can populate details once on a parent node and
      // have multiple subnodes that hold voting power from different organisations.
      inherit: true,
    },
    description: {
      type: 'string',
      description: 'Profile or introduction of the delegate',
      examples: ['John Doe is a delegate for the DAO'],
      inherit: true,
    },
    avatar: {
      type: 'string',
      description: "URI pointing to the delegate's avatar",
      inherit: true,
    },
    url: {
      type: 'string',
      format: 'uri',
      description: "URL pointing to the delegate's profile or website",
      inherit: true,
    },
    'legal-name': {
      type: 'string',
      description: 'Legal name of the delegate',
      examples: ['John Doe'],
      inherit: true,
    },
    statement: {
      type: 'string',
      description: "The delegate's general-purpose delegate statement",
      inherit: true,
    },
    'conflict-of-interest': {
      type: 'string',
      description: "The delegate's general-purpose conflict of interest declaration",
      inherit: true,
    },
    'forum-handle': {
      type: 'string',
      description: "The delegate's default forum handle",
      examples: ['johndoe'],
      inherit: true,
    },
  },
  patternProperties: {
    '^statement(\\[[^\\]]+\\])?$': {
      type: 'string',
      description:
        "Delegate statements written for specific organizations, labeled by the organization's ENS name",
      examples: ['statement[dao.eth] = "I am a delegate for the DAO"'],
      inherit: true,
    },
    '^conflict-of-interest(\\[[^\\]]+\\])?$': {
      type: 'string',
      description:
        "Conflict of interest declarations written for specific organizations, labeled by the organization's ENS name",
      examples: ['conflict-of-interest[dao.eth] = "I have no conflicts of interest"'],
      inherit: true,
    },
    '^forum-handle(\\[[^\\]]+\\])?$': {
      type: 'string',
      description:
        "Specific forum handles the delegate uses for each organization, labeled by the organization's ENS name",
      examples: ['forum-handle[dao.eth] = "johndoe"'],
      inherit: true,
    },
  },
  required: ['class', 'schema'],
  recommended: ['alias', 'statement', 'conflict-of-interest', 'forum-handle'],
}
