import type { Schema } from '@ensmetadata/schemas/types'
import type { MetadataValidationError, MetadataValidationResult } from './types'

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

/**
 * Default IPFS gateway prefix. Treated as a URL prefix: the SDK appends the
 * CID (and any sub-path inside the ipfs:// URI) directly. Include any path
 * segment that should appear before the CID, e.g. `/ipfs`.
 */
export const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io/ipfs'
const DEFAULT_TIMEOUT_MS = 15_000

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

/**
 * A caller-provided resolver that may produce a Schema for a given URI without
 * touching the network. Returning `null` means "I don't know this URI; fall
 * back to the regular protocol fetch."
 */
export type SchemaResolver = (uri: string) => Promise<Schema | null> | Schema | null

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

// Checks to see if the value is a valid Schema object
function isValidSchema(value: unknown): value is Schema {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (candidate.type !== 'object') return false
  if (typeof candidate.properties !== 'object' || candidate.properties === null) return false
  return true
}

// Fetches a Schema from a JSON URL and returns it as a Schema object
async function fetchJsonAsSchema(url: string, timeoutMs: number): Promise<Schema> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal })
  } catch (err) {
    throw new Error(
      `Failed to fetch schema from ${url}: ${err instanceof Error ? err.message : String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch schema from ${url}: HTTP ${response.status} ${response.statusText}`,
    )
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch (err) {
    throw new Error(
      `Schema response from ${url} was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!isValidSchema(parsed)) {
    throw new Error(
      `Schema fetched from ${url} does not look like a valid Schema (missing properties or type !== 'object').`,
    )
  }

  return parsed
}

// --------------------------------------------------------------------------
// Protocol-specific fetchers
// --------------------------------------------------------------------------

/**
 * Fetch a Schema from an `https://` URL directly. Throws if the URI does not
 * use the https scheme.
 */
export async function fetchSchemaFromHttps(
  uri: string,
  opts: { timeoutMs?: number } = {},
): Promise<Schema> {
  const trimmed = uri.trim()
  if (!trimmed.startsWith('https://')) {
    throw new Error(`Unsupported HTTPS URI: "${uri}". Expected https://...`)
  }
  return fetchJsonAsSchema(trimmed, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
}

/**
 * Fetch a Schema from an `ipfs://<cid>[/path]` URI via an IPFS HTTP gateway.
 * Throws if the URI does not use the ipfs scheme.
 *
 * `ipfsGateway` is treated as a URL prefix: the CID (and any sub-path inside
 * the ipfs:// URI) is appended directly with a single `/` separator. Include
 * any path segment that should appear before the CID in the prefix itself.
 */
export async function fetchSchemaFromIpfs(
  uri: string,
  opts: { ipfsGateway?: string; timeoutMs?: number } = {},
): Promise<Schema> {
  const trimmed = uri.trim()
  if (!trimmed.startsWith('ipfs://')) {
    throw new Error(`Unsupported IPFS URI: "${uri}". Expected ipfs://<cid>[/path].`)
  }
  const location = trimmed.slice('ipfs://'.length).replace(/^\/+/, '')
  if (!location) {
    throw new Error(`Invalid IPFS URI: "${uri}". Missing CID.`)
  }
  const prefix = (opts.ipfsGateway ?? DEFAULT_IPFS_GATEWAY).replace(/\/+$/, '')
  const url = `${prefix}/${location}`
  return fetchJsonAsSchema(url, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
}

/**
 * Resolve a URI via a caller-provided resolver. Returns `null` if the resolver
 * declines (returns null/undefined). Any URI scheme is accepted; the resolver
 * is free to handle or ignore each one.
 */
export async function fetchSchemaFromLocal(
  uri: string,
  resolver: SchemaResolver,
): Promise<Schema | null> {
  const result = await resolver(uri)
  return result ?? null
}

/**
 * Top-level schema dispatcher. If a `resolver` is provided, it is tried first
 * for every URI; on a miss the URI scheme decides the protocol fetcher
 * (`ipfs://` → `fetchSchemaFromIpfs`, `https://` → `fetchSchemaFromHttps`).
 * Throws on any other scheme.
 */
export async function fetchSchema(
  uri: string,
  opts: { resolver?: SchemaResolver; ipfsGateway?: string; timeoutMs?: number } = {},
): Promise<Schema> {
  if (opts.resolver) {
    const local = await fetchSchemaFromLocal(uri, opts.resolver)
    if (local) return local
  }
  const trimmed = uri.trim()
  if (trimmed.startsWith('ipfs://')) {
    return fetchSchemaFromIpfs(trimmed, {
      ipfsGateway: opts.ipfsGateway,
      timeoutMs: opts.timeoutMs,
    })
  }
  if (trimmed.startsWith('https://')) {
    return fetchSchemaFromHttps(trimmed, { timeoutMs: opts.timeoutMs })
  }
  throw new Error(
    `Unsupported schema URI: "${uri}". Only ipfs:// and https:// schemes are supported.`,
  )
}

// --------------------------------------------------------------------------
// Schema introspection
// --------------------------------------------------------------------------

/**
 * Return the keys declared by a Schema's `properties` object, in declaration
 * order. `patternProperties` are excluded for now since regex patterns are
 * not concrete record keys. The return shape is intentionally an object so
 * additional categories (e.g. `requiredKeys`, `recommendedKeys`,
 * `patternKeys`) can be added later without breaking callers.
 */
export function getSchemaKeys(schema: Schema): { keys: string[] } {
  return { keys: Object.keys(schema.properties ?? {}) }
}

// --------------------------------------------------------------------------
// Schema validation
// --------------------------------------------------------------------------

/**
 * Validate a record map against a Schema. Checks `required` fields and
 * rejects unknown keys (a key is known if it appears in `properties` or
 * matches one of the regexes in `patternProperties`). Returns a discriminated
 * union: on success the `data` is the validated record, on failure a list of
 * per-key errors.
 */
export function validateMetadata(data: unknown, schema: Schema): MetadataValidationResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { success: false, errors: [{ key: '(root)', message: 'Expected an object' }] }
  }

  const record = data as Record<string, unknown>
  const errors: MetadataValidationError[] = []
  const knownKeys = new Set(Object.keys(schema.properties))
  const patternRegexes = Object.keys(schema.patternProperties ?? {}).map((p) => new RegExp(p))

  for (const key of schema.required ?? []) {
    if (!record[key]) errors.push({ key, message: `Required field "${key}" is missing` })
  }

  for (const key of Object.keys(record)) {
    if (!knownKeys.has(key) && !patternRegexes.some((r) => r.test(key))) {
      errors.push({ key, message: `Unknown field "${key}"` })
    }
  }

  return errors.length > 0
    ? { success: false, errors }
    : { success: true, data: record as Record<string, string> }
}

/**
 * Boolean wrapper around `validateMetadata` for callers that only need
 * to know whether the data conforms.
 */
export function validate(schema: Schema, data: unknown): boolean {
  return validateMetadata(data, schema).success
}
