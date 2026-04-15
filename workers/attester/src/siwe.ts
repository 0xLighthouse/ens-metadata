import { type Address, verifyMessage } from 'viem'
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe'
import type { Env } from './env'

/**
 * Verify a SIWE (EIP-4361) message + signature pair against an expected
 * nonce. Returns the recovered wallet address on success, throws otherwise.
 *
 * Three checks:
 *   1. The message parses as a valid SIWE payload.
 *   2. The parsed `domain` field is in the SIWE_DOMAIN allowlist (a comma-
 *      separated env var so localhost and a tunnel like ngrok or
 *      cloudflared can both be valid at once without picking one).
 *   3. `validateSiweMessage` confirms the nonce matches the session-issued
 *      one and timestamps are sane, then `verifyMessage` confirms the
 *      signature recovers to the address named in the SIWE message.
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

  const allowedDomains = env.SIWE_DOMAIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!parsed.domain || !allowedDomains.includes(parsed.domain)) {
    throw new Error(
      `siwe: domain "${parsed.domain ?? ''}" not in allowed list (${allowedDomains.join(', ')})`,
    )
  }

  const valid = validateSiweMessage({
    message: parsed,
    domain: parsed.domain,
    nonce: args.expectedNonce,
  })
  if (!valid) {
    throw new Error('siwe: validation failed (nonce/time mismatch)')
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
