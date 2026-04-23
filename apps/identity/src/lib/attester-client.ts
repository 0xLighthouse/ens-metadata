import type { IntentConfig } from '@ensmetadata/shared/intent'

/**
 * Typed client for the ENS Metadata attester worker. The session endpoints
 * are POST-JSON; the intent endpoints add one GET. The session-id flows
 * through the wizard state and is persisted to sessionStorage so it survives
 * Privy's OAuth redirect.
 */

const ATTESTER_URL = process.env.NEXT_PUBLIC_ATTESTER_URL ?? 'http://localhost:8787'

/**
 * Error kinds the attester client can surface:
 *   - `network`: request never reached the worker (offline, DNS, CORS).
 *   - `http`:    worker returned a non-2xx; `status` is populated.
 *   - `parse`:   worker returned 2xx but response body wasn't JSON.
 */
export type AttesterErrorKind = 'network' | 'http' | 'parse'

export class AttesterError extends Error {
  readonly kind: AttesterErrorKind
  readonly status?: number
  constructor(kind: AttesterErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'AttesterError'
    this.kind = kind
    this.status = status
  }
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${ATTESTER_URL}${path}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network request failed'
    throw new AttesterError('network', `${path}: ${message}`)
  }
  return readJson<T>(path, res)
}

async function getJson<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${ATTESTER_URL}${path}`, { method: 'GET', credentials: 'omit' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network request failed'
    throw new AttesterError('network', `${path}: ${message}`)
  }
  return readJson<T>(path, res)
}

async function readJson<T>(path: string, res: Response): Promise<T> {
  if (!res.ok) {
    let message = `${path}: ${res.status}`
    try {
      const json = (await res.json()) as { error?: string }
      if (json.error) message = json.error
    } catch {
      // body wasn't JSON — fall back to the status-line message
    }
    throw new AttesterError('http', message, res.status)
  }
  try {
    return (await res.json()) as T
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid JSON'
    throw new AttesterError('parse', `${path}: ${message}`)
  }
}

export interface CreateSessionResponse {
  sessionId: string
  nonce: string
  expiresAt: number
}

export function createSession(): Promise<CreateSessionResponse> {
  return postJson<CreateSessionResponse>('/api/session')
}

export interface BindWalletArgs {
  sessionId: string
  message: string
  signature: string
}

export function bindWallet(args: BindWalletArgs): Promise<{ ok: true; wallet: string }> {
  return postJson('/api/session/wallet', args)
}

export interface BindPlatformArgs {
  sessionId: string
  platform: string
  payload: unknown
}

export function bindPlatform(
  args: BindPlatformArgs,
): Promise<{ ok: true; uid: string; handle: string }> {
  return postJson(`/api/session/platform/${encodeURIComponent(args.platform)}`, {
    sessionId: args.sessionId,
    payload: args.payload,
  })
}

export interface AttestArgs {
  sessionId: string
  name: string
}

export interface AttestationEntry {
  /** Platform namespace (e.g. "com.x", "org.telegram"). */
  platform: string
  /** Display handle. */
  handle: string
  /** Attester address. */
  attester: string
  /** Pre-built text-record key/value pairs to write on-chain. */
  records: {
    handleKey: string
    handleHex: string
    uidKey: string
    uidHex: string
  }
}

export interface AttestResult {
  attestations: AttestationEntry[]
}

export async function attest(args: AttestArgs): Promise<AttestResult> {
  return postJson<AttestResult>('/api/attest', args)
}

export function evictSession(sessionId: string): Promise<{ ok: true }> {
  return postJson('/api/session/evict', { sessionId })
}

// -----------------------------
// Profile-builder intents
// -----------------------------

export interface CreateIntentArgs {
  address: `0x${string}`
  ensName: string
  config: IntentConfig
  signature: `0x${string}`
  expiry: number
}

export function createIntent(args: CreateIntentArgs): Promise<{ id: string }> {
  return postJson<{ id: string }>('/api/intent', args)
}

export interface IntentResponse {
  id: string
  config: IntentConfig
  creator: { address: string; ensName: string; avatar: string | null }
}

export function getIntent(id: string): Promise<IntentResponse> {
  return getJson<IntentResponse>(`/api/intent/${encodeURIComponent(id)}`)
}
