import type { Schema } from '@ensmetadata/schemas/types'
import type { PublicClient } from 'viem'
import { normalize } from 'viem/ens'
import { fetchSchema, getSchemaKeys } from './schema'
import type {
  GetMetadataOptions,
  GetMetadataResult,
  GetSchemaOptions,
  GetSchemaResult,
  RecordSet,
} from './types'

const SCHEMA_KEYS = ['schema', 'class']

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
    timerId = setTimeout(
      () => reject(new Error(`Timed out reading '${label}' after ${ms}ms`)),
      ms,
    )
  })
  return Promise.race([promise, timer]).finally(() => clearTimeout(timerId))
}


// Strict read: RPC errors and timeouts propagate; empty strings normalise to null.
export async function readTextRecords(opts: {
  client: PublicClient
  name: string
  keys: string[]
  blockNumber?: bigint
  blockTag?: 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'
  gatewayUrls?: string[]
  strict?: boolean
  universalResolverAddress?: string
  timeoutMs?: number
}): Promise<Record<string, string | null>> {
  const { client, name, keys, timeoutMs, ...textOptions } = opts
  const normalizedName = normalize(name)
  const ms = timeoutMs ?? 10_000

  const entries = await Promise.all(
    keys.map(async (key) => {
      const value = await withTimeout<string | null>(
        // biome-ignore lint/suspicious/noExplicitAny: ensjs extends PublicClient with getEnsText
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

  const keys = new Set<string>()
  if (schema) {
    for (const k of getSchemaKeys(schema).keys) keys.add(k)
    keys.add('schema')
  }
  if (opts.keys) {
    for (const k of opts.keys) keys.add(k)
  }
  for (const k of alreadyRead) keys.delete(k)

  const texts =
    keys.size > 0 ? await readTextRecords({ ...opts, client, keys: [...keys] }) : {}

  // State RecordSet convention: only keys with values on-chain appear.
  for (const [k, v] of Object.entries(texts)) {
    if (v !== null) properties[k] = v
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
    resolvedSchema = await fetchSchema(schemaUri)
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
 * The factory is intentionally argument-free so it composes cleanly with 
 * `viem.PublicClient.extend()`.
 */
export function metadataReader() {
  return (client: PublicClient) => ({
    getSchema: (opts: GetSchemaOptions) => getSchema(client, opts),
    getMetadata: (opts: GetMetadataOptions) => getMetadata(client, opts),
  })
}
