import { jsonResponse } from '../cors'
import type { Env } from '../env'
import { verifySiwe } from '../siwe'

/**
 * POST /api/session/wallet — bind a wallet to a session via SIWE.
 *
 * Body: { sessionId, message, signature } — the SIWE pair produced by the
 * user's wallet. The message must include the nonce we issued at session
 * creation; otherwise the binding is rejected.
 */
export async function handleWallet(env: Env, request: Request): Promise<Response> {
  let body: { sessionId?: string; message?: string; signature?: string }
  try {
    body = await request.json()
  } catch {
    return jsonResponse(env, request, { error: 'invalid JSON' }, { status: 400 })
  }

  const { sessionId, message, signature } = body
  if (!sessionId || !message || !signature) {
    return jsonResponse(
      env,
      request,
      { error: 'sessionId, message, and signature are required' },
      { status: 400 },
    )
  }

  const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId))
  const session = await stub.get()
  if (!session) {
    return jsonResponse(env, request, { error: 'session not found or expired' }, { status: 404 })
  }

  let verified
  try {
    verified = await verifySiwe(env, {
      message,
      signature: signature as `0x${string}`,
      expectedNonce: session.nonce,
    })
  } catch (err) {
    return jsonResponse(
      env,
      request,
      { error: err instanceof Error ? err.message : 'siwe verification failed' },
      { status: 400 },
    )
  }

  await stub.bindWallet(verified.address, verified.resources)
  return jsonResponse(env, request, { ok: true, wallet: verified.address })
}
