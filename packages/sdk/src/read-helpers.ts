import { type PublicClient, namehash } from 'viem'
import { normalize } from 'viem/ens'
import { buildTextOptions, fetchTextRecords, normalizeResolverAddress } from './internal'

const RESOLVER_TEXT_ABI = [
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

export interface ReadTextRecordsOptions {
  client: PublicClient
  name: string
  keys: string[]
  blockNumber?: bigint
  blockTag?: 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'
  gatewayUrls?: string[]
  strict?: boolean
  universalResolverAddress?: string
  timeoutMs?: number
}

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

function buildResolverOptions(opts: GetResolverAddressOptions) {
  return {
    ...(opts.blockNumber !== undefined ? { blockNumber: opts.blockNumber } : {}),
    ...(opts.blockTag !== undefined ? { blockTag: opts.blockTag } : {}),
  }
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
  const node = namehash(normalize(opts.name))
  const entries = await Promise.all(
    opts.keys.map(async (key) => {
      try {
        const value = (await opts.client.readContract({
          address: opts.resolverAddress,
          abi: RESOLVER_TEXT_ABI,
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
