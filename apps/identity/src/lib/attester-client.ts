/**
 * Typed client for the ENS Metadata attester worker. Five endpoints, all
 * POST, all JSON. The session-id flows through the wizard state and is
 * persisted to sessionStorage so it survives Privy's OAuth redirect.
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

export interface AttestResult {
  /** 0x-prefixed hex of the fully-encoded v1 envelope — write directly to ENS. */
  claimHex: string
  /** Platform namespace from the session. */
  platform: string
  /** Handle from the session. */
  handle: string
  /** Attester address. */
  attester: string
}

export async function attest(args: AttestArgs): Promise<AttestResult> {
  return postJson<AttestResult>('/api/attest', args)
}

export function evictSession(sessionId: string): Promise<{ ok: true }> {
  return postJson('/api/session/evict', { sessionId })
}
