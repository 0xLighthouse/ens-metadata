// Thin helpers around @ensmetadata/sdk for ENS reads/writes used by the
// proofs wizard. The actual proof write goes through metadataWriter's
// setMetadata({ name, records: { 'social-proofs[com.x]': hex } }) directly — no
// dedicated setProof helper in the SDK.

import { getOwner } from '@ensdomains/ensjs/public'
// biome-ignore lint/suspicious/noExplicitAny: ensjs-extended PublicClient
type EnsPublicClient = any

export async function resolveOwner(client: EnsPublicClient, name: string) {
  const result = await getOwner(client, { name })
  return result?.owner ?? null
}
