import {
  BADGEHOLDERS_CACHE_TTL_SECONDS,
  BADGEHOLDERS_DUNE_QUERY_ID,
  BADGEHOLDER_ADDRESS_COLUMNS,
  BADGEHOLDER_TOKEN_ID_COLUMNS,
} from '@/lib/constants'
import type { Badgeholder } from '@/lib/types'
import { DuneClient } from '@duneanalytics/client-sdk'
import { unstable_cache } from 'next/cache'

type DuneRow = Record<string, unknown>

/** Finds the first accepted column present on a row, matching keys case-insensitively. */
const resolveColumn = (row: DuneRow, accepted: readonly string[]) => {
  const keys = Object.keys(row)
  for (const name of accepted) {
    const key = keys.find((candidate) => candidate.toLowerCase() === name)
    if (key) return key
  }
  return undefined
}

/** Maps Dune rows onto badgeholders: lowercased addresses, first occurrence wins. */
const toBadgeholders = (rows: DuneRow[]): Badgeholder[] => {
  if (rows.length === 0) return []

  const addressColumn = resolveColumn(rows[0], BADGEHOLDER_ADDRESS_COLUMNS)
  if (!addressColumn) {
    console.error(
      `Dune query ${BADGEHOLDERS_DUNE_QUERY_ID} returned no address column. Saw [${Object.keys(
        rows[0],
      ).join(', ')}], accepts [${BADGEHOLDER_ADDRESS_COLUMNS.join(', ')}].`,
    )
    return []
  }
  const tokenIdColumn = resolveColumn(rows[0], BADGEHOLDER_TOKEN_ID_COLUMNS)

  const seen = new Set<string>()
  const badgeholders: Badgeholder[] = []
  for (const row of rows) {
    const value = row[addressColumn]
    if (typeof value !== 'string' || value === '') continue

    const address = value.toLowerCase()
    if (seen.has(address)) continue
    seen.add(address)

    const tokenId = tokenIdColumn ? row[tokenIdColumn] : undefined
    badgeholders.push(
      tokenId === undefined || tokenId === null
        ? { address }
        : { address, tokenId: String(tokenId) },
    )
  }
  return badgeholders
}

/**
 * Reads the last stored execution of the badgeholder query. Wrapped in `unstable_cache` so a
 * second call inside the TTL is served from Next's data cache without a second Dune request;
 * a throw is not cached, so an outage does not pin an empty list for the whole TTL.
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
 * `DUNE_API_KEY`. A Dune outage yields an empty list and a logged error rather than a throw,
 * so callers decide how to present it.
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
