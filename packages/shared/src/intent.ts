import { keccak256, stringToBytes } from 'viem'

// Shape stored in KV and returned to the wizard. Fully resolved at creation
// time so the wizard never has to re-look-up BUILDER_SCHEMAS — the list of
// offered classes and schema URIs may change while old intents keep working.
export interface IntentConfig {
  version: 1
  name: string | null
  classValues: string[]
  schemaUris: string[]
  required: string[]
  optional: string[]
  /** Platforms the recipient MUST link. Disjoint with optionalPlatforms. */
  requiredPlatforms: IntentPlatform[]
  /** Platforms offered as linkable but skippable. Disjoint with requiredPlatforms. */
  optionalPlatforms: IntentPlatform[]
  message: string
}

export const INTENT_PLATFORMS = ['com.x', 'org.telegram'] as const
export type IntentPlatform = (typeof INTENT_PLATFORMS)[number]

export const INTENT_LIMITS = {
  maxMessageChars: 280,
  maxAttrCount: 32,
  maxPayloadBytes: 8 * 1024,
} as const

// EIP-712 binds the signature to the config bytes and the claimed ensName.
// chainId=1 because the reverse record lives on mainnet and we never want
// the wallet to prompt a chain switch for a pure signature.
export const INTENT_EIP712_DOMAIN = {
  name: 'ENS Identity Intent',
  version: '1',
  chainId: 1,
} as const

export const INTENT_EIP712_TYPES = {
  Intent: [
    { name: 'configHash', type: 'bytes32' },
    { name: 'ensName', type: 'string' },
    { name: 'expiry', type: 'uint256' },
  ],
} as const

export interface IntentSignedMessage {
  configHash: `0x${string}`
  ensName: string
  expiry: bigint
}

// Canonical JSON: stable key order, no whitespace. Must produce byte-for-byte
// identical output on client and server so the signature verifies.
export function canonicalizeConfig(config: IntentConfig): string {
  return stableStringify(config)
}

export function hashConfig(config: IntentConfig): `0x${string}` {
  return keccak256(stringToBytes(canonicalizeConfig(config)))
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number in config')
    return JSON.stringify(value)
  }
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    return `{${parts.join(',')}}`
  }
  throw new Error(`unsupported value in config: ${typeof value}`)
}

export type IntentValidationError = { field: string; message: string }

// Server-side shape + size check. Returns the first problem found so the
// API can report something actionable instead of a generic 400.
export function validateIntentConfig(
  raw: unknown,
): { ok: true; value: IntentConfig } | { ok: false; error: IntentValidationError } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: { field: 'config', message: 'must be an object' } }
  }
  const c = raw as Record<string, unknown>
  if (c.version !== 1) {
    return { ok: false, error: { field: 'version', message: 'must be 1' } }
  }
  if (c.name !== null && typeof c.name !== 'string') {
    return { ok: false, error: { field: 'name', message: 'must be string or null' } }
  }
  if (typeof c.message !== 'string') {
    return { ok: false, error: { field: 'message', message: 'must be a string' } }
  }
  if (c.message.length > INTENT_LIMITS.maxMessageChars) {
    return { ok: false, error: { field: 'message', message: 'too long' } }
  }
  const classValues = asStringArray(c.classValues)
  const schemaUris = asStringArray(c.schemaUris)
  const required = asStringArray(c.required)
  const optional = asStringArray(c.optional)
  const requiredPlatformsRaw = asStringArray(c.requiredPlatforms)
  const optionalPlatformsRaw = asStringArray(c.optionalPlatforms)
  if (!classValues) return bad('classValues')
  if (!schemaUris || schemaUris.length === 0) return bad('schemaUris')
  if (!required) return bad('required')
  if (!optional) return bad('optional')
  if (!requiredPlatformsRaw) return bad('requiredPlatforms')
  if (!optionalPlatformsRaw) return bad('optionalPlatforms')
  if (classValues.length !== schemaUris.length) {
    return { ok: false, error: { field: 'classValues', message: 'must match schemaUris length' } }
  }
  const isKnownPlatform = (p: string): p is IntentPlatform =>
    (INTENT_PLATFORMS as readonly string[]).includes(p)
  const requiredPlatforms = requiredPlatformsRaw.filter(isKnownPlatform)
  if (requiredPlatforms.length !== requiredPlatformsRaw.length) {
    return { ok: false, error: { field: 'requiredPlatforms', message: 'contains unknown platform' } }
  }
  const optionalPlatforms = optionalPlatformsRaw.filter(isKnownPlatform)
  if (optionalPlatforms.length !== optionalPlatformsRaw.length) {
    return { ok: false, error: { field: 'optionalPlatforms', message: 'contains unknown platform' } }
  }
  const platformOverlap = requiredPlatforms.filter((p) => optionalPlatforms.includes(p))
  if (platformOverlap.length > 0) {
    return { ok: false, error: { field: 'optionalPlatforms', message: 'overlaps requiredPlatforms' } }
  }
  const overlap = required.filter((k) => optional.includes(k))
  if (overlap.length > 0) {
    return { ok: false, error: { field: 'optional', message: 'overlaps required' } }
  }
  if (required.length + optional.length > INTENT_LIMITS.maxAttrCount) {
    return { ok: false, error: { field: 'required', message: 'too many attributes' } }
  }

  const value: IntentConfig = {
    version: 1,
    name: c.name as string | null,
    classValues,
    schemaUris,
    required,
    optional,
    requiredPlatforms,
    optionalPlatforms,
    message: c.message,
  }

  if (
    new TextEncoder().encode(canonicalizeConfig(value)).byteLength > INTENT_LIMITS.maxPayloadBytes
  ) {
    return { ok: false, error: { field: 'config', message: 'payload too large' } }
  }
  return { ok: true, value }
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out: string[] = []
  for (const item of v) {
    if (typeof item !== 'string') return null
    out.push(item)
  }
  return out
}

function bad(field: string): { ok: false; error: IntentValidationError } {
  return { ok: false, error: { field, message: 'invalid' } }
}
