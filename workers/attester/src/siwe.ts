import { type Address, verifyMessage } from 'viem'
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe'
import type { Env } from './env'

/**
 * Verify a SIWE (EIP-4361) message + signature pair against an expected
 * nonce. Returns the recovered wallet address on success, throws otherwise.
 *
 * Three checks:
 *   1. The message parses as a valid SIWE payload.
 *   2. `validateSiweMessage` confirms the domain matches our env, the
 *      nonce matches the session-issued one, and the timestamps are sane.
 *   3. `verifyMessage` confirms the signature recovers to the address
 *      named in the SIWE message.
 *
 * viem's primitives run in Workers without any Node shims — pure crypto.
 */
export async function verifySiwe(
  env: Env,
  args: {
    message: string
    signature: `0x${string}`
    expectedNonce: string
  },
): Promise<Address> {
  const parsed = parseSiweMessage(args.message)
  if (!parsed.address) {
    throw new Error('siwe: message has no address')
  }

  const valid = validateSiweMessage({
    message: parsed,
    domain: env.SIWE_DOMAIN,
    nonce: args.expectedNonce,
  })
  if (!valid) {
    throw new Error('siwe: validation failed (domain/nonce/time mismatch)')
  }

  const recovered = await verifyMessage({
    address: parsed.address,
    message: args.message,
    signature: args.signature,
  })
  if (!recovered) {
    throw new Error('siwe: signature does not recover to the message address')
  }
  return parsed.address
}
