import type { Address, Hex, WalletClient } from 'viem'

// --- v2 Envelope ---

/**
 * The v2 envelope shape. The envelope carries only the version, the signed
 * timestamp, and the signature itself — the inner payload is NOT stored on
 * chain. Verifiers reconstruct the payload from known context (name, owner,
 * platform, handle or uid, timestamp) and check the signature against it.
 *
 * The attester identity is not part of the envelope either. It is expected
 * to be carried in the record key as an ENS name
 * (`attestations[<p>][<attester.eth>]` or `uid[<p>][<attester.eth>]`), which
 * lets the attester rotate its signing key by updating the ENS name's
 * resolution — older signatures made with the retired key stop verifying.
 */
export interface Envelope {
  /** Envelope version (2). */
  version: number
  /** Issued-at, unix seconds. Signed — tampering invalidates the signature. */
  issuedAt: number
  /** EIP-191 signature over keccak256(dag-cbor(payload)). */
  sig: Hex
}

// --- Payload shapes ---

/**
 * Fields signed for a handle attestation. Encoded as canonical DAG-CBOR
 * with single-char keys: n (name), a (addr), p (platform), h (handle),
 * t (issuedAt). `addr` is a 20-byte `bstr`; everything else is a `tstr`
 * or `uint`.
 */
export interface HandlePayloadFields {
  platform: string
  handle: string
  name: string
  issuedAt: number
  addr: Address
}

/**
 * Fields signed for a uid attestation. Same shape as HandlePayloadFields
 * but the social identifier is the raw uid (`u`) instead of the public
 * handle (`h`). The raw uid is intentionally load-bearing — verifiers
 * must already know it to reconstruct the payload.
 */
export interface UidPayloadFields {
  platform: string
  uid: string
  name: string
  issuedAt: number
  addr: Address
}

// --- Sign inputs ---

/**
 * Input to `signHandleClaim`. `issuedAt` is auto-computed at sign time.
 */
export interface SignHandleClaimInput {
  platform: string
  handle: string
  name: string
  addr: Address
}

/**
 * Input to `signUidClaim`. `issuedAt` is auto-computed at sign time.
 */
export interface SignUidClaimInput {
  platform: string
  uid: string
  name: string
  addr: Address
}

export interface SignClaimWalletClient {
  account: WalletClient['account']
  signMessage: WalletClient['signMessage']
}

// --- Verify types ---

/**
 * v2 collapses the fine-grained tamper reasons (wrong-owner, tampered handle,
 * untrusted-attester) into `bad-signature`: since the payload is
 * reconstructed, any mismatch between reconstruction and what was signed
 * produces a different recovered address, and we can't tell which field was
 * wrong. Callers can inspect `recovered` to distinguish "wrong signer" from
 * "wrong reconstruction".
 *
 * `attester-not-resolved` is separate because it's actionable: the attester
 * ENS name has no current addr record, so no signing key is claimable and
 * nothing under that name can be verified until the ENS is fixed.
 */
export type VerifyFailureReason =
  | 'missing'
  | 'stale'
  | 'bad-signature'
  | 'unsupported-version'
  | 'decode-error'
  | 'attester-not-resolved'

export interface VerifyClaimResult {
  valid: boolean
  reason?: VerifyFailureReason
  /** Address recovered from the signature, if ecrecover succeeded. */
  recovered?: Address
}

interface BaseVerifyClaimOptions {
  /** Address of the attester whose signature is expected. */
  trustedAttester: Address
  /**
   * The wallet address signed into the payload — typically the current ENS
   * owner. Required: v2 can't verify without it because `addr` is signed.
   */
  owner: Address
  /** Max age in seconds. If `now - issuedAt > maxAge`, claim is stale. */
  maxAge?: number
  /** The ENS name the attestation is bound to. */
  name: string
  /** The platform namespace (e.g. "com.x"). */
  platform: string
}

export interface VerifyHandleClaimOptions extends BaseVerifyClaimOptions {
  /** The handle asserted by the attestation. */
  handle: string
}

export interface VerifyUidClaimOptions extends BaseVerifyClaimOptions {
  /** The raw uid asserted by the attestation. */
  uid: string
}

// --- Top-level verifier (read-from-chain) types ---

export interface VerifyHandleAttestationOptions {
  name: string
  platform: string
  /**
   * ENS name of the attester whose record is being read + verified.
   * Defaults to `DEFAULT_ATTESTER_ENS`. The SDK resolves this to an
   * address at verify time — key rotation = resolution change = old
   * signatures stop verifying.
   */
  attester?: string
}

export interface VerifyUidAttestationOptions {
  name: string
  platform: string
  /** ENS name of the attester whose record is being read + verified. */
  attester?: string
  /** Raw uid the caller already knows (from OAuth/platform metadata). */
  uid: string
}

export interface VerifyResult {
  valid: boolean
  reason?: VerifyFailureReason
  /** Present on successful handle verification. */
  handle?: string
  /** Present on successful uid verification. */
  uid?: string
  issuedAt?: number
  /** The attester ENS name the proof was read under. */
  attester?: string
  /** The address the attester ENS name resolved to at verify time. */
  attesterAddress?: Address
}
