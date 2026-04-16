'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { bindPlatform } from '@/lib/attester-client'
import {
  type DraftFullProof,
  type PrivyTwitterAccount,
  TWITTER_PLATFORM,
  buildTwitterProofFromPrivy,
} from '@/lib/twitter-proof'
import { getAccessToken, usePrivy, useWallets } from '@privy-io/react-auth'
import { AlertCircle, CheckCircle2, Twitter } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Props {
  name: string
  sessionId: string
  onBack: () => void
  onComplete: (draft: DraftFullProof) => void
}

export function ConnectTwitterStep({ name, sessionId, onBack, onComplete }: Props) {
  const { user, linkTwitter } = usePrivy()
  const { wallets } = useWallets()
  const [error, setError] = useState<string | null>(null)
  const [binding, setBinding] = useState(false)

  // Privy's `user.twitter` is populated once the OAuth round-trip completes.
  // If the user has a previously-linked Twitter account, it's already there
  // on mount and we short-circuit straight to the "linked" state.
  const twitter = (user?.twitter ?? null) as PrivyTwitterAccount | null

  // Clear any stale error once Privy reports a linked account.
  useEffect(() => {
    if (twitter) setError(null)
  }, [twitter])

  const start = () => {
    setError(null)
    try {
      linkTwitter()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleContinue = async () => {
    setError(null)
    setBinding(true)
    try {
      if (!twitter) {
        throw new Error('No Twitter account linked yet.')
      }
      const issuer = wallets[0]?.address
      if (!issuer) {
        throw new Error('No wallet connected. Go back and reconnect.')
      }
      // Send both the Privy access token (for production) and the
      // dev-passthrough fields (uid/handle from the linked account). The
      // worker's twitter validator picks based on whether Privy creds are
      // configured — in dev it falls back to the passthrough fields.
      const privyAccessToken = (await getAccessToken().catch(() => null)) ?? undefined
      await bindPlatform({
        sessionId,
        platform: TWITTER_PLATFORM,
        payload: {
          privyAccessToken,
          uid: twitter.subject,
          handle: twitter.username,
        },
      })

      const draft = buildTwitterProofFromPrivy({
        twitter,
        issuerAddress: issuer as `0x${string}`,
        ensName: name,
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
        <CardTitle>Connect Twitter</CardTitle>
        <CardDescription>
          Link a Twitter account to <span className="font-mono">{name}</span>. Privy runs the OAuth
          flow in a popup; we read the linked account and bind it to your ENS name.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!twitter && (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 text-sm text-neutral-600 dark:text-neutral-400">
            Clicking below opens Privy's Twitter OAuth flow. Log in to Twitter, approve the app, and
            Privy returns the linked account here.
          </div>
        )}

        {twitter && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <div className="flex flex-col">
                <span className="font-mono font-semibold">@{twitter.username}</span>
                <span className="text-xs text-green-700/80 dark:text-green-400/80">
                  Twitter account linked via Privy
                </span>
              </div>
            </div>
            <dl className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500 dark:text-neutral-400">Stable user id</dt>
                <dd className="font-mono truncate">{twitter.subject}</dd>
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
          {!twitter && (
            <Button onClick={start} full>
              <Twitter className="h-4 w-4 mr-2" />
              Link Twitter
            </Button>
          )}
          {twitter && (
            <Button onClick={handleContinue} full isLoading={binding}>
              {binding ? 'Binding to session…' : 'Continue'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
