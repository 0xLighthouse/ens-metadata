'use client'

import type { PrivyTelegramAccount } from '@/lib/telegram-proof'
import type { PrivyTwitterAccount } from '@/lib/twitter-proof'
import type { IntentPlatform as Platform } from '@ensmetadata/shared/intent'
import { usePrivy } from '@privy-io/react-auth'
import { useMemo, useState } from 'react'

export type { Platform }

/**
 * Normalizes Privy's linked accounts (which surface via two redundant fields)
 * and exposes link/unlink handlers with their own error + pending state.
 *
 * Privy emits linked accounts both as top-level convenience fields
 * (`user.twitter`, `user.telegram`) and in `user.linkedAccounts`. They should
 * mirror but occasionally lag post-OAuth — accept either.
 */
export function useSocialAccounts() {
  const { user, linkTwitter, linkTelegram, unlinkTwitter, unlinkTelegram } = usePrivy()

  const twitter: PrivyTwitterAccount | null = useMemo(() => {
    if (user?.twitter) return user.twitter as PrivyTwitterAccount
    const entry = user?.linkedAccounts?.find(
      (a) => (a as { type?: string }).type === 'twitter_oauth',
    ) as (PrivyTwitterAccount & { type?: string }) | undefined
    return entry ?? null
  }, [user])

  const telegram: PrivyTelegramAccount | null = useMemo(() => {
    if (user?.telegram) return user.telegram as PrivyTelegramAccount
    const entry = user?.linkedAccounts?.find((a) => (a as { type?: string }).type === 'telegram') as
      | (PrivyTelegramAccount & { type?: string })
      | undefined
    return entry ?? null
  }, [user])

  const [linkError, setLinkError] = useState<string | null>(null)
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<Platform | null>(null)

  const isLinked = (p: Platform) =>
    (p === 'com.x' && !!twitter) || (p === 'org.telegram' && !!telegram)

  const link = (p: Platform) => {
    setLinkError(null)
    try {
      if (p === 'com.x') linkTwitter()
      else linkTelegram()
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err))
    }
  }

  const unlink = async (p: Platform) => {
    setDisconnectingPlatform(p)
    setLinkError(null)
    try {
      if (p === 'com.x' && twitter) await unlinkTwitter(twitter.subject)
      if (p === 'org.telegram' && telegram) await unlinkTelegram(telegram.telegramUserId)
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err))
    } finally {
      setDisconnectingPlatform(null)
    }
  }

  return {
    twitter,
    telegram,
    isLinked,
    link,
    unlink,
    linkError,
    disconnectingPlatform,
    anyLinked: !!twitter || !!telegram,
  }
}
