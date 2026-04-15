import type { Address, Hex, PublicClient } from 'viem'
import { isAddress } from 'viem'
import { normalize } from 'viem/ens'
import { decodeClaim, verifyClaim } from './proof'
import type { Claim, FullVerifyResult, VerifyProofOptions, VerifyResult } from './proof-types'

/**
 * Configuration for the proof verifier extension. The trusted-attester list
 * is required at extension construction time; per-call overrides can be
 * added later if needed.
 */
export interface ProofVerifierConfig {
  /** Attester key addresses this verifier accepts. EIP-55 or lowercase. */
  trustedAttesters: readonly Address[]
}

const TEXT_KEY_PREFIX = 'proof.'

// Avoid pulling in the full DOM lib just for fetch — declare the shape we use.
declare const fetch: (
  input: string,
  init?: unknown,
) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>

/**
 * Read the ENS text record `proof.<platform>`, decode the CBOR claim, and
 * verify its attester signature + staleness against the current ENS owner.
 *
 * This is the "cheap path": no IPFS fetch, no upstream attester round-trip.
 * Use `fetchAndVerifyFullProof` for deep checks against the OAuth/HMAC
 * payload stored in IPFS.
 */
async function verifyProofImpl(
  client: PublicClient,
  config: ProofVerifierConfig,
  opts: VerifyProofOptions,
): Promise<VerifyResult> {
  const name = normalize(opts.name)
  const textKey = `${TEXT_KEY_PREFIX}${opts.platform}`

  // biome-ignore lint/suspicious/noExplicitAny: ensjs extends PublicClient with getEnsText/getEnsOwner
  const anyClient = client as any

  const [rawTextResult, ownerResult] = await Promise.allSettled([
    anyClient.getEnsText({ name, key: textKey }),
    anyClient.getEnsOwner?.({ name }) ?? anyClient.getEnsAddress({ name }),
  ])

  const rawText =
    rawTextResult.status === 'fulfilled' && typeof rawTextResult.value === 'string'
      ? (rawTextResult.value as string)
      : null
  if (!rawText || rawText.length === 0) {
    return { valid: false, reason: 'missing' }
  }

  let ownerAddress: Address | null = null
  if (ownerResult.status === 'fulfilled' && ownerResult.value) {
    const raw = ownerResult.value
    const maybe =
      typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object' && 'owner' in raw
          ? ((raw as { owner?: unknown }).owner as string | undefined)
          : typeof raw === 'object' && raw !== null && 'address' in raw
            ? ((raw as { address?: unknown }).address as string | undefined)
            : undefined
    if (typeof maybe === 'string' && isAddress(maybe)) {
      ownerAddress = maybe as Address
    }
  }
  if (!ownerAddress) {
    return { valid: false, reason: 'wrong-owner' }
  }

  let claim: Claim
  try {
    const bytes = hexToBytes(rawText as Hex)
    const decoded = decodeClaim(bytes)
    if (!('sig' in decoded) || !decoded.sig) {
      return { valid: false, reason: 'bad-signature' }
    }
    claim = decoded as Claim
  } catch {
    return { valid: false, reason: 'decode-error' }
  }

  const result = await verifyClaim(claim, {
    trustedAttesters: config.trustedAttesters,
    expectedOwner: ownerAddress,
  })
  if (!result.valid) {
    return {
      valid: false,
      reason: result.reason,
      handle: claim.h,
      uid: claim.uid,
      expiresAt: claim.exp,
      cid: claim.prf,
    }
  }

  return {
    valid: true,
    handle: claim.h,
    uid: claim.uid,
    expiresAt: claim.exp,
    cid: claim.prf,
  }
}

/**
 * Deep-path verifier. Fetches the full proof document from IPFS, decodes it,
 * and re-runs the cheap-path checks over the embedded claim. Backend-specific
 * notary verification is intentionally out of scope — callers plug that in
 * based on the `method` field.
 *
 * Phase 1 note: this uses a public IPFS gateway. Callers can swap in a
 * private gateway by providing `gatewayUrl`.
 */
async function fetchAndVerifyFullProofImpl(
  cid: string,
  config: ProofVerifierConfig,
  options: { gatewayUrl?: string; expectedOwner?: Address } = {},
): Promise<FullVerifyResult> {
  const gateway = options.gatewayUrl ?? 'https://ipfs.io/ipfs'
  const url = `${gateway.replace(/\/$/, '')}/${cid}`

  let bytes: Uint8Array
  try {
    const res = await fetch(url)
    if (!res.ok) {
      return { valid: false, reason: 'missing', cid }
    }
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch {
    return { valid: false, reason: 'missing', cid }
  }

  // Full proof is a dag-cbor map with a nested `claim` field that contains
  // the exact on-chain claim bytes logic operates on.
  let fullProof: { claim?: unknown; method?: unknown }
  try {
    const { decode } = await import('@ipld/dag-cbor')
    fullProof = decode(bytes) as { claim?: unknown; method?: unknown }
  } catch {
    return { valid: false, reason: 'decode-error', cid }
  }

  let claim: Claim
  try {
    const inner = fullProof.claim
    if (inner instanceof Uint8Array) {
      const decoded = decodeClaim(inner)
      if (!('sig' in decoded) || !decoded.sig) {
        return { valid: false, reason: 'bad-signature', cid }
      }
      claim = decoded as Claim
    } else if (inner && typeof inner === 'object') {
      // Already-decoded nested map. Re-encode via dag-cbor to canonicalize,
      // then decode through our schema validator so missing fields surface.
      const { encode } = await import('@ipld/dag-cbor')
      const decoded = decodeClaim(encode(inner as Record<string, unknown>))
      if (!('sig' in decoded) || !decoded.sig) {
        return { valid: false, reason: 'bad-signature', cid }
      }
      claim = decoded as Claim
    } else {
      return { valid: false, reason: 'decode-error', cid }
    }
  } catch {
    return { valid: false, reason: 'decode-error', cid }
  }

  const result = await verifyClaim(claim, {
    trustedAttesters: config.trustedAttesters,
    expectedOwner: options.expectedOwner,
  })
  if (!result.valid) {
    return {
      valid: false,
      reason: result.reason,
      handle: claim.h,
      uid: claim.uid,
      expiresAt: claim.exp,
      cid,
      method: typeof fullProof.method === 'string' ? fullProof.method : undefined,
    }
  }

  return {
    valid: true,
    handle: claim.h,
    uid: claim.uid,
    expiresAt: claim.exp,
    cid,
    method: typeof fullProof.method === 'string' ? fullProof.method : undefined,
  }
}

/**
 * viem extension factory. Slots into `ensMetadataActions()` alongside
 * `getSchema` / `getMetadata`. The trusted-attester set is fixed at
 * extension creation; consumers configure it once based on which
 * attesters they accept.
 */
export function proofVerifier(config: ProofVerifierConfig) {
  return (client: PublicClient) => ({
    verifyProof: (opts: VerifyProofOptions) => verifyProofImpl(client, config, opts),
    fetchAndVerifyFullProof: (
      cid: string,
      options?: { gatewayUrl?: string; expectedOwner?: Address },
    ) => fetchAndVerifyFullProofImpl(cid, config, options),
  })
}

// Standalone wrappers for callers that don't want the extension pattern.
export function verifyProof(
  client: PublicClient,
  config: ProofVerifierConfig,
  opts: VerifyProofOptions,
): Promise<VerifyResult> {
  return verifyProofImpl(client, config, opts)
}

export function fetchAndVerifyFullProof(
  cid: string,
  config: ProofVerifierConfig,
  options?: { gatewayUrl?: string; expectedOwner?: Address },
): Promise<FullVerifyResult> {
  return fetchAndVerifyFullProofImpl(cid, config, options)
}

function hexToBytes(hex: Hex | string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2 !== 0) {
    throw new Error('hex: odd length')
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) {
      throw new Error('hex: invalid character')
    }
    out[i] = byte
  }
  return out
}
