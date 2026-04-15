import type { SessionStore } from './session-store'

/**
 * Worker environment bindings — populated at runtime by Cloudflare from
 * wrangler.jsonc `vars`, secrets (`wrangler secret put`), and Durable Object
 * bindings.
 */
export interface Env {
  // Durable Object namespace for session storage.
  SESSIONS: DurableObjectNamespace<SessionStore>

  // Secrets — required.
  ATTESTER_PRIVATE_KEY: string

  // Vars — required (declared in wrangler.jsonc).
  SIWE_DOMAIN: string
  SIWE_ORIGIN: string
  SESSION_TTL_SECONDS: string
  TRUSTED_ORIGIN: string

  // Optional. Validators fall back to dev passthrough when missing.
  PRIVY_APP_ID?: string
  PRIVY_APP_SECRET?: string
  TELEGRAM_BOT_TOKEN?: string
}
