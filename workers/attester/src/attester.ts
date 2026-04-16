import { ApiKeyStamper } from '@turnkey/api-key-stamper'
import { TurnkeyClient } from '@turnkey/http'
import { createAccount } from '@turnkey/viem'
import { http, type WalletClient, createWalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import type { Env } from './env'

function isTurnkeyConfigured(env: Env): boolean {
  return !!(
    env.TURNKEY_API_PUBLIC_KEY &&
    env.TURNKEY_API_PRIVATE_KEY &&
    env.TURNKEY_ORGANIZATION_ID &&
    env.TURNKEY_PRIVATE_KEY_ID
  )
}

function isLocalKeyConfigured(env: Env): boolean {
  return !!env.ATTESTER_PRIVATE_KEY?.startsWith('0x')
}

// Module-scoped cache: @turnkey/viem's createAccount issues a getPrivateKey
// HTTP call to resolve the ETH address when `signWith` is a UUID, so every
// uncached attesterWallet() call costs a Turnkey round-trip. Env is static
// per isolate lifetime, so keying on the signer identifier is safe.
let cachedWallet: Promise<WalletClient> | null = null
let cachedKey: string | null = null

async function buildWallet(env: Env): Promise<WalletClient> {
  if (isTurnkeyConfigured(env)) {
    const stamper = new ApiKeyStamper({
      apiPublicKey: env.TURNKEY_API_PUBLIC_KEY!,
      apiPrivateKey: env.TURNKEY_API_PRIVATE_KEY!,
      runtimeOverride: 'browser',
    })
    const client = new TurnkeyClient(
      { baseUrl: 'https://api.turnkey.com' },
      stamper,
    )
    const account = await createAccount({
      client,
      organizationId: env.TURNKEY_ORGANIZATION_ID!,
      signWith: env.TURNKEY_PRIVATE_KEY_ID!,
    })
    return createWalletClient({
      account,
      chain: mainnet,
      transport: http('http://127.0.0.1:1/unused'),
    })
  }

  if (isLocalKeyConfigured(env)) {
    const account = privateKeyToAccount(env.ATTESTER_PRIVATE_KEY as `0x${string}`)
    return createWalletClient({
      account,
      chain: mainnet,
      transport: http('http://127.0.0.1:1/unused'),
    })
  }

  throw new Error('attester: no signing key configured (set TURNKEY_* or ATTESTER_PRIVATE_KEY)')
}

/**
 * Build (or reuse) a viem wallet client for the attester.
 *
 * Two modes:
 *   1. Turnkey (prod): key lives in Turnkey's secure enclave, signing
 *      happens via API. Set TURNKEY_* env vars.
 *   2. Local key (dev): raw private key in ATTESTER_PRIVATE_KEY.
 *
 * Turnkey is preferred when both are configured. Result is memoized so
 * Turnkey's one-time address-resolution round-trip doesn't repeat per
 * request.
 */
export function attesterWallet(env: Env): Promise<WalletClient> {
  const key = isTurnkeyConfigured(env)
    ? `turnkey:${env.TURNKEY_PRIVATE_KEY_ID}`
    : isLocalKeyConfigured(env)
      ? `local:${env.ATTESTER_PRIVATE_KEY}`
      : 'unconfigured'
  if (cachedWallet && cachedKey === key) return cachedWallet
  cachedKey = key
  cachedWallet = buildWallet(env).catch((err) => {
    cachedWallet = null
    cachedKey = null
    throw err
  })
  return cachedWallet
}
