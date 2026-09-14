import { ATTESTER_ADDRESS } from '@/lib/constants'
import { decodeEnvelope, handleAttestationRecordKey, verifyHandleClaim } from '@ensmetadata/sdk'
import { DEFAULT_ATTESTER_ENS } from '@ensmetadata/sdk'
import { type Address, type Hex, hexToBytes } from 'viem'

/**
 * Whether `records` carry a valid attestation from the trusted attester for `handle` on
 * `platform`. The record `attestations[<platform>][<attester>]` holds a hex CBOR envelope
 * signed over `{ platform, handle, name, addr }`; it counts only when the signature recovers
 * to `ATTESTER_ADDRESS`. Any decode or verification failure reads as unattested.
 *
 * Shared by the server (rcrds.xyz rows) and the client (live reads in the editor).
 */
export async function isHandleAttested(args: {
  platform: string
  handle: string
  ensName: string
  owner: Address
  records: Record<string, string | null | undefined>
}): Promise<boolean> {
  const envelopeHex = args.records[handleAttestationRecordKey(args.platform, DEFAULT_ATTESTER_ENS)]
  if (!envelopeHex) return false
  try {
    const envelope = decodeEnvelope(hexToBytes(envelopeHex as Hex))
    const result = await verifyHandleClaim(envelope, {
      trustedAttester: ATTESTER_ADDRESS,
      owner: args.owner,
      name: args.ensName,
      platform: args.platform,
      handle: args.handle,
    })
    return result.valid
  } catch {
    return false
  }
}
