import { encode as dagCborEncode } from '@ipld/dag-cbor'
import { Tagged, decode as cborgDecode, encode as cborgEncode } from 'cborg'
import type { Address, Hex } from 'viem'
import { bytesToHex, hexToBytes, isAddress, keccak256, recoverMessageAddress } from 'viem'
import type {
  Envelope,
  HandlePayloadFields,
  SignClaimWalletClient,
  SignHandleClaimInput,
  SignUidClaimInput,
  UidPayloadFields,
  VerifyClaimResult,
  VerifyHandleClaimOptions,
  VerifyUidClaimOptions,
} from './attestation-types'

/** Current claim schema version. */
export const CLAIM_VERSION = 2

/**
 * CBOR tag for envelopes: "atst" as big-endian uint32.
 * Bytes: 0x61 0x74 0x73 0x74 → decimal 1635021684.
 *
 * Detection: the first byte of the encoded envelope is 0xDA (CBOR major
 * type 6 / tag, 4-byte additional info).
 */
export const ENVELOPE_TAG = 1635021684

// --- Payload assertion ---

function assertString(val: unknown, key: string): asserts val is string {
  if (typeof val !== 'string' || val.length === 0) {
    throw new Error(`claim: "${key}" must be a non-empty string`)
  }
}

function assertTimestamp(val: unknown): asserts val is number {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
    throw new Error('claim: "issuedAt" must be a non-negative integer')
  }
}

function assertAddress(val: unknown): asserts val is Address {
  if (typeof val !== 'string' || !isAddress(val)) {
    throw new Error('claim: "addr" must be a valid 0x-prefixed address')
  }
}

function assertHandleFields(
  fields: Partial<HandlePayloadFields>,
): asserts fields is HandlePayloadFields {
  assertString(fields.platform, 'platform')
  assertString(fields.handle, 'handle')
  assertString(fields.name, 'name')
  assertTimestamp(fields.issuedAt)
  assertAddress(fields.addr)
}

function assertUidFields(fields: Partial<UidPayloadFields>): asserts fields is UidPayloadFields {
  assertString(fields.platform, 'platform')
  assertString(fields.uid, 'uid')
  assertString(fields.name, 'name')
  assertTimestamp(fields.issuedAt)
  assertAddress(fields.addr)
}

// --- Payload encoding ---

/**
 * Encode a handle payload as canonical DAG-CBOR bytes.
 * Map keys: n (name), a (addr), p (platform), h (handle), t (issuedAt).
 */
export function encodeHandlePayload(fields: HandlePayloadFields): Uint8Array {
  assertHandleFields(fields)
  return dagCborEncode({
    n: fields.name,
    a: hexToBytes(fields.addr),
    p: fields.platform,
    h: fields.handle,
    t: fields.issuedAt,
  })
}

/**
 * Encode a uid payload as canonical DAG-CBOR bytes.
 * Map keys: n (name), a (addr), p (platform), u (uid), t (issuedAt).
 */
export function encodeUidPayload(fields: UidPayloadFields): Uint8Array {
  assertUidFields(fields)
  return dagCborEncode({
    n: fields.name,
    a: hexToBytes(fields.addr),
    p: fields.platform,
    u: fields.uid,
    t: fields.issuedAt,
  })
}

// --- Envelope encoding ---

/**
 * Encode a v2 envelope as tagged CBOR bytes. On the wire it's a 3-element
 * array: [version=2, issuedAt, sig(65)].
 */
export function encodeEnvelope(envelope: Envelope): Uint8Array {
  const arr = [envelope.version, envelope.issuedAt, hexToBytes(envelope.sig)]
  return cborgEncode(new Tagged(ENVELOPE_TAG, arr), { float64: true })
}

/**
 * Decode tagged CBOR bytes into a v2 Envelope. Requires the `atst` tag
 * prefix (0xDA 0x61 0x74 0x73 0x74) and version=2; otherwise throws so
 * unrelated envelope variants can't silently verify.
 */
export function decodeEnvelope(bytes: Uint8Array): Envelope {
  if (bytes.length < 5 || bytes[0] !== 0xda) {
    throw new Error('claim: envelope missing CBOR tag prefix')
  }
  const decoded = cborgDecode(bytes, {
    // biome-ignore lint/suspicious/noExplicitAny: cborg's TagDecodeControl type isn't exported
    tags: { [ENVELOPE_TAG]: (decode: any) => decode() },
  })
  if (!Array.isArray(decoded) || decoded.length !== 3) {
    throw new Error('claim: decoded envelope is not a 3-element array')
  }

  const [version, issuedAt, sigBytes] = decoded

  if (typeof version !== 'number' || version !== CLAIM_VERSION) {
    throw new Error(`claim: unsupported envelope version ${version}`)
  }
  if (typeof issuedAt !== 'number' || !Number.isInteger(issuedAt) || issuedAt < 0) {
    throw new Error('claim: envelope element 1 (issuedAt) must be a non-negative integer')
  }
  if (!(sigBytes instanceof Uint8Array) || sigBytes.length !== 65) {
    throw new Error('claim: envelope element 2 (sig) must be 65 bytes')
  }

  return {
    version,
    issuedAt,
    sig: bytesToHex(sigBytes),
  }
}

// --- Sign ---

async function signPayload(payload: Uint8Array, wallet: SignClaimWalletClient): Promise<Hex> {
  const account = wallet.account
  if (!account) throw new Error('signClaim: attesterWallet has no connected account')
  const hash = keccak256(payload)
  return (await wallet.signMessage({ account, message: { raw: hash } })) as Hex
}

/**
 * Sign a handle claim as an attester, producing a v2 envelope.
 * `issuedAt` is auto-computed (current unix seconds).
 */
export async function signHandleClaim(
  input: SignHandleClaimInput,
  attesterWallet: SignClaimWalletClient,
): Promise<Envelope> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = encodeHandlePayload({
    platform: input.platform,
    handle: input.handle,
    name: input.name,
    issuedAt,
    addr: input.addr,
  })
  const sig = await signPayload(payload, attesterWallet)
  return { version: CLAIM_VERSION, issuedAt, sig }
}

/**
 * Sign a uid claim as an attester, producing a v2 envelope.
 * `issuedAt` is auto-computed (current unix seconds).
 */
export async function signUidClaim(
  input: SignUidClaimInput,
  attesterWallet: SignClaimWalletClient,
): Promise<Envelope> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = encodeUidPayload({
    platform: input.platform,
    uid: input.uid,
    name: input.name,
    issuedAt,
    addr: input.addr,
  })
  const sig = await signPayload(payload, attesterWallet)
  return { version: CLAIM_VERSION, issuedAt, sig }
}

// --- Verify ---

function checkMaxAge(issuedAt: number, maxAge: number | undefined): boolean {
  if (maxAge === undefined) return true
  const now = Math.floor(Date.now() / 1000)
  return now - issuedAt <= maxAge
}

async function recoverAndCheck(
  payload: Uint8Array,
  sig: Hex,
  expectedAttester: Address,
): Promise<VerifyClaimResult> {
  let recovered: Address
  try {
    const hash = keccak256(payload)
    recovered = await recoverMessageAddress({ message: { raw: hash }, signature: sig })
  } catch {
    return { valid: false, reason: 'bad-signature' }
  }
  if (recovered.toLowerCase() !== expectedAttester.toLowerCase()) {
    return { valid: false, reason: 'bad-signature', recovered }
  }
  return { valid: true, recovered }
}

/**
 * Verify a v2 handle claim. The caller supplies everything needed to
 * reconstruct the signed payload (name, platform, handle, owner). Any
 * reconstruction mismatch (wrong owner, wrong handle, etc.) or wrong
 * attester surfaces as `bad-signature` with `recovered` for debugging.
 */
export async function verifyHandleClaim(
  envelope: Envelope,
  options: VerifyHandleClaimOptions,
): Promise<VerifyClaimResult> {
  if (envelope.version !== CLAIM_VERSION) {
    return { valid: false, reason: 'unsupported-version' }
  }
  if (!checkMaxAge(envelope.issuedAt, options.maxAge)) {
    return { valid: false, reason: 'stale' }
  }

  let payload: Uint8Array
  try {
    payload = encodeHandlePayload({
      platform: options.platform,
      handle: options.handle,
      name: options.name,
      issuedAt: envelope.issuedAt,
      addr: options.owner,
    })
  } catch {
    return { valid: false, reason: 'decode-error' }
  }

  return recoverAndCheck(payload, envelope.sig, options.trustedAttester)
}

/**
 * Verify a v2 uid claim. Same shape as verifyHandleClaim but reconstructs
 * the payload using the raw uid; a wrong uid surfaces as `bad-signature`.
 */
export async function verifyUidClaim(
  envelope: Envelope,
  options: VerifyUidClaimOptions,
): Promise<VerifyClaimResult> {
  if (envelope.version !== CLAIM_VERSION) {
    return { valid: false, reason: 'unsupported-version' }
  }
  if (!checkMaxAge(envelope.issuedAt, options.maxAge)) {
    return { valid: false, reason: 'stale' }
  }

  let payload: Uint8Array
  try {
    payload = encodeUidPayload({
      platform: options.platform,
      uid: options.uid,
      name: options.name,
      issuedAt: envelope.issuedAt,
      addr: options.owner,
    })
  } catch {
    return { valid: false, reason: 'decode-error' }
  }

  return recoverAndCheck(payload, envelope.sig, options.trustedAttester)
}
