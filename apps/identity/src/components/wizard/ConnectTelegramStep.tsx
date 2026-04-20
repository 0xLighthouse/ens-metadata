'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useWeb3 } from '@/contexts/Web3Provider'
import { AttesterError, attest, bindPlatform, bindWallet } from '@/lib/attester-client'
import { wizardStyles as s } from './wizardStyles'
import {
  type DraftFullProof,
  type PrivyTelegramAccount,
  TELEGRAM_PLATFORM,
  buildTelegramProofFromPrivy,
} from '@/lib/telegram-proof'
import { getAccessToken, usePrivy, useWallets } from '@privy-io/react-auth'
import { AlertCircle, CheckCircle2, FileSignature, Send, X } from 'lucide-react'
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

export function ConnectTelegramStep({ name, sessionId, nonce, onBack, onSessionExpired, onComplete }: Props) {
  const { user, linkTelegram, unlinkTelegram } = usePrivy()
  const { wallets } = useWallets()
  const { walletClient, publicClient } = useWeb3()
  const [phase, setPhase] = useState<Phase>('idle')
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const telegram = (user?.telegram ?? null) as PrivyTelegramAccount | null

  useEffect(() => {
    if (telegram) setError(null)
  }, [telegram])

  const handleLink = () => {
    setError(null)
    try {
      linkTelegram()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDisconnect = async () => {
    if (!telegram) return
    setDisconnecting(true)
    setError(null)
    try {
      await unlinkTelegram(telegram.telegramUserId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDisconnecting(false)
    }
  }

  const handleCreateAttestation = async () => {
    setError(null)
    try {
      if (!telegram) throw new Error('No Telegram account linked yet.')
      if (!telegram.username) {
        throw new Error(
          'Linked Telegram account has no public @username. Set one in Telegram and re-link to attest.',
        )
      }
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
        platform: TELEGRAM_PLATFORM,
        payload: { privyAccessToken, uid: telegram.telegramUserId, handle: telegram.username },
      })

      setPhase('attesting')
      const result = await attest({ sessionId, name })

      const draft = buildTelegramProofFromPrivy({
        telegram,
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
        <CardTitle>Connect Telegram</CardTitle>
        <CardDescription>
          Link your Telegram account to <span className="font-mono">{name}</span> to generate a
          trustless on-chain attestation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={s.borderedContainer}>
          {!telegram ? (
            <div className={s.unlinkedAccountInner}>
              <p className={s.bodyText}>
                Log in to Telegram and approve access to continue. Your Telegram account must
                have a public @username. Only your username will be made public — no other data
                is stored or shared.
              </p>
              <Button onClick={handleLink} full>
                <Send className={s.iconSm} />
                Link Telegram account
              </Button>
            </div>
          ) : (
            <div className={s.connectedAccountRow}>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className={s.checkIcon} />
                <span className={s.monoSemibold}>
                  {telegram.username ? `@${telegram.username}` : '(no public @username)'}
                </span>
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
            disabled={!telegram || busy}
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
