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
  // Falls back to the SDK's DEFAULT_ATTESTER_ENS when unset. Applies to
  // names that resolve on mainnet (everything that isn't *.base.eth).
  ATTESTER_ENS?: string
  // Attester ENS name used for *.base.eth subjects. Defaults to
  // 'atst.base.eth' when unset. Same signing key as ATTESTER_ENS — only
  // the label embedded in record keys differs, so verifiers resolve the
  // Base-hosted ENS on Base.
  ATTESTER_ENS_BASE?: string

  // Mainnet RPC URL for ENS reverse/avatar resolution during intent creation.
  // Secret — set via `wrangler secret put ENS_RPC_URL` or .dev.vars.
  ENS_RPC_URL?: string

  // Privy credentials — required when Twitter/Telegram validators run.
  PRIVY_APP_ID?: string
  PRIVY_APP_SECRET?: string
  TELEGRAM_BOT_TOKEN?: string

  // HMAC key used to sign outbound webhook payloads. The receiver verifies
  // the `X-Identity-Signature` header against the request body using this
  // shared secret. Optional — when unset, outbound webhooks are sent without
  // a signature header (useful for local dev against webhook.site).
  WEBHOOK_SIGNING_SECRET?: string
}
