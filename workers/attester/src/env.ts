import type { SessionStore } from './session-store'

/**
 * Worker environment bindings — populated at runtime by Cloudflare from
 * wrangler.jsonc `vars`, secrets (`wrangler secret put`), and Durable Object
 * bindings.
 */
export interface Env {
  // Durable Object namespace for session storage.
  SESSIONS: DurableObjectNamespace<SessionStore>

  // Secrets — one of the two signing modes must be configured.
  // Local key (dev): raw hex private key.
  ATTESTER_PRIVATE_KEY?: string
  // Turnkey (prod): remote signer via Turnkey API.
  TURNKEY_API_PUBLIC_KEY?: string
  TURNKEY_API_PRIVATE_KEY?: string
  TURNKEY_ORGANIZATION_ID?: string
  TURNKEY_PRIVATE_KEY_ID?: string

  // Vars — required (declared in wrangler.jsonc).
  SIWE_DOMAIN: string
  SESSION_TTL_SECONDS: string
  TRUSTED_ORIGIN: string

  // Privy credentials — required when Twitter/Telegram validators run.
  PRIVY_APP_ID?: string
  PRIVY_APP_SECRET?: string
  TELEGRAM_BOT_TOKEN?: string
}
