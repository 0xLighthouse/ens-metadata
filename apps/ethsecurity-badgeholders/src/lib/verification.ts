import type { BadgeholderRecords, BadgeholderRow } from '@/lib/types'

/** The records that can carry an attestation. Email is never attestable, so it never counts. */
export const SOCIAL_HANDLE_KEYS = [
  'x',
  'telegram',
] as const satisfies readonly (keyof BadgeholderRecords)[]

/** True when at least one of the row's social handles (X or Telegram) is attested. */
export const isProfileVerified = (row: BadgeholderRow): boolean =>
  SOCIAL_HANDLE_KEYS.some((key) => row.records[key].state === 'attested')
