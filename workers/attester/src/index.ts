import { CLAIM_VERSION, ENVELOPE_TAG } from '@ensmetadata/sdk'
import { attesterWallet } from './attester'
import { attesterEnsMap } from './attester-ens'
import { jsonResponse, preflightResponse } from './cors'
import type { Env } from './env'
import { handleAttest } from './handlers/attest'
import { handleCreateIntent, handleGetIntent } from './handlers/intent'
import { handlePlatform } from './handlers/platform'
import { handleSession } from './handlers/session'
import { handleSubmission } from './handlers/submission'
import { handleWallet } from './handlers/wallet'

// Re-export the Durable Object class so wrangler can register it via the
// `class_name` binding in wrangler.jsonc. Workers expects the class to be
// reachable from the worker's main module export.
export { SessionStore } from './session-store'

/**
 * Routing is hand-rolled — fewer deps in an isolate is always better.
 *
 *   POST /api/session                       — create session, get nonce
 *   POST /api/session/wallet                — bind wallet via SIWE
 *   POST /api/session/platform/:platformId  — bind platform account
 *   POST /api/session/evict                 — evict session after tx confirmed
 *   POST /api/attest                        — issue signed claim
 *   POST /api/intent                        — create profile-builder intent
 *   GET  /api/intent/:id                    — read profile-builder intent
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return preflightResponse(env, request)
    }

    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'GET' && path === '/') {
      let signerAddress: string | undefined
      try {
        const wallet = await attesterWallet(env)
        signerAddress = wallet.account?.address
      } catch (err) {
        console.error('info: failed to resolve attester', err)
      }
      return jsonResponse(env, request, {
        service: 'ensmetadata-attester',
        version: CLAIM_VERSION,
        tag: ENVELOPE_TAG,
        // Per-chain attester ENS labels. Clients look up by chain slug
        // (`chainForName(name).name`). The signing key is the same across
        // labels; only the ENS embedded in record keys differs.
        attesters: attesterEnsMap(env),
        signerAddress: signerAddress ?? null,
        endpoints: [
          'POST /api/session',
          'POST /api/session/wallet',
          'POST /api/session/platform/:platform',
          'POST /api/attest',
        ],
      })
    }

    if (request.method === 'POST' && path === '/api/session') {
      return handleSession(env, request)
    }
    if (request.method === 'POST' && path === '/api/session/wallet') {
      return handleWallet(env, request)
    }

    const platformMatch = /^\/api\/session\/platform\/([^/]+)\/?$/.exec(path)
    if (request.method === 'POST' && platformMatch) {
      return handlePlatform(env, request, decodeURIComponent(platformMatch[1]))
    }

    if (request.method === 'POST' && path === '/api/attest') {
      return handleAttest(env, request)
    }

    if (request.method === 'POST' && path === '/api/intent') {
      return handleCreateIntent(env, request)
    }
    const submissionMatch = /^\/api\/intent\/([^/]+)\/submission\/?$/.exec(path)
    if (request.method === 'POST' && submissionMatch) {
      return handleSubmission(env, request, ctx, decodeURIComponent(submissionMatch[1]!))
    }
    const intentMatch = /^\/api\/intent\/([^/]+)\/?$/.exec(path)
    if (request.method === 'GET' && intentMatch) {
      return handleGetIntent(env, request, decodeURIComponent(intentMatch[1]!))
    }

    if (request.method === 'POST' && path === '/api/session/evict') {
      let body: { sessionId?: string }
      try {
        body = await request.json()
      } catch {
        return jsonResponse(env, request, { error: 'invalid JSON' }, { status: 400 })
      }
      if (!body.sessionId) {
        return jsonResponse(env, request, { error: 'sessionId is required' }, { status: 400 })
      }
      const stub = env.SESSIONS.get(env.SESSIONS.idFromName(body.sessionId))
      await stub.evict()
      return jsonResponse(env, request, { ok: true })
    }
    return jsonResponse(env, request, { error: 'not found' }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
