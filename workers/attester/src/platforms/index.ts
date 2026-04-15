import type { Env } from '../env'
import { telegramPlatform } from './telegram'
import { twitterPlatform } from './twitter'

/**
 * A platform validator turns a client-supplied auth payload into a verified
 * `{ uid, handle }` pair. Each platform has its own protocol — Twitter uses
 * Privy-validated OAuth, Telegram uses HMAC-SHA256 with a bot token — but
 * the contract is the same: trust nothing the client says about identity,
 * validate using the platform-issued cryptographic primitive, return the
 * fields that go into the claim.
 *
 * Adding a platform = drop a new module here and register it.
 */
export interface PlatformValidationResult {
  /** Stable platform user id. Goes into claim.uid. */
  uid: string
  /** Display handle at validation time. Goes into claim.h. */
  handle: string
}

export interface Platform {
  /** Identifier as it appears in claim.p and the URL. */
  id: string
  /**
   * Validate a client-supplied payload. Throws on any failure — an invalid
   * payload should never silently produce a binding.
   */
  validate(env: Env, payload: unknown): Promise<PlatformValidationResult>
}

const registry: Record<string, Platform> = {
  'com.x': twitterPlatform,
  'org.telegram': telegramPlatform,
}

export function getPlatform(id: string): Platform | undefined {
  return registry[id]
}

export function listPlatforms(): string[] {
  return Object.keys(registry)
}
