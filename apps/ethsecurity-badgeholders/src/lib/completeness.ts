import type { BadgeholderRow, HandleField } from '@/lib/types'

const handleScore = (field: HandleField): number => {
  if (field.state === 'attested') return 2
  if (field.state === 'unattested') return 1
  return 0
}

/**
 * Weighted score for sorting. Each set text record scores 1; each handle scores 1 when set and 2
 * when attested, so an attested profile outranks a merely populated one. Range 0 to 7.
 */
export const completenessScore = (row: BadgeholderRow): number => {
  const { name, description, avatar, x, telegram } = row.records
  const textScore = [name, description, avatar].filter((value) => value !== null).length
  return textScore + handleScore(x) + handleScore(telegram)
}

/** How many of the five tracked records are set, attested or not. Breaks sort ties. */
export const populatedCount = (row: BadgeholderRow): number => {
  const { name, description, avatar, x, telegram } = row.records
  return (
    [name, description, avatar].filter((value) => value !== null).length +
    [x, telegram].filter((field) => field.state !== 'empty').length
  )
}
