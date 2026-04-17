import type { Env } from '../env'
import type { Platform, PlatformValidationResult } from './index'
import { getAuthenticatedPrivyUser } from './privy'

/**
 * Telegram validator backed by the Privy REST API — mirrors twitter.ts.
 *
 * The worker verifies the Privy access token, fetches the user, then
 * finds a linked account with `type: 'telegram'`. Privy's stable id is
 * `telegram_user_id`; the display handle is `username` (nullable —
 * Telegram users without a public @username can't be attested because
 * there'd be no stable handle to display).
 *
 * Missing PRIVY_APP_ID / PRIVY_APP_SECRET is a hard error — silent dev
 * passthrough would let misconfigured prod trust client-supplied identities.
 */

interface TelegramPayload {
  /** Privy access token issued to the authenticated user. */
  privyAccessToken?: string
}

async function validate(env: Env, payload: unknown): Promise<PlatformValidationResult> {
  const p = (payload ?? {}) as TelegramPayload

  if (!p.privyAccessToken) {
    throw new Error('telegram: missing privyAccessToken')
  }

  const user = await getAuthenticatedPrivyUser(env, p.privyAccessToken)
  const telegram = user.linked_accounts?.find((a) => a.type === 'telegram')
  if (!telegram) {
    throw new Error('telegram: privy user has no linked telegram account')
  }
  if (!telegram.telegram_user_id || !telegram.username) {
    // Telegram users without a public @username can't be attested — there's
    // no stable handle to display. Refuse rather than silently storing the
    // numeric id as the handle.
    throw new Error('telegram: privy linked account missing telegram_user_id or username')
  }
  return { uid: telegram.telegram_user_id, handle: telegram.username }
}

export const telegramPlatform: Platform = {
  id: 'org.telegram',
  validate,
}
