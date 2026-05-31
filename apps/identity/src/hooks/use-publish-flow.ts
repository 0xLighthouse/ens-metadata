'use client'

import { getPublicClientForName, useWeb3 } from '@/contexts/Web3Provider'
import { evictSession, notifySubmission } from '@/lib/attester-client'
import { diffToWriteMap } from '@/lib/record-diff'
import { useWizardStore } from '@/stores/wizard'
import { MetadataValidationFailedError, fetchSchema, metadataWriter } from '@ensmetadata/sdk'
import { chainFromName } from '@ensmetadata/shared/chain-from-name'
import { useState } from 'react'

export type PublishPhase = 'idle' | 'writing' | 'confirming' | 'done' | 'error'

/**
 * Drives the on-chain publish: write the batched records, wait for
 * confirmations, evict the attester session. The returned state machine is
 * the single source of truth for the preview screen's render branches.
 *
 * Auto-routes to the right chain for `ensName` (e.g. `*.base.eth` → Base):
 * switches the wallet to the target chain, rebuilds the WalletClient against
 * the new chain, and waits for confirmations on the same chain the tx landed
 * on.
 */
export function usePublishFlow(intentId: string) {
  const { isInitialized, getWalletClientForChain } = useWeb3()
  const ensName = useWizardStore((s) => s.ensName)
  const sessionId = useWizardStore((s) => s.sessionId)
  const recordDiff = useWizardStore((s) => s.recordDiff)
  const proofs = useWizardStore((s) => s.proofs)

  const [phase, setPhase] = useState<PublishPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Only changes gate the Publish button — unchanged records are display-only.
  const hasAnything =
    recordDiff.added.length + recordDiff.updated.length + recordDiff.removed.length > 0

  const busy = phase === 'writing' || phase === 'confirming'

  const runPublish = async () => {
    if (!isInitialized) {
      setError('Wallet not ready.')
      setPhase('error')
      return
    }
    if (!hasAnything) {
      setError('Nothing to publish — no proof or attribute changes.')
      setPhase('error')
      return
    }
    setError(null)

    try {
      const recordsToWrite = diffToWriteMap(recordDiff)
      const chain = chainFromName(ensName)
      const publicClient = getPublicClientForName(ensName)

      // Switch the wallet to the target chain and build a WalletClient
      // bound to it. Privy's switchChain reconfigures the underlying
      // EIP-1193 provider; the stored mainnet-bound walletClient would
      // still report mainnet as its `chain`, which the SDK uses for
      // simulation.
      const walletClient = await getWalletClientForChain(chain.id)
      if (!walletClient) {
        setError('Wallet not ready.')
        setPhase('error')
        return
      }

      // Proof records (platform handles + attestation envelopes) are added
      // by us after verifying the user's social accounts — they shouldn't
      // be subject to schema validation. Split them out, validate only user
      // records, then merge them back before broadcasting.
      const proofKeys = new Set<string>()
      for (const proof of proofs) {
        proofKeys.add(proof.draft.claim.p)
        proofKeys.add(proof.records.handle.key)
        proofKeys.add(proof.records.uid.key)
      }
      const userRecords: Record<string, string> = {}
      const proofRecords: Record<string, string> = {}
      for (const [key, value] of Object.entries(recordsToWrite)) {
        if (proofKeys.has(key)) {
          proofRecords[key] = value
        } else {
          userRecords[key] = value
        }
      }

      // When the publish is bootstrapping a fresh name (writing a `schema`
      // URI for the first time), the SDK can't read the schema from chain
      // because it isn't there yet. Fetch it locally and hand it in so
      // prepareSetMetadata has something to validate against.
      const newSchemaUri = userRecords.schema
      const schema = newSchemaUri ? await fetchSchema(newSchemaUri) : undefined

      setPhase('writing')
      const writer = metadataWriter({ publicClient })(walletClient)

      // Prepare validates user records against the schema. PATCH semantics
      // (ignoreMissing) so the SDK doesn't delete keys we didn't touch.
      const prepared = await writer.prepareSetMetadata({
        name: ensName,
        desired: userRecords,
        ignoreMissing: true,
        ...(schema ? { schema } : {}),
        ...(chain.ensRegistry ? { registry: chain.ensRegistry } : {}),
      })

      // Throw if user records fail validation.
      const v = prepared.changePreview.validation
      if (v && !v.success) throw new MetadataValidationFailedError(v.errors)

      // Merge proof records into the prepared changes (already diffed in
      // the attestation step — unchanged values were filtered out).
      for (const [key, value] of Object.entries(proofRecords)) {
        prepared.changePreview.changes[key] = value
      }
      // Bypass the SDK's internal re-check since we validated above.
      prepared.changePreview.validation = null

      const { txHash: hash } = await writer.setPreparedMetadata(prepared)
      setTxHash(hash)

      // Notify the worker as soon as the tx is broadcast; the webhook receiver
      // is responsible for waiting for confirmations and re-reading on-chain
      // for the actual record values. Awaited (not parallel with the wait
      // below) so the session validation lands before we evict the session.
      // Errors are non-fatal — the on-chain publish is the source of truth.
      if (sessionId) {
        try {
          await notifySubmission(intentId, {
            sessionId,
            ensName,
            txHash: hash,
            from: walletClient.account?.address,
            chainId: chain.id,
          })
        } catch (err) {
          console.warn('notifySubmission failed', err)
        }
      }

      setPhase('confirming')
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 })
      if (sessionId) {
        // Best-effort cleanup; don't fail the publish, but don't hide failures either.
        await evictSession(sessionId).catch((err) =>
          console.warn('[publish] session eviction failed:', err),
        )
      }
      setPhase('done')
    } catch (err) {
      setError(friendlyError(err))
      setPhase('error')
    }
  }

  return {
    phase,
    error,
    txHash,
    busy,
    hasAnything,
    runPublish,
  }
}

/** Map viem/ethers wallet-rejection noise to a single user-facing message. */
function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()
  if (
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('rejected the request')
  ) {
    return 'Transaction cancelled, please try again.'
  }
  return raw
}
