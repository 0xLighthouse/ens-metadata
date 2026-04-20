import { jsonResponse } from '../cors'
import type { Env } from '../env'
import { getPlatform } from '../platforms'

/**
 * POST /api/session/platform/[platform] — bind a platform account to a
 * session. The platform validator is dispatched via the URL segment, so
 * adding a new platform is just dropping a module under platforms/ and
 * registering it.
 *
 * Body: { sessionId, payload } where the shape of payload is platform-
 * specific (Privy access token for Twitter, Login Widget HMAC for
 * Telegram, etc.). The validator owns the parsing.
 *
 * When the session has SIWE resources (i.e. the client used the multi-
 * platform signing flow), we verify that the platform handle was included
 * in the signed message. This ties the attestation to the exact accounts
 * the user consented to in their signature.
 */
export async function handlePlatform(
  env: Env,
  request: Request,
  platformId: string,
): Promise<Response> {
  const platform = getPlatform(platformId)
  if (!platform) {
    return jsonResponse(env, request, { error: `unknown platform: ${platformId}` }, { status: 404 })
  }

  let body: { sessionId?: string; payload?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonResponse(env, request, { error: 'invalid JSON' }, { status: 400 })
  }

  const { sessionId, payload } = body
  if (!sessionId) {
    return jsonResponse(env, request, { error: 'sessionId is required' }, { status: 400 })
  }

  const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId))
  const session = await stub.get()
  if (!session) {
    return jsonResponse(env, request, { error: 'session not found or expired' }, { status: 404 })
  }

  let validated
  try {
    validated = await platform.validate(env, payload)
  } catch (err) {
    return jsonResponse(
      env,
      request,
      { error: err instanceof Error ? err.message : 'validation failed' },
      { status: 400 },
    )
  }

  // When the client included resources in the SIWE message, verify the handle
  // is present. Format: "social:{platformId}:{handle}". Skipped for sessions
  // created by older clients that don't include resources.
  if (session.siweResources.length > 0) {
    const expected = `social:${platform.id}:${validated.handle}`
    if (!session.siweResources.includes(expected)) {
      return jsonResponse(
        env,
        request,
        { error: `platform handle not included in signed message` },
        { status: 403 },
      )
    }
  }

  await stub.bindPlatform({
    platform: platform.id,
    uid: validated.uid,
    handle: validated.handle,
    boundAt: Math.floor(Date.now() / 1000),
  })

  return jsonResponse(env, request, {
    ok: true,
    uid: validated.uid,
    handle: validated.handle,
  })
}
