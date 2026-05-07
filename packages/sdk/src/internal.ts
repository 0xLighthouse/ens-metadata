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
 * Read the resolver address for `name` from the Base L2 registry. Throws
 * when the registry returns the zero address (name unconfigured on L2).
 */
export async function getBaseResolverAddress(
  client: PublicClient,
  name: string,
): Promise<`0x${string}`> {
  const node = namehash(normalize(name))
  const address = (await client.readContract({
    address: BASE_REGISTRY,
    abi: baseRegistryAbi,
    functionName: 'resolver',
    args: [node],
  })) as `0x${string}`
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    throw new Error(`No resolver set on Base registry for ${name}`)
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
