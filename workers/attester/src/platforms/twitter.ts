import type { Env } from '../env'
import type { Platform, PlatformValidationResult } from './index'

/**
 * Twitter validator backed by the Privy REST API.
 *
 * No SDK — Workers run in a V8 isolate without Node built-ins, and Privy's
 * official `@privy-io/server-auth` is Node-only. We talk to Privy directly
 * over HTTP, which is two well-defined endpoints:
 *
 *   1. Verify the access token. We use the user-from-token endpoint
 *      (`POST /api/v1/users/me`) with `Authorization: Bearer <token>`
 *      and Basic auth (`appId:appSecret`). Privy returns the user object
 *      including linked accounts on success, or 401 if the token is bad.
 *
 *   2. Find the linked Twitter account. Privy returns `linkedAccounts`,
 *      and Twitter entries have `type: 'twitter_oauth'` with `subject`
 *      (the stable JWT `sub` claim — what we want for uid) and `username`.
 *
 * Dev passthrough: when PRIVY_APP_ID/SECRET are unset, we accept a
 * client-supplied { uid, handle } directly and log a warning. This is for
 * testing the worker flow without standing up a Privy app.
 */

interface TwitterPayload {
  /** Privy access token issued to the authenticated user. */
  privyAccessToken?: string
  /** Dev-only fallback when Privy creds are unset. */
  uid?: string
  /** Dev-only fallback when Privy creds are unset. */
  handle?: string
}

interface PrivyLinkedAccount {
  type: string
  subject?: string
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
    throw new Error('twitter: Privy creds not configured')
  }
  // Privy auth combines the user's bearer token with the app's basic creds.
  // The bearer identifies the user; the basic creds authorize the app to
  // read this user's data.
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
    throw new Error(`twitter: Privy returned ${res.status}`)
  }
  return (await res.json()) as PrivyUser
}

async function validate(env: Env, payload: unknown): Promise<PlatformValidationResult> {
  const p = (payload ?? {}) as TwitterPayload

  if (!env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET) {
    if (!p.uid || !p.handle) {
      throw new Error(
        'twitter: dev passthrough requires { uid, handle }; set PRIVY_APP_ID and PRIVY_APP_SECRET for real validation',
      )
    }
    console.warn('[attester] twitter validator is in dev passthrough mode')
    return { uid: p.uid, handle: p.handle }
  }

  if (!p.privyAccessToken) {
    throw new Error('twitter: missing privyAccessToken')
  }

  const user = await callPrivy(env, p.privyAccessToken)
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
