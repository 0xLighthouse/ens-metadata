import { getOwner } from '@ensdomains/ensjs/public'
import type { Address, Hex, PublicClient } from 'viem'
import { hexToBytes, isAddress } from 'viem'
import { getEnsText } from 'viem/actions'
import { normalize } from 'viem/ens'
import { decodeEnvelope, decodePayload, verifyClaim } from './proof'
import type { VerifyProofOptions, VerifyResult } from './proof-types'

/**
 * Configuration for the proof verifier extension. The trusted-attester list
 * is required at extension construction time; per-call overrides can be
 * added later if needed.
 */
export interface ProofVerifierConfig {
  trustedAttesters: readonly Address[]
  /** Max age in seconds. If `now - issuedAt > maxAge`, the claim is stale. */
  maxAge?: number
}

const TEXT_KEY_SUFFIX = '.proof'

/**
 * Read the ENS text record `<platform>.proof`, decode the v1 envelope,
 * and verify its attester signature + ownership against the current ENS
 * owner.
 */
async function verifyProofImpl(
  client: PublicClient,
  config: ProofVerifierConfig,
  opts: VerifyProofOptions,
): Promise<VerifyResult> {
  const name = normalize(opts.name)
  const textKey = `${opts.platform}${TEXT_KEY_SUFFIX}`

  const [rawTextResult, ownerResult] = await Promise.allSettled([
    getEnsText(client, { name, key: textKey }),
    getOwner(client as never, { name }),
  ])

  const rawText =
    rawTextResult.status === 'fulfilled' && typeof rawTextResult.value === 'string'
      ? (rawTextResult.value as string)
      : null
  if (!rawText || rawText.length === 0) {
    return { valid: false, reason: 'missing' }
  }

  let ownerAddress: Address | null = null
  if (ownerResult.status === 'fulfilled' && ownerResult.value?.owner) {
    const candidate = ownerResult.value.owner
    if (isAddress(candidate)) {
      ownerAddress = candidate as Address
    }
  }
  if (!ownerAddress) {
    return { valid: false, reason: 'wrong-owner' }
  }

  try {
    const bytes = hexToBytes(rawText as Hex)
    const envelope = decodeEnvelope(bytes)
    const inner = decodePayload(envelope.payload)

    const result = await verifyClaim(envelope, {
      trustedAttesters: config.trustedAttesters,
      expectedOwner: ownerAddress,
      maxAge: config.maxAge,
    })
    if (!result.valid) {
      return {
        valid: false,
        reason: result.reason,
        handle: inner.handle,
        uid: inner.uid,
        issuedAt: inner.issuedAt,
        attester: envelope.attester,
      }
    }

    return {
      valid: true,
      handle: inner.handle,
      uid: inner.uid,
      issuedAt: inner.issuedAt,
      attester: envelope.attester,
    }
  } catch {
    return { valid: false, reason: 'decode-error' }
  }
}

export function proofVerifier(config: ProofVerifierConfig) {
  return (client: PublicClient) => ({
    verifyProof: (opts: VerifyProofOptions) => verifyProofImpl(client, config, opts),
  })
}

export function verifyProof(
  client: PublicClient,
  config: ProofVerifierConfig,
  opts: VerifyProofOptions,
): Promise<VerifyResult> {
  return verifyProofImpl(client, config, opts)
}
