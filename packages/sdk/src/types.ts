import type { Schema } from '@ensmetadata/schemas/types'

// --- Read types ---

export interface GetSchemaOptions {
  name: string
  blockNumber?: bigint
  blockTag?: 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'
  gatewayUrls?: string[]
  strict?: boolean
  universalResolverAddress?: string
}

export interface GetSchemaResult {
  schema: string | null
  class: string | null
  version: string | null
  cid: string | null
}

export interface GetMetadataOptions {
  name: string
  schema?: Schema
  keys?: string[]
  coinType?: number
  blockNumber?: bigint
  blockTag?: 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'
  gatewayUrls?: string[]
  strict?: boolean
  universalResolverAddress?: string
}

export interface GetMetadataResult {
  name: string
  resolver: string | null
  address: string | null
  class: string | null
  schema: string | null
  properties: Record<string, string | null>
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
  records: Record<string, string>
  deleted?: string[]
  schema?: Schema
  resolverAddress?: `0x${string}`
}

export interface ApplyDeltaOptions {
  name: string
  delta: MetadataDelta
  resolverAddress: `0x${string}`
}

export interface SetMetadataResult {
  txHash: `0x${string}`
  texts: { key: string; value: string }[]
  coins: { coin: string; value: string }[]
}

// --- prepare/estimate types ---

export interface PrepareSetMetadataOptions {
  name: string
  /** Desired record values keyed by ENS text key. Empty string / null marks the key for deletion. */
  desired: Record<string, string | null | undefined>
  /**
   * Pre-read existing values. If omitted the SDK reads the union of
   * `Object.keys(desired)` strictly from ENS.
   */
  existing?: Record<string, string | null>
  /** Validation runs before the delta is computed, against `desired`. */
  schema?: Schema
  /** Forwarded to computeDelta. */
  ignoreKeys?: Set<string>
  resolverAddress?: `0x${string}`
}

export interface PrepareResult {
  name: string
  resolverAddress: `0x${string}`
  existing: Record<string, string | null>
  delta: MetadataDelta
  /** Multicall calldata ready for sendTransaction. Empty string when delta is a no-op. */
  calldata: `0x${string}` | null
  /** Always equals the resolver address. */
  to: `0x${string}`
  /** Validation outcome — `null` when no schema was supplied. */
  validation: MetadataValidationResult | null
}

export interface EstimateSetMetadataOptions extends PrepareSetMetadataOptions {
  account: `0x${string}`
}

export interface EstimateResult {
  prepared: PrepareResult
  gas: bigint
  maxFeePerGas: bigint
  costWei: bigint
  /** Signer balance for caller-side affordability checks. */
  balance: bigint
}
