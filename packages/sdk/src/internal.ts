import { http, type PublicClient, createPublicClient, namehash } from 'viem'
import { base } from 'viem/chains'
import { normalize } from 'viem/ens'
import type { GetSchemaResult } from './types'

export const BASE_CHAIN_ID = 8453
export const BASE_REGISTRY = '0xb94704422c2a1e396835a571837aa5ae53285a95' as const

export const baseRegistryAbi = [
  {
    name: 'resolver',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

export const resolverTextAbi = [
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

export const resolverAddrAbi = [
  {
    name: 'addr',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'coinType', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
] as const

/**
 * Returns true for strict subdomains of `base.eth`. The 2LD `base.eth` itself
 * is excluded because it is owned and resolved on L1.
 */
export function isBasename(name: string): boolean {
  const n = normalize(name)
  if (n === 'base.eth') return false
  return n.endsWith('.base.eth')
}

/**
 * Distinguishes "name is unconfigured on the Base L2 registry" from "the read
 * itself failed (RPC error, rate limit, network, decode)". Callers that want
 * to silently treat unconfigured names as missing data can do so without also
 * swallowing transport failures.
 */
export class BaseResolverError extends Error {
  code: 'unconfigured' | 'rpc-error'
  cause?: unknown

  constructor(message: string, code: 'unconfigured' | 'rpc-error', cause?: unknown) {
    super(message)
    this.name = 'BaseResolverError'
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

/**
 * Read `owner(node)` for `name` on the Base L2 registry. Returns `null` when
 * the registry definitively reports no owner (zero address). RPC / network
 * failures propagate so callers can surface them instead of silently treating
 * a transport error as "unowned".
 */
export async function getBaseRegistryOwner(
  client: PublicClient,
  name: string,
): Promise<`0x${string}` | null> {
  const node = namehash(normalize(name))
  const address = (await client.readContract({
    address: BASE_REGISTRY,
    abi: baseRegistryAbi,
    functionName: 'owner',
    args: [node],
  })) as `0x${string}`
  if (!address || address === '0x0000000000000000000000000000000000000000') return null
  return address
}

/**
 * Read the resolver address for `name` from the Base L2 registry. Throws a
 * `BaseResolverError` distinguishing the two failure modes:
 *   - `code: 'unconfigured'` — registry returned the zero address.
 *   - `code: 'rpc-error'`    — the read itself failed (rate limit, network,
 *                              decode). The original error is attached as
 *                              `cause`.
 */
export async function getBaseResolverAddress(
  client: PublicClient,
  name: string,
): Promise<`0x${string}`> {
  const node = namehash(normalize(name))
  let address: `0x${string}`
  try {
    address = (await client.readContract({
      address: BASE_REGISTRY,
      abi: baseRegistryAbi,
      functionName: 'resolver',
      args: [node],
    })) as `0x${string}`
  } catch (err) {
    throw new BaseResolverError(
      `Failed to read resolver from Base registry for ${name}: ${err instanceof Error ? err.message : String(err)}`,
      'rpc-error',
      err,
    )
  }
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    throw new BaseResolverError(`No resolver set on Base registry for ${name}`, 'unconfigured')
  }
  return address
}

let cachedBasePublicClient: PublicClient | null = null

/**
 * Return the supplied Base public client, or lazily create one against the
 * default Base RPC. The lazy default is intended for tests and prototypes;
 * production callers should pass their own client.
 */
export function getOrCreateBasePublicClient(supplied?: PublicClient): PublicClient {
  if (supplied) return supplied
  if (!cachedBasePublicClient) {
    cachedBasePublicClient = createPublicClient({
      chain: base,
      transport: http(),
    }) as unknown as PublicClient
  }
  return cachedBasePublicClient
}

export function pickFirst(
  texts: Record<string, string | null>,
  candidates: string[],
): string | null {
  for (const key of candidates) {
    const value = texts[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

export function normalizeResolverAddress(resolver: unknown): string | null {
  if (!resolver) return null
  if (typeof resolver === 'string') return resolver
  if (typeof resolver === 'object' && resolver !== null && 'address' in resolver) {
    const address = (resolver as { address?: unknown }).address
    return typeof address === 'string' ? address : null
  }
  return null
}

export function buildTextOptions(opts: {
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

export function extractSchemaFields(texts: Record<string, string | null>): GetSchemaResult {
  return {
    schema: pickFirst(texts, ['schema', 'ens.schema', 'record.schema']),
    class: pickFirst(texts, ['class', 'ens.class', 'record.class']),
    version: pickFirst(texts, ['schemaVersion', 'schema-version', 'version', 'record.version']),
    cid: pickFirst(texts, ['schemaCid', 'schema-cid', 'cid', 'record.cid']),
  }
}

declare function setTimeout(callback: () => void, ms: number): unknown
declare function clearTimeout(handle: unknown): void

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timerId: unknown
  const timer = new Promise<null>((resolve) => {
    timerId = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([promise, timer]).finally(() => clearTimeout(timerId)) as Promise<T | null>
}

export async function fetchTextRecords(
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

/**
 * Read `addr(node, coinType)` directly on a resolver contract. Returns the
 * 0x-prefixed bytes value, or `null` when unset.
 */
export async function fetchAddrDirect(
  client: PublicClient,
  resolverAddress: `0x${string}`,
  name: string,
  coinType: number,
): Promise<string | null> {
  const node = namehash(normalize(name))
  try {
    const value = (await client.readContract({
      address: resolverAddress,
      abi: resolverAddrAbi,
      functionName: 'addr',
      args: [node, BigInt(coinType)],
    })) as `0x${string}`
    if (!value || value === '0x' || /^0x0+$/i.test(value)) return null
    return value
  } catch {
    return null
  }
}

/**
 * Resolve the resolver address for a name on the appropriate chain. Returns
 * `null` when no resolver is configured. Auto-detects Basenames and reads
 * their resolver from the Base registry; mainnet names go through ensjs's
 * universal-resolver path.
 */
export async function getResolverForName(
  name: string,
  clients: { mainnetClient: PublicClient; basePublicClient?: PublicClient },
): Promise<`0x${string}` | null> {
  if (isBasename(name)) {
    const baseClient = getOrCreateBasePublicClient(clients.basePublicClient)
    try {
      return await getBaseResolverAddress(baseClient, name)
    } catch {
      return null
    }
  }
  try {
    const resolved =
      await // biome-ignore lint/suspicious/noExplicitAny: ensjs extends PublicClient with getEnsResolver
      (clients.mainnetClient as any).getEnsResolver({ name: normalize(name) })
    const address = normalizeResolverAddress(resolved)
    return address ? (address as `0x${string}`) : null
  } catch {
    return null
  }
}
