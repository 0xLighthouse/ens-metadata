/**
 * Typed client for the ENS Metadata attester worker. Five endpoints, all
 * POST, all JSON. The session-id flows through the wizard state and is
 * persisted to sessionStorage so it survives Privy's OAuth redirect.
 */

const ATTESTER_URL = process.env.NEXT_PUBLIC_ATTESTER_URL ?? 'http://localhost:8787'

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${ATTESTER_URL}${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'omit',
  })
  if (!res.ok) {
    let message = `${path}: ${res.status}`
    try {
      const json = (await res.json()) as { error?: string }
      if (json.error) message = json.error
    } catch {
      // body wasn't JSON — fall back to the status-line message
    }
    throw new Error(message)
  }
  return (await res.json()) as T
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
  chainId: number
  expSeconds: number
  prf?: string
}

export interface AttestResult {
  /** 0x-prefixed hex of the fully-encoded v3 envelope — write directly to ENS. */
  claimHex: string
  /** Envelope metadata for display in the review step. */
  envelope: {
    v: number
    p: string
    h: string
    method: string
    issuedAt: number
  }
}

export async function attest(args: AttestArgs): Promise<AttestResult> {
  return postJson<AttestResult>('/api/attest', args)
}
