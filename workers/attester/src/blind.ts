import type { Env } from './env'

/**
 * Deterministic one-way blinding of a platform uid. The output is a
 * hex-encoded HMAC-SHA256 digest keyed by the attester's private key.
 *
 * Properties:
 *   - Same attester key + same platform + same uid → same output, always.
 *     Agents can cache the result and poll without re-calling /api/blind.
 *   - One-way: an observer who reads the on-chain claim can't recover the
 *     raw uid without the attester key. Unlike a plain hash, brute-forcing
 *     the uid space doesn't help because the key is unknown.
 *   - Platform-scoped: the same uid on two different platforms produces
 *     different blinded values, preventing cross-platform linkage.
 *
 * The key is imported once per isolate lifetime and cached. Each subsequent
 * call is a single `crypto.subtle.sign` — sub-millisecond on Cloudflare.
 */

let cachedKey: CryptoKey | undefined
let cachedKeySource: string | undefined

async function getHmacKey(env: Env): Promise<CryptoKey> {
  // Re-import only if the key material changed (shouldn't happen in a
  // single isolate, but handles wrangler dev hot-reload).
  if (cachedKey && cachedKeySource === env.ATTESTER_PRIVATE_KEY) {
    return cachedKey
  }
  const raw = env.ATTESTER_PRIVATE_KEY
  const keyBytes = new TextEncoder().encode(raw)
  cachedKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  cachedKeySource = raw
  return cachedKey
}

function bytesToHex(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf)
  let out = ''
  for (const b of view) out += b.toString(16).padStart(2, '0')
  return out
}

/**
 * Blind a platform uid. Returns a deterministic 64-char hex string.
 */
export async function blindUid(
  env: Env,
  platform: string,
  uid: string,
): Promise<string> {
  const key = await getHmacKey(env)
  const data = new TextEncoder().encode(`${platform}:${uid}`)
  const sig = await crypto.subtle.sign('HMAC', key, data)
  return bytesToHex(sig)
}
