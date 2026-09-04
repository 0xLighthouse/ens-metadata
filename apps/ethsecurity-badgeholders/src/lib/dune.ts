import { BADGEHOLDERS_CACHE_TTL_SECONDS, BADGEHOLDERS_DUNE_QUERY_ID } from '@/lib/constants'
import type { Badgeholder } from '@/lib/types'
import { DuneClient } from '@duneanalytics/client-sdk'
import { unstable_cache } from 'next/cache'

/** The columns query 8607855 returns. See `BADGEHOLDERS_DUNE_QUERY_ID`. */
const COLUMNS = ['owner', 'tokenId', 'issuedAt'] as const

type DuneRow = Record<string, unknown>

/** Dune serialises timestamps as `YYYY-MM-DD HH:mm:ss.SSS UTC`; rewrite that as ISO 8601. */
const toIsoTimestamp = (value: string) => value.replace(' ', 'T').replace(' UTC', 'Z')

/**
 * Maps Dune rows onto badgeholders: lowercased addresses, first occurrence wins. Throws when
 * the expected columns are missing, so a schema change takes the same uncached path as an
 * outage instead of pinning an empty list for the whole TTL.
 */
const toBadgeholders = (rows: DuneRow[]): Badgeholder[] => {
  if (rows.length === 0) return []

  const missing = COLUMNS.filter((column) => !(column in rows[0]))
  if (missing.length > 0) {
    throw new Error(
      `Dune query ${BADGEHOLDERS_DUNE_QUERY_ID} is missing column(s) [${missing.join(', ')}]. Saw [${Object.keys(
        rows[0],
      ).join(', ')}].`,
    )
  }

  const seen = new Set<string>()
  const badgeholders: Badgeholder[] = []
  for (const row of rows) {
    const owner = row.owner
    if (typeof owner !== 'string' || owner === '') continue

    const address = owner.toLowerCase()
    if (seen.has(address)) continue
    seen.add(address)

    badgeholders.push({
      address,
      tokenId: String(row.tokenId),
      issuedAt: toIsoTimestamp(String(row.issuedAt)),
    })
  }
  return badgeholders
}

/**
 * Reads the last stored execution of the badgeholder query. Wrapped in `unstable_cache` so a
 * second call inside the TTL is served from Next's data cache without a second Dune request;
 * a throw is not cached, so neither an outage nor a schema mismatch pins an empty list for the
 * whole TTL.
 */
const loadBadgeholders = unstable_cache(
  async (): Promise<Badgeholder[]> => {
    const dune = new DuneClient(process.env.DUNE_API_KEY!)
    const response = await dune.getLatestResult({ queryId: BADGEHOLDERS_DUNE_QUERY_ID })
    if (response.error) {
      throw new Error(`Dune returned an error: ${JSON.stringify(response.error)}`)
    }
    return toBadgeholders(response.result?.rows ?? [])
  },
  ['ethsecurity-badgeholders'],
  { revalidate: BADGEHOLDERS_CACHE_TTL_SECONDS },
)

/**
 * The current ETHSecurity badgeholders, lowercased and de-duplicated. Server-only: it reads
 * `DUNE_API_KEY`. A Dune outage or an unrecognised result schema yields an empty list and a
 * logged error rather than a throw, so callers decide how to present it.
 */
export async function fetchBadgeholders(): Promise<Badgeholder[]> {
  try {
    return await loadBadgeholders()
  } catch (error) {
    console.error(
      `Failed to fetch ETHSecurity badgeholders from Dune query ${BADGEHOLDERS_DUNE_QUERY_ID}`,
      error,
    )
    return []
  }
}
