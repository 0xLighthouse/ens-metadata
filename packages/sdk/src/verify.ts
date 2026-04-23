import { getOwner } from '@ensdomains/ensjs/public'
import type { Address, Hex, PublicClient } from 'viem'
import { hexToBytes, isAddress } from 'viem'
import { getEnsText } from 'viem/actions'
import { normalize } from 'viem/ens'
import { decodeEnvelope, verifyHandleClaim, verifyUidClaim } from './attestation'
import type {
  Envelope,
  VerifyHandleAttestationOptions,
  VerifyResult,
  VerifyUidAttestationOptions,
} from './attestation-types'

/**
 * Configuration for the attestation verifier extension.
 */
export interface AttestationVerifierConfig {
  /** Max age in seconds. If `now - issuedAt > maxAge`, the claim is stale. */
  maxAge?: number
}

/**
 * Build the parameterized text-record key for a handle attestation:
 * `attestations[<platform>][<0xattester>]`. The attester address is
 * lowercased for record-key canonicalization.
 */
export function handleAttestationRecordKey(platform: string, attester: Address): string {
  return `attestations[${platform}][${attester.toLowerCase()}]`
}

/**
 * Build the parameterized text-record key for a uid attestation:
 * `uid[<platform>][<0xattester>]`.
 */
export function uidAttestationRecordKey(platform: string, attester: Address): string {
  return `uid[${platform}][${attester.toLowerCase()}]`
}

async function readOwner(client: PublicClient, name: string): Promise<Address | null> {
  try {
    const owner = await getOwner(client as never, { name })
    if (owner?.owner && isAddress(owner.owner)) return owner.owner as Address
  } catch {
    // fall through
  }
  return null
}

async function readEnvelopeHex(
  client: PublicClient,
  name: string,
  key: string,
): Promise<Hex | null> {
  const raw = await getEnsText(client, { name, key }).catch(() => null)
  if (!raw || typeof raw !== 'string' || raw.length === 0) return null
  return raw as Hex
}

/**
 * Read `attestations[<platform>][<attester>]` on the ENS name, decode the
 * v2 envelope, and verify the signature against the attester + current
 * owner + the handle text record (`<platform>`).
 */
async function verifyHandleAttestationImpl(
  client: PublicClient,
  config: AttestationVerifierConfig,
  opts: VerifyHandleAttestationOptions,
): Promise<VerifyResult> {
  const name = normalize(opts.name)

  const [envHex, owner, handle] = await Promise.all([
    readEnvelopeHex(client, name, handleAttestationRecordKey(opts.platform, opts.attester)),
    readOwner(client, name),
    getEnsText(client, { name, key: opts.platform }).catch(() => null),
  ])

  if (!envHex) return { valid: false, reason: 'missing' }
  if (!owner) return { valid: false, reason: 'bad-signature' }
  if (!handle || typeof handle !== 'string' || handle.length === 0) {
    return { valid: false, reason: 'missing' }
  }

  let envelope: Envelope
  try {
    envelope = decodeEnvelope(hexToBytes(envHex))
  } catch {
    return { valid: false, reason: 'decode-error' }
  }

  const result = await verifyHandleClaim(envelope, {
    trustedAttester: opts.attester,
    owner,
    name,
    platform: opts.platform,
    handle,
    maxAge: config.maxAge,
  })

  if (!result.valid) {
    return {
      valid: false,
      reason: result.reason,
      handle,
      issuedAt: envelope.issuedAt,
      attester: opts.attester,
    }
  }

  return {
    valid: true,
    handle,
    issuedAt: envelope.issuedAt,
    attester: opts.attester,
  }
}

/**
 * Read `uid[<platform>][<attester>]` on the ENS name, decode the v2
 * envelope, and verify the signature against the attester + current
 * owner + the caller-supplied raw uid.
 */
async function verifyUidAttestationImpl(
  client: PublicClient,
  config: AttestationVerifierConfig,
  opts: VerifyUidAttestationOptions,
): Promise<VerifyResult> {
  const name = normalize(opts.name)

  const [envHex, owner] = await Promise.all([
    readEnvelopeHex(client, name, uidAttestationRecordKey(opts.platform, opts.attester)),
    readOwner(client, name),
  ])

  if (!envHex) return { valid: false, reason: 'missing' }
  if (!owner) return { valid: false, reason: 'bad-signature' }

  let envelope: Envelope
  try {
    envelope = decodeEnvelope(hexToBytes(envHex))
  } catch {
    return { valid: false, reason: 'decode-error' }
  }

  const result = await verifyUidClaim(envelope, {
    trustedAttester: opts.attester,
    owner,
    name,
    platform: opts.platform,
    uid: opts.uid,
    maxAge: config.maxAge,
  })

  if (!result.valid) {
    return {
      valid: false,
      reason: result.reason,
      uid: opts.uid,
      issuedAt: envelope.issuedAt,
      attester: opts.attester,
    }
  }

  return {
    valid: true,
    uid: opts.uid,
    issuedAt: envelope.issuedAt,
    attester: opts.attester,
  }
}

export function attestationVerifier(config: AttestationVerifierConfig = {}) {
  return (client: PublicClient) => ({
    verifyHandleAttestation: (opts: VerifyHandleAttestationOptions) =>
      verifyHandleAttestationImpl(client, config, opts),
    verifyUidAttestation: (opts: VerifyUidAttestationOptions) =>
      verifyUidAttestationImpl(client, config, opts),
  })
}

export function verifyHandleAttestation(
  client: PublicClient,
  config: AttestationVerifierConfig,
  opts: VerifyHandleAttestationOptions,
): Promise<VerifyResult> {
  return verifyHandleAttestationImpl(client, config, opts)
}

export function verifyUidAttestation(
  client: PublicClient,
  config: AttestationVerifierConfig,
  opts: VerifyUidAttestationOptions,
): Promise<VerifyResult> {
  return verifyUidAttestationImpl(client, config, opts)
}
