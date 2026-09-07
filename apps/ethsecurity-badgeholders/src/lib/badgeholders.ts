import { fetchBadgeholders } from '@/lib/dune'
import { EMPTY_PROFILE, fetchBadgeholderRecords } from '@/lib/rcrds'
import type { BadgeholderRow } from '@/lib/types'

/**
 * Every badgeholder joined with its rcrds.xyz profile. Server-only. A Dune outage yields an
 * empty list; an rcrds.xyz outage yields rows with empty profiles. Never throws.
 */
export async function loadBadgeholderRows(): Promise<BadgeholderRow[]> {
  const badgeholders = await fetchBadgeholders()
  const profiles = await fetchBadgeholderRecords(badgeholders.map((b) => b.address))

  return badgeholders.map((badgeholder) => ({
    ...badgeholder,
    ...(profiles.get(badgeholder.address) ?? EMPTY_PROFILE),
  }))
}
