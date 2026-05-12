import { getOwner } from '@ensdomains/ensjs/public'
import type { Address, Hex, PublicClient } from 'viem'
import { hexToBytes, isAddress } from 'viem'
import { getEnsAddress, getEnsText } from 'viem/actions'
import { normalize } from 'viem/ens'
import { decodeEnvelope, verifyHandleClaim, verifyUidClaim } from '../attestation'
import type {
  Envelope,
  VerifyHandleAttestationOptions,
  VerifyResult,
  VerifyUidAttestationOptions,
} from '../attestation-types'
import {
  BaseResolverError,
  getBaseRegistryOwner,
  getBaseResolverAddress,
  isBasename,
} from '../chains/base'
import { fetchTextRecordsDirect } from './reader'
import { type ChainClients, MissingChainClientError, chainForName } from './routing'

/**
 * Default attester ENS name. Callers who haven't set their own trusted
 * attester get this one. The address it resolves to is the signing key
 * expected during verification; rotating this name's addr record retires
 * the old signing key and invalidates every signature under it.
 */
export const DEFAULT_ATTESTER_ENS = 'atst.lighthousegov.eth'

/**
 * Configuration for the multichain attestation verifier. The verifier is
 * inherently multichain because verification reads from the subject's chain
 * (envelope, owner, handle) and from mainnet (attester ENS resolution); a
 * single-chain form has no useful semantics, which is why no core verifier
 * factory exists.
 */
export interface MultichainAttestationVerifierConfig {
  /** Max age in seconds. If `now - issuedAt > maxAge`, the claim is stale. */
  maxAge?: number
  /**
   * Map of viem `PublicClient`s keyed by chain. `mainnet` is always required
   * because the attester ENS is a mainnet ENS today; `base` is required for
   * any name routed there by `chainForName`.
   */
  publicClients: ChainClients
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

function pickSubjectClient(publicClients: ChainClients, name: string): PublicClient {
  const chain = chainForName(name)
  if (chain === 'base') {
    if (!publicClients.base) throw new MissingChainClientError('base', name)
    return publicClients.base
  }
  return publicClients.mainnet
}

async function readOwner(publicClients: ChainClients, name: string): Promise<Address | null> {
  if (isBasename(name)) {
    const baseClient = pickSubjectClient(publicClients, name)
    const owner = await getBaseRegistryOwner(baseClient, name)
    return (owner ?? null) as Address | null
  }
  try {
    const owner = await getOwner(publicClients.mainnet as never, { name })
    if (owner?.owner && isAddress(owner.owner)) return owner.owner as Address
  } catch {
    // fall through
  }
  return null
}

async function readBaseTextsForVerify(
  baseClient: PublicClient,
  name: string,
  keys: string[],
): Promise<Record<string, string | null>> {
  let resolverAddress: `0x${string}` | null = null
  try {
    resolverAddress = await getBaseResolverAddress(baseClient, name)
  } catch (err) {
    if (err instanceof BaseResolverError && err.code === 'unconfigured') {
      resolverAddress = null
    } else {
      throw err
    }
  }
  if (!resolverAddress) {
    return Object.fromEntries(keys.map((k) => [k, null]))
  }
  return fetchTextRecordsDirect(baseClient, resolverAddress, name, keys)
}

async function readEnvelopeHex(
  publicClients: ChainClients,
  name: string,
  key: string,
): Promise<Hex | null> {
  if (isBasename(name)) {
    const baseClient = pickSubjectClient(publicClients, name)
    const records = await readBaseTextsForVerify(baseClient, name, [key])
    const value = records[key]
    return value && value.length > 0 ? (value as Hex) : null
  }
  const raw = await getEnsText(publicClients.mainnet, { name, key }).catch(() => null)
  if (!raw || typeof raw !== 'string' || raw.length === 0) return null
  return raw as Hex
}

async function readPlatformHandle(
  publicClients: ChainClients,
  name: string,
  platform: string,
): Promise<string | null> {
  if (isBasename(name)) {
    const baseClient = pickSubjectClient(publicClients, name)
    const records = await readBaseTextsForVerify(baseClient, name, [platform])
    return records[platform] ?? null
  }
  const raw = await getEnsText(publicClients.mainnet, { name, key: platform }).catch(() => null)
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

async function resolveAttester(
  mainnetClient: PublicClient,
  attesterEns: string,
): Promise<Address | null> {
  const resolved = await getEnsAddress(mainnetClient, { name: normalize(attesterEns) }).catch(
    () => null,
  )
  return resolved && isAddress(resolved) ? (resolved as Address) : null
}

/**
 * Read `attestations[<platform>][<attester-ens>]` on the ENS name, decode
 * the v2 envelope, and verify the signature against the attester ENS's
 * current address + current owner + the handle text record (`<platform>`).
 */
async function verifyHandleAttestationImpl(
  config: MultichainAttestationVerifierConfig,
  opts: VerifyHandleAttestationOptions,
): Promise<VerifyResult> {
  const name = normalize(opts.name)
  const attesterEns = opts.attester ?? DEFAULT_ATTESTER_ENS
  const { publicClients } = config

  // Touch the subject client up front so a missing-chain error surfaces
  // before the parallel read kicks off.
  pickSubjectClient(publicClients, name)

  const [envHex, owner, handle, attesterAddress] = await Promise.all([
    readEnvelopeHex(publicClients, name, handleAttestationRecordKey(opts.platform, attesterEns)),
    readOwner(publicClients, name),
    readPlatformHandle(publicClients, name, opts.platform),
    resolveAttester(publicClients.mainnet, attesterEns),
  ])

  if (!envHex) return { valid: false, reason: 'missing', attester: attesterEns }
  if (!attesterAddress) {
    return { valid: false, reason: 'attester-not-resolved', attester: attesterEns }
  }
  if (!owner) {
    return { valid: false, reason: 'owner-not-resolved', attester: attesterEns, attesterAddress }
  }
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
  config: MultichainAttestationVerifierConfig,
  opts: VerifyUidAttestationOptions,
): Promise<VerifyResult> {
  const name = normalize(opts.name)
  const attesterEns = opts.attester ?? DEFAULT_ATTESTER_ENS
  const { publicClients } = config

  pickSubjectClient(publicClients, name)

  const [envHex, owner, attesterAddress] = await Promise.all([
    readEnvelopeHex(publicClients, name, uidAttestationRecordKey(opts.platform, attesterEns)),
    readOwner(publicClients, name),
    resolveAttester(publicClients.mainnet, attesterEns),
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

/**
 * Multichain attestation verifier. Returns an object exposing
 * `verifyHandleAttestation` and `verifyUidAttestation`. Subject-side reads
 * are dispatched via `chainForName(opts.name)` against `config.publicClients`;
 * the attester ENS resolution always uses `config.publicClients.mainnet`.
 */
export function multichainAttestationVerifier(config: MultichainAttestationVerifierConfig) {
  return {
    verifyHandleAttestation: (opts: VerifyHandleAttestationOptions) =>
      verifyHandleAttestationImpl(config, opts),
    verifyUidAttestation: (opts: VerifyUidAttestationOptions) =>
      verifyUidAttestationImpl(config, opts),
  }
}

// --------------------------------------------------------------------------
// Backwards-compatibility wrappers. The old standalone exports are kept as
// thin adapters so existing callers (notably `packages/cli`) continue to work
// while their migration to the multichain factory is staged separately. New
// code should call `multichainAttestationVerifier` directly.
// --------------------------------------------------------------------------

/**
 * @deprecated Use `multichainAttestationVerifier({ publicClients })` directly.
 */
export interface AttestationVerifierConfig {
  maxAge?: number
  /** Optional Base public client. */
  basePublicClient?: PublicClient
}

function liftLegacyConfig(
  client: PublicClient,
  config: AttestationVerifierConfig,
): MultichainAttestationVerifierConfig {
  const publicClients: ChainClients = {
    mainnet: client,
    ...(config.basePublicClient ? { base: config.basePublicClient } : {}),
  }
  return {
    publicClients,
    ...(config.maxAge !== undefined ? { maxAge: config.maxAge } : {}),
  }
}

/**
 * @deprecated Use `multichainAttestationVerifier({ publicClients }).verifyHandleAttestation` instead.
 */
export function verifyHandleAttestation(
  client: PublicClient,
  config: AttestationVerifierConfig,
  opts: VerifyHandleAttestationOptions,
): Promise<VerifyResult> {
  return verifyHandleAttestationImpl(liftLegacyConfig(client, config), opts)
}

/**
 * @deprecated Use `multichainAttestationVerifier({ publicClients }).verifyUidAttestation` instead.
 */
export function verifyUidAttestation(
  client: PublicClient,
  config: AttestationVerifierConfig,
  opts: VerifyUidAttestationOptions,
): Promise<VerifyResult> {
  return verifyUidAttestationImpl(liftLegacyConfig(client, config), opts)
}
