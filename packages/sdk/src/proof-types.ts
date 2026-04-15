import type { Address, Hex, WalletClient } from 'viem'

// --- Claim types ---

/**
 * Fields required to construct an on-chain identity claim.
 *
 * Every field participates in the signed payload. The signature is produced
 * by an **attester** — a backend service that observed both the wallet
 * connection and the platform OAuth flow in a single session, then signed
 * a claim binding them together. `att` is the attester's key address; `sig`
 * is the attester's signature.
 *
 * Replay protection: `name`, `chainId`, `addr`, and `att` are all in the
 * hash. Tampering with any of them invalidates the signature.
 */
export interface ClaimFields {
  /** Schema version. */
  v: number
  /** Platform identifier, e.g. "twitter". */
  p: string
  /** Handle at time of attestation, e.g. "vitalik". */
  h: string
  /** Platform-stable user id (canonical identity across handle changes). */
  uid: string
  /** Expiry, unix seconds. */
  exp: number
  /** IPFS CID of the full proof document (string form). */
  prf: string
  /** ENS name this claim is bound to, e.g. "alice.eth". */
  name: string
  /** EVM chain id the claim is valid on. */
  chainId: number
  /**
   * Wallet the attester observed during the session — typically via SIWE.
   * Verifiers compare this to the current ENS owner; a mismatch means the
   * name has transferred since attestation and the proof is stale.
   * EIP-55 checksummed.
   */
  addr: Address
  /**
   * Attester key address. The signer of `sig`. Verifiers reject any claim
   * whose `att` is not in their trusted-attester set. EIP-55 checksummed.
   */
  att: Address
}

/**
 * Input shape accepted by `signClaim`. `att` is optional here — if omitted,
 * it is auto-populated from the attester wallet client's connected account.
 * If provided, it must match the connected account or `signClaim` throws.
 *
 * Note: `addr` is required from the caller. Unlike `att`, it isn't auto-
 * populated — the attester observes it via SIWE during the session and
 * passes it explicitly when issuing the claim.
 */
export type SignClaimInput = Omit<ClaimFields, 'att'> & { att?: Address }

/**
 * A claim that has not yet been signed. Same shape as `ClaimFields` —
 * exported as a distinct type for clarity at call sites.
 */
export type ClaimWithoutSig = ClaimFields

/**
 * A fully signed on-chain claim.
 */
export interface Claim extends ClaimFields {
  /** EIP-191 signature over canonical CBOR of the claim without `sig`. */
  sig: Hex
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

/**
 * Options for low-level `verifyClaim`. The trusted-attester set is required
 * — verifying without one would mean accepting any signer. The expected
 * owner is optional: when present, the verifier additionally checks that
 * the wallet the attester observed (`claim.addr`) is the current ENS owner
 * (the staleness check). Higher-level helpers like `verifyProof` resolve
 * the current owner from the chain and supply this for you.
 */
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
}

export interface FullVerifyResult extends VerifyResult {
  method?: string
}

export interface SignClaimWalletClient {
  account: WalletClient['account']
  signMessage: WalletClient['signMessage']
}
