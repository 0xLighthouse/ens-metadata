import type { Schema } from '@ensmetadata/schemas/types'
import type { PublicClient } from 'viem'
import { normalize } from 'viem/ens'
import { fetchSchema, type SchemaResolver } from './schema'
import type {
  GetMetadataOptions,
  GetMetadataResult,
  GetSchemaOptions,
  ReadTextRecordsOptions,
} from './types'

const DEFAULT_KEYS = ['alias', 'description', 'avatar', 'url']

const SCHEMA_KEYS = ['schema', 'class']

// --------------------------------------------------------------------------
// Internal helpers (previously in internal.ts). Kept module-private now that
// they only serve this file.
// --------------------------------------------------------------------------

declare function setTimeout(callback: () => void, ms: number): unknown
declare function clearTimeout(handle: unknown): void

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timerId: unknown
  const timer = new Promise<null>((resolve) => {
    timerId = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([promise, timer]).finally(() => clearTimeout(timerId)) as Promise<T | null>
}

function buildTextOptions(opts: {
  blockNumber?: bigint
  blockTag?: string
  gatewayUrls?: string[]
  strict?: boolean
  universalResolverAddress?: string
}) {
  return {
    ...(opts.blockNumber !== undefined ? { blockNumber: opts.blockNumber } : {}),
    ...(opts.blockTag !== undefined ? { blockTag: opts.blockTag } : {}),
    ...(opts.gatewayUrls !== undefined ? { gatewayUrls: opts.gatewayUrls } : {}),
    ...(opts.strict !== undefined ? { strict: opts.strict } : {}),
    ...(opts.universalResolverAddress !== undefined
      ? { universalResolverAddress: opts.universalResolverAddress }
      : {}),
  }
}

function buildResolverOptions(opts: GetResolverAddressOptions) {
  return {
    ...(opts.blockNumber !== undefined ? { blockNumber: opts.blockNumber } : {}),
    ...(opts.blockTag !== undefined ? { blockTag: opts.blockTag } : {}),
  }
}

function normalizeResolverAddress(resolver: unknown): string | null {
  if (!resolver) return null
  if (typeof resolver === 'string') return resolver
  if (typeof resolver === 'object' && resolver !== null && 'address' in resolver) {
    const address = (resolver as { address?: unknown }).address
    return typeof address === 'string' ? address : null
  }
  return null
}

async function fetchTextRecords(
  client: PublicClient,
  normalizedName: string,
  keys: string[],
  textOptions: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<Record<string, string | null>> {
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const value = await withTimeout<string | null>(
          // biome-ignore lint/suspicious/noExplicitAny: ensjs extends PublicClient with getEnsText
          (client as any).getEnsText({ name: normalizedName, key, ...textOptions }),
          timeoutMs,
        )
        return [key, (value ?? null) as string | null] as const
      } catch {
        return [key, null] as const
      }
    }),
  )
  return Object.fromEntries(results)
}

// --------------------------------------------------------------------------
// Public: chain-agnostic text-record + resolver helpers. The caller picks
// the chain by handing in the right `PublicClient`. Basename routing has
// moved to `multichainMetadataReader`; if you need an L2 read, use that
// (or call `fetchTextRecordsDirect` from `./multichain` with an L2 client).
// --------------------------------------------------------------------------

/**
 * Read multiple ENS text records in parallel. Per-key errors are swallowed and
 * surface as `null`. Use this when you'd rather see partial results than fail
 * on a single bad key.
 */
export async function readTextRecords(
  opts: ReadTextRecordsOptions,
): Promise<Record<string, string | null>> {
  const normalizedName = normalize(opts.name)
  const textOptions = buildTextOptions(opts)
  const records = await fetchTextRecords(
    opts.client,
    normalizedName,
    opts.keys,
    textOptions,
    opts.timeoutMs,
  )
  const result: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(records)) {
    result[key] = typeof value === 'string' && value.length > 0 ? value : null
  }
  return result
}

/**
 * Read multiple ENS text records in parallel. Any RPC error propagates — use
 * this when "no record set" must be distinguishable from "transport blip".
 * Empty strings are normalised to `null`.
 */
export async function readTextRecordsStrict(
  opts: ReadTextRecordsOptions,
): Promise<Record<string, string | null>> {
  const normalizedName = normalize(opts.name)
  const textOptions = buildTextOptions(opts)
  const entries = await Promise.all(
    opts.keys.map(async (key) => {
      // biome-ignore lint/suspicious/noExplicitAny: ensjs extends PublicClient with getEnsText
      const value = await (opts.client as any).getEnsText({
        name: normalizedName,
        key,
        ...textOptions,
      })
      return [key, typeof value === 'string' && value.length > 0 ? value : null] as const
    }),
  )
  return Object.fromEntries(entries)
}

export interface GetResolverAddressOptions {
  client: PublicClient
  name: string
  blockNumber?: bigint
  blockTag?: 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'
}

/**
 * Look up the resolver address for an ENS name. Returns `null` when no
 * resolver is set or any error occurs.
 */
export async function getResolverAddress(
  opts: GetResolverAddressOptions,
): Promise<`0x${string}` | null> {
  const normalizedName = normalize(opts.name)
  const extras = buildResolverOptions(opts)
  try {
    const resolver =
      await // biome-ignore lint/suspicious/noExplicitAny: ensjs extends PublicClient with getEnsResolver
      (opts.client as any).getEnsResolver({ name: normalizedName, ...extras })
    const address = normalizeResolverAddress(resolver)
    return address ? (address as `0x${string}`) : null
  } catch {
    return null
  }
}

/**
 * Look up the resolver address for an ENS name. Throws if the lookup fails or
 * the name has no resolver set.
 */
export async function getResolverAddressStrict(
  opts: GetResolverAddressOptions,
): Promise<`0x${string}`> {
  const normalizedName = normalize(opts.name)
  const extras = buildResolverOptions(opts)
  // biome-ignore lint/suspicious/noExplicitAny: ensjs extends PublicClient with getEnsResolver
  const resolver = await (opts.client as any).getEnsResolver({ name: normalizedName, ...extras })
  const address = normalizeResolverAddress(resolver)
  if (!address) {
    throw new Error(`No resolver found for ${normalizedName}`)
  }
  return address as `0x${string}`
}

// --------------------------------------------------------------------------
// Schema cascade resolution for an ENS name
// --------------------------------------------------------------------------

export type SchemaSource = 'payload' | 'ens' | 'none'

export interface ResolvedSchema {
  schema: Schema | null
  source: SchemaSource
  uri: string | null
}

export interface ResolveSchemaOptions {
  client: PublicClient
  name: string
  /** Schema URI carried in the inbound payload, if any. */
  payloadSchemaUri?: string | null
  /**
   * Pre-fetched value of the `schema` text record, if the caller already
   * read it (avoids a duplicate getEnsText). `undefined` = not provided →
   * SDK reads it strictly. `null`/`''` = caller confirms no record set.
   */
  ensSchemaText?: string | null
  /** Optional caller-provided resolver, tried before the network fetch. */
  resolver?: SchemaResolver
  /** IPFS gateway origin. Default `https://ipfs.io`. */
  gateway?: string
  /** Network timeout (ms). Default 15000. */
  timeoutMs?: number
}

/**
 * Resolve the schema to validate a payload against, following the cascade:
 *  1. If `payloadSchemaUri` non-empty → fetch it (hard-fail on any error).
 *  2. Else if `ensSchemaText` provided → use as URI (or `null`/`''` → none).
 *  3. Else → read the `schema` text record off ENS strictly.
 *  4. If a URI was found from ENS → fetch it (hard-fail on any error).
 *  5. No URI anywhere → `{source: 'none', uri: null, schema: null}`.
 */
export async function resolveSchemaForName(opts: ResolveSchemaOptions): Promise<ResolvedSchema> {
  const payloadUri =
    typeof opts.payloadSchemaUri === 'string' && opts.payloadSchemaUri.length > 0
      ? opts.payloadSchemaUri
      : null

  const fetchOpts: { resolver?: SchemaResolver; gateway?: string; timeoutMs?: number } = {}
  if (opts.resolver !== undefined) fetchOpts.resolver = opts.resolver
  if (opts.gateway !== undefined) fetchOpts.gateway = opts.gateway
  if (opts.timeoutMs !== undefined) fetchOpts.timeoutMs = opts.timeoutMs

  if (payloadUri) {
    const schema = await fetchSchema(payloadUri, fetchOpts)
    return { schema, source: 'payload', uri: payloadUri }
  }

  let ensUri: string | null
  if (opts.ensSchemaText !== undefined) {
    ensUri =
      typeof opts.ensSchemaText === 'string' && opts.ensSchemaText.length > 0
        ? opts.ensSchemaText
        : null
  } else {
    try {
      const records = await readTextRecordsStrict({
        client: opts.client,
        name: opts.name,
        keys: ['schema'],
      })
      ensUri = records.schema ?? null
    } catch (err) {
      throw new Error(
        `Failed to read 'schema' text record from ENS for ${opts.name}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (!ensUri) {
    return { schema: null, source: 'none', uri: null }
  }

  const schema = await fetchSchema(ensUri, fetchOpts)
  return { schema, source: 'ens', uri: ensUri }
}

// --------------------------------------------------------------------------
// Single-chain metadata reader factory
// --------------------------------------------------------------------------

async function getMetadataRecords(
  client: PublicClient,
  opts: GetMetadataOptions,
): Promise<GetMetadataResult> {
  const normalizedName = normalize(opts.name)

  let keys: string[]
  if (opts.schema) {
    const schemaKeysList = Object.keys(opts.schema.properties)
    const extraKeys = opts.keys ?? []
    keys = [...new Set([...schemaKeysList, ...extraKeys])]
  } else if (opts.keys) {
    keys = [...new Set(opts.keys)]
  } else {
    keys = DEFAULT_KEYS
  }
  const textOptions = buildTextOptions(opts)
  const texts = await fetchTextRecords(client, normalizedName, keys, textOptions)

  return {
    name: normalizedName,
    schema: texts.schema ?? null,
    class: texts.class ?? null,
    properties: texts,
  }
}

/**
 * Single-chain metadata reader. The factory is intentionally argument-free so
 * it composes cleanly with `viem.PublicClient.extend()`. Chain selection is
 * implicit: the supplied `client` decides which chain reads land on. Use
 * `multichainMetadataReader` from `./multichain` if you need a single object
 * that dispatches across chains.
 */
export function metadataReader() {
  return (client: PublicClient) => ({
    getSchema: (opts: GetSchemaOptions) =>
      getMetadataRecords(client, { ...opts, keys: SCHEMA_KEYS }),
    getMetadata: (opts: GetMetadataOptions) => getMetadataRecords(client, opts),
  })
}
