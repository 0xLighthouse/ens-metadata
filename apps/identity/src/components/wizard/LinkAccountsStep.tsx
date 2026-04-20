'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useWeb3 } from '@/contexts/Web3Provider'
import { AttesterError, attest, bindPlatform, bindWallet } from '@/lib/attester-client'
import {
  TELEGRAM_PLATFORM,
  type DraftFullProof as DraftTelegramProof,
  type PrivyTelegramAccount,
  buildTelegramProofFromPrivy,
} from '@/lib/telegram-proof'
import {
  TWITTER_PLATFORM,
  type DraftFullProof as DraftTwitterProof,
  type PrivyTwitterAccount,
  buildTwitterProofFromPrivy,
} from '@/lib/twitter-proof'
import { getAccessToken, usePrivy, useWallets } from '@privy-io/react-auth'
import { AlertCircle, CheckCircle2, FileSignature, Send, X } from 'lucide-react'
import { useState } from 'react'
import { createSiweMessage } from 'viem/siwe'

type Platform = 'com.x' | 'org.telegram'
type AnyDraftFullProof = DraftTwitterProof | DraftTelegramProof
type Phase = 'idle' | 'awaiting-siwe' | 'binding' | 'attesting'

export interface AttestationProof {
  draft: AnyDraftFullProof
  claimHex: string
}

interface Props {
  name: string
  sessionId: string
  nonce: string
  requiredPlatforms: Platform[]
  optionalPlatforms: Platform[]
  platformsRequested: boolean
  initialPlatform: Platform
  onPlatformChange: (p: Platform) => void
  onBack: () => void
  onSessionExpired: () => void
  onComplete: (proofs: AttestationProof[]) => void
}

export function LinkAccountsStep({
  name,
  sessionId,
  nonce,
  requiredPlatforms,
  optionalPlatforms,
  platformsRequested,
  initialPlatform,
  onPlatformChange,
  onBack,
  onSessionExpired,
  onComplete,
}: Props) {
  const specifiedPlatforms: Platform[] = [...requiredPlatforms, ...optionalPlatforms]
  const visiblePlatforms: Platform[] =
    specifiedPlatforms.length > 0 ? specifiedPlatforms : ['com.x', 'org.telegram']
  const [activePlatform, setActivePlatform] = useState<Platform>(initialPlatform)
  const { user, linkTwitter, linkTelegram, unlinkTwitter, unlinkTelegram } = usePrivy()
  const { wallets } = useWallets()
  const { walletClient, publicClient } = useWeb3()
  const [phase, setPhase] = useState<Phase>('idle')
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const twitter = (user?.twitter ?? null) as PrivyTwitterAccount | null
  const telegram = (user?.telegram ?? null) as PrivyTelegramAccount | null
  const anyLinked = !!(twitter || telegram)
  const busy = phase !== 'idle'

  const allRequiredLinked = requiredPlatforms.every(
    (p) => (p === 'com.x' && !!twitter) || (p === 'org.telegram' && !!telegram),
  )
  const canSkip = platformsRequested && requiredPlatforms.length === 0 && !anyLinked

  const switchTab = (p: Platform) => {
    setActivePlatform(p)
    onPlatformChange(p)
  }

  const handleLinkTwitter = () => {
    setError(null)
    try { linkTwitter() } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  const handleLinkTelegram = () => {
    setError(null)
    try { linkTelegram() } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  const handleDisconnect = async (platform: Platform) => {
    setDisconnecting(true)
    setError(null)
    try {
      if (platform === 'com.x' && twitter) {
        await unlinkTwitter(twitter.subject)
      } else if (platform === 'org.telegram' && telegram) {
        await unlinkTelegram(telegram.telegramUserId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDisconnecting(false)
    }
  }

  const handleCreateAttestation = async () => {
    setError(null)

    if (!twitter && !telegram) return

    // Validate Telegram has a username before signing
    if (telegram && !telegram.username) {
      setError('Linked Telegram account has no public @username. Set one in Telegram and re-link.')
      return
    }

    try {
      const issuer = wallets[0]?.address
      if (!issuer) throw new Error('No wallet connected. Go back and reconnect.')
      if (!walletClient) throw new Error('Wallet client not ready.')

      // Build SIWE resources: ENS name + one entry per linked platform.
      // The attester validates all three so the signature commits to exactly
      // this name and these handles — no substitution is possible.
      const resources: string[] = [
        `ens:${name}`,
        ...(twitter ? [`social:${TWITTER_PLATFORM}:${twitter.username}`] : []),
        ...(telegram?.username ? [`social:${TELEGRAM_PLATFORM}:${telegram.username}`] : []),
      ]

      setPhase('awaiting-siwe')
      const message = createSiweMessage({
        address: issuer as `0x${string}`,
        chainId: publicClient?.chain?.id ?? 1,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: '1',
        statement:
          'Sign this message to confirm your intent to link the resources listed below.',
        resources,
        issuedAt: new Date(),
      })
      const signature = await walletClient.signMessage({
        account: issuer as `0x${string}`,
        message,
      })

      setPhase('binding')
      await bindWallet({ sessionId, message, signature })
      const privyAccessToken = (await getAccessToken().catch(() => null)) ?? undefined

      // Bind each linked platform in parallel
      await Promise.all([
        twitter
          ? bindPlatform({
              sessionId,
              platform: TWITTER_PLATFORM,
              payload: { privyAccessToken, uid: twitter.subject, handle: twitter.username },
            })
          : null,
        telegram?.username
          ? bindPlatform({
              sessionId,
              platform: TELEGRAM_PLATFORM,
              payload: { privyAccessToken, uid: telegram.telegramUserId, handle: telegram.username },
            })
          : null,
      ])

      setPhase('attesting')
      const result = await attest({ sessionId, name })

      // Map each attestation entry back to its typed draft proof
      const proofs: AttestationProof[] = result.attestations.map((entry) => {
        if (entry.platform === TWITTER_PLATFORM && twitter) {
          return {
            draft: buildTwitterProofFromPrivy({
              twitter,
              issuerAddress: issuer as `0x${string}`,
              ensName: name,
            }),
            claimHex: entry.claimHex,
          }
        }
        if (entry.platform === TELEGRAM_PLATFORM && telegram) {
          return {
            draft: buildTelegramProofFromPrivy({
              telegram,
              issuerAddress: issuer as `0x${string}`,
              ensName: name,
            }),
            claimHex: entry.claimHex,
          }
        }
        throw new Error(`Unexpected attestation platform: ${entry.platform}`)
      })

      onComplete(proofs)
    } catch (err) {
      if (err instanceof AttesterError && err.status === 404) {
        onSessionExpired()
        return
      }
      setError(err instanceof Error ? err.message : String(err))
      setPhase('idle')
    }
  }

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
        <CardTitle>Link your social media accounts.</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          {/* Tabs — only rendered when multiple platforms are available */}
          {visiblePlatforms.length > 1 && (
            <div className="flex border-b border-neutral-200 dark:border-neutral-700">
              {visiblePlatforms.includes('com.x') && (
                <button
                  type="button"
                  onClick={() => switchTab('com.x')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activePlatform === 'com.x'
                      ? 'border-neutral-900 dark:border-neutral-50 text-neutral-900 dark:text-neutral-50'
                      : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                  }`}
                >
                  X
                  {twitter
                    ? <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                    : requiredPlatforms.includes('com.x')
                      ? <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                      : null}
                </button>
              )}
              {visiblePlatforms.includes('org.telegram') && (
                <button
                  type="button"
                  onClick={() => switchTab('org.telegram')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activePlatform === 'org.telegram'
                      ? 'border-neutral-900 dark:border-neutral-50 text-neutral-900 dark:text-neutral-50'
                      : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                  }`}
                >
                  <Send className="h-4 w-4" />
                  Telegram
                  {telegram
                    ? <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                    : requiredPlatforms.includes('org.telegram')
                      ? <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                      : null}
                </button>
              )}
            </div>
          )}

          {/* X content */}
          {activePlatform === 'com.x' && (
            !twitter ? (
              <div className="p-4 space-y-4">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Log in to X and approve access. Only your X handle will be made public. No other data will be stored or shared.
                </p>
                <Button onClick={handleLinkTwitter} full>
                  Link X account
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="font-mono font-semibold">@{twitter.username}</span>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">connected</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDisconnect('com.x')}
                  isLoading={disconnecting}
                  disabled={busy}
                >
                  {!disconnecting && <X className="h-3.5 w-3.5 mr-1" />}
                  Disconnect
                </Button>
              </div>
            )
          )}

          {/* Telegram content */}
          {activePlatform === 'org.telegram' && (
            !telegram ? (
              <div className="p-4 space-y-4">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Log in to Telegram and approve access. Your account must have a public
                  @username. Only your username will be made public. No other data will be stored or
                  shared.
                </p>
                <Button onClick={handleLinkTelegram} full>
                  <Send className="h-4 w-4 mr-2" />
                  Link Telegram account
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="font-mono font-semibold">
                    {telegram.username ? `@${telegram.username}` : '(no public @username)'}
                  </span>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">connected</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDisconnect('org.telegram')}
                  isLoading={disconnecting}
                  disabled={busy}
                >
                  {!disconnecting && <X className="h-3.5 w-3.5 mr-1" />}
                  Disconnect
                </Button>
              </div>
            )
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={busy} full>
            Back
          </Button>
          <Button
            onClick={canSkip ? () => onComplete([]) : handleCreateAttestation}
            full
            disabled={!canSkip && (!anyLinked || !allRequiredLinked || busy)}
            isLoading={!canSkip && busy}
            className={canSkip ? 'bg-neutral-400 dark:bg-neutral-500 text-neutral-50 hover:bg-neutral-400/90 dark:hover:bg-neutral-500/90' : undefined}
          >
            {canSkip ? 'Skip attestation' : phase === 'awaiting-siwe' ? (
              <>
                <FileSignature className="h-4 w-4 mr-2" />
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
