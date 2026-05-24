import type { Schema } from '@ensmetadata/schemas/types'
import { type Address, type PublicClient, zeroAddress } from 'viem'
import { namehash, normalize } from 'viem/ens'
import { type SchemaResolver, fetchSchema, getSchemaKeys } from './schema'
import type {
  GetMetadataOptions,
  GetMetadataResult,
  GetSchemaOptions,
  GetSchemaResult,
  RecordSet,
} from './types'

const SCHEMA_KEYS = ['schema', 'class']

// Safety cap on sequential array-pattern reads. A misbehaving resolver that
// always returns a non-empty string would otherwise loop forever.
const MAX_ARRAY_ENTRIES = 1000

// Ensure we get a non-empty string or null
function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

// Timeouts so we can control how long we wait for a read to complete
declare function setTimeout(callback: () => void, ms: number): unknown
declare function clearTimeout(handle: unknown): void

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timerId: unknown
  const timer = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new Error(`Timed out reading '${label}' after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timer]).finally(() => clearTimeout(timerId))
}

// ─── Direct registry → resolver → text reads ────────────────────────────────

const REGISTRY_RESOLVER_ABI = [
  {
    type: 'function',
    name: 'resolver',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

const RESOLVER_TEXT_ABI = [
  {
    type: 'function',
    name: 'text',
    stateMutability: 'view',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

/**
 * Look up `registry.resolver(namehash(name))`. Returns `null` for the zero
 * address (which means "no resolver set" on most ENS-compatible registries).
 */
export async function getResolverFromRegistry(
  client: PublicClient,
  registry: Address,
  name: string,
): Promise<Address | null> {
  const node = namehash(normalize(name))
  const addr = (await client.readContract({
    address: registry,
    abi: REGISTRY_RESOLVER_ABI,
    functionName: 'resolver',
    args: [node],
  })) as Address
  return addr === zeroAddress ? null : addr
}

async function directReadTextRecords(
  client: PublicClient,
  name: string,
  keys: string[],
  timeoutMs: number,
  opts: { registry?: Address; resolver?: Address | null },
): Promise<Record<string, string | null>> {
  let resolverAddr = opts.resolver ?? null
  if (resolverAddr === null && opts.registry) {
    resolverAddr = await getResolverFromRegistry(client, opts.registry, name)
  }
  if (!resolverAddr) {
    return Object.fromEntries(keys.map((k) => [k, null]))
  }
  const node = namehash(name)
  const entries = await Promise.all(
    keys.map(async (key) => {
      const value = await withTimeout<string>(
        client.readContract({
          address: resolverAddr,
          abi: RESOLVER_TEXT_ABI,
          functionName: 'text',
          args: [node, key],
        }) as Promise<string>,
        timeoutMs,
        key,
      )
      return [key, nonEmpty(value)] as const
    }),
  )
  return Object.fromEntries(entries)
}

// ─── Public reads ───────────────────────────────────────────────────────────

// Strict read: RPC errors and timeouts propagate; empty strings normalise to null.
// When `registry` or `resolver` is supplied, reads go directly through the
// registry + resolver pair (no Universal Resolver). Otherwise we delegate to
// viem's `getEnsText`, which routes through the chain's UniversalResolver.
// `resolver` short-circuits the `registry.resolver(node)` lookup — callers
// reading repeatedly against the same name should pre-resolve once.
export async function readTextRecords(opts: {
  client: PublicClient
  name: string
  keys: string[]
  blockNumber?: bigint
  blockTag?: 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'
  gatewayUrls?: string[]
  strict?: boolean
  universalResolverAddress?: string
  registry?: Address
  resolver?: Address | null
  timeoutMs?: number
}): Promise<Record<string, string | null>> {
  const { client, name, keys, timeoutMs, registry, resolver, ...textOptions } = opts
  const normalizedName = normalize(name)
  const ms = timeoutMs ?? 10_000

  if (registry || resolver) {
    return directReadTextRecords(client, normalizedName, keys, ms, { registry, resolver })
  }

  const entries = await Promise.all(
    keys.map(async (key) => {
      const value = await withTimeout<string | null>(
        // biome-ignore lint/suspicious/noExplicitAny: viem extends PublicClient with getEnsText
        (client as any).getEnsText({ name: normalizedName, key, ...textOptions }),
        ms,
        key,
      )
      return [key, nonEmpty(value)] as const
    }),
  )
  return Object.fromEntries(entries)
}

/**
 * Resolve the set of keys to read for a name, then read them.
 *
 * Key-list construction:
 *  - Neither `opts.schema` nor `opts.keys` given → call `getSchemaRecords`
 *    first to discover the name's Schema; the `schema`/`class` text records
 *    are returned as a side effect and reused in the output (no second read).
 *  - A `Schema` is available (passed in or just discovered) → its declared
 *    property keys are added. `schema` is also added explicitly because it's
 *    rarely declared as a property but is still meaningful to surface.
 *  - `opts.keys` given → unioned in.
 *  - Anything already pre-fetched is removed before the read so we never
 *    hit the same key twice.
 *
 * The single read is strict: any RPC error or per-key timeout throws.
 */
export async function getMetadata(
  client: PublicClient,
  opts: GetMetadataOptions,
): Promise<GetMetadataResult> {
  let schema: Schema | null = opts.schema ?? null
  const properties: RecordSet = {}
  const alreadyRead = new Set<string>()

  if (!opts.schema && !opts.keys) {
    const schemaResult = await getSchema(client, opts)
    schema = schemaResult.schema
    Object.assign(properties, schemaResult.properties)
    for (const k of SCHEMA_KEYS) alreadyRead.add(k)
  }

  const schemaKeys = schema ? getSchemaKeys(schema) : { keys: [], arrayPatterns: [] }

  const keys = new Set<string>()
  if (schema) {
    for (const k of schemaKeys.keys) keys.add(k)
    keys.add('schema')
  }
  if (opts.keys) {
    for (const k of opts.keys) keys.add(k)
  }
  for (const k of alreadyRead) keys.delete(k)

  // Pre-resolve the resolver once when using the direct path, so the array
  // phase below doesn't re-run `registry.resolver(node)` per index. A null
  // result means the name has no resolver — every read returns null, so we
  // can short-circuit both phases.
  const hasArrayWork = schemaKeys.arrayPatterns.length > 0
  let readOpts: typeof opts & { client: PublicClient; resolver?: Address | null }
  if (opts.registry && (keys.size > 0 || hasArrayWork)) {
    const resolverAddr = await getResolverFromRegistry(client, opts.registry, normalize(opts.name))
    if (!resolverAddr) {
      return { name: normalize(opts.name), properties, schema }
    }
    readOpts = { ...opts, client, registry: undefined, resolver: resolverAddr }
  } else {
    readOpts = { ...opts, client }
  }

  const texts = keys.size > 0 ? await readTextRecords({ ...readOpts, keys: [...keys] }) : {}

  // State RecordSet convention: only keys with values on-chain appear.
  for (const [k, v] of Object.entries(texts)) {
    if (v !== null) properties[k] = v
  }

  // Array-pattern phase: for each `parameterType: "array"` pattern, read
  // `${baseKey}[0]`, `${baseKey}[1]`, ... sequentially and stop at the first
  // gap. Different patterns run in parallel; entries within one pattern do
  // not, since we don't know the length up front.
  if (hasArrayWork) {
    const arrayResults = await Promise.all(
      schemaKeys.arrayPatterns.map(async ({ baseKey }) => {
        const found: Array<[string, string]> = []
        for (let i = 0; i < MAX_ARRAY_ENTRIES; i++) {
          const key = `${baseKey}[${i}]`
          const result = await readTextRecords({ ...readOpts, keys: [key] })
          const value = result[key]
          if (value === null || value === undefined) break
          found.push([key, value])
        }
        return found
      }),
    )
    for (const entries of arrayResults) {
      for (const [k, v] of entries) properties[k] = v
    }
  }

  return {
    name: normalize(opts.name),
    properties,
    schema,
  }
}

/**
 * Reads the `schema` and `class` text records and, when a `schema` URI is set,
 * fetches the referenced Schema.
 *
 * Returns:
 *  - `properties.schema` — raw `schema` text record (URI), present only when set
 *  - `properties.class`  — raw `class` text record, with one fallback: if the
 *                          record is unset but the resolved Schema declares
 *                          `properties.class.default`, that default is used
 *  - `schema`            — the resolved Schema object, or null when no URI is set
 */
export async function getSchema(
  client: PublicClient,
  opts: GetSchemaOptions,
): Promise<GetSchemaResult> {
  const texts = await readTextRecords({ ...opts, client, keys: SCHEMA_KEYS })

  const schemaUri = texts.schema
  let classValue = texts.class

  let resolvedSchema: Schema | null = null
  if (schemaUri) {
    resolvedSchema = await fetchSchema(schemaUri, {
      ipfsGateway: opts.ipfsGateway,
      resolver: opts.schemaResolver,
    })
    if (!classValue) {
      classValue = nonEmpty(resolvedSchema.properties?.class?.default)
    }
  }

  const properties: RecordSet = {}
  if (schemaUri) properties.schema = schemaUri
  if (classValue) properties.class = classValue

  return {
    name: normalize(opts.name),
    properties,
    schema: resolvedSchema,
  }
}

/**
 * The factory composes cleanly with `viem.PublicClient.extend()`. Pass
 * `registry` per call (on {@link GetSchemaOptions} / {@link GetMetadataOptions})
 * to use direct registry+resolver reads instead of a Universal Resolver.
 *
 * Optional `ipfsGateway` and `schemaResolver` configure defaults for every
 * call made through the returned reader; per-call options take precedence.
 */
export function metadataReader(
  config: { ipfsGateway?: string; schemaResolver?: SchemaResolver } = {},
) {
  const { ipfsGateway: defaultIpfsGateway, schemaResolver: defaultSchemaResolver } = config
  return (client: PublicClient) => ({
    getSchema: (opts: GetSchemaOptions) =>
      getSchema(client, {
        ...opts,
        ipfsGateway: opts.ipfsGateway ?? defaultIpfsGateway,
        schemaResolver: opts.schemaResolver ?? defaultSchemaResolver,
      }),
    getMetadata: (opts: GetMetadataOptions) =>
      getMetadata(client, {
        ...opts,
        ipfsGateway: opts.ipfsGateway ?? defaultIpfsGateway,
        schemaResolver: opts.schemaResolver ?? defaultSchemaResolver,
      }),
  })
}
