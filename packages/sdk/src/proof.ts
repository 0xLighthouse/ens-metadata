import { decode as dagCborDecode, encode as dagCborEncode } from '@ipld/dag-cbor'
import { Tagged, decode as cborgDecode, encode as cborgEncode } from 'cborg'
import type { Address, Hex, WalletClient } from 'viem'
import {
  bytesToHex,
  getAddress,
  hexToBytes,
  isAddress,
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
export const CLAIM_VERSION = 3

/**
 * CBOR tag for v3 envelopes: "ensprf" as big-endian uint48.
 * Bytes: 0x65 0x6E 0x73 0x70 0x72 0x66 → decimal 111525057557094.
 *
 * Detection: the first byte of the encoded envelope is 0xDB (CBOR major
 * type 6 / tag, 8-byte additional info).
 */
export const ENVELOPE_TAG = 111525057557094

const PAYLOAD_FIELDS = ['v', 'p', 'uid', 'name', 'chainId', 'addr', 'att', 'exp', 'prf'] as const

function assertPayloadFields(fields: Partial<PayloadFields>): asserts fields is PayloadFields {
  for (const key of PAYLOAD_FIELDS) {
    if (fields[key] === undefined || fields[key] === null) {
      throw new Error(`claim: missing required payload field "${key}"`)
    }
  }
  if (typeof fields.v !== 'number' || fields.v !== CLAIM_VERSION) {
    throw new Error(`claim: unsupported version ${fields.v} (expected ${CLAIM_VERSION})`)
  }
  if (typeof fields.exp !== 'number' || !Number.isInteger(fields.exp) || fields.exp < 0) {
    throw new Error('claim: "exp" must be a non-negative integer')
  }
  if (typeof fields.chainId !== 'number' || !Number.isInteger(fields.chainId) || fields.chainId < 0) {
    throw new Error('claim: "chainId" must be a non-negative integer')
  }
  for (const key of ['p', 'uid', 'prf', 'name'] as const) {
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

function toPayloadRecord(fields: PayloadFields): Record<string, unknown> {
  return {
    v: fields.v,
    p: fields.p,
    uid: fields.uid,
    name: fields.name,
    chainId: fields.chainId,
    addr: fields.addr,
    att: fields.att,
    exp: fields.exp,
    prf: fields.prf,
  }
}

// --- Encode / Decode ---

/**
 * Encode the inner signed payload as canonical dag-cbor bytes.
 * The output is what gets hashed + signed.
 */
export function encodePayload(fields: PayloadFields): Uint8Array {
  assertPayloadFields(fields)
  return dagCborEncode(toPayloadRecord(fields))
}

/**
 * Decode inner payload bytes back to typed fields.
 */
export function decodePayload(bytes: Uint8Array): PayloadFields {
  const decoded = dagCborDecode(bytes) as Record<string, unknown>
  const partial: Partial<PayloadFields> = {
    v: decoded.v as number,
    p: decoded.p as string,
    uid: decoded.uid as string,
    name: decoded.name as string,
    chainId: decoded.chainId as number,
    addr: decoded.addr as Address,
    att: decoded.att as Address,
    exp: decoded.exp as number,
    prf: decoded.prf as string,
  }
  assertPayloadFields(partial)
  return partial
}

/**
 * Encode a full v3 envelope as tagged CBOR bytes, ready to write to an
 * ENS text record as hex.
 */
export function encodeEnvelope(envelope: Envelope): Uint8Array {
  const map: Record<string, unknown> = {
    v: envelope.v,
    p: envelope.p,
    h: envelope.h,
    method: envelope.method,
    issuedAt: envelope.issuedAt,
    payload: envelope.payload,
    sig: hexToBytes(envelope.sig),
  }
  return cborgEncode(new Tagged(ENVELOPE_TAG, map), { float64: true })
}

/**
 * Decode tagged CBOR bytes into a v3 Envelope. Throws if the tag doesn't
 * match or required fields are missing.
 */
export function decodeEnvelope(bytes: Uint8Array): Envelope {
  // cborg v5 tag decoders receive a callable control — call it to decode
  // the tagged content. The control also has an .entries() for maps, but
  // we just want the full decoded value.
  // biome-ignore lint/suspicious/noExplicitAny: cborg's TagDecodeControl type isn't exported
  const decoded = cborgDecode(bytes, {
    tags: { [ENVELOPE_TAG]: (decode: any) => decode() },
  })
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('claim: decoded envelope is not a map')
  }
  const map = decoded as Record<string, unknown>

  if (typeof map.v !== 'number' || map.v !== CLAIM_VERSION) {
    throw new Error(`claim: unsupported envelope version ${map.v}`)
  }
  for (const key of ['p', 'h', 'method'] as const) {
    if (typeof map[key] !== 'string') {
      throw new Error(`claim: envelope missing or invalid "${key}"`)
    }
  }
  if (typeof map.issuedAt !== 'number') {
    throw new Error('claim: envelope missing "issuedAt"')
  }
  if (!(map.payload instanceof Uint8Array)) {
    throw new Error('claim: envelope "payload" must be bytes')
  }
  const sigBytes = map.sig
  if (!(sigBytes instanceof Uint8Array) || sigBytes.length !== 65) {
    throw new Error('claim: envelope "sig" must be 65 bytes')
  }

  return {
    v: map.v as number,
    p: map.p as string,
    h: map.h as string,
    method: map.method as string,
    issuedAt: map.issuedAt as number,
    payload: map.payload as Uint8Array,
    sig: bytesToHex(sigBytes),
  }
}

// --- Sign / Verify ---

/**
 * Sign a claim as an attester, producing a v3 envelope. The inner payload
 * is encoded as canonical dag-cbor and signed with EIP-191. The unsigned
 * metadata (h, method, issuedAt) is attached to the outer envelope.
 *
 * `att` is auto-populated from the attester wallet's connected account.
 */
export async function signClaim(
  input: SignClaimInput,
  attesterWallet: WalletClient | SignClaimWalletClient,
): Promise<Envelope> {
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

  const payloadFields: PayloadFields = {
    v: CLAIM_VERSION,
    p: input.p,
    uid: input.uid,
    name: input.name,
    chainId: input.chainId,
    addr: input.addr,
    att: attAddr,
    exp: input.exp,
    prf: input.prf,
  }

  const payloadBytes = encodePayload(payloadFields)
  const hash = keccak256(payloadBytes)
  const sig = (await attesterWallet.signMessage({
    account,
    message: { raw: hash },
  })) as Hex

  return {
    v: CLAIM_VERSION,
    p: input.p,
    h: input.h,
    method: input.method,
    issuedAt: input.issuedAt,
    payload: payloadBytes,
    sig,
  }
}

/**
 * Verify a v3 envelope. Decodes the inner payload, checks expiry,
 * signature integrity, trust, and optional staleness.
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

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (inner.exp <= nowSeconds) {
    return { valid: false, reason: 'expired' }
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

  if (recovered.toLowerCase() !== inner.att.toLowerCase()) {
    return { valid: false, reason: 'bad-signature', recovered }
  }

  const trustedLower = options.trustedAttesters.map((a) => a.toLowerCase())
  if (!trustedLower.includes(inner.att.toLowerCase())) {
    return { valid: false, reason: 'untrusted-attester', recovered }
  }

  if (options.expectedOwner) {
    if (inner.addr.toLowerCase() !== options.expectedOwner.toLowerCase()) {
      return { valid: false, reason: 'wrong-owner', recovered }
    }
  }
  return { valid: true, recovered }
}
