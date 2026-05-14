import type { Schema } from '@ensmetadata/schemas/types'

/**
 * A map of ENS text records keyed by name.
 *
 * Two semantic uses:
 *  - **State RecordSet** (current/projected on-chain state, e.g. `existing`
 *    or the result of `applyDelta`): only keys that are populated on-chain
 *    appear. Absent keys are unset.
 *  - **Changes RecordSet** (broadcast-ready, e.g. `prepared.changes`):
 *    non-empty `string` sets the new value, `""` explicitly deletes the key,
 *    absent keys are left untouched (unless `ignoreMissing` is `false` in a
 *    diff op).
 */
export type RecordSet = Record<string, string>

// --- Read types ---

export interface GetSchemaOptions {
  name: string
  blockNumber?: bigint
  blockTag?: 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'
  gatewayUrls?: string[]
  strict?: boolean
  universalResolverAddress?: string
}

export interface GetMetadataOptions {
  name: string
  schema?: Schema
  keys?: string[]
  blockNumber?: bigint
  blockTag?: 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'
  gatewayUrls?: string[]
  strict?: boolean
  universalResolverAddress?: string
}

export interface GetMetadataResult {
  name: string
  properties: RecordSet
  schema: Schema | null
}

export interface GetSchemaResult {
  name: string
  properties: RecordSet
  schema: Schema | null
}

// --- Validation types ---

export type MetadataValidationError = { key: string; message: string }
export type MetadataValidationResult =
  | { success: true; data: Record<string, string> }
  | { success: false; errors: MetadataValidationError[] }

// --- Delta types ---

export interface MetadataDelta {
  changes: Record<string, string>
  deleted: string[]
}

export interface ComputeDeltaOptions {
  ignoreKeys?: Set<string>
}

// --- Write types ---

export interface SetMetadataOptions {
  name: string
  schema?: Schema
  resolver?: `0x${string}`
  ignoreMissing?: boolean
  desired: RecordSet
  existing?: RecordSet
}

export interface SetMetadataResult {
  txHash: `0x${string}`
  texts: { key: string; value: string }[]
}

// --- prepare/estimate types ---

export interface ChangePreview {
  name: string
  resolver: `0x${string}`
  existing?: RecordSet
  /** Keys to publish: `string` = set new value, "" = delete the key. */
  changes: RecordSet
  /** Validation outcome — `null` when no schema was supplied. */
  validation: MetadataValidationResult | null
}

export interface PreparedMetadata {
  name: string
  resolver: `0x${string}`
  schema: Schema
  changePreview: ChangePreview
}

export interface EstimateSetMetadataOptions extends SetMetadataOptions {
  account: `0x${string}`
}

export interface EstimateResult {
  prepared: PreparedMetadata
  gas: bigint
  maxFeePerGas: bigint
  costWei: bigint
  /** Signer balance for caller-side affordability checks. */
  balance: bigint
}
