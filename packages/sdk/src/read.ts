import type { PublicClient } from 'viem'
import { normalize } from 'viem/ens'
import {
  buildTextOptions,
  extractSchemaFields,
  fetchAddrDirect,
  fetchTextRecords,
  fetchTextRecordsDirect,
  getBaseResolverAddress,
  getOrCreateBasePublicClient,
  isBasename,
  normalizeResolverAddress,
  withTimeout,
} from './internal'
import type {
  GetMetadataOptions,
  GetMetadataResult,
  GetSchemaOptions,
  GetSchemaResult,
} from './types'

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

async function getSchemaImpl(
  client: PublicClient,
  opts: GetSchemaOptions,
  basePublicClient?: PublicClient,
): Promise<GetSchemaResult> {
  const normalizedName = normalize(opts.name)
  if (isBasename(normalizedName)) {
    const baseClient = getOrCreateBasePublicClient(basePublicClient)
    try {
      const resolverAddress = await getBaseResolverAddress(baseClient, normalizedName)
      const texts = await fetchTextRecordsDirect(
        baseClient,
        resolverAddress,
        normalizedName,
        SCHEMA_KEYS,
      )
      return extractSchemaFields(texts)
    } catch {
      return extractSchemaFields({})
    }
  }
  const textOptions = buildTextOptions(opts)
  const texts = await fetchTextRecords(client, normalizedName, SCHEMA_KEYS, textOptions)
  return extractSchemaFields(texts)
}

async function getMetadataImpl(
  client: PublicClient,
  opts: GetMetadataOptions,
  basePublicClient?: PublicClient,
): Promise<GetMetadataResult> {
  const normalizedName = normalize(opts.name)
  const coinType = opts.coinType ?? 60

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

  if (isBasename(normalizedName)) {
    const baseClient = getOrCreateBasePublicClient(basePublicClient)
    let resolverAddress: `0x${string}` | null = null
    try {
      resolverAddress = await getBaseResolverAddress(baseClient, normalizedName)
    } catch {
      resolverAddress = null
    }

    if (!resolverAddress) {
      const empty = Object.fromEntries(keys.map((k) => [k, null]))
      const schemaFields = extractSchemaFields(empty)
      return {
        name: normalizedName,
        resolver: null,
        address: null,
        class: schemaFields.class,
        schema: schemaFields.schema,
        properties: empty,
      }
    }

    const [texts, address] = await Promise.all([
      fetchTextRecordsDirect(baseClient, resolverAddress, normalizedName, keys),
      fetchAddrDirect(baseClient, resolverAddress, normalizedName, coinType),
    ])
    const schemaFields = extractSchemaFields(texts)
    return {
      name: normalizedName,
      resolver: resolverAddress,
      address,
      class: schemaFields.class,
      schema: schemaFields.schema,
      properties: texts,
    }
  }

  const commonOptions = {
    ...(opts.blockNumber !== undefined ? { blockNumber: opts.blockNumber } : {}),
    ...(opts.blockTag !== undefined ? { blockTag: opts.blockTag } : {}),
  }

  const textOptions = buildTextOptions(opts)

  const [resolverValue, addressValue, texts] = await Promise.all([
    withTimeout(
      // biome-ignore lint/suspicious/noExplicitAny: ensjs extends PublicClient with getEnsResolver
      (client as any).getEnsResolver({ name: normalizedName, ...commonOptions }),
      10_000,
    ).catch(() => null),
    withTimeout(
      // biome-ignore lint/suspicious/noExplicitAny: ensjs extends PublicClient with getEnsAddress
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

export function metadataReader(config: { basePublicClient?: PublicClient } = {}) {
  return (client: PublicClient) => ({
    getSchema: (opts: GetSchemaOptions) => getSchemaImpl(client, opts, config.basePublicClient),
    getMetadata: (opts: GetMetadataOptions) =>
      getMetadataImpl(client, opts, config.basePublicClient),
  })
}
