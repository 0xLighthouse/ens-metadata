import type { BadgeholderRow } from '@/lib/types'
import { shortenAddress } from '@/lib/utils'

/** The string the name sort orders on: the display name, else the ENS name, else the address. */
export const sortIdentity = (row: BadgeholderRow): string =>
  row.records.name ?? row.ensName ?? row.address

/** True when the row has neither a display name nor an ENS name. */
export const isAddressOnly = (row: BadgeholderRow): boolean =>
  row.records.name === null && row.ensName === null

/**
 * How a row identifies itself on screen. `secondary` is the ENS name only when a display name
 * takes the primary slot; otherwise the ENS name is already the primary. Callers render
 * `secondary` in parentheses after the primary.
 */
export const rowLabel = (row: BadgeholderRow): { primary: string; secondary: string | null } => ({
  primary: row.records.name ?? row.ensName ?? shortenAddress(row.address),
  secondary: row.records.name ? row.ensName : null,
})
