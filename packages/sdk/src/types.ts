import type { Schema } from '@ens-node-metadata/schemas/types'

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
