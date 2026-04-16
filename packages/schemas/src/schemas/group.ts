import type { Schema } from '../types'
import { GITHUB_URL } from '../config/constants'

const GROUP_SCHEMA_VERSION = '3.0.1'

export const GROUP_SCHEMA: Schema = {
  $id: `${GITHUB_URL}/tree/main/packages/schemas/published/group/versions/${GROUP_SCHEMA_VERSION}`,
  source: GITHUB_URL,
  title: 'Group',
  version: GROUP_SCHEMA_VERSION,
  description: 'A group of individuals or entities with a shared purpose or responsibility.',
  type: 'object' as const,
  properties: {
    class: {
      type: 'string',
      default: 'Group',
      description: 'Class identifier for this node',
      examples: ['Group', 'Committee', 'Council', 'Workgroup', 'Team', 'Department'],
    },
    schema: {
      type: 'string',
      format: 'uri',
      description: 'URI pointing to the group schema',
    },
    alias: {
      type: 'string',
      description: 'Display name of the group',
    },
    avatar: {
      type: 'string',
      description: "URI pointing to the group's avatar",
    },
    description: {
      type: 'string',
      description: "Short description of the group's purpose and responsibility",
    },
    url: {
      type: 'string',
      format: 'uri',
      description: 'URL pointing to information about the group',
      examples: ['https://www.example.com/groups/example-group'],
    },
    lead: {
      type: 'string',
      description: 'ENS name or address of the group leader',
    },
    'lead-title': {
      type: 'string',
      description: 'Title or role of the group leader',
      examples: ['Lead Steward', 'Chair', 'Manager', 'Owner'],
      inherit: true,
    },
    'members-title': {
      type: 'string',
      description: 'Title or role of the group members',
      examples: ['Member', 'Steward', 'Contributor', 'Participant'],
      inherit: true,
    },
  },
  required: ['class', 'schema'],
  recommended: ['alias', 'lead', 'avatar', 'url', 'description'],
}
