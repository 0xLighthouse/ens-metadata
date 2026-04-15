// TODO: Phase 1, deliverable 4 — thin wrapper around @ensmetadata/sdk's
// setMetadata for writing a single proof.twitter text record.
// See /tasks/link-app-spec.md "ENS write" decision: do NOT add a setProof
// helper in the SDK. Call setMetadata({ name, records: { 'proof.twitter': hex } })
// directly.

import { getOwner } from '@ensdomains/ensjs/public'
// biome-ignore lint/suspicious/noExplicitAny: ensjs-extended PublicClient
type EnsPublicClient = any

export async function resolveOwner(client: EnsPublicClient, name: string) {
  const result = await getOwner(client, { name })
  return result?.owner ?? null
}
