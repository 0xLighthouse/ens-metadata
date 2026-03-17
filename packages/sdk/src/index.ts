import { normalize } from 'viem/ens'
import type { PublicClient } from 'viem'
import type { Schema } from '@ens-node-metadata/schemas/types'
import type {
  GetSchemaOptions,
  GetSchemaResult,
  GetMetadataOptions,
  GetMetadataResult,
} from './types'

export type MetadataValidationError = { key: string; message: string }
export type MetadataValidationResult =
  | { success: true; data: Record<string, string> }
  | { success: false; errors: MetadataValidationError[] }

export function validateMetadataSchema(
  data: unknown,
  schema: Schema,
): MetadataValidationResult {
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

  return errors.length > 0 ? { success: false, errors } : { success: true, data: record as Record<string, string> }
}

export function validate(schema: Schema, data: unknown): boolean {
  return validateMetadataSchema(data, schema).success
}

const DEFAULT_KEYS = [
  'schema',
  'class',
  'schemaVersion',
  'schemaCid',
  'description',
  'avatar',
  'url',
]

const SCHEMA_KEYS = ['schema', 'class', 'schemaVersion', 'schemaCid']

function pickFirst(
  texts: Record<string, string | null>,
  candidates: string[],
): string | null {
  for (const key of candidates) {
    const value = texts[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
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
    ...(opts.universalResolverAddress !== undefined ? { universalResolverAddress: opts.universalResolverAddress } : {}),
  }
}

function extractSchemaFields(texts: Record<string, string | null>): Omit<GetSchemaResult, never> {
  return {
    schema: pickFirst(texts, ['schema', 'ens.schema', 'record.schema']),
    class: pickFirst(texts, ['class', 'ens.class', 'record.class']),
    version: pickFirst(texts, ['schemaVersion', 'schema-version', 'version', 'record.version']),
    cid: pickFirst(texts, ['schemaCid', 'schema-cid', 'cid', 'record.cid']),
  }
}

declare function setTimeout(callback: () => void, ms: number): unknown

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  const timer = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
  return Promise.race([promise, timer]) as Promise<T | null>
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

async function getSchemaImpl(
  client: PublicClient,
  opts: GetSchemaOptions,
): Promise<GetSchemaResult> {
  const normalizedName = normalize(opts.name)
  const textOptions = buildTextOptions(opts)
  const texts = await fetchTextRecords(client, normalizedName, SCHEMA_KEYS, textOptions)
  return extractSchemaFields(texts)
}

async function getMetadataImpl(
  client: PublicClient,
  opts: GetMetadataOptions,
): Promise<GetMetadataResult> {
  const normalizedName = normalize(opts.name)
  const coinType = opts.coinType ?? 60

  // Determine which keys to fetch
  let keys: string[]
  if (opts.schema) {
    const schemaKeys = Object.keys(opts.schema.properties)
    const extraKeys = opts.keys ?? []
    keys = [...new Set([...schemaKeys, ...extraKeys])]
  } else if (opts.keys) {
    keys = [...new Set(opts.keys)]
  } else {
    keys = DEFAULT_KEYS
  }

  const commonOptions = {
    ...(opts.blockNumber !== undefined ? { blockNumber: opts.blockNumber } : {}),
    ...(opts.blockTag !== undefined ? { blockTag: opts.blockTag } : {}),
  }

  const textOptions = buildTextOptions(opts)

  const [resolverValue, addressValue, texts] = await Promise.all([
    withTimeout(
      (client as any).getEnsResolver({ name: normalizedName, ...commonOptions }),
      10_000,
    ).catch(() => null),
    withTimeout(
      (client as any).getEnsAddress({ name: normalizedName, coinType, ...commonOptions }),
      10_000,
    ).catch(() => null),
    fetchTextRecords(client, normalizedName, keys, textOptions),
  ])

  const schemaFields = extractSchemaFields(texts)

  return {
    name: normalizedName,
    resolver: normalizeResolverAddress(resolverValue),
    address: typeof addressValue === 'string' ? addressValue : null,
    class: schemaFields.class,
    schema: schemaFields.schema,
    properties: texts,
  }
}

export function ensMetadataActions() {
  return (client: PublicClient) => ({
    getSchema: (opts: GetSchemaOptions) => getSchemaImpl(client, opts),
    getMetadata: (opts: GetMetadataOptions) => getMetadataImpl(client, opts),
  })
}

export type {
  GetSchemaOptions,
  GetSchemaResult,
  GetMetadataOptions,
  GetMetadataResult,
} from './types'
