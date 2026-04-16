import { keccak256, toBytes } from 'viem'

/**
 * Deterministic one-way blinding of a platform uid. The output is
 * `keccak256("platform:rawUid")` — a 0x-prefixed 66-char hex string.
 *
 * Both the attester (at sign time) and the consumer (at verify time)
 * compute the same hash from the same inputs. The consumer already knows
 * the raw uid from chat context and can verify locally — no network call
 * to the attester, no key management, no /api/blind endpoint.
 *
 * The trade-off: an observer who reads the on-chain claim can brute-force
 * the uid space (Telegram ids are ~10B sequential integers, seconds on a
 * GPU). This is accepted — the blinding prevents casual observation and
 * bulk indexing, not targeted deanonymisation.
 */
export function blindUid(platform: string, uid: string): string {
  return keccak256(toBytes(`${platform}:${uid}`))
}
