import { jsonResponse } from '../cors'
import type { Env } from '../env'
import type { StoredIntent } from './intent'

/**
 * POST /api/intent/:id/submission
 *
 * Called by the wizard as soon as a publish tx is broadcast. If the stored
 * intent has a `webhookUrl`, we fire-and-forget a signed POST containing
 * just enough for the receiver to pick up from here on their own:
 *
 *   { intentId, ensName, txHash, from, chainId, submittedAt }
 *
 * The receiver waits for confirmations and reads the resulting on-chain
 * records themselves — we don't try to ship "what the user submitted."
 *
 * Auth: requires a `sessionId` resolving to a live SessionStore DO. The
 * payload is verifiable on-chain so strong auth here would only be spam
 * protection; the live-session check is enough of a gate.
 *
 * Idempotent on the no-webhook path: returns 200 with `delivered: false`
 * so the wizard can call this unconditionally.
 */

const MAX_ATTEMPTS = 4
// Inter-attempt backoff. Length must be MAX_ATTEMPTS - 1 (no sleep after the
// final attempt). Total time budget ~5.25s — well within waitUntil's window.
const BACKOFF_MS = [250, 1000, 4000]
const FETCH_TIMEOUT_MS = 10_000

interface SubmissionBody {
  sessionId?: unknown
  ensName?: unknown
  txHash?: unknown
  from?: unknown
  chainId?: unknown
}

export async function handleSubmission(
  env: Env,
  request: Request,
  ctx: ExecutionContext,
  id: string,
): Promise<Response> {
  if (!id || id.length > 32) {
    return jsonResponse(env, request, { error: 'invalid_id' }, { status: 400 })
  }

  let body: SubmissionBody
  try {
    body = (await request.json()) as SubmissionBody
  } catch {
    return jsonResponse(env, request, { error: 'invalid_json' }, { status: 400 })
  }

  if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) {
    return jsonResponse(env, request, { error: 'sessionId_required' }, { status: 400 })
  }
  if (typeof body.ensName !== 'string' || body.ensName.length === 0) {
    return jsonResponse(env, request, { error: 'ensName_required' }, { status: 400 })
  }
  if (typeof body.txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) {
    return jsonResponse(env, request, { error: 'invalid_txHash' }, { status: 400 })
  }
  const from = parseAddress(body.from)
  const chainId =
    typeof body.chainId === 'number' && Number.isFinite(body.chainId) ? body.chainId : null

  let raw: string | null
  try {
    raw = await env.INTENTS.get(`intent:${id}`)
  } catch {
    return jsonResponse(env, request, { error: 'kv_unavailable' }, { status: 502 })
  }
  if (raw === null) {
    return jsonResponse(env, request, { error: 'not_found' }, { status: 404 })
  }

  let stored: StoredIntent
  try {
    stored = JSON.parse(raw) as StoredIntent
  } catch {
    return jsonResponse(env, request, { error: 'corrupt' }, { status: 500 })
  }

  const webhookUrl = stored.config.webhookUrl
  if (!webhookUrl) {
    // Nothing to deliver — keep callers idempotent.
    return jsonResponse(env, request, { ok: true, delivered: false })
  }

  const stub = env.SESSIONS.get(env.SESSIONS.idFromName(body.sessionId))
  const session = await stub.get()
  if (!session) {
    return jsonResponse(env, request, { error: 'session_not_found' }, { status: 404 })
  }

  const payload = {
    intentId: id,
    ensName: body.ensName,
    txHash: body.txHash,
    from,
    chainId,
    submittedAt: Date.now(),
  }

  const bodyBytes = new TextEncoder().encode(JSON.stringify(payload))
  ctx.waitUntil(dispatchWebhook(webhookUrl, bodyBytes, env.WEBHOOK_SIGNING_SECRET))

  return jsonResponse(env, request, { ok: true, delivered: true }, { status: 202 })
}

// Lightweight 0x-address shape check. We don't need viem's full isAddress
// (with checksum validation) — the receiver is going to re-verify on chain
// anyway, so all we want is to reject obvious junk before it lands in the
// payload.
function parseAddress(raw: unknown): `0x${string}` | null {
  if (typeof raw !== 'string') return null
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) return null
  return raw.toLowerCase() as `0x${string}`
}

async function dispatchWebhook(
  url: string,
  body: Uint8Array,
  secret: string | undefined,
): Promise<void> {
  const signature = secret ? await hmacSha256Hex(secret, body) : null
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'ensmetadata-attester/1',
  }
  if (signature) headers['X-Identity-Signature'] = `sha256=${signature}`

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (res.ok) return
      // 4xx is terminal — the receiver has rejected the payload, retrying
      // won't help.
      if (res.status >= 400 && res.status < 500) {
        console.warn('webhook: 4xx, giving up', { status: res.status, url })
        return
      }
      console.warn('webhook: 5xx, retrying', { status: res.status, attempt })
    } catch (err) {
      clearTimeout(timer)
      console.warn('webhook: fetch error, retrying', {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    const delay = BACKOFF_MS[attempt]
    if (delay !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  console.error('webhook: all retries exhausted', { url })
}

async function hmacSha256Hex(secret: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, body)
  const bytes = new Uint8Array(sig)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0')
  }
  return hex
}
