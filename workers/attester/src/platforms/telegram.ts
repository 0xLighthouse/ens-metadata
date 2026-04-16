import type { Env } from '../env'
import type { Platform, PlatformValidationResult } from './index'

/**
 * Telegram validator backed by the Privy REST API — mirrors twitter.ts.
 *
 * The client posts a Privy access token. We hand it to the same
 * /api/v1/users/me endpoint as the Twitter validator and look for a linked
 * account with `type: 'telegram'`. Privy's stable id field is
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

interface PrivyLinkedAccount {
  type: string
  telegram_user_id?: string
  username?: string | null
}

interface PrivyUser {
  id: string
  linked_accounts?: PrivyLinkedAccount[]
}

async function callPrivy(env: Env, accessToken: string): Promise<PrivyUser> {
  const appId = env.PRIVY_APP_ID
  const appSecret = env.PRIVY_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('telegram: Privy creds not configured')
  }
  const basicAuth = btoa(`${appId}:${appSecret}`)
  const res = await fetch('https://auth.privy.io/api/v1/users/me', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'privy-app-id': appId,
      'X-App-Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`telegram: Privy returned ${res.status}`)
  }
  return (await res.json()) as PrivyUser
}

async function validate(env: Env, payload: unknown): Promise<PlatformValidationResult> {
  const p = (payload ?? {}) as TelegramPayload

  if (!env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET) {
    throw new Error('telegram: PRIVY_APP_ID and PRIVY_APP_SECRET must be set')
  }

  if (!p.privyAccessToken) {
    throw new Error('telegram: missing privyAccessToken')
  }

  const user = await callPrivy(env, p.privyAccessToken)
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
