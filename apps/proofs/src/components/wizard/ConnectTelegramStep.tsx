'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useWeb3 } from '@/contexts/Web3Provider'
import { bindPlatform } from '@/lib/attester-client'
import {
  type DraftFullProof,
  type PrivyTelegramAccount,
  TELEGRAM_PLATFORM,
  buildTelegramProofFromPrivy,
} from '@/lib/telegram-proof'
import { getAccessToken, usePrivy, useWallets } from '@privy-io/react-auth'
import { AlertCircle, CheckCircle2, Send } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Props {
  name: string
  sessionId: string
  onBack: () => void
  onComplete: (draft: DraftFullProof) => void
}

export function ConnectTelegramStep({ name, sessionId, onBack, onComplete }: Props) {
  const { publicClient } = useWeb3()
  const { user, linkTelegram } = usePrivy()
  const { wallets } = useWallets()
  const [error, setError] = useState<string | null>(null)
  const [binding, setBinding] = useState(false)

  // Privy's `user.telegram` is populated once the link flow completes.
  // If the user has a previously-linked Telegram account, it's already
  // there on mount and we short-circuit straight to the "linked" state.
  const telegram = (user?.telegram ?? null) as PrivyTelegramAccount | null

  // Clear any stale error once Privy reports a linked account.
  useEffect(() => {
    if (telegram) setError(null)
  }, [telegram])

  const start = () => {
    setError(null)
    try {
      linkTelegram()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleContinue = async () => {
    setError(null)
    setBinding(true)
    try {
      if (!telegram) {
        throw new Error('No Telegram account linked yet.')
      }
      if (!telegram.username) {
        throw new Error(
          'Linked Telegram account has no public @username. Set one in Telegram and re-link to attest.',
        )
      }
      const issuer = wallets[0]?.address
      if (!issuer) {
        throw new Error('No wallet connected. Go back and reconnect.')
      }
      const chainId = publicClient?.chain?.id ?? 1

      // Send both the Privy access token (for production) and the
      // dev-passthrough fields (uid/handle from the linked account). The
      // worker's telegram validator picks based on whether Privy creds are
      // configured — in dev it falls back to the passthrough fields.
      const privyAccessToken = (await getAccessToken().catch(() => null)) ?? undefined
      await bindPlatform({
        sessionId,
        platform: TELEGRAM_PLATFORM,
        payload: {
          privyAccessToken,
          uid: telegram.telegramUserId,
          handle: telegram.username,
        },
      })

      const draft = buildTelegramProofFromPrivy({
        telegram,
        issuerAddress: issuer as `0x${string}`,
        ensName: name,
        chainId,
      })
      onComplete(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBinding(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect Telegram</CardTitle>
        <CardDescription>
          Link a Telegram account to <span className="font-mono">{name}</span>. Privy runs the
          Telegram login flow; we read the linked account and bind it to your ENS name.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!telegram && (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 text-sm text-neutral-600 dark:text-neutral-400">
            Clicking below opens Privy's Telegram login. Approve the app and Privy returns the
            linked account here. Your Telegram account must have a public @username.
          </div>
        )}

        {telegram && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <div className="flex flex-col">
                <span className="font-mono font-semibold">
                  {telegram.username ? `@${telegram.username}` : '(no public @username)'}
                </span>
                <span className="text-xs text-green-700/80 dark:text-green-400/80">
                  Telegram account linked via Privy
                </span>
              </div>
            </div>
            <dl className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500 dark:text-neutral-400">Stable user id</dt>
                <dd className="font-mono truncate">{telegram.telegramUserId}</dd>
              </div>
            </dl>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} full>
            Back
          </Button>
          {!telegram && (
            <Button onClick={start} full>
              <Send className="h-4 w-4 mr-2" />
              Link Telegram
            </Button>
          )}
          {telegram && (
            <Button onClick={handleContinue} full isLoading={binding}>
              {binding ? 'Binding to session…' : 'Continue'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
