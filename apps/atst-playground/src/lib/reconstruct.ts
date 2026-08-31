/**
 * Pure payload reconstruction, shared by the inspector and the signer.
 * No chain reads: every field is supplied by the caller, which is what
 * makes the inspector useful — change one and watch recovery diverge.
 */
import {
  type Envelope,
  decodeEnvelope,
  encodeHandlePayload,
  encodeUidPayload,
} from '@ensmetadata/sdk'
import {
  type Address,
  type Hex,
  bytesToHex,
  hexToBytes,
  keccak256,
  recoverMessageAddress,
} from 'viem'

export type ClaimMode = 'handle' | 'uid'

export interface PayloadFields {
  mode: ClaimMode
  name: string
  addr: string
  platform: string
  /** The handle in handle mode, the uid in uid mode. */
  identifier: string
  issuedAt: number
}

export interface Reconstruction {
  payloadHex: Hex
  digest: Hex
  recovered: Address
}

export function encodePayload(fields: PayloadFields): Uint8Array {
  const common = {
    name: fields.name,
    addr: fields.addr as Address,
    platform: fields.platform,
    issuedAt: fields.issuedAt,
  }
  return fields.mode === 'handle'
    ? encodeHandlePayload({ ...common, handle: fields.identifier })
    : encodeUidPayload({ ...common, uid: fields.identifier })
}

/** Decode an envelope from its on-chain hex form. Throws with the SDK's message. */
export function decodeEnvelopeHex(hex: string): Envelope {
  return decodeEnvelope(hexToBytes(hex.trim() as Hex))
}

/**
 * Reconstruct the payload from `fields`, hash it, and recover the signer of
 * `sig`. Any field that differs from what was signed yields an unrelated
 * address rather than an error — that is the failure mode Section 8 describes.
 */
export async function reconstruct(fields: PayloadFields, sig: Hex): Promise<Reconstruction> {
  const payload = encodePayload(fields)
  const digest = keccak256(payload)
  const recovered = await recoverMessageAddress({ message: { raw: digest }, signature: sig })
  return { payloadHex: bytesToHex(payload), digest, recovered }
}
