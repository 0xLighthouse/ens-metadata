import type { SessionStore } from './session-store'

/**
 * Worker environment bindings — populated at runtime by Cloudflare from
 * wrangler.jsonc `vars`, secrets (`wrangler secret put`), and Durable Object
 * bindings.
 */
export interface Env {
  // Durable Object namespace for session storage.
  SESSIONS: DurableObjectNamespace<SessionStore>

  // KV store for profile-builder intents.
  INTENTS: KVNamespace

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

  // Attester ENS name used as the identity in v2 record keys
  // (attestations[<p>][<ATTESTER_ENS>] and uid[<p>][<ATTESTER_ENS>]).
  // Falls back to the SDK's DEFAULT_ATTESTER_ENS when unset.
  ATTESTER_ENS?: string

  // Mainnet RPC URL for ENS reverse/avatar resolution during intent creation.
  // Secret — set via `wrangler secret put ENS_RPC_URL` or .dev.vars.
  ENS_RPC_URL?: string

  // Privy credentials — required when Twitter/Telegram validators run.
  PRIVY_APP_ID?: string
  PRIVY_APP_SECRET?: string
  TELEGRAM_BOT_TOKEN?: string
}
