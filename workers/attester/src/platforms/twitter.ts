import type { Env } from '../env'
import type { Platform, PlatformValidationResult } from './index'
import { getAuthenticatedPrivyUser } from './privy'

/**
 * Twitter validator backed by the Privy REST API.
 *
 * The worker verifies the user's Privy access token against Privy's JWKS,
 * fetches the Privy user, then looks for a linked account with
 * `type: 'twitter_oauth'`. The twitter account's `subject` (stable JWT
 * `sub` from the Twitter OAuth issuance) is the uid; `username` is the
 * display handle.
 *
 * Missing PRIVY_APP_ID / PRIVY_APP_SECRET is a hard error — silent dev
 * passthrough would let misconfigured prod trust client-supplied identities.
 */

interface TwitterPayload {
  /** Privy access token issued to the authenticated user. */
  privyAccessToken?: string
}

async function validate(env: Env, payload: unknown): Promise<PlatformValidationResult> {
  const p = (payload ?? {}) as TwitterPayload

  if (!p.privyAccessToken) {
    throw new Error('twitter: missing privyAccessToken')
  }

  const user = await getAuthenticatedPrivyUser(env, p.privyAccessToken)
  const twitter = user.linked_accounts?.find((a) => a.type === 'twitter_oauth')
  if (!twitter) {
    throw new Error('twitter: privy user has no linked twitter account')
  }
  if (!twitter.subject || !twitter.username) {
    throw new Error('twitter: privy linked account missing subject or username')
  }
  return { uid: twitter.subject, handle: twitter.username }
}

export const twitterPlatform: Platform = {
  id: 'com.x',
  validate,
}
