import { type PublicClient, namehash } from 'viem'
import { normalize } from 'viem/ens'
import { BaseResolverError, getBaseResolverAddress } from '../chains/base'
import { metadataReader } from '../read'
import { type ChainClients, MissingChainClientError, chainForName } from './routing'
import type {
  GetMetadataOptions,
  GetMetadataResult,
  GetSchemaOptions,
  RecordSet,
} from '../types'

const DEFAULT_KEYS = ['alias', 'description', 'avatar', 'url']

const SCHEMA_KEYS = ['schema', 'class']

const resolverTextAbi = [
  {
    name: 'text',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

/**
 * Read text records by calling `text(node, key)` directly on a resolver
 * contract. No CCIP-Read, no universal resolver — the caller chooses the
 * chain via `client`. Per-key errors surface as `null`; empty strings are
 * normalised to `null`.
 */
export async function fetchTextRecordsDirect(
  client: PublicClient,
  resolverAddress: `0x${string}`,
  name: string,
  keys: string[],
): Promise<Record<string, string | null>> {
  const node = namehash(normalize(name))
  const entries = await Promise.all(
    keys.map(async (key) => {
      try {
        const value = (await client.readContract({
          address: resolverAddress,
          abi: resolverTextAbi,
          functionName: 'text',
          args: [node, key],
        })) as string
        return [key, typeof value === 'string' && value.length > 0 ? value : null] as const
      } catch {
        return [key, null] as const
      }
    }),
  )
  return Object.fromEntries(entries)
}

type CoreReader = ReturnType<ReturnType<typeof metadataReader>>

/**
 * Multichain wrapper around `metadataReader`. Routes each call to the
 * appropriate per-chain core reader based on `chainForName(opts.name)`. The
 * mainnet client is always used for `*.eth`; basenames are routed to the
 * Base client when supplied. Throws `MissingChainClientError` if a name
 * lands on a chain whose client is not in the map.
 */
export function multichainMetadataReader(clients: ChainClients) {
  const mainnetReader: CoreReader = clients.mainnet.extend(metadataReader())

  // Basenames live on Base L2 but mainnet's universal resolver does not
  // support them, so we read directly from the L2 registry + resolver.
  // This keeps the wrapper independent of any future L1↔L2 CCIP wiring.
  async function readBaseRecords(name: string, keys: string[]): Promise<GetMetadataResult> {
    const baseClient = clients.base
    if (!baseClient) throw new MissingChainClientError('base', name)

    let resolverAddress: `0x${string}` | null = null
    try {
      resolverAddress = await getBaseResolverAddress(baseClient, name)
    } catch (err) {
      if (err instanceof BaseResolverError && err.code === 'unconfigured') {
        resolverAddress = null
      } else {
        throw err
      }
    }

    const raw = resolverAddress
      ? await fetchTextRecordsDirect(baseClient, resolverAddress, name, keys)
      : {}
    // State RecordSet convention: only keys with values on-chain appear.
    const properties: RecordSet = {}
    for (const [k, v] of Object.entries(raw)) {
      if (v !== null) properties[k] = v
    }
    return {
      name,
      schema: properties.schema ?? null,
      class: properties.class ?? null,
      properties,
    }
  }

  function keysFor(opts: GetMetadataOptions): string[] {
    if (opts.schema) {
      const schemaKeys = Object.keys(opts.schema.properties)
      const extraKeys = opts.keys ?? []
      return [...new Set([...schemaKeys, ...extraKeys])]
    }
    if (opts.keys) return [...new Set(opts.keys)]
    return DEFAULT_KEYS
  }

  // Async so synchronous dispatch errors (missing Base client) surface as
  // promise rejections rather than throwing into the caller's call site.
  return {
    getSchema: async (opts: GetSchemaOptions): Promise<GetMetadataResult> =>
      chainForName(opts.name) === 'base'
        ? readBaseRecords(opts.name, SCHEMA_KEYS)
        : mainnetReader.getSchema(opts),
    getMetadata: async (opts: GetMetadataOptions): Promise<GetMetadataResult> =>
      chainForName(opts.name) === 'base'
        ? readBaseRecords(opts.name, keysFor(opts))
        : mainnetReader.getMetadata(opts),
  }
}
