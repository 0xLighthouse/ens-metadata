import { fetchBadgeholders } from '@/lib/dune'
import { EMPTY_PROFILE, fetchBadgeholderRecords } from '@/lib/rcrds'
import type { BadgeholderRow } from '@/lib/types'
import { NextResponse } from 'next/server'

/**
 * Debug surface for the badgeholder data layer. Always 200 — a Dune or rcrds.xyz outage
 * degrades to an empty list or empty profiles, never a 500. Caching lives in the fetchers, so
 * this segment stays dynamic and the list is never baked into the build.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const badgeholders = await fetchBadgeholders()
  const profiles = await fetchBadgeholderRecords(badgeholders.map((b) => b.address))

  const rows: BadgeholderRow[] = badgeholders.map((badgeholder) => ({
    ...badgeholder,
    ...(profiles.get(badgeholder.address) ?? EMPTY_PROFILE),
  }))
  return NextResponse.json(rows)
}
