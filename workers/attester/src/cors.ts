import type { Env } from './env'

/**
 * Minimal CORS handling for the attester. We only allow one origin (the
 * proofs frontend, configured via TRUSTED_ORIGIN). Anything else gets a
 * blank Access-Control-Allow-Origin and the browser will block it.
 *
 * Workers must handle OPTIONS preflight requests explicitly — there's no
 * framework doing it for us.
 */
export function corsHeaders(env: Env, origin: string | null): HeadersInit {
  const allowed = origin === env.TRUSTED_ORIGIN ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function preflightResponse(env: Env, request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(env, request.headers.get('Origin')),
  })
}

export function jsonResponse(
  env: Env,
  request: Request,
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env, request.headers.get('Origin')),
      ...(init.headers ?? {}),
    },
  })
}
