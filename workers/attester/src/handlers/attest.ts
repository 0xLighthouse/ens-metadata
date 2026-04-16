import { CLAIM_VERSION, encodeEnvelope, signClaim } from '@ensmetadata/sdk'
import { bytesToHex, isAddress } from 'viem'
import { attesterWallet } from '../attester'
import { blindUid } from '../blind'
import { jsonResponse } from '../cors'
import type { Env } from '../env'

/**
 * POST /api/attest — issue a signed claim for a session.
 *
 * Pre-conditions: the session must already have BOTH a SIWE-bound wallet
 * (from /session/wallet) and a validated platform account (from
 * /session/platform/[platform]). If either is missing, the attester refuses.
 *
 * Body: { sessionId, name }
 *   - name: ENS name being attested
 *
 * The response is the signed v1 envelope ready to write directly to the
 * `social-proofs[<platform>]` ENS text record.
 */
export async function handleAttest(env: Env, request: Request): Promise<Response> {
  let body: {
    sessionId?: string
    name?: string
  }
  try {
    body = await request.json()
  } catch {
    return jsonResponse(env, request, { error: 'invalid JSON' }, { status: 400 })
  }

  const { sessionId, name } = body
  if (!sessionId || !name) {
    return jsonResponse(env, request, { error: 'sessionId and name are required' }, { status: 400 })
  }

  const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId))
  const session = await stub.get()
  if (!session) {
    return jsonResponse(env, request, { error: 'session not found or expired' }, { status: 404 })
  }
  if (!session.wallet) {
    return jsonResponse(env, request, { error: 'session has no wallet bound' }, { status: 409 })
  }
  if (!session.platform) {
    return jsonResponse(
      env,
      request,
      { error: 'session has no platform account bound' },
      { status: 409 },
    )
  }
  if (!isAddress(session.wallet)) {
    return jsonResponse(
      env,
      request,
      { error: 'session wallet is not a valid address' },
      { status: 500 },
    )
  }

  try {
    const wallet = attesterWallet(env)
    const blinded = await blindUid(session.platform.platform, session.platform.uid, wallet)
    const envelope = await signClaim(
      {
        platform: session.platform.platform,
        handle: session.platform.handle,
        uid: blinded,
        name,
        addr: session.wallet,
      },
      wallet,
    )

    const envelopeBytes = encodeEnvelope(envelope)
    const claimHex = bytesToHex(envelopeBytes)

    return jsonResponse(env, request, {
      claimHex,
      platform: session.platform.platform,
      handle: session.platform.handle,
      attester: envelope.attester,
    })
  } catch (err) {
    return jsonResponse(
      env,
      request,
      { error: err instanceof Error ? err.message : 'signing failed' },
      { status: 500 },
    )
  }
}
