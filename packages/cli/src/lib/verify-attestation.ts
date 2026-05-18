/**
 * High-level attestation verification: read the envelope text record off
 * the subject name, decode it, resolve owner + attester address, then call
 * the SDK's pure `verifyHandleClaim` / `verifyUidClaim` primitives.
 *
 * Single-chain: subject and attester must live on the same chain. The
 * caller passes one client; it's used for both the subject reads and the
 * attester-ENS address lookup. Reads route through the SDK reader, which
 * uses direct registry+resolver reads when `registry` is supplied (e.g.
 * Basenames on Base).
 */
import {
  type Envelope,
  type VerifyFailureReason,
  decodeEnvelope,
  handleAttestationRecordKey,
  metadataReader,
  uidAttestationRecordKey,
  verifyHandleClaim,
  verifyUidClaim,
} from '@ensmetadata/sdk'
import {
  type Address,
  type Hex,
  type PublicClient,
  hexToBytes,
  isAddress,
  namehash,
  zeroAddress,
} from 'viem'
import { getEnsAddress } from 'viem/actions'
import { normalize } from 'viem/ens'

export interface VerifyAttestationConfig {
  /**
   * ENS registry on the chain that hosts the subject's resolver. When
   * set, the SDK reader does direct registry+resolver reads instead of
   * UR-based reads. Required for `*.base.eth` and other L2 subjects.
   */
  registry?: Address
}

/**
 * Result reasons surfaced by the CLI verifier. Extends the SDK's set with
 * `'stale'`, which the CLI applies post-hoc against a caller-supplied
 * `--max-age` — the SDK does not enforce freshness.
 */
export type CliVerifyFailureReason = VerifyFailureReason | 'stale'

export interface VerifyHandleAttestationOptions {
  name: string
  platform: string
  attester: string
}

export interface VerifyUidAttestationOptions {
  name: string
  platform: string
  uid: string
  attester: string
}

interface VerifyResultBase {
  attester: string
  attesterAddress?: Address
}

export type VerifyHandleResult = VerifyResultBase &
  (
    | { valid: true; handle: string; issuedAt: number }
    | { valid: false; reason: CliVerifyFailureReason; handle?: string; issuedAt?: number }
  )

export type VerifyUidResult = VerifyResultBase &
  (
    | { valid: true; uid: string; issuedAt: number }
    | { valid: false; reason: CliVerifyFailureReason; uid?: string; issuedAt?: number }
  )

// ─── Read helpers ───────────────────────────────────────────────────────────

const REGISTRY_OWNER_ABI = [
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

async function resolveOwner(
  client: PublicClient,
  name: string,
  registry?: Address,
): Promise<Address | null> {
  if (registry) {
    try {
      const owner = (await client.readContract({
        address: registry,
        abi: REGISTRY_OWNER_ABI,
        functionName: 'owner',
        args: [namehash(name)],
      })) as Address
      return owner === zeroAddress ? null : owner
    } catch {
      return null
    }
  }
  const { getOwner } = await import('@ensdomains/ensjs/public')
  try {
    const owner = await getOwner(client as never, { name })
    if (owner?.owner && isAddress(owner.owner)) return owner.owner as Address
  } catch {
    // fall through
  }
  return null
}

async function resolveAttester(client: PublicClient, attesterEns: string): Promise<Address | null> {
  const resolved = await getEnsAddress(client, { name: normalize(attesterEns) }).catch(() => null)
  return resolved && isAddress(resolved) ? (resolved as Address) : null
}

interface SubjectReads {
  envHex: Hex | null
  handle?: string | null
}

async function readSubjectRecords(
  subjectClient: PublicClient,
  name: string,
  recordKey: string,
  registry: Address | undefined,
  platformKey?: string,
): Promise<SubjectReads> {
  const reader = metadataReader()(subjectClient)
  const keys = platformKey ? [recordKey, platformKey] : [recordKey]
  try {
    const result = await reader.getMetadata({
      name,
      keys,
      ...(registry ? { registry } : {}),
    })
    const raw = result.properties[recordKey]
    const envHex = raw && raw.length > 0 ? (raw as Hex) : null
    const out: SubjectReads = { envHex }
    if (platformKey) {
      const h = result.properties[platformKey]
      out.handle = h && h.length > 0 ? h : null
    }
    return out
  } catch {
    return platformKey ? { envHex: null, handle: null } : { envHex: null }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Verify the `attestations[<platform>][<attester-ens>]` text record on
 * `name`. Returns a structured result; throws only on programmer error.
 */
export async function verifyHandleAttestation(
  subjectClient: PublicClient,
  config: VerifyAttestationConfig,
  opts: VerifyHandleAttestationOptions,
): Promise<VerifyHandleResult> {
  const name = normalize(opts.name)
  const attesterEns = opts.attester
  const recordKey = handleAttestationRecordKey(opts.platform, attesterEns)

  const [{ envHex, handle }, owner, attesterAddress] = await Promise.all([
    readSubjectRecords(subjectClient, name, recordKey, config.registry, opts.platform),
    resolveOwner(subjectClient, name, config.registry),
    resolveAttester(subjectClient, attesterEns),
  ])

  if (!envHex) return { valid: false, reason: 'missing', attester: attesterEns }
  if (!attesterAddress) {
    return { valid: false, reason: 'attester-not-resolved', attester: attesterEns }
  }
  if (!owner) {
    return { valid: false, reason: 'owner-not-resolved', attester: attesterEns, attesterAddress }
  }
  if (!handle) {
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
  })

  if (!result.valid) {
    return {
      valid: false,
      reason: result.reason ?? 'bad-signature',
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
 * Verify the `uid[<platform>][<attester-ens>]` text record on `name`. The
 * raw uid is load-bearing — the verifier must already know it to
 * reconstruct the signed payload.
 */
export async function verifyUidAttestation(
  subjectClient: PublicClient,
  config: VerifyAttestationConfig,
  opts: VerifyUidAttestationOptions,
): Promise<VerifyUidResult> {
  const name = normalize(opts.name)
  const attesterEns = opts.attester
  const recordKey = uidAttestationRecordKey(opts.platform, attesterEns)

  const [{ envHex }, owner, attesterAddress] = await Promise.all([
    readSubjectRecords(subjectClient, name, recordKey, config.registry),
    resolveOwner(subjectClient, name, config.registry),
    resolveAttester(subjectClient, attesterEns),
  ])

  if (!envHex) return { valid: false, reason: 'missing', attester: attesterEns }
  if (!attesterAddress) {
    return { valid: false, reason: 'attester-not-resolved', attester: attesterEns }
  }
  if (!owner) {
    return { valid: false, reason: 'owner-not-resolved', attester: attesterEns, attesterAddress }
  }

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
  })

  if (!result.valid) {
    return {
      valid: false,
      reason: result.reason ?? 'bad-signature',
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
