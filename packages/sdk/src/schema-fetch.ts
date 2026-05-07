import type { Schema } from '@ensmetadata/schemas/types'

declare function setTimeout(callback: () => void, ms: number): unknown
declare function clearTimeout(handle: unknown): void
declare const AbortController: { new (): { signal: unknown; abort(): void } }
interface FetchResponse {
  ok: boolean
  status: number
  statusText: string
  json(): Promise<unknown>
}
declare const fetch: (url: string, init?: { signal?: unknown }) => Promise<FetchResponse>

export const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io'

export interface SchemaFetcherOptions {
  /** IPFS gateway origin. Default `https://ipfs.io`. Trailing slash optional. */
  ipfsGateway?: string
  /** Network timeout (ms). Default 15000. */
  timeoutMs?: number
  /**
   * Optional fast-path resolver. If supplied and returns a Schema for the
   * CID, the gateway fetch is skipped. Used by callers (e.g. the CLI) to
   * consult a bundled local registry before going over the network.
   */
  localResolver?: (cid: string) => Promise<Schema | null> | Schema | null
}

/**
 * Parse an `ipfs://<cid>` URI into its CID. Throws on any other scheme.
 */
export function parseSchemaUri(uri: string): { cid: string } {
  const trimmed = uri.trim()
  if (!trimmed.startsWith('ipfs://')) {
    throw new Error(`Unsupported schema URI: "${uri}". Only ipfs://<cid> URIs are supported.`)
  }
  const cid = trimmed.slice('ipfs://'.length).replace(/^\/+/, '').split('/')[0]
  if (!cid) {
    throw new Error(`Invalid IPFS URI: "${uri}". Missing CID.`)
  }
  return { cid }
}

function isPlausibleSchema(value: unknown): value is Schema {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (candidate.type !== 'object') return false
  if (typeof candidate.properties !== 'object' || candidate.properties === null) return false
  return true
}

async function fetchFromGateway(cid: string, gateway: string, timeoutMs: number): Promise<Schema> {
  const origin = gateway.replace(/\/+$/, '')
  const url = `${origin}/ipfs/${cid}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: FetchResponse
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
 * Resolve an `ipfs://<cid>` URI to a `Schema`. Tries the optional
 * `localResolver` first, then falls back to the configured IPFS gateway.
 */
export async function fetchSchemaByUri(
  uri: string,
  opts: SchemaFetcherOptions = {},
): Promise<Schema> {
  const { cid } = parseSchemaUri(uri)

  if (opts.localResolver) {
    const local = await opts.localResolver(cid)
    if (local) return local
  }

  const gateway = opts.ipfsGateway ?? DEFAULT_IPFS_GATEWAY
  const timeoutMs = opts.timeoutMs ?? 15_000
  return fetchFromGateway(cid, gateway, timeoutMs)
}
