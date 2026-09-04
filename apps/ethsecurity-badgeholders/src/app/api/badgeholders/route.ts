import { fetchBadgeholders } from '@/lib/dune'
import { NextResponse } from 'next/server'

/**
 * Debug surface for the badgeholder data layer. Always 200 — a Dune outage returns an empty
 * array, never a 500. Caching lives in `fetchBadgeholders`, so this segment stays dynamic and
 * the list is never baked into the build.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const badgeholders = await fetchBadgeholders()
  return NextResponse.json(badgeholders)
}
