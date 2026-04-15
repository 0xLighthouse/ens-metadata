import { http, createWalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import type { Env } from './env'

/**
 * Build a viem wallet client from the ATTESTER_PRIVATE_KEY secret.
 *
 * No caching — Workers may dispatch requests across isolates, so a
 * module-level singleton would be wrong. Constructing a wallet client is
 * cheap (no network, no key derivation work).
 *
 * Production should swap `privateKeyToAccount` for a remote signer
 * (Cloudflare KV-encrypted key, KMS-backed signer, etc.). The viem
 * `WalletClient` interface stays the same, so callers don't change.
 */
export function attesterWallet(env: Env) {
  const pk = env.ATTESTER_PRIVATE_KEY as `0x${string}`
  if (!pk || !pk.startsWith('0x')) {
    throw new Error('attester: ATTESTER_PRIVATE_KEY is missing or malformed')
  }
  const account = privateKeyToAccount(pk)
  return createWalletClient({
    account,
    chain: mainnet,
    // Transport is unused — we only sign messages, never broadcast.
    transport: http('http://127.0.0.1:1/unused'),
  })
}
