// Thin helpers around @ensmetadata/sdk for ENS reads/writes used by the
// proofs wizard. The actual proof write goes through metadataWriter's
// setMetadata({ name, records: { 'attestations[com.x][0x…]': hex, ... } })
// directly — no dedicated setProof helper in the SDK.

import { getOwner } from '@ensdomains/ensjs/public'
import { GraphQLClient, gql } from 'graphql-request'
import type { Address } from 'viem'
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

export async function resolveOwner(client: EnsPublicClient, name: string) {
  const result = await getOwner(client, { name })
  return result?.owner ?? null
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
