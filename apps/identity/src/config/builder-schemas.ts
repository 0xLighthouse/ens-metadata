/**
 * Hardcoded schema + attribute catalog for the /form-builder.
 *
 * CIDs mirror the `latest` entries in packages/schemas/published/_registry.json
 * at the time of writing. Replace with a live registry fetch (the interface
 * app already does this via `getPublishedRegistry`) once the builder graduates
 * past MVP. Until then, pinning keeps the wizard URL deterministic.
 *
 * Attrs are a merge of the ENSIP-5 globals (the ensjs-style universal text
 * records) + the schema-specific properties, with `class` / `schema` /
 * structural-only keys stripped — those get written automatically by the
 * wizard and aren't things the actor needs to pick.
 *
 * Invariant: every attr key must be either in the schema's own properties
 * OR an ENSIP-5 global. assertAttrsValid enforces this at module load so a
 * typo here can't generate URLs the wizard rejects.
 */

import { ENSIP5_GLOBAL_KEYS, isEnsip5Global } from '@/lib/ensip-5'

export interface BuilderAttr {
  key: string
  label: string
  description?: string
}

export interface BuilderSchema {
  id: string
  label: string
  description: string
  classValue: string
  schemaUri: string
  /** Keys of the schema's own (non-ENSIP-5) properties. Used together with
   *  ENSIP5_GLOBAL_KEYS at module-load to audit the `attrs` list below. */
  schemaOwnKeys: readonly string[]
  attrs: BuilderAttr[]
}

const ENSIP5_ATTRS: BuilderAttr[] = [
  { key: 'avatar', label: 'Avatar', description: 'Profile picture URL or ipfs:// URI' },
  { key: 'description', label: 'Description', description: 'Short bio or summary' },
  { key: 'display', label: 'Display name', description: 'Canonical cased display name' },
  { key: 'email', label: 'Email' },
  { key: 'keywords', label: 'Keywords', description: 'Comma-separated keywords' },
  { key: 'location', label: 'Location', description: 'City, country, region…' },
  { key: 'mail', label: 'Mailing address' },
  { key: 'notice', label: 'Notice', description: 'A notice displayed for this name' },
  { key: 'phone', label: 'Phone' },
  { key: 'url', label: 'Website' },
]

// Belt-and-suspenders: the ENSIP5_ATTRS label list above must cover
// exactly the authoritative global-key set. If someone adds an entry
// here without updating ensip-5.ts (or vice versa), this throws at
// module load — surfaces in dev immediately instead of at the recipient.
{
  const labelKeys = new Set(ENSIP5_ATTRS.map((a) => a.key))
  for (const k of ENSIP5_GLOBAL_KEYS) {
    if (!labelKeys.has(k)) {
      throw new Error(`builder-schemas: ENSIP5_ATTRS missing label for global key "${k}"`)
    }
  }
  for (const a of ENSIP5_ATTRS) {
    if (!ENSIP5_GLOBAL_KEYS.has(a.key)) {
      throw new Error(`builder-schemas: ENSIP5_ATTRS contains non-global key "${a.key}"`)
    }
  }
}

// Per-schema own keys (i.e. NOT ENSIP-5 globals). Mirrors the `properties`
// map in packages/schemas/published/<id>/versions/3.0.1/schema.json, minus
// the structural `class` / `schema` fields the wizard writes automatically.
// mail is redeclared in the Person schema but already an ENSIP-5 global,
// so we source it from ENSIP5_ATTRS rather than listing it twice.
const PERSON_OWN_KEYS = ['alias', 'legal-name', 'title'] as const
const AGENT_OWN_KEYS = [
  'alias',
  'agent-uri',
  'services',
  'agent-wallet',
  'x402-support',
  'active',
  'supported-trust',
] as const
const ORG_OWN_KEYS = ['alias'] as const

export const BUILDER_SCHEMAS: BuilderSchema[] = [
  {
    id: 'person',
    label: 'Person',
    description: 'A real human. Use this for personal ENS names.',
    classValue: 'Person',
    schemaUri: 'ipfs://QmSHkLhbPF96jYwYq52TmmvQNSCFijhZWYziRqgimBQ9Na',
    schemaOwnKeys: PERSON_OWN_KEYS,
    attrs: [
      { key: 'alias', label: 'Alias', description: 'Display name' },
      { key: 'legal-name', label: 'Legal name' },
      { key: 'title', label: 'Title', description: 'Role, e.g. CEO, Director' },
      ...ENSIP5_ATTRS,
    ],
  },
  {
    id: 'agent',
    label: 'Agent',
    description: 'An AI agent with ERC-8004 metadata.',
    classValue: 'Agent',
    schemaUri: 'ipfs://QmUATTZzuow7zUPz9KV4AbY2YgVtaRKHzbQ1Kh8w8dTeZs',
    schemaOwnKeys: AGENT_OWN_KEYS,
    attrs: [
      { key: 'alias', label: 'Alias', description: 'Display name of the agent' },
      { key: 'agent-uri', label: 'Agent URI', description: 'ERC-8004 registration file URI' },
      { key: 'services', label: 'Services', description: 'URI to agent services manifest' },
      { key: 'agent-wallet', label: 'Agent wallet', description: 'Where the agent receives payments' },
      { key: 'x402-support', label: 'x402 support', description: 'Whether the agent accepts x402 payments' },
      { key: 'active', label: 'Active', description: 'Whether the agent is currently active' },
      { key: 'supported-trust', label: 'Supported trust models' },
      ...ENSIP5_ATTRS,
    ],
  },
  {
    id: 'org',
    label: 'Organization',
    description: 'A legal or organizational entity.',
    classValue: 'Organization',
    schemaUri: 'ipfs://QmaJ6HSdKy7fLsJy9Sk8xP6LW2CagLUwLgDm5KtKLPTwnp',
    schemaOwnKeys: ORG_OWN_KEYS,
    attrs: [
      { key: 'alias', label: 'Alias', description: 'Display name of the organization' },
      ...ENSIP5_ATTRS,
    ],
  },
]

// Module-load audit: every attr offered for a schema must be either the
// schema's own property or an ENSIP-5 global — the same rule useSchema
// applies at wizard load. Mismatch = generated URL the wizard will reject.
for (const s of BUILDER_SCHEMAS) {
  const own = new Set<string>(s.schemaOwnKeys)
  for (const a of s.attrs) {
    if (!own.has(a.key) && !isEnsip5Global(a.key)) {
      throw new Error(
        `builder-schemas: attr "${a.key}" in schema "${s.id}" is neither a schema property nor an ENSIP-5 global`,
      )
    }
  }
}

export const BUILDER_PLATFORMS = [
  { id: 'com.x', label: 'X' },
  { id: 'org.telegram', label: 'Telegram' },
] as const

export type BuilderPlatformId = (typeof BUILDER_PLATFORMS)[number]['id']
