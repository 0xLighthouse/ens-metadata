import { matchesAllowlist, parseAllowlist } from './allowlist'
import type { Env } from './env'

/**
 * Minimal CORS handling for the attester. The TRUSTED_ORIGIN env var is a
 * comma-separated allowlist — any origin in the list is reflected back via
 * Access-Control-Allow-Origin; anything else gets a blank header and the
 * browser blocks the request.
 *
 * Entries can include a single `*` wildcard (e.g. `https://*-8640p.vercel.app`)
 * so Vercel preview URLs are covered without per-deployment config. Workers
 * must handle OPTIONS preflight requests explicitly — there's no framework
 * doing it for us.
 */
export function corsHeaders(env: Env, origin: string | null): HeadersInit {
  const allowed = origin && matchesAllowlist(origin, parseAllowlist(env.TRUSTED_ORIGIN)) ? origin : ''
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
