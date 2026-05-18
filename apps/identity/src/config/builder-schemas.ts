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
  /** Published schema version that `schemaUri` resolves to. Pinned alongside
   *  the CID so the dropdown can show "<label> (v <version>)". */
  version: string
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
const APPLICATION_OWN_KEYS = ['alias', 'repository', 'version', 'status'] as const
const CONTRACT_OWN_KEYS = [
  'alias',
  'category',
  'license',
  'docs',
  'audits',
  'com.github',
  'com.twitter',
  'org.telegram',
] as const
const DELEGATE_OWN_KEYS = [
  'alias',
  'legal-name',
  'statement',
  'conflict-of-interest',
  'forum-handle',
] as const
const GRANT_OWN_KEYS = ['alias', 'status', 'budget', 'token'] as const
const GROUP_OWN_KEYS = ['alias', 'lead', 'lead-title', 'members-title'] as const
const TREASURY_OWN_KEYS = ['alias'] as const
const WALLET_OWN_KEYS = ['alias'] as const

export const BUILDER_SCHEMAS: BuilderSchema[] = [
  {
    id: 'person',
    label: 'Person',
    description: 'A real human. Use this for personal ENS names.',
    classValue: 'Person',
    version: '3.0.1',
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
    version: '3.0.1',
    schemaUri: 'ipfs://QmUATTZzuow7zUPz9KV4AbY2YgVtaRKHzbQ1Kh8w8dTeZs',
    schemaOwnKeys: AGENT_OWN_KEYS,
    attrs: [
      { key: 'alias', label: 'Alias', description: 'Display name of the agent' },
      { key: 'agent-uri', label: 'Agent URI', description: 'ERC-8004 registration file URI' },
      { key: 'services', label: 'Services', description: 'URI to agent services manifest' },
      {
        key: 'agent-wallet',
        label: 'Agent wallet',
        description: 'Where the agent receives payments',
      },
      {
        key: 'x402-support',
        label: 'x402 support',
        description: 'Whether the agent accepts x402 payments',
      },
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
    version: '3.0.1',
    schemaUri: 'ipfs://QmaJ6HSdKy7fLsJy9Sk8xP6LW2CagLUwLgDm5KtKLPTwnp',
    schemaOwnKeys: ORG_OWN_KEYS,
    attrs: [
      { key: 'alias', label: 'Alias', description: 'Display name of the organization' },
      ...ENSIP5_ATTRS,
    ],
  },
  {
    id: 'application',
    label: 'Application',
    description: 'A software application, service, or website.',
    classValue: 'Application',
    version: '3.0.1',
    schemaUri: 'ipfs://QmU9v5zCHehurk6DeeWLHSDCxMT5pv9AtBRckdZP5sVK3t',
    schemaOwnKeys: APPLICATION_OWN_KEYS,
    attrs: [
      { key: 'alias', label: 'Alias', description: 'Display name of the application' },
      {
        key: 'repository',
        label: 'Repository',
        description: 'URL pointing to the source code repository',
      },
      { key: 'version', label: 'Version', description: 'Current version of the application' },
      { key: 'status', label: 'Status', description: 'The current status of the application' },
      ...ENSIP5_ATTRS,
    ],
  },
  {
    id: 'contract',
    label: 'Contract',
    description: "An on-chain smart contract found at this node's resolved address.",
    classValue: 'Contract',
    version: '3.0.1',
    schemaUri: 'ipfs://QmbioLkr8t9A35aBaqWuChJhLyvjUoYVYB3ekw3nrGAL3P',
    schemaOwnKeys: CONTRACT_OWN_KEYS,
    attrs: [
      { key: 'alias', label: 'Alias', description: 'Display name of the contract' },
      { key: 'category', label: 'Category', description: 'The category of the contract' },
      { key: 'license', label: 'License', description: 'Software license in SPDX format' },
      { key: 'docs', label: 'Docs', description: 'Primary documentation URL' },
      { key: 'audits', label: 'Audits', description: 'URI pointing to third-party audit reports' },
      { key: 'com.github', label: 'GitHub', description: 'GitHub repository' },
      { key: 'com.twitter', label: 'X / Twitter', description: 'X/Twitter handle' },
      { key: 'org.telegram', label: 'Telegram', description: 'Telegram handle' },
      ...ENSIP5_ATTRS,
    ],
  },
  {
    id: 'delegate',
    label: 'Delegate',
    description: 'A voter who has been delegated voting power.',
    classValue: 'Delegate',
    version: '3.0.1',
    schemaUri: 'ipfs://QmaXLcD6imQYMibAfoXaVGdkJJo6dZf9YiBTqfBQ8joeUj',
    schemaOwnKeys: DELEGATE_OWN_KEYS,
    attrs: [
      { key: 'alias', label: 'Alias', description: 'Display name of the delegate' },
      { key: 'legal-name', label: 'Legal name' },
      {
        key: 'statement',
        label: 'Statement',
        description: "The delegate's general-purpose delegate statement",
      },
      {
        key: 'conflict-of-interest',
        label: 'Conflict of interest',
        description: 'Conflict of interest declaration',
      },
      {
        key: 'forum-handle',
        label: 'Forum handle',
        description: "The delegate's default forum handle",
      },
      ...ENSIP5_ATTRS,
    ],
  },
  {
    id: 'grant',
    label: 'Grant',
    description: 'A grant issued by an organization.',
    classValue: 'Grant',
    version: '3.0.1',
    schemaUri: 'ipfs://QmXHZB371UYkDXUnAJFHHRDPFT5MgAkyNQRbS7H5qsBcEb',
    schemaOwnKeys: GRANT_OWN_KEYS,
    attrs: [
      { key: 'alias', label: 'Alias', description: 'Display name of the grant' },
      { key: 'status', label: 'Status', description: 'The current status of the grant' },
      { key: 'budget', label: 'Budget', description: 'Total amount of the grant in WEI' },
      { key: 'token', label: 'Token', description: 'ERC-20 token address used to fund the grant' },
      ...ENSIP5_ATTRS,
    ],
  },
  {
    id: 'group',
    label: 'Group',
    description: 'A group of individuals or entities with a shared purpose.',
    classValue: 'Group',
    version: '3.0.1',
    schemaUri: 'ipfs://QmPy7ZXw7EDJmZ8pPG4BGFHvSfy5QQ17Ph2Z58uWa3PhBJ',
    schemaOwnKeys: GROUP_OWN_KEYS,
    attrs: [
      { key: 'alias', label: 'Alias', description: 'Display name of the group' },
      { key: 'lead', label: 'Lead', description: 'ENS name or address of the group leader' },
      { key: 'lead-title', label: 'Lead title', description: 'Title or role of the group leader' },
      {
        key: 'members-title',
        label: 'Members title',
        description: 'Title or role of the group members',
      },
      ...ENSIP5_ATTRS,
    ],
  },
  {
    id: 'treasury',
    label: 'Treasury',
    description: 'Funds and assets managed by a collective.',
    classValue: 'Treasury',
    version: '3.0.1',
    schemaUri: 'ipfs://QmceYfvRNjdZN3KD7sA3NfCHHBf3jVekDpLQCD39omdykt',
    schemaOwnKeys: TREASURY_OWN_KEYS,
    attrs: [
      { key: 'alias', label: 'Alias', description: 'Display name of the treasury' },
      ...ENSIP5_ATTRS,
    ],
  },
  {
    id: 'wallet',
    label: 'Wallet',
    description: 'A wallet for holding or managing assets.',
    classValue: 'Wallet',
    version: '3.0.1',
    schemaUri: 'ipfs://QmNhNg4LFsWyLNEXRzotmAmzyo9cWYaWzxGc4gLgrxHeEL',
    schemaOwnKeys: WALLET_OWN_KEYS,
    attrs: [
      { key: 'alias', label: 'Alias', description: 'Display name of the wallet' },
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
