import { encodeEnvelope, signClaim } from '@ensmetadata/sdk'
import { bytesToHex, isAddress } from 'viem'
import { attesterWallet } from '../attester'
import { blindUid } from '../blind'
import { jsonResponse } from '../cors'
import type { Env } from '../env'

/**
 * POST /api/attest — issue signed claims for all platform accounts bound to
 * a session.
 *
 * Pre-conditions: the session must already have BOTH a SIWE-bound wallet
 * (from /session/wallet) and at least one validated platform account (from
 * /session/platform/[platform]). If either is missing, the attester refuses.
 *
 * Body: { sessionId, name }
 *   - name: ENS name being attested
 *
 * Response: { attestations: [{ claimHex, platform, handle, attester }] }
 * One entry per bound platform. Each claimHex is the signed v1 envelope
 * ready to write directly to the `social-proofs[<platform>]` ENS text record.
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
  if (!session.platforms.length) {
    return jsonResponse(
      env,
      request,
      { error: 'session has no platform account bound' },
      { status: 409 },
    )
  }
  // When the client used the multi-platform signing flow, verify the ENS name
  // matches what was in the signed message. Skipped for old-style sessions.
  if (session.siweResources.length > 0 && !session.siweResources.includes(`ens:${name}`)) {
    return jsonResponse(
      env,
      request,
      { error: 'ENS name does not match signed message' },
      { status: 403 },
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
    const wallet = await attesterWallet(env)

    const attestations = await Promise.all(
      session.platforms.map(async (binding) => {
        const blinded = await blindUid(binding.platform, binding.uid, wallet)
        const envelope = await signClaim(
          {
            platform: binding.platform,
            handle: binding.handle,
            uid: blinded,
            name,
            addr: session.wallet!,
          },
          wallet,
        )
        const claimHex = bytesToHex(encodeEnvelope(envelope))
        return {
          claimHex,
          platform: binding.platform,
          handle: binding.handle,
          attester: envelope.attester,
        }
      }),
    )

    return jsonResponse(env, request, { attestations })
  } catch (err) {
    return jsonResponse(
      env,
      request,
      { error: err instanceof Error ? err.message : 'signing failed' },
      { status: 500 },
    )
  }
}
