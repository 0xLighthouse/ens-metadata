import { http, type PublicClient, createPublicClient, namehash } from 'viem'
import { base } from 'viem/chains'
import { normalize } from 'viem/ens'

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
