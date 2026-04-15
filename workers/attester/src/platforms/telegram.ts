import type { Env } from '../env'
import type { Platform, PlatformValidationResult } from './index'

/**
 * Telegram validator using the Login Widget HMAC scheme, ported to
 * WebCrypto so it runs in a Workers V8 isolate without `node:crypto`.
 *
 * Spec: https://core.telegram.org/widgets/login#checking-authorization
 *
 * Telegram's Login Widget returns a payload like:
 *   { id, first_name, last_name, username, photo_url, auth_date, hash }
 * The `hash` field is HMAC-SHA256 over a sorted "key=value\n" string of
 * every other field, keyed by SHA-256(bot_token). We recompute the HMAC
 * with crypto.subtle and constant-time compare to detect tampering.
 *
 * `auth_date` is a unix-seconds timestamp. We reject any payload older
 * than the staleness window — the spec recommends an hour but for an
 * attestation flow we can be tighter.
 */

const STALENESS_WINDOW_SECONDS = 5 * 60

interface TelegramPayload {
  id?: number | string
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date?: number | string
  hash?: string
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2 !== 0) throw new Error('hex: odd length')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/**
 * Constant-time byte comparison. Branch-free over equal-length inputs;
 * unequal lengths short-circuit immediately (the lengths themselves are
 * not secret).
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

async function checkSignature(
  payload: TelegramPayload,
  botToken: string,
): Promise<boolean> {
  const { hash, ...fields } = payload
  if (!hash) return false

  // Build the data-check string per Telegram spec: sorted alphabetically,
  // joined as "key=value" with newlines between.
  const dataCheckString = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  // Telegram's secret key is SHA-256 of the bot token (raw bytes, not hex).
  const tokenBytes = new TextEncoder().encode(botToken)
  const secretKey = await crypto.subtle.digest('SHA-256', tokenBytes)

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await crypto.subtle.sign(
    'HMAC',
    hmacKey,
    new TextEncoder().encode(dataCheckString),
  )

  const expected = new Uint8Array(sigBuffer)
  let provided: Uint8Array
  try {
    provided = hexToBytes(hash)
  } catch {
    return false
  }
  return timingSafeEqual(expected, provided)
}

async function validate(
  env: Env,
  payload: unknown,
): Promise<PlatformValidationResult> {
  const p = (payload ?? {}) as TelegramPayload
  const botToken = env.TELEGRAM_BOT_TOKEN

  if (!botToken) {
    if (!p.id || !p.username) {
      throw new Error(
        'telegram: dev passthrough requires { id, username }; set TELEGRAM_BOT_TOKEN for real validation',
      )
    }
    console.warn('[attester] telegram validator is in dev passthrough mode')
    return { uid: String(p.id), handle: String(p.username) }
  }

  if (!p.id || !p.auth_date || !p.hash) {
    throw new Error('telegram: payload missing id, auth_date, or hash')
  }

  const ok = await checkSignature(p, botToken)
  if (!ok) {
    throw new Error('telegram: HMAC mismatch — payload was tampered or signed by a different bot')
  }

  const authDate = Number(p.auth_date)
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (nowSeconds - authDate > STALENESS_WINDOW_SECONDS) {
    throw new Error(`telegram: auth payload is stale (${nowSeconds - authDate}s old)`)
  }

  if (!p.username) {
    // Telegram users without a public @username can't have a stable handle.
    // Refuse rather than silently storing the numeric id as the handle.
    throw new Error('telegram: account has no public username')
  }
  return { uid: String(p.id), handle: p.username }
}

export const telegramPlatform: Platform = {
  id: 'org.telegram',
  validate,
}
