import { getOwner } from '@ensdomains/ensjs/public'
import type { Address, Hex, PublicClient } from 'viem'
import { hexToBytes, isAddress } from 'viem'
import { getEnsAddress, getEnsText } from 'viem/actions'
import { normalize } from 'viem/ens'
import { decodeEnvelope, verifyHandleClaim, verifyUidClaim } from './attestation'
import type {
  Envelope,
  VerifyHandleAttestationOptions,
  VerifyResult,
  VerifyUidAttestationOptions,
} from './attestation-types'

/**
 * Default attester ENS name. Callers who haven't set their own trusted
 * attester get this one. The address it resolves to is the signing key
 * expected during verification; rotating this name's addr record retires
 * the old signing key and invalidates every signature under it.
 */
export const DEFAULT_ATTESTER_ENS = 'atst.lighthousegov.eth'

/**
 * Configuration for the attestation verifier extension.
 */
export interface AttestationVerifierConfig {
  /** Max age in seconds. If `now - issuedAt > maxAge`, the claim is stale. */
  maxAge?: number
}

/**
 * Build the parameterized text-record key for a handle attestation:
 * `attestations[<platform>][<attester-ens>]`. The attester name is
 * normalized via ENSIP-15 so writer and reader produce the same key.
 */
export function handleAttestationRecordKey(platform: string, attesterEns: string): string {
  return `attestations[${platform}][${normalize(attesterEns)}]`
}

/**
 * Build the parameterized text-record key for a uid attestation:
 * `uid[<platform>][<attester-ens>]`.
 */
export function uidAttestationRecordKey(platform: string, attesterEns: string): string {
  return `uid[${platform}][${normalize(attesterEns)}]`
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

async function resolveAttester(
  client: PublicClient,
  attesterEns: string,
): Promise<Address | null> {
  const resolved = await getEnsAddress(client, { name: normalize(attesterEns) }).catch(() => null)
  return resolved && isAddress(resolved) ? (resolved as Address) : null
}

/**
 * Read `attestations[<platform>][<attester-ens>]` on the ENS name, decode
 * the v2 envelope, and verify the signature against the attester ENS's
 * current address + current owner + the handle text record (`<platform>`).
 */
async function verifyHandleAttestationImpl(
  client: PublicClient,
  config: AttestationVerifierConfig,
  opts: VerifyHandleAttestationOptions,
): Promise<VerifyResult> {
  const name = normalize(opts.name)
  const attesterEns = opts.attester ?? DEFAULT_ATTESTER_ENS

  const [envHex, owner, handle, attesterAddress] = await Promise.all([
    readEnvelopeHex(client, name, handleAttestationRecordKey(opts.platform, attesterEns)),
    readOwner(client, name),
    getEnsText(client, { name, key: opts.platform }).catch(() => null),
    resolveAttester(client, attesterEns),
  ])

  if (!envHex) return { valid: false, reason: 'missing', attester: attesterEns }
  if (!attesterAddress) {
    return { valid: false, reason: 'attester-not-resolved', attester: attesterEns }
  }
  if (!owner) return { valid: false, reason: 'bad-signature', attester: attesterEns, attesterAddress }
  if (!handle || typeof handle !== 'string' || handle.length === 0) {
    return { valid: false, reason: 'missing', attester: attesterEns, attesterAddress }
  }

  let envelope: Envelope
  try {
    envelope = decodeEnvelope(hexToBytes(envHex))
  } catch {
    return { valid: false, reason: 'decode-error', attester: attesterEns, attesterAddress }
  }

  const result = await verifyHandleClaim(envelope, {
    trustedAttester: attesterAddress,
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
      attester: attesterEns,
      attesterAddress,
    }
  }

  return {
    valid: true,
    handle,
    issuedAt: envelope.issuedAt,
    attester: attesterEns,
    attesterAddress,
  }
}

/**
 * Read `uid[<platform>][<attester-ens>]` on the ENS name, decode the v2
 * envelope, and verify the signature against the attester ENS's current
 * address + current owner + the caller-supplied raw uid.
 */
async function verifyUidAttestationImpl(
  client: PublicClient,
  config: AttestationVerifierConfig,
  opts: VerifyUidAttestationOptions,
): Promise<VerifyResult> {
  const name = normalize(opts.name)
  const attesterEns = opts.attester ?? DEFAULT_ATTESTER_ENS

  const [envHex, owner, attesterAddress] = await Promise.all([
    readEnvelopeHex(client, name, uidAttestationRecordKey(opts.platform, attesterEns)),
    readOwner(client, name),
    resolveAttester(client, attesterEns),
  ])

  if (!envHex) return { valid: false, reason: 'missing', attester: attesterEns }
  if (!attesterAddress) {
    return { valid: false, reason: 'attester-not-resolved', attester: attesterEns }
  }
  if (!owner) return { valid: false, reason: 'bad-signature', attester: attesterEns, attesterAddress }

  let envelope: Envelope
  try {
    envelope = decodeEnvelope(hexToBytes(envHex))
  } catch {
    return { valid: false, reason: 'decode-error', attester: attesterEns, attesterAddress }
  }

  const result = await verifyUidClaim(envelope, {
    trustedAttester: attesterAddress,
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
      attester: attesterEns,
      attesterAddress,
    }
  }

  return {
    valid: true,
    uid: opts.uid,
    issuedAt: envelope.issuedAt,
    attester: attesterEns,
    attesterAddress,
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
