import type { Attribute, Schema } from '@ensmetadata/schemas/types'
import { validateSchema } from '@ensmetadata/schemas/validate'
import type { MetadataValidationError, MetadataValidationResult } from './types'

// `validateSchema` now lives in `@ensmetadata/schemas` (it validates schemas,
// which are owned there). Re-exported so `@ensmetadata/sdk` keeps exposing it.
export { validateSchema }

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
// Schema validation — moved to `@ensmetadata/schemas/validate`, re-exported above
// --------------------------------------------------------------------------

function isValidSchema(value: unknown): value is Schema {
  return validateSchema(value).success
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
 * Descriptor for a `patternProperties` entry with `parameterType: "array"`.
 * `baseKey` is the literal prefix extracted from the regex; concrete record
 * names are formed as `${baseKey}[<index>]`.
 */
export interface ArrayPatternKey {
  pattern: string
  baseKey: string
  attribute: Attribute
}

/**
 * Pull the literal base from a recognised array-pattern regex. Returns null
 * for any shape we don't understand, so callers can warn-and-skip rather than
 * crash on an exotic schema.
 *
 * Recognised shapes (matching ENSIP-64 canonical forms):
 *  - `^<base>\[[^\]]+\]$`    — required bracket (current schema convention)
 *  - `^<base>(\[[^\]]+\])?$` — optional bracket (legacy; still accepted for
 *    compatibility with pre-fix published schemas, but the bare `<base>` is
 *    ambiguous with a `properties.<base>` entry and should be avoided in new
 *    schemas)
 *
 * `<base>` must be a regex-escaped literal (alphanumerics, `-`, `_`, `.`,
 * plus backslash-escaped metacharacters). Anything else returns null.
 */
export function extractArrayPatternBase(pattern: string): string | null {
  let body = pattern
  if (body.startsWith('^')) body = body.slice(1)
  if (body.endsWith('$')) body = body.slice(0, -1)

  const optionalSuffix = '(\\[[^\\]]+\\])?'
  const requiredSuffix = '\\[[^\\]]+\\]'
  if (body.endsWith(optionalSuffix)) {
    body = body.slice(0, -optionalSuffix.length)
  } else if (body.endsWith(requiredSuffix)) {
    body = body.slice(0, -requiredSuffix.length)
  } else {
    return null
  }

  // Walk the remaining regex: each char is either a literal, a `\X` escape
  // (yields the literal X), or — if it's an unescaped metacharacter — proof
  // that we don't understand the shape and must bail.
  const REGEX_META = new Set('\\^$.*+?()[]{}|')
  let base = ''
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '\\') {
      if (i + 1 >= body.length) return null
      base += body[i + 1]
      i++
    } else if (REGEX_META.has(ch)) {
      return null
    } else {
      base += ch
    }
  }
  return base.length > 0 ? base : null
}

/**
 * Match `<baseKey>[<n>]` where baseKey is one we expect AND n is a
 * non-negative integer with no leading zeros (except "0" itself). Returns
 * null for anything that doesn't fit — map-form patterns, unrelated
 * bracketed keys, malformed indices.
 *
 * Shared between hydrate, validation, and the writer's array-aware delta so
 * all three agree on what counts as a canonical array entry.
 */
export function matchArrayEntry(
  key: string,
  baseKeys: Set<string>,
): { baseKey: string; index: number } | null {
  const open = key.lastIndexOf('[')
  if (open <= 0 || !key.endsWith(']')) return null
  const baseKey = key.slice(0, open)
  if (!baseKeys.has(baseKey)) return null
  const inside = key.slice(open + 1, -1)
  if (inside.length === 0) return null
  if (inside !== '0' && !/^[1-9][0-9]*$/.test(inside)) return null
  return { baseKey, index: Number(inside) }
}

/**
 * Like {@link matchArrayEntry} but also reports the malformed-index case so
 * validation can emit a precise error. Returns `null` when the key doesn't
 * look like a `${baseKey}[…]` entry for any known array baseKey.
 */
function classifyArrayEntry(
  key: string,
  baseKeys: Set<string>,
): { baseKey: string; index: number } | { baseKey: string; badIndex: string } | null {
  const open = key.lastIndexOf('[')
  if (open <= 0 || !key.endsWith(']')) return null
  const baseKey = key.slice(0, open)
  if (!baseKeys.has(baseKey)) return null
  const inside = key.slice(open + 1, -1)
  if (inside === '0' || /^[1-9][0-9]*$/.test(inside)) {
    return { baseKey, index: Number(inside) }
  }
  return { baseKey, badIndex: inside }
}

/**
 * Return the keys declared by a Schema's `properties` object (in declaration
 * order) and the array-form `patternProperties` entries we can resolve to a
 * concrete base key. Map-form pattern properties are not surfaced — without
 * a parameter to look up, there's nothing concrete to read.
 *
 * Array patterns whose regex doesn't match the two ENSIP-canonical shapes
 * (see {@link extractArrayPatternBase}) are silently skipped. This is not an
 * error from a reader/writer's perspective — the pattern still works as a
 * regular `patternProperties` entry; the SDK just can't auto-bucket entries
 * under it into a JS array. Library code can't tell whether the caller cares,
 * so we stay quiet and let callers diagnose if they need to.
 */
export function getSchemaKeys(schema: Schema): {
  keys: string[]
  arrayPatterns: ArrayPatternKey[]
} {
  const arrayPatterns: ArrayPatternKey[] = []
  for (const [pattern, attribute] of Object.entries(schema.patternProperties ?? {})) {
    if (attribute.parameterType !== 'array') continue
    const baseKey = extractArrayPatternBase(pattern)
    if (!baseKey) continue
    arrayPatterns.push({ pattern, baseKey, attribute })
  }
  return { keys: Object.keys(schema.properties ?? {}), arrayPatterns }
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
 *
 * Array-pattern entries (`parameterType: "array"`) get stricter treatment than
 * the bare `patternProperties` regex implies, so the writer can't publish
 * state the reader will silently truncate:
 *  - Indices must be canonical (`0` or `[1-9][0-9]*`).
 *  - Entries per baseKey must be contiguous `0..k`. A gap means `getMetadata`
 *    would stop reading before the tail.
 *  - The literal baseKey (e.g. `audits` with no bracket) is rejected — it
 *    can't be reached by the array-read phase.
 */
export function validateMetadata(data: unknown, schema: Schema): MetadataValidationResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { success: false, errors: [{ key: '(root)', message: 'Expected an object' }] }
  }

  const record = data as Record<string, unknown>
  const errors: MetadataValidationError[] = []
  const knownKeys = new Set(Object.keys(schema.properties))
  const patternRegexes = Object.keys(schema.patternProperties ?? {}).map((p) => new RegExp(p))
  const { arrayPatterns } = getSchemaKeys(schema)
  const arrayBaseKeys = new Set(arrayPatterns.map((p) => p.baseKey))

  for (const key of schema.required ?? []) {
    if (!record[key]) errors.push({ key, message: `Required field "${key}" is missing` })
  }

  // baseKey → set of canonical indices seen in `record`
  const arrayIndices = new Map<string, Set<number>>()

  for (const key of Object.keys(record)) {
    if (arrayBaseKeys.has(key)) {
      errors.push({
        key,
        message: `"${key}" is an array baseKey and cannot be used as a literal key — use ${key}[0], ${key}[1], ...`,
      })
      continue
    }
    const cls = classifyArrayEntry(key, arrayBaseKeys)
    if (cls) {
      if ('badIndex' in cls) {
        errors.push({
          key,
          message: `Invalid array index in "${key}" — indices must be 0 or a positive integer with no leading zeros`,
        })
      } else {
        let seen = arrayIndices.get(cls.baseKey)
        if (!seen) {
          seen = new Set()
          arrayIndices.set(cls.baseKey, seen)
        }
        seen.add(cls.index)
      }
      continue
    }
    if (!knownKeys.has(key) && !patternRegexes.some((r) => r.test(key))) {
      errors.push({ key, message: `Unknown field "${key}"` })
    }
  }

  for (const [baseKey, indices] of arrayIndices) {
    const max = Math.max(...indices)
    for (let i = 0; i <= max; i++) {
      if (!indices.has(i)) {
        errors.push({
          key: `${baseKey}[${i}]`,
          message: `Array "${baseKey}" is missing index ${i} — entries must be contiguous starting at 0`,
        })
      }
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
