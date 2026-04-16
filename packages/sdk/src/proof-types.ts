import type { Address, Hex, WalletClient } from 'viem'

// --- v3 Envelope types ---

/**
 * Fields inside the signed payload blob of a v3 envelope. These are the
 * security-critical fields that participate in the signature hash. Changing
 * any of them invalidates the signature.
 *
 * `p` is signed for replay protection (prevents replaying a com.x proof
 * as an org.telegram proof). It's also duplicated in the unsigned envelope
 * metadata for indexing convenience.
 *
 * `h` (handle) is NOT here — it's display-only and lives in the unsigned
 * envelope metadata so it can be updated without re-attestation.
 */
export interface PayloadFields {
  /** Schema version. */
  v: number
  /** Reverse-DNS platform namespace, e.g. "com.x", "org.telegram". */
  p: string
  /** Blinded platform user id. */
  uid: string
  /** ENS name this claim is bound to. */
  name: string
  /** EVM chain id the claim is valid on. */
  chainId: number
  /** Wallet the attester observed during the session (via SIWE). EIP-55. */
  addr: Address
  /** Attester key address — the signer of `sig`. EIP-55. */
  att: Address
  /** Expiry, unix seconds. */
  exp: number
  /** Reference to the full proof document (IPFS CID or CDN URL). */
  prf: string
}

/**
 * Unsigned metadata in the v3 envelope. NOT signed — exists for
 * indexing/display convenience. Can be updated without re-attestation.
 */
export interface EnvelopeMetadata {
  /** Envelope version (3). */
  v: number
  /** Platform namespace (duplicated from signed payload for indexing). */
  p: string
  /** Handle at time of attestation — display only. */
  h: string
  /** Attestation backend, e.g. "privy-linked". */
  method: string
  /** When the attestation was created, unix seconds. */
  issuedAt: number
}

/**
 * The full v3 envelope shape as a TypeScript object (after decode or
 * before encode). `payload` is the raw dag-cbor bytes of PayloadFields.
 * `sig` is the EIP-191 signature over keccak256(payload).
 */
export interface Envelope extends EnvelopeMetadata {
  /** Canonical dag-cbor bytes of the signed PayloadFields. */
  payload: Uint8Array
  /** EIP-191 signature over keccak256(payload). */
  sig: Hex
}

/**
 * Input to `signClaim`. `att` is optional — auto-populated from the
 * attester wallet client. Everything else is required. `h`, `method`,
 * and `issuedAt` end up in the unsigned envelope metadata; the rest
 * goes into the signed payload.
 */
export interface SignClaimInput {
  p: string
  h: string
  uid: string
  name: string
  chainId: number
  addr: Address
  att?: Address
  exp: number
  prf: string
  method: string
  issuedAt: number
}

// --- Verify types ---

export type VerifyFailureReason =
  | 'missing'
  | 'expired'
  | 'bad-signature'
  | 'wrong-owner'
  | 'untrusted-attester'
  | 'unsupported-version'
  | 'handle-changed'
  | 'decode-error'

export interface VerifyClaimResult {
  valid: boolean
  reason?: VerifyFailureReason
  recovered?: Address
}

export interface VerifyClaimOptions {
  trustedAttesters: readonly Address[]
  expectedOwner?: Address
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
  expiresAt?: number
  cid?: string
  method?: string
}

export interface FullVerifyResult extends VerifyResult {
  method?: string
}

export interface SignClaimWalletClient {
  account: WalletClient['account']
  signMessage: WalletClient['signMessage']
}
