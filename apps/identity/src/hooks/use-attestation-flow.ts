'use client'

import { useWeb3 } from '@/contexts/Web3Provider'
import type { AttestationProof, UnchangedRecord } from '@/lib/attestation-types'
import { attest, bindPlatform, bindWallet, createSession } from '@/lib/attester-client'
import { type RecordDiff, computeRecordDiff } from '@/lib/record-diff'
import {
  type PrivyTelegramAccount,
  TELEGRAM_PLATFORM,
  buildTelegramProofFromPrivy,
} from '@/lib/telegram-proof'
import {
  type PrivyTwitterAccount,
  TWITTER_PLATFORM,
  buildTwitterProofFromPrivy,
} from '@/lib/twitter-proof'
import { useWizardStore, useWizardStoreApi } from '@/stores/wizard'
import { getAccessToken, usePrivy, useWallets } from '@privy-io/react-auth'
import { useState } from 'react'
import { createSiweMessage } from 'viem/siwe'

export type SignPhase = 'idle' | 'awaiting-siwe' | 'binding' | 'attesting'

interface Args {
  loadedRecords: Record<string, string | null> | null
  requestedAttrs: string[]
  classValue?: string
  schemaUri?: string
  twitter: PrivyTwitterAccount | null
  telegram: PrivyTelegramAccount | null
}

/**
 * Orchestrates the publish-prep flow: mint a fresh session, prompt SIWE, bind
 * the wallet + each linked platform, request attestations, then diff the
 * desired records against what's on chain and commit the result to the store
 * (which flips the wizard to the preview screen).
 */
export function useAttestationFlow({
  loadedRecords,
  requestedAttrs,
  classValue,
  schemaUri,
  twitter,
  telegram,
}: Args) {
  const { publicClient, walletClient } = useWeb3()
  const { wallets } = useWallets()
  const { user } = usePrivy()
  const address = user?.wallet?.address as `0x${string}` | undefined

  const ensName = useWizardStore((s) => s.ensName)
  const storeApi = useWizardStoreApi()

  const [signPhase, setSignPhase] = useState<SignPhase>('idle')
  const [signError, setSignError] = useState<string | null>(null)

  const isSigning = signPhase !== 'idle'
  const hasLinkedAccount = !!twitter || !!telegram

  const createAttestation = async () => {
    if (!address || !walletClient) return
    if (telegram && !telegram.username) {
      setSignError('Your Telegram account has no public @username. Set one and re-link.')
      return
    }
    setSignError(null)

    try {
      let proofsOut: AttestationProof[] = []

      if (hasLinkedAccount) {
        // Fresh session right before attestation. Reusing the ENS-confirm
        // session only invites "session expired" errors if the user sits on
        // the form too long.
        const session = await createSession()
        storeApi
          .getState()
          .confirmEns({ ensName, sessionId: session.sessionId, nonce: session.nonce })

        const issuer = wallets[0]?.address ?? address

        // SIWE binds the signature to this ENS name + every linked handle, so
        // the attester can't swap in a different account behind our back.
        const resources: string[] = [
          `ens:${ensName}`,
          ...(twitter ? [`social:${TWITTER_PLATFORM}:${twitter.username}`] : []),
          ...(telegram?.username ? [`social:${TELEGRAM_PLATFORM}:${telegram.username}`] : []),
        ]

        setSignPhase('awaiting-siwe')
        const message = createSiweMessage({
          address: issuer as `0x${string}`,
          chainId: publicClient?.chain?.id ?? 1,
          domain: window.location.host,
          nonce: session.nonce,
          uri: window.location.origin,
          version: '1',
          statement:
            'Sign this message to confirm your intent to link the resources listed below. This will not make any changes to your ENS profile.',
          resources,
          issuedAt: new Date(),
        })
        const signature = await walletClient.signMessage({
          account: issuer as `0x${string}`,
          message,
        })

        setSignPhase('binding')
        await bindWallet({ sessionId: session.sessionId, message, signature })
        const privyAccessToken = (await getAccessToken().catch(() => null)) ?? undefined
        await Promise.all([
          twitter
            ? bindPlatform({
                sessionId: session.sessionId,
                platform: TWITTER_PLATFORM,
                payload: {
                  privyAccessToken,
                  uid: twitter.subject,
                  handle: twitter.username,
                },
              })
            : null,
          telegram?.username
            ? bindPlatform({
                sessionId: session.sessionId,
                platform: TELEGRAM_PLATFORM,
                payload: {
                  privyAccessToken,
                  uid: telegram.telegramUserId,
                  handle: telegram.username,
                },
              })
            : null,
        ])

        setSignPhase('attesting')
        const result = await attest({ sessionId: session.sessionId, name: ensName })

        proofsOut = result.attestations.map((entry) => {
          if (entry.platform === TWITTER_PLATFORM && twitter) {
            return {
              draft: buildTwitterProofFromPrivy({
                twitter,
                issuerAddress: issuer as `0x${string}`,
                ensName,
              }),
              attester: entry.attester,
              records: entry.records,
            }
          }
          if (entry.platform === TELEGRAM_PLATFORM && telegram) {
            return {
              draft: buildTelegramProofFromPrivy({
                telegram,
                issuerAddress: issuer as `0x${string}`,
                ensName,
              }),
              attester: entry.attester,
              records: entry.records,
            }
          }
          throw new Error(`Unexpected attestation platform: ${entry.platform}`)
        })
      }

      // Attr diff (including class/schema) powers the preview screen and the
      // eventual on-chain writes.
      const attrsValues = storeApi.getState().attrsValues
      const desired: Record<string, string> = { ...attrsValues }
      if (classValue) desired.class = classValue
      if (schemaUri) desired.schema = schemaUri
      const diff: RecordDiff = computeRecordDiff(loadedRecords ?? {}, desired)

      // Attrs whose on-chain value already matches the submission — shown in
      // the preview's clean view for a complete post-publish picture.
      const changedKeys = new Set<string>([
        ...diff.added.map((a) => a.key),
        ...diff.updated.map((u) => u.key),
        ...diff.removed.map((r) => r.key),
      ])
      const unchanged: UnchangedRecord[] = []
      for (const key of requestedAttrs) {
        if (changedKeys.has(key)) continue
        const existing = loadedRecords?.[key]
        if (typeof existing === 'string' && existing.length > 0) {
          unchanged.push({ key, value: existing })
        }
      }

      setSignPhase('idle')
      storeApi.getState().commitAttestation(proofsOut, diff, unchanged)
    } catch (err) {
      setSignError(err instanceof Error ? err.message : String(err))
      setSignPhase('idle')
    }
  }

  return {
    signPhase,
    signError,
    isSigning,
    createAttestation,
  }
}
