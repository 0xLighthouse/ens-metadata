import { rowLabel } from '@/lib/identity'
import type { BadgeholderRow, HandleField } from '@/lib/types'

// Prefixed with `@` so a query typed either way ("alice" or "@alice") finds the handle.
const handleText = (field: HandleField): string | null =>
  field.state === 'empty' ? null : `@${field.handle}`

/** The strings a row can be found by: what the row shows as its name, the full address, and the handles. */
const searchableText = (row: BadgeholderRow): string[] => {
  const { primary, secondary } = rowLabel(row)
  return [
    primary,
    secondary,
    row.address,
    handleText(row.records.x),
    handleText(row.records.telegram),
  ]
    .filter((value): value is string => value !== null)
    .map((value) => value.toLowerCase())
}

/** True when `row` matches `query`, case-insensitively. A blank query matches every row. */
export const rowMatches = (row: BadgeholderRow, query: string): boolean => {
  const needle = query.trim().toLowerCase()
  return needle === '' || searchableText(row).some((value) => value.includes(needle))
}

/** The rows matching `query`, in their original order. */
export const filterRows = (rows: BadgeholderRow[], query: string): BadgeholderRow[] =>
  query.trim() === '' ? rows : rows.filter((row) => rowMatches(row, query))
