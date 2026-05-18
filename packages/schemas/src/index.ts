import type { Schema } from './types'

import { AGENT_SCHEMA } from './schemas/agent'
import { APPLICATION_SCHEMA } from './schemas/application'
import { CONTRACT_SCHEMA } from './schemas/contract'
import { DELEGATE_SCHEMA } from './schemas/delegate'
import { GRANT_SCHEMA } from './schemas/grant'
import { GROUP_SCHEMA } from './schemas/group'
import { ORGANIZATION_SCHEMA } from './schemas/org'
import { PERSON_SCHEMA } from './schemas/person'
import { TREASURY_SCHEMA } from './schemas/treasury'
import { WALLET_SCHEMA } from './schemas/wallet'

export const SCHEMAS: Schema[] = [
  AGENT_SCHEMA,
  APPLICATION_SCHEMA,
  CONTRACT_SCHEMA,
  DELEGATE_SCHEMA,
  GRANT_SCHEMA,
  GROUP_SCHEMA,
  PERSON_SCHEMA,
  ORGANIZATION_SCHEMA,
  WALLET_SCHEMA,
  TREASURY_SCHEMA,
]

export const SCHEMA_MAP: Record<string, Schema> = SCHEMAS.reduce(
  (map, schema) => {
    map[schema.title] = schema
    return map
  },
  {} as Record<string, Schema>,
)
