import { getOwner } from '@ensdomains/ensjs/public'
import type { Address, Hex, PublicClient } from 'viem'
import { hexToBytes, isAddress } from 'viem'
import { getEnsText } from 'viem/actions'
import { normalize } from 'viem/ens'
import { decodeEnvelope, decodePayload, verifyClaim } from './attestation'
import type { VerifyAttestationOptions, VerifyResult } from './attestation-types'

/**
 * Configuration for the attestation verifier extension. The trusted-attester
 * list is required at extension construction time; per-call overrides can be
 * added later if needed.
 */
export interface AttestationVerifierConfig {
  trustedAttesters: readonly Address[]
  /** Max age in seconds. If `now - issuedAt > maxAge`, the claim is stale. */
  maxAge?: number
}

const TEXT_KEY_PREFIX = 'social-proofs'

/**
 * Read the ENS text record `social-proofs[<platform>]`, decode the v1
 * envelope, and verify its attester signature + ownership against the
 * current ENS owner.
 */
async function verifyAttestationImpl(
  client: PublicClient,
  config: AttestationVerifierConfig,
  opts: VerifyAttestationOptions,
): Promise<VerifyResult> {
  const name = normalize(opts.name)
  const textKey = `${TEXT_KEY_PREFIX}[${opts.platform}]`

  const [rawTextResult, ownerResult] = await Promise.allSettled([
    getEnsText(client, { name, key: textKey }),
    getOwner(client as never, { name }),
  ])

  const rawText =
    rawTextResult.status === 'fulfilled' && typeof rawTextResult.value === 'string'
      ? rawTextResult.value
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

export function attestationVerifier(config: AttestationVerifierConfig) {
  return (client: PublicClient) => ({
    verifyAttestation: (opts: VerifyAttestationOptions) =>
      verifyAttestationImpl(client, config, opts),
  })
}

export function verifyAttestation(
  client: PublicClient,
  config: AttestationVerifierConfig,
  opts: VerifyAttestationOptions,
): Promise<VerifyResult> {
  return verifyAttestationImpl(client, config, opts)
}
