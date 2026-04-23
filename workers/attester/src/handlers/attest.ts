import {
  encodeEnvelope,
  handleAttestationRecordKey,
  signHandleClaim,
  signUidClaim,
  uidAttestationRecordKey,
} from '@ensmetadata/sdk'
import { bytesToHex, isAddress } from 'viem'
import { attesterWallet } from '../attester'
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
 * Response: { attestations: [{ platform, handle, attester, records }] }
 * where `records` contains pre-built text-record key/value pairs ready to
 * write to the resolver:
 *   - `handleKey`, `handleHex` — `attestations[<platform>][<attester>]`
 *   - `uidKey`, `uidHex` — `uid[<platform>][<attester>]`
 *   - `platform`, `handle` — the plain `<platform>` text record
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
    const attester = wallet.account?.address
    if (!attester) throw new Error('attester wallet has no account')
    const addr = session.wallet!

    const attestations = await Promise.all(
      session.platforms.map(async (binding) => {
        const [handleEnvelope, uidEnvelope] = await Promise.all([
          signHandleClaim(
            { platform: binding.platform, handle: binding.handle, name, addr },
            wallet,
          ),
          signUidClaim({ platform: binding.platform, uid: binding.uid, name, addr }, wallet),
        ])
        return {
          platform: binding.platform,
          handle: binding.handle,
          attester,
          records: {
            handleKey: handleAttestationRecordKey(binding.platform, attester),
            handleHex: bytesToHex(encodeEnvelope(handleEnvelope)),
            uidKey: uidAttestationRecordKey(binding.platform, attester),
            uidHex: bytesToHex(encodeEnvelope(uidEnvelope)),
          },
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
