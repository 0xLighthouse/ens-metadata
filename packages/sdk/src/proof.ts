import { decode as dagCborDecode, encode as dagCborEncode } from '@ipld/dag-cbor'
import { Tagged, decode as cborgDecode, encode as cborgEncode } from 'cborg'
import type { Address, Hex } from 'viem'
import {
  bytesToHex,
  getAddress,
  hexToBytes,
  isAddress,
  isHex,
  keccak256,
  recoverMessageAddress,
} from 'viem'
import type {
  Envelope,
  PayloadFields,
  SignClaimInput,
  SignClaimWalletClient,
  VerifyClaimOptions,
  VerifyClaimResult,
} from './proof-types'

/** Current claim schema version. */
export const CLAIM_VERSION = 1

/**
 * CBOR tag for envelopes: "atst" as big-endian uint32.
 * Bytes: 0x61 0x74 0x73 0x74 → decimal 1635021684.
 *
 * Detection: the first byte of the encoded envelope is 0xDA (CBOR major
 * type 6 / tag, 4-byte additional info).
 */
export const ENVELOPE_TAG = 1635021684

const PAYLOAD_FIELD_NAMES = ['platform', 'handle', 'uid', 'name', 'issuedAt', 'addr'] as const

function assertPayloadFields(fields: Partial<PayloadFields>): asserts fields is PayloadFields {
  for (const key of PAYLOAD_FIELD_NAMES) {
    if (fields[key] === undefined || fields[key] === null) {
      throw new Error(`claim: missing required payload field "${key}"`)
    }
  }
  for (const key of ['platform', 'handle', 'name'] as const) {
    if (typeof fields[key] !== 'string' || fields[key].length === 0) {
      throw new Error(`claim: "${key}" must be a non-empty string`)
    }
  }
  if (
    typeof fields.uid !== 'string' ||
    !isHex(fields.uid) ||
    hexToBytes(fields.uid).length !== 65
  ) {
    throw new Error('claim: "uid" must be a 65-byte hex string (blinded uid signature)')
  }
  if (
    typeof fields.issuedAt !== 'number' ||
    !Number.isInteger(fields.issuedAt) ||
    fields.issuedAt < 0
  ) {
    throw new Error('claim: "issuedAt" must be a non-negative integer')
  }
  if (typeof fields.addr !== 'string' || !isAddress(fields.addr)) {
    throw new Error('claim: "addr" must be a valid 0x-prefixed address')
  }
}

// --- Encode / Decode ---

/**
 * Encode the inner signed payload as canonical dag-cbor bytes.
 * Maps readable TS field names to single-char CBOR keys and converts
 * binary values from hex strings to raw bytes.
 */
export function encodePayload(fields: PayloadFields): Uint8Array {
  assertPayloadFields(fields)
  return dagCborEncode({
    p: fields.platform,
    h: fields.handle,
    u: hexToBytes(fields.uid),
    n: fields.name,
    t: fields.issuedAt,
    a: hexToBytes(fields.addr),
  })
}

/**
 * Decode inner payload bytes back to typed fields.
 * Maps single-char CBOR keys back to readable TS names and converts
 * raw bytes back to hex strings.
 */
export function decodePayload(bytes: Uint8Array): PayloadFields {
  const decoded = dagCborDecode(bytes) as Record<string, unknown>
  const u = decoded.u
  const a = decoded.a
  if (!(u instanceof Uint8Array) || u.length !== 65) {
    throw new Error('claim: payload "u" must be 65 bytes')
  }
  if (!(a instanceof Uint8Array) || a.length !== 20) {
    throw new Error('claim: payload "a" (addr) must be 20 bytes')
  }
  const partial: Partial<PayloadFields> = {
    platform: decoded.p as string,
    handle: decoded.h as string,
    uid: bytesToHex(u),
    name: decoded.n as string,
    issuedAt: decoded.t as number,
    addr: getAddress(bytesToHex(a)),
  }
  assertPayloadFields(partial)
  return partial
}

/**
 * Encode a full v1 envelope as tagged CBOR bytes, ready to write to an
 * ENS text record as hex. On the wire the envelope is a 4-element array:
 * [version, payload, attester (20 bytes), sig (65 bytes)].
 */
export function encodeEnvelope(envelope: Envelope): Uint8Array {
  const arr = [
    envelope.version,
    envelope.payload,
    hexToBytes(envelope.attester),
    hexToBytes(envelope.sig),
  ]
  return cborgEncode(new Tagged(ENVELOPE_TAG, arr), { float64: true })
}

/**
 * Decode tagged CBOR bytes into a v1 Envelope. Expects the `atst` tag
 * (0xDA 0x61 0x74 0x73 0x74) followed by a 4-element array
 * [version, payload, attester, sig]. The tag prefix is enforced so future
 * envelope variants can't be silently accepted as v1.
 */
export function decodeEnvelope(bytes: Uint8Array): Envelope {
  if (bytes.length < 5 || bytes[0] !== 0xda) {
    throw new Error('claim: envelope missing CBOR tag prefix')
  }
  const decoded = cborgDecode(bytes, {
    // biome-ignore lint/suspicious/noExplicitAny: cborg's TagDecodeControl type isn't exported
    tags: { [ENVELOPE_TAG]: (decode: any) => decode() },
  })
  if (!Array.isArray(decoded) || decoded.length !== 4) {
    throw new Error('claim: decoded envelope is not a 4-element array')
  }

  const [version, payload, attesterBytes, sigBytes] = decoded

  if (typeof version !== 'number' || version !== CLAIM_VERSION) {
    throw new Error(`claim: unsupported envelope version ${version}`)
  }
  if (!(payload instanceof Uint8Array)) {
    throw new Error('claim: envelope element 1 (payload) must be bytes')
  }
  if (!(attesterBytes instanceof Uint8Array) || attesterBytes.length !== 20) {
    throw new Error('claim: envelope element 2 (attester) must be 20 bytes')
  }
  if (!(sigBytes instanceof Uint8Array) || sigBytes.length !== 65) {
    throw new Error('claim: envelope element 3 (sig) must be 65 bytes')
  }

  return {
    version,
    payload,
    attester: getAddress(bytesToHex(attesterBytes)),
    sig: bytesToHex(sigBytes),
  }
}

// --- Sign / Verify ---

/**
 * Sign a claim as an attester, producing a v1 envelope. The inner payload
 * is encoded as canonical dag-cbor and signed with EIP-191.
 *
 * `issuedAt` is auto-computed (current unix time).
 * `attester` is auto-populated from the wallet's connected account.
 */
export async function signClaim(
  input: SignClaimInput,
  attesterWallet: SignClaimWalletClient,
): Promise<Envelope> {
  const account = attesterWallet.account
  if (!account) {
    throw new Error('signClaim: attesterWallet has no connected account')
  }
  const attAddr = getAddress(account.address)

  const payloadFields: PayloadFields = {
    platform: input.platform,
    handle: input.handle,
    uid: input.uid,
    name: input.name,
    issuedAt: Math.floor(Date.now() / 1000),
    addr: input.addr,
  }

  const payloadBytes = encodePayload(payloadFields)
  const hash = keccak256(payloadBytes)
  const sig = (await attesterWallet.signMessage({
    account,
    message: { raw: hash },
  })) as Hex

  return {
    version: CLAIM_VERSION,
    payload: payloadBytes,
    attester: attAddr,
    sig,
  }
}

/**
 * Verify a v1 envelope. Decodes the inner payload, checks optional
 * freshness (maxAge against issuedAt), signature integrity, trust, and
 * optional owner match.
 */
export async function verifyClaim(
  envelope: Envelope,
  options: VerifyClaimOptions,
): Promise<VerifyClaimResult> {
  let inner: PayloadFields
  try {
    inner = decodePayload(envelope.payload)
  } catch (err) {
    if (err instanceof Error && err.message.includes('unsupported version')) {
      return { valid: false, reason: 'unsupported-version' }
    }
    return { valid: false, reason: 'decode-error' }
  }

  if (!envelope.sig) {
    return { valid: false, reason: 'bad-signature' }
  }

  if (options.maxAge !== undefined) {
    const nowSeconds = Math.floor(Date.now() / 1000)
    if (nowSeconds - inner.issuedAt > options.maxAge) {
      return { valid: false, reason: 'stale' }
    }
  }

  let recovered: Address
  try {
    const hash = keccak256(envelope.payload)
    recovered = await recoverMessageAddress({
      message: { raw: hash },
      signature: envelope.sig,
    })
  } catch {
    return { valid: false, reason: 'bad-signature' }
  }

  if (recovered.toLowerCase() !== envelope.attester.toLowerCase()) {
    return { valid: false, reason: 'bad-signature', recovered }
  }

  const trustedLower = options.trustedAttesters.map((a) => a.toLowerCase())
  if (!trustedLower.includes(envelope.attester.toLowerCase())) {
    return { valid: false, reason: 'untrusted-attester', recovered }
  }

  if (options.expectedOwner) {
    if (inner.addr.toLowerCase() !== options.expectedOwner.toLowerCase()) {
      return { valid: false, reason: 'wrong-owner', recovered }
    }
  }
  return { valid: true, recovered }
}
