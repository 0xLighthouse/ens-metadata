import type { Address, Hex, WalletClient } from 'viem'

// --- Claim types ---

/**
 * Fields required to construct an on-chain identity claim.
 *
 * Every field participates in the signed payload. `name` and `chainId` are
 * part of the hash for replay protection — without them a claim for
 * `alice.eth` could be replayed into `bob.eth` (same address) or between
 * mainnet and Sepolia.
 */
export interface ClaimFields {
  /** Schema version, currently 1. */
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
}

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
  | 'handle-changed'
  | 'decode-error'

export interface VerifyClaimResult {
  valid: boolean
  reason?: VerifyFailureReason
  recovered?: Address
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
