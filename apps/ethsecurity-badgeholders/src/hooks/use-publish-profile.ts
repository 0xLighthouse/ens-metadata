'use client'

import { refreshBadgeholderProfile } from '@/app/actions/refresh-profile'
import { useWeb3 } from '@/components/web3-provider'
import { type AttestPhase, type PendingLink, createAttestations } from '@/lib/attestation-flow'
import { type AttestationEntry, evictSession } from '@/lib/attester-client'
import { clearEditDraft } from '@/lib/edit-draft'
import { resolveManager } from '@/lib/ens-owner'
import { PERSON_SCHEMA } from '@/lib/person-schema'
import {
  type ProfileForm,
  type RecordState,
  type SocialDrafts,
  buildDesiredRecords,
  existingForWriter,
  splitWriteMap,
} from '@/lib/profile-records'
import { SOCIAL_PLATFORMS } from '@/lib/social'
import type { BadgeholderRow } from '@/lib/types'
import { shortenAddress } from '@/lib/utils'
import { MetadataValidationFailedError, metadataWriter } from '@ensmetadata/sdk'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

export type PublishPhase =
  | 'idle'
  | 'preflight'
  | 'switching'
  | AttestPhase
  | 'writing'
  | 'confirming'
  | 'refreshing'
  | 'done'
  | 'error'

/** What the Save button reads while each phase runs. */
export const PHASE_LABELS: Record<PublishPhase, string> = {
  idle: 'Save changes',
  preflight: 'Checking ownership…',
  switching: 'Switching network…',
  siwe: 'Waiting for signature…',
  binding: 'Linking accounts…',
  attesting: 'Generating attestation…',
  writing: 'Waiting for transaction…',
  confirming: 'Confirming…',
  refreshing: 'Refreshing…',
  done: 'Published',
  error: 'Save changes',
}

const BUSY_PHASES: ReadonlySet<PublishPhase> = new Set([
  'preflight',
  'switching',
  'siwe',
  'binding',
  'attesting',
  'writing',
  'confirming',
  'refreshing',
])

class NotManagerError extends Error {}

/**
 * The save pipeline, after `apps/identity/src/hooks/use-publish-flow.ts`: check the wallet
 * manages the name, attest any newly connected handles, build the record delta, validate the
 * Person fields through the SDK, merge in the records the schema does not declare, broadcast
 * one `setRecords`, wait for two confirmations, then refresh the page data.
 */
export function usePublishProfile(row: BadgeholderRow) {
  const { publicClient, address, getMainnetWalletClient } = useWeb3()
  const router = useRouter()
  const [phase, setPhase] = useState<PublishPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)

  const busy = BUSY_PHASES.has(phase)

  const reset = useCallback(() => {
    setPhase('idle')
    setError(null)
    setTxHash(null)
  }, [])

  const publish = useCallback(
    async (input: { existing: RecordState; form: ProfileForm; socials: SocialDrafts }) => {
      const name = row.ensName
      if (!name) return
      if (!address || address.toLowerCase() !== row.address) {
        setError(`Connect ${shortenAddress(row.address)} to publish.`)
        setPhase('error')
        return
      }
      setError(null)
      setTxHash(null)
      let sessionId: string | null = null

      try {
        setPhase('preflight')
        try {
          const manager = await resolveManager(publicClient, name)
          if (manager && manager.toLowerCase() !== row.address) {
            throw new NotManagerError(
              `${name} is managed by ${shortenAddress(manager)}, not by the connected wallet.`,
            )
          }
        } catch (err) {
          if (err instanceof NotManagerError) throw err
          // The transaction itself is the real check; a flaky RPC should not block it.
          console.warn('ENS ownership pre-check failed', err)
        }

        setPhase('switching')
        const walletClient = await getMainnetWalletClient()

        const pending: PendingLink[] = SOCIAL_PLATFORMS.flatMap((platform) => {
          const draft = input.socials[platform]
          return draft.kind === 'link' ? [{ platform, handle: draft.handle, uid: draft.uid }] : []
        })
        let attestations: AttestationEntry[] = []
        if (pending.length > 0) {
          const result = await createAttestations({
            name,
            walletClient,
            issuer: address,
            pending,
            onPhase: setPhase,
          })
          sessionId = result.sessionId
          attestations = result.entries
        }

        const desired = buildDesiredRecords({
          form: input.form,
          socials: input.socials,
          attestations,
        })
        const { schemaRecords, socialRecords, hasChanges } = splitWriteMap(input.existing, desired)
        if (!hasChanges) throw new Error('Nothing to publish: every record already matches.')

        setPhase('writing')
        const writer = metadataWriter({ publicClient })(walletClient)
        // The SDK validates the projected state against the Person schema, which does not
        // declare the social keys. Validate the schema records alone, then merge the social
        // records into the same transaction.
        const prepared = await writer.prepareSetMetadata({
          name,
          desired: schemaRecords,
          existing: existingForWriter(input.existing),
          schema: PERSON_SCHEMA,
          ignoreMissing: true,
        })
        const validation = prepared.changePreview.validation
        if (validation && !validation.success) {
          throw new MetadataValidationFailedError(validation.errors)
        }
        for (const [key, value] of Object.entries(socialRecords)) {
          prepared.changePreview.changes[key] = value
        }
        prepared.changePreview.validation = null

        const { txHash: hash } = await writer.setPreparedMetadata(prepared)
        setTxHash(hash)

        setPhase('confirming')
        const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 })
        if (receipt.status !== 'success') throw new Error('The transaction reverted.')
        if (sessionId) {
          evictSession(sessionId).catch((err) =>
            console.warn('Attester session eviction failed', err),
          )
        }

        setPhase('refreshing')
        await refreshBadgeholderProfile(row.address).catch((err) =>
          console.warn('Profile cache refresh failed', err),
        )
        clearEditDraft(row.address)
        router.refresh()
        setPhase('done')
      } catch (err) {
        setError(friendlyError(err))
        setPhase('error')
      }
    },
    [row.ensName, row.address, address, publicClient, getMainnetWalletClient, router],
  )

  return { phase, error, txHash, busy, publish, reset }
}

/** One user-facing line per failure, folding wallet-rejection noise into a single message. */
function friendlyError(err: unknown): string {
  if (err instanceof MetadataValidationFailedError) {
    return `Invalid records: ${err.errors.map((e) => `${e.key}: ${e.message}`).join('; ')}`
  }
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()
  if (
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('rejected the request')
  ) {
    return 'Signature cancelled. Try again when you are ready.'
  }
  return raw
}
