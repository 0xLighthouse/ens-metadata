'use client'

import { getPublicClientForName, useWeb3 } from '@/contexts/Web3Provider'
import { evictSession, notifySubmission } from '@/lib/attester-client'
import { diffToWriteMap } from '@/lib/record-diff'
import { useWizardStore } from '@/stores/wizard'
import { fetchSchema, metadataWriter } from '@ensmetadata/sdk'
import { chainForName } from '@ensmetadata/shared/chain-for-name'
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
      const chain = chainForName(ensName)
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

      // When the publish is bootstrapping a fresh name (writing a `schema`
      // URI for the first time), the SDK can't read the schema from chain
      // because it isn't there yet. Fetch it locally and hand it in so
      // setMetadata has something to validate against.
      const newSchemaUri = recordsToWrite.schema
      const schema = newSchemaUri ? await fetchSchema(newSchemaUri) : undefined

      setPhase('writing')
      const writer = metadataWriter({ publicClient })(walletClient)
      // PATCH semantics: `recordsToWrite` is already a diff (added/updated/removed)
      // built from `computeRecordDiff`. Without this, the SDK's default PUT mode
      // re-reads on-chain state and deletes every key not in `desired` — wiping
      // `class`, `schema`, and any other records the user didn't touch.
      const { txHash: hash } = await writer.setMetadata({
        name: ensName,
        desired: recordsToWrite,
        ignoreMissing: true,
        ...(schema ? { schema } : {}),
        ...(chain.ensRegistry ? { registry: chain.ensRegistry } : {}),
      })
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
      if (sessionId) await evictSession(sessionId).catch(() => {})
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
