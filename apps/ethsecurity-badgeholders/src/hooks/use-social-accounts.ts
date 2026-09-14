'use client'

import {
  PLATFORM_LABELS,
  type PrivyTelegramAccount,
  type PrivyTwitterAccount,
  type SocialPlatform,
  X_PLATFORM,
} from '@/lib/social'
import { useLinkAccount, usePrivy } from '@privy-io/react-auth'
import { useCallback, useMemo, useState } from 'react'

/**
 * The user's Privy-linked X and Telegram accounts plus a `link` action per platform, after
 * `apps/identity/src/hooks/use-social-accounts.ts`. Privy surfaces linked accounts both as
 * `user.twitter` / `user.telegram` and in `user.linkedAccounts`; the two can lag each other
 * right after an OAuth round-trip, so either counts.
 *
 * Linking X (and usually Telegram) leaves the page for the provider's login and comes back
 * with a fresh document, so callers must park any state they want to keep before calling
 * `link`.
 */
export function useSocialAccounts() {
  const { user } = usePrivy()
  const [linkError, setLinkError] = useState<string | null>(null)

  const { linkTwitter, linkTelegram } = useLinkAccount({
    onError: (error, { linkMethod }) => {
      const label =
        linkMethod === 'twitter' ? 'X' : linkMethod === 'telegram' ? 'Telegram' : linkMethod
      setLinkError(`Could not connect ${label} (${error}).`)
    },
  })

  const twitter = useMemo<PrivyTwitterAccount | null>(() => {
    if (user?.twitter) return user.twitter
    const entry = user?.linkedAccounts?.find((account) => account.type === 'twitter_oauth')
    return entry?.type === 'twitter_oauth' ? entry : null
  }, [user])

  const telegram = useMemo<PrivyTelegramAccount | null>(() => {
    if (user?.telegram) return user.telegram
    const entry = user?.linkedAccounts?.find((account) => account.type === 'telegram')
    return entry?.type === 'telegram' ? entry : null
  }, [user])

  const link = useCallback(
    (platform: SocialPlatform) => {
      setLinkError(null)
      try {
        if (platform === X_PLATFORM) linkTwitter()
        else linkTelegram()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setLinkError(`Could not connect ${PLATFORM_LABELS[platform]}: ${message}`)
      }
    },
    [linkTwitter, linkTelegram],
  )

  return { twitter, telegram, link, linkError, clearLinkError: () => setLinkError(null) }
}
