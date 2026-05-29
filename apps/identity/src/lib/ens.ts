// Thin helpers around @ensmetadata/sdk for ENS reads/writes used by the
// proofs wizard. The actual proof write goes through metadataWriter's
// setMetadata({ name, desired: { 'attestations[com.x][0x…]': hex, ... } })
// directly — no dedicated setProof helper in the SDK.

import { getPublicClientForName } from '@/contexts/Web3Provider'
import { getOwner } from '@ensdomains/ensjs/public'
import { chainFromName } from '@ensmetadata/shared/chain-from-name'
import { GraphQLClient, gql } from 'graphql-request'
import { type Address, type PublicClient, isAddress, namehash } from 'viem'
// biome-ignore lint/suspicious/noExplicitAny: ensjs-extended PublicClient
type EnsPublicClient = any

const ENSNODE_URL = process.env.NEXT_PUBLIC_ENSNODE_URL ?? 'https://api.alpha.ensnode.io/subgraph'
const ensNodeClient = new GraphQLClient(ENSNODE_URL)

const QUERY_NAMES_FOR_ADDRESS = gql`
  query NamesForAddress($address: String!) {
    domains(where: { or: [{ owner: $address }, { wrappedOwnerId: $address }] }) {
      name
    }
  }
`

const L2_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000'

/**
 * Resolve the address that manages `name`'s records. Routes to the chain
 * the name lives on: ensjs's `getOwner` for mainnet (which transparently
 * handles registry / registrar / NameWrapper), or a direct `owner(node)`
 * call on the L2 registry for chains like Base.
 *
 * `mainnetClient` is used only for mainnet names; L2 names build their own
 * client off the chain registry.
 */
export async function resolveOwner(
  mainnetClient: EnsPublicClient,
  name: string,
): Promise<Address | null> {
  const chain = chainFromName(name)
  if (chain.ensRegistry) {
    const client = getPublicClientForName(name) as PublicClient
    const owner = (await client.readContract({
      address: chain.ensRegistry,
      abi: L2_REGISTRY_ABI,
      functionName: 'owner',
      args: [namehash(name)],
    })) as Address
    if (!owner || owner === ZERO_ADDRESS) return null
    return owner
  }

  const result = await getOwner(mainnetClient, { name })
  const owner = result?.owner
  return owner && isAddress(owner) ? (owner as Address) : null
}

/**
 * Returns every ENS name (including subnames) the address owns or wraps,
 * sorted alphabetically. Silently returns an empty list if ensnode is
 * unreachable — callers should treat that as "no autocomplete available"
 * rather than an error state. Capped at 100 results (subgraph default).
 */
export async function getOwnedNames(_client: EnsPublicClient, address: Address): Promise<string[]> {
  try {
    const resp = await ensNodeClient.request<{ domains: { name: string | null }[] }>(
      QUERY_NAMES_FOR_ADDRESS,
      // Subgraph stores addresses as lowercase hex strings.
      { address: address.toLowerCase() },
    )
    const names = resp.domains
      .map((d) => d.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
    return Array.from(new Set(names)).sort()
  } catch {
    return []
  }
}
