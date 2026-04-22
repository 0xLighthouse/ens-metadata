// Thin helpers around @ensmetadata/sdk for ENS reads/writes used by the
// proofs wizard. The actual proof write goes through metadataWriter's
// setMetadata({ name, records: { 'social-proofs[com.x]': hex } }) directly — no
// dedicated setProof helper in the SDK.

import { getOwner } from '@ensdomains/ensjs/public'
import { getNamesForAddress } from '@ensdomains/ensjs/subgraph'
import type { Address } from 'viem'
// biome-ignore lint/suspicious/noExplicitAny: ensjs-extended PublicClient
type EnsPublicClient = any

export async function resolveOwner(client: EnsPublicClient, name: string) {
  const result = await getOwner(client, { name })
  return result?.owner ?? null
}

/**
 * Returns every ENS name (including subnames) the address owns or wraps,
 * sorted alphabetically. Silently returns an empty list if the subgraph is
 * unreachable — callers should treat that as "no autocomplete available"
 * rather than an error state.
 */
export async function getOwnedNames(client: EnsPublicClient, address: Address): Promise<string[]> {
  try {
    const result = await getNamesForAddress(client, { address, pageSize: 1000 })
    const names = result
      .map((r: { name?: string | null }) => r.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
    return Array.from(new Set(names)).sort()
  } catch {
    return []
  }
}
