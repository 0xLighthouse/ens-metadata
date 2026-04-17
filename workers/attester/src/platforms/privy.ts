import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Env } from '../env'

/**
 * Privy REST client. Two primitives:
 *
 *   1. verifyPrivyAccessToken — verifies the user-supplied JWT against
 *      Privy's JWKS, enforces iss + aud, returns the recovered userId.
 *      Forgery-resistant — skipping this would let anyone mint a token
 *      with someone else's sub and claim attestations for a user they
 *      don't own.
 *
 *   2. fetchPrivyUser — authenticated app → user lookup. Pairs basic
 *      auth with `privy-app-id` per Privy's REST spec. The access token
 *      is NOT forwarded here; Privy's REST surface identifies requests
 *      by app credentials, not bearer tokens.
 *
 * JWKS caching: `createRemoteJWKSet` caches keys module-scoped with a
 * 10-minute stale window, so the first request per isolate pays one HTTP
 * round-trip and subsequent requests verify locally.
 *
 * NB: token verification runs against `auth.privy.io`, user lookups run
 * against `api.privy.io` — different hosts for different concerns. The
 * `api.privy.io/v1/users/{id}` endpoint is heavily rate-limited per
 * Privy's docs, so identity tokens (which embed the user payload) may be
 * a better long-term path.
 */

const ISSUER = 'privy.io'

export interface PrivyLinkedAccount {
  type: string
  subject?: string
  username?: string | null
  // Telegram populates this separately from `subject`.
  telegram_user_id?: string
  // Optional display fields; not all account types populate them.
  first_name?: string | null
  last_name?: string | null
}

export interface PrivyUser {
  id: string
  linked_accounts?: PrivyLinkedAccount[]
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function jwksFor(appId: string) {
  let jwks = jwksCache.get(appId)
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`),
    )
    jwksCache.set(appId, jwks)
  }
  return jwks
}

/**
 * Verify a Privy access token. Returns the recovered Privy userId
 * (without the `did:privy:` prefix).
 */
export async function verifyPrivyAccessToken(env: Env, accessToken: string): Promise<string> {
  if (!env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET) {
    throw new Error('privy: PRIVY_APP_ID and PRIVY_APP_SECRET must be set')
  }
  const jwks = jwksFor(env.PRIVY_APP_ID)
  const { payload } = await jwtVerify(accessToken, jwks, {
    issuer: ISSUER,
    audience: env.PRIVY_APP_ID,
  })
  const sub = payload.sub
  if (typeof sub !== 'string' || !sub.startsWith('did:privy:')) {
    throw new Error('privy: token sub is not a Privy DID')
  }
  return sub.slice('did:privy:'.length)
}

/**
 * Fetch a user by id using app Basic auth. The access token is NOT sent;
 * Privy authenticates this request by the app credentials alone.
 */
export async function fetchPrivyUser(env: Env, userId: string): Promise<PrivyUser> {
  if (!env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET) {
    throw new Error('privy: PRIVY_APP_ID and PRIVY_APP_SECRET must be set')
  }
  const basicAuth = btoa(`${env.PRIVY_APP_ID}:${env.PRIVY_APP_SECRET}`)
  const res = await fetch(`https://api.privy.io/v1/users/${encodeURIComponent(userId)}`, {
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'privy-app-id': env.PRIVY_APP_ID,
    },
  })
  if (!res.ok) {
    throw new Error(`privy: users/${userId} returned ${res.status}`)
  }
  return (await res.json()) as PrivyUser
}

/**
 * Convenience: verify token → fetch user in one call. Most callers want
 * this path.
 */
export async function getAuthenticatedPrivyUser(
  env: Env,
  accessToken: string,
): Promise<PrivyUser> {
  const userId = await verifyPrivyAccessToken(env, accessToken)
  return fetchPrivyUser(env, userId)
}
