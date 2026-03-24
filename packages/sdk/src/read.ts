import type { PublicClient } from 'viem'
import { normalize } from 'viem/ens'
import {
  buildTextOptions,
  extractSchemaFields,
  fetchTextRecords,
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

export function metadataReader() {
  return (client: PublicClient) => ({
    getSchema: (opts: GetSchemaOptions) => getSchemaImpl(client, opts),
    getMetadata: (opts: GetMetadataOptions) => getMetadataImpl(client, opts),
  })
}
