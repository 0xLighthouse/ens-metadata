import { blindUid } from '../blind'
import { jsonResponse } from '../cors'
import type { Env } from '../env'

/**
 * POST /api/blind — compute the blinded uid for a given platform + raw uid.
 *
 * Stateless, no session required. The agent calls this once per user to
 * get the blinded value it needs for comparison against on-chain claims,
 * then caches the result forever (the output is deterministic for a given
 * attester key + platform + uid).
 *
 * Body: { platform, uid }
 *   - platform: reverse-DNS namespace, e.g. "com.x", "org.telegram"
 *   - uid: the raw platform user id the agent knows from chat context
 *
 * Returns: { blindedUid } — 64-char hex string (HMAC-SHA256 digest).
 */
export async function handleBlind(env: Env, request: Request): Promise<Response> {
  let body: { platform?: string; uid?: string }
  try {
    body = await request.json()
  } catch {
    return jsonResponse(env, request, { error: 'invalid JSON' }, { status: 400 })
  }

  const { platform, uid } = body
  if (!platform || !uid) {
    return jsonResponse(
      env,
      request,
      { error: 'platform and uid are required' },
      { status: 400 },
    )
  }

  const blindedUid = await blindUid(env, platform, uid)
  return jsonResponse(env, request, { blindedUid })
}
