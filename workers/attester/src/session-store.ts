import { DurableObject } from 'cloudflare:workers'
import type { Address } from 'viem'
import type { Env } from './env'

export interface PlatformBinding {
  /** Platform identifier — must match a registered Platform key. */
  platform: string
  /** Stable platform user id. Goes into claim.uid. */
  uid: string
  /** Display handle at attestation time. Goes into claim.h. */
  handle: string
  /** When the binding was recorded, unix seconds. */
  boundAt: number
}

export interface SessionData {
  /** SIWE nonce issued at session creation. */
  nonce: string
  /** Wallet address bound to the session, after successful SIWE verify. */
  wallet?: Address
  /** Platform account bound to this session, if any. */
  platform?: PlatformBinding
  /** Created at, unix seconds. */
  createdAt: number
  /** Expires at, unix seconds. */
  expiresAt: number
}

/**
 * One Durable Object instance per session, addressed by sessionId via
 * `env.SESSIONS.idFromName(sessionId)`. Single-writer, strongly consistent,
 * exactly the right primitive for "I just bound a wallet, did the binding
 * land?" — no eventual-consistency races like KV would have.
 *
 * TTL: an alarm is scheduled at session creation. When it fires we wipe
 * storage so Cloudflare can evict the instance and reclaim the slot.
 *
 * TODO: the sessionId is a bare bearer token — anyone who intercepts it
 * can bind a wallet/platform to the session. Current mitigations are
 * short TTL (900s) and origin-locked CORS. For stronger auth, move to an
 * HttpOnly cookie + double-submit CSRF token, or HMAC-signed session
 * handle. Acceptable for PoC scope.
 */
export class SessionStore extends DurableObject<Env> {
  /**
   * Idempotent initialization: if the session already has data, return it
   * unchanged. The router enforces a fresh sessionId per init, so this is
   * mostly a safety net against double-clicks.
   */
  async init(nonce: string, ttlSeconds: number): Promise<SessionData> {
    const existing = await this.ctx.storage.get<SessionData>('data')
    if (existing) return existing

    const now = Math.floor(Date.now() / 1000)
    const data: SessionData = {
      nonce,
      createdAt: now,
      expiresAt: now + ttlSeconds,
    }
    await this.ctx.storage.put('data', data)
    await this.ctx.storage.setAlarm(Date.now() + ttlSeconds * 1000)
    return data
  }

  async get(): Promise<SessionData | null> {
    const data = await this.ctx.storage.get<SessionData>('data')
    if (!data) return null
    const now = Math.floor(Date.now() / 1000)
    if (data.expiresAt <= now) {
      await this.ctx.storage.deleteAll()
      return null
    }
    return data
  }

  async bindWallet(wallet: Address): Promise<SessionData | null> {
    const data = await this.get()
    if (!data) return null
    data.wallet = wallet
    await this.ctx.storage.put('data', data)
    return data
  }

  async bindPlatform(binding: PlatformBinding): Promise<SessionData | null> {
    const data = await this.get()
    if (!data) return null
    data.platform = binding
    await this.ctx.storage.put('data', data)
    return data
  }

  async evict(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }

  /**
   * Alarm handler — runs at session expiry. Deleting all storage signals to
   * the Cloudflare runtime that this DO instance is no longer needed.
   */
  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }
}
