import type { PublicClient } from 'viem'
import { normalize } from 'viem/ens'
import {
  buildTextOptions,
  fetchTextRecords,
  fetchTextRecordsDirect,
  getBaseResolverAddress,
  getOrCreateBasePublicClient,
  isBasename,
  normalizeResolverAddress,
} from './internal'

export interface ReadTextRecordsOptions {
  client: PublicClient
  name: string
  keys: string[]
  /**
   * Optional Base public client. Used when `name` is a Basename. When
   * omitted the SDK lazily creates one against the default Base RPC.
   */
  basePublicClient?: PublicClient
  blockNumber?: bigint
  blockTag?: 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'
  gatewayUrls?: string[]
  strict?: boolean
  universalResolverAddress?: string
  timeoutMs?: number
}

async function readTextRecordsViaBase(
  opts: ReadTextRecordsOptions,
): Promise<Record<string, string | null>> {
  const baseClient = getOrCreateBasePublicClient(opts.basePublicClient)
  const resolverAddress = await getBaseResolverAddress(baseClient, opts.name)
  return fetchTextRecordsDirect(baseClient, resolverAddress, opts.name, opts.keys)
}

/**
 * Read multiple ENS text records in parallel. Per-key errors are swallowed and
 * surface as `null`. Use this when you'd rather see partial results than fail
 * on a single bad key.
 *
 * Auto-detects Basenames and routes them through a direct L2 read.
 */
export async function readTextRecords(
  opts: ReadTextRecordsOptions,
): Promise<Record<string, string | null>> {
  if (isBasename(opts.name)) {
    try {
      return await readTextRecordsViaBase(opts)
    } catch {
      return Object.fromEntries(opts.keys.map((k) => [k, null]))
    }
  }
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
 *
 * Auto-detects Basenames and routes them through a direct L2 read.
 */
export async function readTextRecordsStrict(
  opts: ReadTextRecordsOptions,
): Promise<Record<string, string | null>> {
  if (isBasename(opts.name)) {
    return readTextRecordsViaBase(opts)
  }
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
  /**
   * Optional Base public client. Used when `name` is a Basename. When
   * omitted the SDK lazily creates one against the default Base RPC.
   */
  basePublicClient?: PublicClient
  blockNumber?: bigint
  blockTag?: 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'
}

function buildResolverOptions(opts: GetResolverAddressOptions) {
  return {
    ...(opts.blockNumber !== undefined ? { blockNumber: opts.blockNumber } : {}),
    ...(opts.blockTag !== undefined ? { blockTag: opts.blockTag } : {}),
  }
}

/**
 * Look up the resolver address for an ENS name. Returns `null` when no
 * resolver is set or any error occurs.
 *
 * For Basenames the resolver is read from the Base registry directly.
 */
export async function getResolverAddress(
  opts: GetResolverAddressOptions,
): Promise<`0x${string}` | null> {
  if (isBasename(opts.name)) {
    const baseClient = getOrCreateBasePublicClient(opts.basePublicClient)
    try {
      return await getBaseResolverAddress(baseClient, opts.name)
    } catch {
      return null
    }
  }
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
 *
 * For Basenames the resolver is read from the Base registry directly.
 */
export async function getResolverAddressStrict(
  opts: GetResolverAddressOptions,
): Promise<`0x${string}`> {
  if (isBasename(opts.name)) {
    const baseClient = getOrCreateBasePublicClient(opts.basePublicClient)
    return getBaseResolverAddress(baseClient, opts.name)
  }
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

export interface ReadTextRecordsFromResolverOptions {
  client: PublicClient
  resolverAddress: `0x${string}`
  name: string
  keys: string[]
}

/**
 * Read text records by calling `text(bytes32 node, string key)` directly on a
 * resolver contract. Bypasses ENS universal-resolver and CCIP-Read flows, so
 * the caller chooses the chain via the supplied `client`.
 *
 * Per-key errors surface as `null`. Empty strings are normalised to `null`.
 */
export async function readTextRecordsFromResolver(
  opts: ReadTextRecordsFromResolverOptions,
): Promise<Record<string, string | null>> {
  return fetchTextRecordsDirect(opts.client, opts.resolverAddress, opts.name, opts.keys)
}
