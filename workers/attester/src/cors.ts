import type { Env } from './env'

/**
 * Minimal CORS handling for the attester. The TRUSTED_ORIGIN env var is a
 * comma-separated allowlist — any origin in the list is reflected back via
 * Access-Control-Allow-Origin; anything else gets a blank header and the
 * browser blocks the request.
 *
 * The list lets you run multiple frontends (localhost and ngrok, say)
 * without picking one. Workers must handle OPTIONS preflight requests
 * explicitly — there's no framework doing it for us.
 */
function allowedOrigins(env: Env): string[] {
  return env.TRUSTED_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function corsHeaders(env: Env, origin: string | null): HeadersInit {
  const allowed = origin && allowedOrigins(env).includes(origin) ? origin : ''
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
