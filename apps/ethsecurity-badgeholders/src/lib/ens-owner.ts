import { getOwner } from '@ensdomains/ensjs/public'
import { type Address, type PublicClient, isAddress } from 'viem'

/**
 * The address that manages `name`'s records on mainnet, or `null` when the name has no owner.
 * ensjs's `getOwner` looks through the registry, the .eth registrar and the NameWrapper, so
 * a wrapped name reports its wrapper owner rather than the wrapper contract.
 */
export async function resolveManager(client: PublicClient, name: string): Promise<Address | null> {
  // biome-ignore lint/suspicious/noExplicitAny: ensjs wants its own extended client type
  const result = await getOwner(client as any, { name })
  const owner = result?.owner
  return owner && isAddress(owner) ? owner : null
}
