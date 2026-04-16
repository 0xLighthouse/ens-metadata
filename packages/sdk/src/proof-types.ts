import type { Address, Hex, WalletClient } from 'viem'

// --- v4 Envelope types ---

/**
 * Signed payload fields inside a v4 envelope. Changing any of these
 * invalidates the signature.
 *
 * Binary values (`uid`, `addr`) are `Hex`/`Address` strings in TypeScript
 * but encoded as raw bytes (`bstr`) in the canonical dag-cbor payload.
 * Field names are readable here; the CBOR encoder maps them to single-char
 * keys internally for compactness.
 */
export interface PayloadFields {
  /** Reverse-DNS platform namespace, e.g. "com.x", "org.telegram". */
  platform: string
  /** Handle at time of attestation — signed, change triggers re-attestation. */
  handle: string
  /** Blinded platform user id — personalSign(keccak256("p:rawUid"), attesterKey). */
  uid: Hex
  /** ENS name this claim is bound to. */
  name: string
  /** Issued-at, unix seconds. Consumers apply their own freshness threshold. */
  issuedAt: number
  /** Wallet the attester observed during the session (via SIWE). */
  addr: Address
}

/**
 * The full v4 envelope shape. `payload` is the raw dag-cbor bytes of
 * PayloadFields. `sig` is the EIP-191 signature over keccak256(payload).
 * `attester` is unsigned — the signature cryptographically binds the signer.
 */
export interface Envelope {
  /** Envelope version (4). */
  version: number
  /** Canonical dag-cbor bytes of the signed PayloadFields. */
  payload: Uint8Array
  /** Attester address — unsigned hint for trusted-set lookup. */
  attester: Address
  /** EIP-191 signature over keccak256(payload). */
  sig: Hex
}

/**
 * Input to `signClaim`. `issuedAt` is auto-computed (current unix time).
 * `attester` is auto-populated from the wallet.
 */
export interface SignClaimInput {
  platform: string
  handle: string
  uid: Hex
  name: string
  addr: Address
}

// --- Verify types ---

export type VerifyFailureReason =
  | 'missing'
  | 'stale'
  | 'bad-signature'
  | 'wrong-owner'
  | 'untrusted-attester'
  | 'unsupported-version'
  | 'decode-error'

export interface VerifyClaimResult {
  valid: boolean
  reason?: VerifyFailureReason
  recovered?: Address
}

export interface VerifyClaimOptions {
  trustedAttesters: readonly Address[]
  expectedOwner?: Address
  /** Max age in seconds. If `now - issuedAt > maxAge`, the claim is stale. */
  maxAge?: number
}

export interface VerifyProofOptions {
  name: string
  platform: string
}

export interface VerifyResult {
  valid: boolean
  reason?: VerifyFailureReason
  handle?: string
  uid?: string
  issuedAt?: number
  attester?: Address
}

export interface SignClaimWalletClient {
  account: WalletClient['account']
  signMessage: WalletClient['signMessage']
}
