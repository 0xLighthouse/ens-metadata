import { jsonResponse, preflightResponse } from './cors'
import type { Env } from './env'
import { handleAttest } from './handlers/attest'
import { handlePlatform } from './handlers/platform'
import { handleSession } from './handlers/session'
import { handleWallet } from './handlers/wallet'

// Re-export the Durable Object class so wrangler can register it via the
// `class_name` binding in wrangler.jsonc. Workers expects the class to be
// reachable from the worker's main module export.
export { SessionStore } from './session-store'

/**
 * Routing is hand-rolled — five endpoints don't justify a router dep, and
 * fewer deps in an isolate is always better.
 *
 *   POST /api/session                       — create session, get nonce
 *   POST /api/session/wallet                — bind wallet via SIWE
 *   POST /api/session/platform/:platformId  — bind platform account
 *   POST /api/attest                        — issue signed claim
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return preflightResponse(env, request)
    }

    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'GET' && path === '/') {
      return jsonResponse(env, request, {
        service: 'ensmetadata-attester',
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
    return jsonResponse(env, request, { error: 'not found' }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
