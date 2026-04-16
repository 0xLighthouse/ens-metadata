import { getOwner } from '@ensdomains/ensjs/public'
import type { Address, Hex, PublicClient } from 'viem'
import { hexToBytes, isAddress } from 'viem'
import { getEnsText } from 'viem/actions'
import { normalize } from 'viem/ens'
import { decodeEnvelope, decodePayload, verifyClaim } from './proof'
import type { FullVerifyResult, VerifyProofOptions, VerifyResult } from './proof-types'

/**
 * Configuration for the proof verifier extension. The trusted-attester list
 * is required at extension construction time; per-call overrides can be
 * added later if needed.
 */
export interface ProofVerifierConfig {
  trustedAttesters: readonly Address[]
}

const TEXT_KEY_SUFFIX = '.proof'

// Avoid pulling in the full DOM lib just for fetch.
declare const fetch: (
  input: string,
  init?: unknown,
) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>

/**
 * Read the ENS text record `<platform>.proof`, decode the v3 envelope,
 * and verify its attester signature + staleness against the current ENS
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
    })
    if (!result.valid) {
      return {
        valid: false,
        reason: result.reason,
        handle: envelope.h,
        uid: inner.uid,
        expiresAt: inner.exp,
        cid: inner.prf,
        method: envelope.method,
      }
    }

    return {
      valid: true,
      handle: envelope.h,
      uid: inner.uid,
      expiresAt: inner.exp,
      cid: inner.prf,
      method: envelope.method,
    }
  } catch {
    return { valid: false, reason: 'decode-error' }
  }
}

/**
 * Deep-path verifier. Fetches the full proof document from IPFS, decodes
 * it, and exposes the upstream evidence. The v3 envelope already has
 * `method` in the on-chain metadata, so the deep path is mainly for
 * inspecting the raw platform evidence payload.
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

  let fullProof: { method?: unknown }
  try {
    const { decode } = await import('@ipld/dag-cbor')
    fullProof = decode(bytes) as { method?: unknown }
  } catch {
    return { valid: false, reason: 'decode-error', cid }
  }

  return {
    valid: true,
    cid,
    method: typeof fullProof.method === 'string' ? fullProof.method : undefined,
  }
}

export function proofVerifier(config: ProofVerifierConfig) {
  return (client: PublicClient) => ({
    verifyProof: (opts: VerifyProofOptions) => verifyProofImpl(client, config, opts),
    fetchAndVerifyFullProof: (
      cid: string,
      options?: { gatewayUrl?: string; expectedOwner?: Address },
    ) => fetchAndVerifyFullProofImpl(cid, config, options),
  })
}

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
