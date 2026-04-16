import type { Hex, WalletClient } from 'viem'
import { keccak256, toBytes } from 'viem'

/**
 * Blind a platform uid by signing its hash with the attester's key.
 *
 * Construction: `personalSign(keccak256("platform:uid"), attesterKey)`
 *
 * The output is a 65-byte EIP-191 signature (0x-prefixed hex). The
 * consumer verifies by computing the same hash from the raw uid they
 * know, then calling `ecrecover(hash, uid)` and checking the recovered
 * address equals `claim.att` (the attester's public key, which is already
 * in the signed payload).
 *
 * Properties:
 *   - NOT brute-forceable: producing a valid signature requires the
 *     attester's private key, regardless of how small the uid space is
 *   - Verifiable locally: the consumer does ecrecover + address compare,
 *     no network call, no attester dependency at verify time
 *   - Deterministic: RFC 6979 makes EIP-191 signatures deterministic for
 *     a given key + message, so the same attester + platform + uid always
 *     produces the same blinded value
 */
export async function blindUid(
  platform: string,
  uid: string,
  wallet: WalletClient,
): Promise<Hex> {
  const account = wallet.account
  if (!account) throw new Error('blindUid: wallet has no connected account')
  const hash = keccak256(toBytes(`${platform}:${uid}`))
  const sig = await wallet.signMessage({ account, message: { raw: hash } })
  return sig as Hex
}
