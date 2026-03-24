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
