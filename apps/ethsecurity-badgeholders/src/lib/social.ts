import { isValidTelegramHandle, isValidXHandle } from '@/lib/validation'
import {
  DEFAULT_ATTESTER_ENS,
  handleAttestationRecordKey,
  uidAttestationRecordKey,
} from '@ensmetadata/sdk'

/** ENS text-record key and attester platform id for X. */
export const X_PLATFORM = 'com.x'
/** ENS text-record key and attester platform id for Telegram. */
export const TELEGRAM_PLATFORM = 'org.telegram'
/** The pre-rebrand X key some names still carry; read as a fallback, cleared on remove. */
export const LEGACY_TWITTER_KEY = 'com.twitter'

export type SocialPlatform = typeof X_PLATFORM | typeof TELEGRAM_PLATFORM

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [X_PLATFORM, TELEGRAM_PLATFORM]

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  [X_PLATFORM]: 'X',
  [TELEGRAM_PLATFORM]: 'Telegram',
}

/** Privy's `user.twitter` shape; `subject` is the stable id the attester binds to. */
export interface PrivyTwitterAccount {
  subject: string
  username: string | null
  name: string | null
  profilePictureUrl: string | null
}

/** Privy's `user.telegram` shape; `telegramUserId` is the stable id. */
export interface PrivyTelegramAccount {
  telegramUserId: string
  username: string | null
  firstName: string | null
  lastName: string | null
}

/** The two attestation record keys for `platform` from the attester this app trusts. */
export const attestationKeys = (platform: SocialPlatform) => ({
  handle: handleAttestationRecordKey(platform, DEFAULT_ATTESTER_ENS),
  uid: uidAttestationRecordKey(platform, DEFAULT_ATTESTER_ENS),
})

/** Whether `handle` is well-formed for `platform`; mirrors what the read path accepts. */
export const isValidHandle = (platform: SocialPlatform, handle: string): boolean =>
  platform === X_PLATFORM ? isValidXHandle(handle) : isValidTelegramHandle(handle)

/** A Privy-linked account reduced to what the attester needs. */
export type LinkedAccount = { handle: string; uid: string }

/**
 * The linked account for `platform`, or `null` when none is linked. Throws with a user-facing
 * message when the account exists but cannot be attested: Telegram accounts without a public
 * `@username`, or a handle the read path would drop as malformed.
 */
export function linkedAccountFor(
  platform: SocialPlatform,
  accounts: { twitter: PrivyTwitterAccount | null; telegram: PrivyTelegramAccount | null },
): LinkedAccount | null {
  const account = platform === X_PLATFORM ? accounts.twitter : accounts.telegram
  if (!account) return null
  const handle = account.username
  if (!handle) {
    throw new Error(
      platform === X_PLATFORM
        ? 'Your X account has no username.'
        : 'Your Telegram account has no public @username. Set one in Telegram and connect again.',
    )
  }
  if (!isValidHandle(platform, handle)) {
    throw new Error(`@${handle} is not a valid ${PLATFORM_LABELS[platform]} handle.`)
  }
  const uid = 'subject' in account ? account.subject : account.telegramUserId
  return { handle, uid }
}
