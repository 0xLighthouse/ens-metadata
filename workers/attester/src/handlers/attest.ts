import { CLAIM_VERSION, signClaim } from '@ensmetadata/sdk'
import { isAddress } from 'viem'
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
 * Body: { sessionId, name, chainId, expSeconds, prf? }
 *   - name:       ENS name being attested
 *   - chainId:    EVM chain id for the on-chain claim
 *   - expSeconds: claim expiry, unix seconds
 *   - prf:        IPFS CID of the full proof document. The frontend pins
 *                 the document and supplies the CID before asking us to
 *                 sign — this commits to a specific document that can be
 *                 re-validated on the deep path. Empty string is allowed
 *                 but the deep path will reject it as decode-error.
 *
 * The response is the signed `Claim` ready to encode and write to the
 * proof.<platform> text record.
 */
export async function handleAttest(env: Env, request: Request): Promise<Response> {
  let body: {
    sessionId?: string
    name?: string
    chainId?: number
    expSeconds?: number
    prf?: string
  }
  try {
    body = await request.json()
  } catch {
    return jsonResponse(env, request, { error: 'invalid JSON' }, { status: 400 })
  }

  const { sessionId, name, chainId, expSeconds, prf } = body
  if (!sessionId || !name || typeof chainId !== 'number' || typeof expSeconds !== 'number') {
    return jsonResponse(
      env,
      request,
      { error: 'sessionId, name, chainId, and expSeconds are required' },
      { status: 400 },
    )
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
    return jsonResponse(env, request, { error: 'session wallet is not a valid address' }, { status: 500 })
  }

  try {
    // Blind the raw uid before it goes into the signed claim. The on-chain
    // text record will contain the HMAC digest, not the raw platform id.
    // Agents verify by calling POST /api/blind with the uid they know
    // from chat context and comparing the result to claim.uid.
    const blinded = await blindUid(env, session.platform.platform, session.platform.uid)

    const wallet = attesterWallet(env)
    const signed = await signClaim(
      {
        v: CLAIM_VERSION,
        p: session.platform.platform,
        h: session.platform.handle,
        uid: blinded,
        exp: expSeconds,
        prf: prf ?? '',
        name,
        chainId,
        addr: session.wallet,
      },
      wallet,
    )
    return jsonResponse(env, request, { claim: signed })
  } catch (err) {
    return jsonResponse(
      env,
      request,
      { error: err instanceof Error ? err.message : 'signing failed' },
      { status: 500 },
    )
  }
}
