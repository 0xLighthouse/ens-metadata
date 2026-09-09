/**
 * One holder of the ETHSecurity badge. `address` is always lowercase. `issuedAt` is an ISO 8601
 * UTC timestamp of the block in which the holder received the badge. Later phases key on `address`.
 */
export type Badgeholder = {
  address: string
  tokenId: string
  issuedAt: string
}

/**
 * A social handle record: unset, set but backed by no valid attestation from the trusted
 * attester, or set and attested.
 */
export type HandleField =
  | { state: 'empty' }
  | { state: 'unattested'; handle: string }
  | { state: 'attested'; handle: string }

/** An unverifiable record. */
export type PlainField = { state: 'empty' } | { state: 'unverifiable'; handle: string }

/** The six tracked text records. Text fields are `null` when unset or whitespace-only. */
export type BadgeholderRecords = {
  name: string | null
  description: string | null
  avatar: string | null
  email: PlainField
  x: HandleField
  telegram: HandleField
}

/** What rcrds.xyz knows about one badgeholder. `ensName` is `null` when the address has no primary name. */
export type BadgeholderProfile = {
  ensName: string | null
  records: BadgeholderRecords
}

/** One row of the badgeholder table: the Dune badge data joined with the rcrds.xyz profile. */
export type BadgeholderRow = Badgeholder & BadgeholderProfile
