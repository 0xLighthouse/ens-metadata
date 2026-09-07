import { completenessScore, populatedCount } from '@/lib/completeness'
import type { BadgeholderRow } from '@/lib/types'

export type SortKey = 'completeness' | 'name' | 'issued'

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'completeness', label: 'Completeness' },
  { value: 'name', label: 'Name' },
  { value: 'issued', label: 'Badge date' },
]

/** Named rows A to Z, then unnamed rows by address. */
const byName = (a: BadgeholderRow, b: BadgeholderRow): number => {
  if (a.ensName && b.ensName) return a.ensName.localeCompare(b.ensName)
  if (a.ensName) return -1
  if (b.ensName) return 1
  return a.address.localeCompare(b.address)
}

const COMPARATORS: Record<SortKey, (a: BadgeholderRow, b: BadgeholderRow) => number> = {
  // Least complete first, so gaps are the first thing on screen. On a tie, no ENS name at all
  // is the bigger gap, so unnamed addresses come before named ones.
  completeness: (a, b) =>
    completenessScore(a) - completenessScore(b) ||
    populatedCount(a) - populatedCount(b) ||
    Number(Boolean(a.ensName)) - Number(Boolean(b.ensName)) ||
    byName(a, b),
  name: byName,
  // Newest badge first.
  issued: (a, b) => b.issuedAt.localeCompare(a.issuedAt) || byName(a, b),
}

/** A sorted copy of `rows`. */
export const sortRows = (rows: BadgeholderRow[], key: SortKey): BadgeholderRow[] =>
  [...rows].sort(COMPARATORS[key])
