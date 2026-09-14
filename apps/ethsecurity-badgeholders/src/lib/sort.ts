import { isAddressOnly, sortIdentity } from '@/lib/identity'
import type { BadgeholderRow } from '@/lib/types'

export type SortKey = 'badge' | 'name' | 'address'
export type SortDirection = 'asc' | 'desc'
export type SortState = { key: SortKey; direction: SortDirection }

export const DEFAULT_SORT: SortState = { key: 'badge', direction: 'asc' }

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'badge', label: 'Badge #' },
  { value: 'name', label: 'Name' },
  { value: 'address', label: 'Address' },
]

// Collation, not Number(): a token id is a uint256, so coercion mis-orders above 2^53 and a
// non-numeric id would yield NaN, which gives Array.prototype.sort undefined behaviour.
const badgeCollator = new Intl.Collator('en', { numeric: true })

// Not numeric: an address is one hex string, and numeric collation would read its digit runs as
// numbers and sort 0x9f… before 0x10….
const textCollator = new Intl.Collator('en', { sensitivity: 'base' })

type Comparator = (a: BadgeholderRow, b: BadgeholderRow) => number

const byAddress: Comparator = (a, b) => textCollator.compare(a.address, b.address)

/** `flip` is 1 ascending, -1 descending, applied per term rather than to the whole comparator. */
const COMPARATORS: Record<SortKey, (flip: number) => Comparator> = {
  badge: (flip) => (a, b) => flip * badgeCollator.compare(a.tokenId, b.tokenId) || byAddress(a, b),
  name: (flip) => (a, b) =>
    // Outside `flip`: descending mirrors the order within each group but never swaps the groups,
    // so address-only rows trail in both directions.
    Number(isAddressOnly(a)) - Number(isAddressOnly(b)) ||
    flip * textCollator.compare(sortIdentity(a), sortIdentity(b)) ||
    byAddress(a, b),
  address: (flip) => (a, b) => flip * byAddress(a, b),
}

/** A sorted copy of `rows`. */
export const sortRows = (
  rows: BadgeholderRow[],
  key: SortKey,
  direction: SortDirection,
): BadgeholderRow[] => [...rows].sort(COMPARATORS[key](direction === 'desc' ? -1 : 1))

const DESCRIPTIONS: Record<SortKey, Record<SortDirection, string>> = {
  badge: {
    asc: 'Sorted by badge number, lowest first',
    desc: 'Sorted by badge number, highest first',
  },
  name: { asc: 'Sorted by name, A to Z', desc: 'Sorted by name, Z to A' },
  address: { asc: 'Sorted by address, A to Z', desc: 'Sorted by address, Z to A' },
}

/** The current sort in words, for screen readers and tooltips. */
export const sortDescription = (state: SortState): string =>
  DESCRIPTIONS[state.key][state.direction]
