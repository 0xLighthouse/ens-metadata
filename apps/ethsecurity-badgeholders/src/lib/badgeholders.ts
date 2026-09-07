import { fetchBadgeholders } from '@/lib/dune'
import { EMPTY_PROFILE, fetchBadgeholderRecords } from '@/lib/rcrds'
import type { BadgeholderRow } from '@/lib/types'

const ADDRESS = /^0x[0-9a-f]{40}$/i

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

/**
 * The badgeholder at `address`, in any casing, or `undefined` when the address is malformed or
 * does not hold the badge. Reads the same cached rows as the list.
 */
export async function findBadgeholderRow(address: string): Promise<BadgeholderRow | undefined> {
  if (!ADDRESS.test(address)) return undefined
  const needle = address.toLowerCase()
  return (await loadBadgeholderRows()).find((row) => row.address === needle)
}
