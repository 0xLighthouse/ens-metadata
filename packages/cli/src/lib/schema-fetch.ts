/**
 * Schema fetch helpers used by the `set` command. Resolves a schema URI to an
 * in-memory `Schema` object, preferring the bundled `_registry.json` cache to
 * avoid unnecessary network calls and falling back to a public IPFS gateway.
 */
import { getPublishedRegistry } from '@ensmetadata/schemas/published'
import type { Schema } from '@ensmetadata/schemas/types'

export const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io'

export interface SchemaFetchOptions {
  /** IPFS gateway origin (e.g. `https://ipfs.io`). Trailing slash optional. */
  ipfsGateway?: string
  /** Network timeout in milliseconds. Defaults to 15000. */
  timeoutMs?: number
}

/**
 * Parse an `ipfs://<cid>` URI into its CID. Throws on any other scheme.
 * Future schemes (e.g. `https://`) can be supported here if/when needed.
 */
export function parseSchemaUri(uri: string): { cid: string } {
  const trimmed = uri.trim()
  if (!trimmed.startsWith('ipfs://')) {
    throw new Error(
      `Unsupported schema URI: "${uri}". Only ipfs://<cid> URIs are supported.`,
    )
  }
  const cid = trimmed.slice('ipfs://'.length).replace(/^\/+/, '').split('/')[0]
  if (!cid) {
    throw new Error(`Invalid IPFS URI: "${uri}". Missing CID.`)
  }
  return { cid }
}

/**
 * Look up a schema by CID in the bundled published registry. Returns `null` if
 * the CID isn't tracked locally.
 */
export async function findLocalSchemaByCid(cid: string): Promise<Schema | null> {
  const registry = await getPublishedRegistry()
  for (const schemaData of Object.values(registry.schemas)) {
    for (const versionData of Object.values(schemaData.published)) {
      if (versionData.cid === cid && versionData.schema) {
        return versionData.schema as Schema
      }
    }
  }
  return null
}

function isPlausibleSchema(value: unknown): value is Schema {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (candidate.type !== 'object') return false
  if (typeof candidate.properties !== 'object' || candidate.properties === null) return false
  return true
}

/**
 * Fetch the JSON document at `gateway/ipfs/<cid>` and validate that it looks
 * like a `Schema`. Throws on network errors, non-2xx responses, JSON parse
 * failures, and unrecognised payload shapes.
 */
async function fetchFromGateway(
  cid: string,
  gateway: string,
  timeoutMs: number,
): Promise<Schema> {
  const origin = gateway.replace(/\/+$/, '')
  const url = `${origin}/ipfs/${cid}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal })
  } catch (err) {
    throw new Error(
      `Failed to fetch schema from IPFS gateway (${url}): ${err instanceof Error ? err.message : String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch schema from IPFS gateway (${url}): HTTP ${response.status} ${response.statusText}`,
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

  if (!isPlausibleSchema(parsed)) {
    throw new Error(
      `Schema fetched from ${url} does not look like a valid Schema (missing properties or type !== 'object').`,
    )
  }

  return parsed
}

/**
 * Resolve an `ipfs://<cid>` URI to a `Schema`. Tries the bundled registry
 * first, then falls back to the configured IPFS gateway.
 */
export async function fetchSchemaByUri(
  uri: string,
  opts: SchemaFetchOptions = {},
): Promise<Schema> {
  const { cid } = parseSchemaUri(uri)

  const local = await findLocalSchemaByCid(cid)
  if (local) return local

  const gateway = opts.ipfsGateway ?? DEFAULT_IPFS_GATEWAY
  const timeoutMs = opts.timeoutMs ?? 15_000
  return fetchFromGateway(cid, gateway, timeoutMs)
}
