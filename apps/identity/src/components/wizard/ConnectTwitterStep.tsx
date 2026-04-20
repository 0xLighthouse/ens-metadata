'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useWeb3 } from '@/contexts/Web3Provider'
import { AttesterError, attest, bindPlatform, bindWallet } from '@/lib/attester-client'
import {
  type DraftFullProof,
  type PrivyTwitterAccount,
  TWITTER_PLATFORM,
  buildTwitterProofFromPrivy,
} from '@/lib/twitter-proof'
import { wizardStyles as s } from './wizardStyles'
import { getAccessToken, usePrivy, useWallets } from '@privy-io/react-auth'
import { AlertCircle, CheckCircle2, FileSignature, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createSiweMessage } from 'viem/siwe'

interface Props {
  name: string
  sessionId: string
  nonce: string
  onBack: () => void
  onSessionExpired: () => void
  onComplete: (draft: DraftFullProof, claimHex: string) => void
}

type Phase = 'idle' | 'awaiting-siwe' | 'binding' | 'attesting'

export function ConnectTwitterStep({ name, sessionId, nonce, onBack, onSessionExpired, onComplete }: Props) {
  const { user, linkTwitter, unlinkTwitter } = usePrivy()
  const { wallets } = useWallets()
  const { walletClient, publicClient } = useWeb3()
  const [phase, setPhase] = useState<Phase>('idle')
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const twitter = (user?.twitter ?? null) as PrivyTwitterAccount | null

  useEffect(() => {
    if (twitter) setError(null)
  }, [twitter])

  const handleLink = () => {
    setError(null)
    try {
      linkTwitter()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDisconnect = async () => {
    if (!twitter) return
    setDisconnecting(true)
    setError(null)
    try {
      await unlinkTwitter(twitter.subject)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDisconnecting(false)
    }
  }

  const handleCreateAttestation = async () => {
    setError(null)
    try {
      if (!twitter) throw new Error('No X account linked yet.')
      const issuer = wallets[0]?.address
      if (!issuer) throw new Error('No wallet connected. Go back and reconnect.')
      if (!walletClient) throw new Error('Wallet client not ready.')

      setPhase('awaiting-siwe')
      const message = createSiweMessage({
        address: issuer as `0x${string}`,
        chainId: publicClient?.chain?.id ?? 1,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: '1',
        statement: 'Sign in to the ENS Metadata Manager to update profile information for your ENS name.',
        issuedAt: new Date(),
      })
      const signature = await walletClient.signMessage({
        account: issuer as `0x${string}`,
        message,
      })

      setPhase('binding')
      await bindWallet({ sessionId, message, signature })
      const privyAccessToken = (await getAccessToken().catch(() => null)) ?? undefined
      await bindPlatform({
        sessionId,
        platform: TWITTER_PLATFORM,
        payload: { privyAccessToken, uid: twitter.subject, handle: twitter.username },
      })

      setPhase('attesting')
      const result = await attest({ sessionId, name })

      const draft = buildTwitterProofFromPrivy({
        twitter,
        issuerAddress: issuer as `0x${string}`,
        ensName: name,
      })
      onComplete(draft, result.attestations[0].claimHex)
    } catch (err) {
      if (err instanceof AttesterError && err.status === 404) {
        onSessionExpired()
        return
      }
      setError(err instanceof Error ? err.message : String(err))
      setPhase('idle')
    }
  }

  const busy = phase !== 'idle'

  const continueLabel = (() => {
    switch (phase) {
      case 'awaiting-siwe': return 'Waiting for signature…'
      case 'binding': return 'Linking account…'
      case 'attesting': return 'Generating attestation…'
      default: return 'Create attestation'
    }
  })()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect X</CardTitle>
        <CardDescription>
          Link your X account to <span className="font-mono">{name}</span> to generate a
          trustless on-chain attestation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={s.borderedContainer}>
          {!twitter ? (
            <div className={s.unlinkedAccountInner}>
              <p className={s.bodyText}>
                Log in to X and approve access to continue. Only your X handle will be made
                public — no other data is stored or shared.
              </p>
              <Button onClick={handleLink} full>
                Link X account
              </Button>
            </div>
          ) : (
            <div className={s.connectedAccountRow}>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className={s.checkIcon} />
                <span className={s.monoSemibold}>@{twitter.username}</span>
                <span className={s.connectedLabel}>connected</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                isLoading={disconnecting}
                disabled={busy}
              >
                {!disconnecting && <X className="h-3.5 w-3.5 mr-1" />}
                Disconnect
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className={s.errorBox}>
            <AlertCircle className={s.errorIcon} />
            <span>{error}</span>
          </div>
        )}

        <div className={s.buttonRow}>
          <Button variant="outline" onClick={onBack} disabled={busy} full>
            Back
          </Button>
          <Button
            onClick={handleCreateAttestation}
            full
            disabled={!twitter || busy}
            isLoading={busy}
          >
            {phase === 'awaiting-siwe' ? (
              <>
                <FileSignature className={s.iconSm} />
                {continueLabel}
              </>
            ) : (
              continueLabel
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
