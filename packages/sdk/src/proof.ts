import { decode as cborDecode, encode as cborEncode } from '@ipld/dag-cbor'
import type { Address, Hex, WalletClient } from 'viem'
import { keccak256, recoverMessageAddress } from 'viem'
import type {
  Claim,
  ClaimFields,
  ClaimWithoutSig,
  SignClaimWalletClient,
  VerifyClaimResult,
} from './proof-types'

/**
 * Strict ordered list of claim field names. Used only for runtime validation
 * and readable error messages — dag-cbor sorts map keys itself per
 * RFC 8949 Core Deterministic Encoding, so this list does NOT influence
 * the on-the-wire byte layout.
 */
const CLAIM_FIELDS = ['v', 'p', 'h', 'uid', 'exp', 'prf', 'name', 'chainId'] as const

function assertClaimFields(fields: Partial<ClaimFields>): asserts fields is ClaimFields {
  for (const key of CLAIM_FIELDS) {
    if (fields[key] === undefined || fields[key] === null) {
      throw new Error(`claim: missing required field "${key}"`)
    }
  }
  if (typeof fields.v !== 'number' || !Number.isInteger(fields.v) || fields.v < 0) {
    throw new Error('claim: "v" must be a non-negative integer')
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
 * Sign an unsigned claim with a viem wallet client. Produces a `Claim`
 * with an EIP-191 signature (`"\x19Ethereum Signed Message:\n32" || hash`).
 *
 * The wallet client's connected account is used as the signer. Callers must
 * ensure that this account is (or will be) the ENS owner of `claim.name` —
 * verification will reject signatures from any other address.
 */
export async function signClaim(
  claim: ClaimWithoutSig,
  walletClient: WalletClient | SignClaimWalletClient,
): Promise<Claim> {
  assertClaimFields(claim)
  const account = walletClient.account
  if (!account) {
    throw new Error('signClaim: walletClient has no connected account')
  }
  const hash = hashClaim(claim)
  // viem's signMessage with `message: { raw }` applies the EIP-191 prefix.
  const sig = (await walletClient.signMessage({
    account,
    message: { raw: hash },
  })) as Hex
  return { ...claim, sig }
}

/**
 * Verify a signed claim against an expected owner address.
 *
 * Re-encodes the claim without `sig`, re-hashes, and recovers the signing
 * address via EIP-191 ecrecover. Returns `{ valid: true }` iff the recovered
 * address case-insensitively matches `expectedOwner`. Also checks expiry.
 */
export async function verifyClaim(
  claim: Claim,
  expectedOwner: Address,
): Promise<VerifyClaimResult> {
  assertClaimFields(claim)
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

  if (recovered.toLowerCase() !== expectedOwner.toLowerCase()) {
    return { valid: false, reason: 'wrong-owner', recovered }
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
