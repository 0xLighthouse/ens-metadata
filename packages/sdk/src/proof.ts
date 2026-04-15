import { decode as cborDecode, encode as cborEncode } from '@ipld/dag-cbor'
import type { Address, Hex, WalletClient } from 'viem'
import { getAddress, isAddress, keccak256, recoverMessageAddress } from 'viem'
import type {
  Claim,
  ClaimFields,
  ClaimWithoutSig,
  SignClaimInput,
  SignClaimWalletClient,
  VerifyClaimOptions,
  VerifyClaimResult,
} from './proof-types'

/** Current claim schema version. v1 was wallet-signed; v2 is attester-signed. */
export const CLAIM_VERSION = 2

/**
 * Strict ordered list of claim field names. Used only for runtime validation
 * and readable error messages — dag-cbor sorts map keys itself per
 * RFC 8949 Core Deterministic Encoding, so this list does NOT influence
 * the on-the-wire byte layout.
 */
const CLAIM_FIELDS = [
  'v',
  'p',
  'h',
  'uid',
  'exp',
  'prf',
  'name',
  'chainId',
  'addr',
  'att',
] as const

function assertClaimFields(fields: Partial<ClaimFields>): asserts fields is ClaimFields {
  for (const key of CLAIM_FIELDS) {
    if (fields[key] === undefined || fields[key] === null) {
      throw new Error(`claim: missing required field "${key}"`)
    }
  }
  if (typeof fields.v !== 'number' || !Number.isInteger(fields.v) || fields.v < 0) {
    throw new Error('claim: "v" must be a non-negative integer')
  }
  if (fields.v !== CLAIM_VERSION) {
    throw new Error(`claim: unsupported version ${fields.v} (expected ${CLAIM_VERSION})`)
  }
  if (typeof fields.exp !== 'number' || !Number.isInteger(fields.exp) || fields.exp < 0) {
    throw new Error('claim: "exp" must be a non-negative integer')
  }
  if (
    typeof fields.chainId !== 'number' ||
    !Number.isInteger(fields.chainId) ||
    fields.chainId < 0
  ) {
    throw new Error('claim: "chainId" must be a non-negative integer')
  }
  for (const key of ['p', 'h', 'uid', 'prf', 'name'] as const) {
    if (typeof fields[key] !== 'string') {
      throw new Error(`claim: "${key}" must be a string`)
    }
  }
  for (const key of ['addr', 'att'] as const) {
    if (typeof fields[key] !== 'string' || !isAddress(fields[key])) {
      throw new Error(`claim: "${key}" must be a valid 0x-prefixed address`)
    }
  }
}

/**
 * Build a plain object containing only the fields that participate in the
 * signed hash. Order-insensitive: dag-cbor canonicalizes at encode time.
 */
function toUnsignedRecord(claim: ClaimWithoutSig): Record<string, unknown> {
  return {
    v: claim.v,
    p: claim.p,
    h: claim.h,
    uid: claim.uid,
    exp: claim.exp,
    prf: claim.prf,
    name: claim.name,
    chainId: claim.chainId,
    addr: claim.addr,
    att: claim.att,
  }
}

/**
 * Encode a claim (signed or unsigned) as canonical dag-cbor bytes.
 *
 * dag-cbor enforces RFC 8949 Core Deterministic Encoding: map keys are
 * sorted by length then bytewise, integers use shortest form, and no
 * indefinite-length items are emitted. This is the property that makes
 * `decode(encode(x))` byte-identical across runs and across implementations
 * — signature verification depends on it.
 */
export function encodeClaim(fields: ClaimFields | Claim): Uint8Array {
  assertClaimFields(fields)
  const record: Record<string, unknown> = toUnsignedRecord(fields)
  if ('sig' in fields && fields.sig !== undefined) {
    record.sig = hexToBytes(fields.sig)
  }
  return cborEncode(record)
}

/**
 * Decode canonical dag-cbor bytes into a claim. Accepts both signed and
 * unsigned claims. Throws on malformed input or missing required fields.
 */
export function decodeClaim(bytes: Uint8Array): Claim | ClaimWithoutSig {
  const decoded = cborDecode(bytes) as Record<string, unknown>
  if (decoded === null || typeof decoded !== 'object') {
    throw new Error('claim: decoded value is not a map')
  }

  const partial: Partial<ClaimFields> = {
    v: decoded.v as number,
    p: decoded.p as string,
    h: decoded.h as string,
    uid: decoded.uid as string,
    exp: decoded.exp as number,
    prf: decoded.prf as string,
    name: decoded.name as string,
    chainId: decoded.chainId as number,
    addr: decoded.addr as Address,
    att: decoded.att as Address,
  }
  assertClaimFields(partial)

  if (decoded.sig !== undefined) {
    const sigBytes = decoded.sig
    if (!(sigBytes instanceof Uint8Array) || sigBytes.length !== 65) {
      throw new Error('claim: "sig" must be 65 bytes')
    }
    return { ...partial, sig: bytesToHex(sigBytes) }
  }
  return partial
}

/**
 * Canonical keccak256 hash of a claim, excluding the `sig` field.
 * This is the value that EIP-191 wraps before signing.
 */
export function hashClaim(claim: ClaimWithoutSig): Hex {
  assertClaimFields(claim)
  const bytes = cborEncode(toUnsignedRecord(claim))
  return keccak256(bytes)
}

/**
 * Sign a claim as an attester. Produces a `Claim` with an EIP-191
 * signature (`"\x19Ethereum Signed Message:\n32" || hash`).
 *
 * The wallet client passed in here is the **attester's** wallet — typically
 * a backend-held key, not the end user's wallet. The connected account
 * address is stamped into the claim as `att` and is also the address that
 * `verifyClaim` will recover from `sig`.
 *
 * `addr` (the wallet observed during the session) is required from the
 * caller and is NOT auto-populated — the attester observes it via SIWE
 * during the session and supplies it explicitly. Auto-populating from the
 * signer would silently turn every attestation into a self-attestation.
 *
 * If the caller pre-populates `att`, it must match the connected account
 * or this throws.
 */
export async function signClaim(
  input: SignClaimInput,
  attesterWallet: WalletClient | SignClaimWalletClient,
): Promise<Claim> {
  const account = attesterWallet.account
  if (!account) {
    throw new Error('signClaim: attesterWallet has no connected account')
  }
  const attAddr = getAddress(account.address)
  if (input.att !== undefined && getAddress(input.att) !== attAddr) {
    throw new Error(
      `signClaim: claim.att (${input.att}) does not match attester wallet (${attAddr})`,
    )
  }
  const claim: ClaimWithoutSig = { ...input, att: attAddr }
  assertClaimFields(claim)
  const hash = hashClaim(claim)
  // viem's signMessage with `message: { raw }` applies the EIP-191 prefix.
  const sig = (await attesterWallet.signMessage({
    account,
    message: { raw: hash },
  })) as Hex
  return { ...claim, sig }
}

/**
 * Verify an attester-signed claim.
 *
 * Four checks, in order:
 *   1. Version — must equal `CLAIM_VERSION`. (assertClaimFields enforces
 *      this; we surface it as `unsupported-version` rather than letting the
 *      generic decode error bubble up.)
 *   2. Expiry — `exp` must be in the future.
 *   3. Signature integrity — `ecrecover(hash, sig)` must equal `claim.att`.
 *      Because `att` is in the signed payload, tampering with any field
 *      (including `att` itself) breaks this check.
 *   4. Trusted attester — `claim.att` must appear in `options.trustedAttesters`.
 *      This is the substantive trust check: "do I accept claims signed by
 *      this attester?"
 *
 * If `options.expectedOwner` is provided, an additional staleness check
 * runs: `claim.addr` (the wallet the attester observed) must equal the
 * expected owner. Higher-level `verifyProof` resolves the current ENS
 * owner from the chain and supplies this for you.
 */
export async function verifyClaim(
  claim: Claim,
  options: VerifyClaimOptions,
): Promise<VerifyClaimResult> {
  try {
    assertClaimFields(claim)
  } catch (err) {
    if (err instanceof Error && err.message.includes('unsupported version')) {
      return { valid: false, reason: 'unsupported-version' }
    }
    throw err
  }
  if (!claim.sig) {
    return { valid: false, reason: 'bad-signature' }
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (claim.exp <= nowSeconds) {
    return { valid: false, reason: 'expired' }
  }

  let recovered: Address
  try {
    const hash = hashClaim(claim)
    recovered = await recoverMessageAddress({
      message: { raw: hash },
      signature: claim.sig,
    })
  } catch {
    return { valid: false, reason: 'bad-signature' }
  }

  if (recovered.toLowerCase() !== claim.att.toLowerCase()) {
    return { valid: false, reason: 'bad-signature', recovered }
  }

  const trustedLower = options.trustedAttesters.map((a) => a.toLowerCase())
  if (!trustedLower.includes(claim.att.toLowerCase())) {
    return { valid: false, reason: 'untrusted-attester', recovered }
  }

  if (options.expectedOwner) {
    if (claim.addr.toLowerCase() !== options.expectedOwner.toLowerCase()) {
      return { valid: false, reason: 'wrong-owner', recovered }
    }
  }
  return { valid: true, recovered }
}

// --- small local hex helpers (avoids pulling extra viem utils for 10 lines) ---

function hexToBytes(hex: Hex): Uint8Array {
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

function bytesToHex(bytes: Uint8Array): Hex {
  let out = '0x'
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0')
  }
  return out as Hex
}
