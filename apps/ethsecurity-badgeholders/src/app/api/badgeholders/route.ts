import { loadBadgeholderRows } from '@/lib/badgeholders'
import { NextResponse } from 'next/server'

/**
 * Debug surface for the badgeholder data layer. Always 200 — a Dune or rcrds.xyz outage
 * degrades to an empty list or empty profiles, never a 500. Caching lives in the fetchers, so
 * this segment stays dynamic and the list is never baked into the build.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await loadBadgeholderRows())
}
