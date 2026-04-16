import { jsonResponse } from '../cors'
import type { Env } from '../env'

/**
 * POST /api/session — start a new attestation session.
 *
 * Mints a fresh sessionId + nonce, creates the Durable Object instance,
 * returns both. The client uses the nonce when constructing the SIWE
 * message it asks the wallet to sign.
 */
export async function handleSession(env: Env, request: Request): Promise<Response> {
  const sessionId = crypto.randomUUID()
  const nonce = crypto.randomUUID().replace(/-/g, '')

  const ttl = Number(env.SESSION_TTL_SECONDS)
  if (!Number.isFinite(ttl) || ttl <= 0) {
    return jsonResponse(
      env,
      request,
      { error: 'SESSION_TTL_SECONDS misconfigured' },
      { status: 500 },
    )
  }

  const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId))
  const data = await stub.init(nonce, ttl)

  return jsonResponse(env, request, {
    sessionId,
    nonce: data.nonce,
    expiresAt: data.expiresAt,
  })
}
