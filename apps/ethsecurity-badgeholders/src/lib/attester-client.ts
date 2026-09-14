import { ATTESTER_URL } from '@/lib/constants'

/**
 * Typed client for the session endpoints of the attester worker, after
 * `apps/identity/src/lib/attester-client.ts`. Every call is POST-JSON with no cookies; the
 * session id in the body is the only credential.
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
      // Not JSON; keep the status line.
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

export const createSession = () => postJson<CreateSessionResponse>('/api/session')

export const bindWallet = (args: { sessionId: string; message: string; signature: string }) =>
  postJson<{ ok: true; wallet: string }>('/api/session/wallet', args)

export const bindPlatform = (args: { sessionId: string; platform: string; payload: unknown }) =>
  postJson<{ ok: true; uid: string; handle: string }>(
    `/api/session/platform/${encodeURIComponent(args.platform)}`,
    { sessionId: args.sessionId, payload: args.payload },
  )

export interface AttestationEntry {
  /** Platform namespace, e.g. `com.x`. */
  platform: string
  /** The handle the attester verified, exactly as it should be written to the platform record. */
  handle: string
  /** Attester ENS name embedded in the record keys. */
  attester: string
  /** Resolved signing address, informational. */
  signerAddress: string
  /** Ready-to-write text records. Use the keys verbatim; never re-derive them. */
  records: {
    handle: { key: string; hex: string }
    uid: { key: string; hex: string }
  }
}

export const attest = (args: { sessionId: string; name: string }) =>
  postJson<{ attestations: AttestationEntry[] }>('/api/attest', args)

export const evictSession = (sessionId: string) =>
  postJson<{ ok: true }>('/api/session/evict', { sessionId })
