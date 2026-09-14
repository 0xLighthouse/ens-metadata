import { isHandleAttested } from '@/lib/attestation-state'
import {
  BADGEHOLDERS_CACHE_TTL_SECONDS,
  BADGEHOLDER_PROFILES_CACHE_TAG,
  RCRDS_API_URL,
  RCRDS_BATCH_SIZE,
} from '@/lib/constants'
import type { BadgeholderProfile, BadgeholderRecords, HandleField, PlainField } from '@/lib/types'
import { isValidEmail, isValidTelegramHandle, isValidXHandle } from '@/lib/validation'
import { unstable_cache } from 'next/cache'
import type { Address } from 'viem'

/**
 * One row of `POST /v1/names`: the flat envelope the single-name endpoints return. For an
 * address query `address` echoes the input, EIP-55 checksummed, and `name` is the primary
 * name it reverse-resolves to. A failed row carries `error` (an error name such as
 * `primary_name_not_set`) and omits `name` and `records`.
 */
type BatchRow = {
  address?: string
  name?: string | null
  records?: Record<string, string>
  error?: string
}

const EMPTY_RECORDS: BadgeholderRecords = {
  name: null,
  description: null,
  avatar: null,
  email: { state: 'empty' },
  x: { state: 'empty' },
  telegram: { state: 'empty' },
}

export const EMPTY_PROFILE: BadgeholderProfile = { ensName: null, records: EMPTY_RECORDS }

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

/**
 * A handle's attestation state: unset, set, or set and backed by a valid attestation from the
 * trusted attester (see `isHandleAttested`).
 */
const toHandleField = async (
  platform: string,
  handle: string | null,
  ensName: string,
  owner: Address,
  records: Record<string, string>,
): Promise<HandleField> => {
  if (handle === null) return { state: 'empty' }
  const attested = await isHandleAttested({ platform, handle, ensName, owner, records })
  return { state: attested ? 'attested' : 'unattested', handle }
}

const toPlainField = (value: string | null): PlainField =>
  value === null ? { state: 'empty' } : { state: 'unverifiable', handle: value }

const toProfile = async (
  address: Address,
  ensName: string,
  records: Record<string, string>,
): Promise<BadgeholderProfile> => {
  // A whitespace-only record reads as unset.
  const text = (key: string): string | null => records[key]?.trim() || null

  // A malformed value is dropped rather than repaired: guessing at what the owner meant would
  // show a handle they never published, and an attestation covers the exact record value.
  const valid = (value: string | null, check: (v: string) => boolean) =>
    value !== null && check(value) ? value : null

  return {
    ensName,
    records: {
      name: text('name'),
      description: text('description'),
      avatar: text('avatar'),
      email: toPlainField(valid(text('email'), isValidEmail)),
      // rcrds serves the legacy `com.twitter` as `com.x` in its profile dataset; mirror that here.
      x: await toHandleField(
        'com.x',
        valid(text('com.x') ?? text('com.twitter'), isValidXHandle),
        ensName,
        address,
        records,
      ),
      telegram: await toHandleField(
        'org.telegram',
        valid(text('org.telegram'), isValidTelegramHandle),
        ensName,
        address,
        records,
      ),
    },
  }
}

/**
 * Resolves one batch of addresses to profiles, keyed by lowercased address. Addresses with no
 * primary name come back as an `{ address, error }` row and are omitted here; the caller
 * fills them.
 * Throws on a missing key, a non-2xx response, or a malformed body, so a failure is never
 * cached. Each batch caches separately: `unstable_cache` keys on its arguments.
 */
const loadBatch = unstable_cache(
  async (addresses: string[]): Promise<[string, BadgeholderProfile][]> => {
    const apiKey = process.env.RCRDS_API_KEY
    if (!apiKey) throw new Error('RCRDS_API_KEY is not set')

    const response = await fetch(`${RCRDS_API_URL}/names?format=json`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ names: addresses, include: ['records'] }),
    })
    if (!response.ok) {
      throw new Error(`rcrds.xyz returned ${response.status}: ${await response.text()}`)
    }

    const { results } = (await response.json()) as { results: BatchRow[] }
    if (!Array.isArray(results)) throw new Error('rcrds.xyz response has no `results` array')

    const profiles: [string, BadgeholderProfile][] = []
    for (const row of results) {
      if (row.error || !row.address || !row.name) continue
      const address = row.address.toLowerCase() as Address
      profiles.push([address, await toProfile(address, row.name, row.records ?? {})])
    }
    return profiles
  },
  ['ethsecurity-badgeholder-profiles'],
  { revalidate: BADGEHOLDERS_CACHE_TTL_SECONDS, tags: [BADGEHOLDER_PROFILES_CACHE_TAG] },
)

/**
 * The rcrds.xyz profile of every given badgeholder, keyed by lowercased address. Server-only:
 * it reads `RCRDS_API_KEY`. Every input address is present in the result; one whose lookup
 * failed, or whose batch failed, maps to `EMPTY_PROFILE` with a logged error. Never throws.
 */
export async function fetchBadgeholderRecords(
  addresses: string[],
): Promise<Map<string, BadgeholderProfile>> {
  const profiles = new Map(addresses.map((address) => [address.toLowerCase(), EMPTY_PROFILE]))

  const batches = await Promise.allSettled(
    chunk([...profiles.keys()], RCRDS_BATCH_SIZE).map(loadBatch),
  )
  for (const batch of batches) {
    if (batch.status === 'rejected') {
      console.error('Failed to fetch badgeholder profiles from rcrds.xyz', batch.reason)
      continue
    }
    for (const [address, profile] of batch.value) profiles.set(address, profile)
  }
  return profiles
}
