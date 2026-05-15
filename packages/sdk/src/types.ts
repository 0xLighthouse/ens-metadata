import type { Schema } from '@ensmetadata/schemas/types'
import type { Address } from 'viem'
import type { SchemaResolver } from './schema'

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
  /**
   * ENS registry address used for direct `registry.resolver(node)` →
   * `resolver.text(node, key)` reads. Bypasses viem's `getEnsText`
   * (which routes through a Universal Resolver). Required for chains
   * without a UniversalResolver (e.g. Basenames on Base).
   */
  registry?: Address
  /**
   * IPFS gateway URL prefix used when the resolved `schema` text record is an
   * `ipfs://` URI. The CID is appended directly with a single `/` separator,
   * so the prefix should include any path segment that must appear before the
   * CID (e.g. `https://my-gw.example/ipfs`). Overrides any default set on the
   * `metadataReader` / `metadataWriter` factory. Falls back to
   * `DEFAULT_IPFS_GATEWAY` when unset everywhere.
   */
  ipfsGateway?: string
  /**
   * Optional resolver consulted before the IPFS / HTTPS fetchers. Lets a caller
   * short-circuit schema retrieval (e.g. by serving schemas bundled in the
   * package). When the resolver returns `null`, fetching falls through to the
   * normal protocol fetchers.
   */
  schemaResolver?: SchemaResolver
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
  /**
   * See {@link GetSchemaOptions.registry}.
   */
  registry?: Address
  /**
   * See {@link GetSchemaOptions.ipfsGateway}.
   */
  ipfsGateway?: string
  /**
   * See {@link GetSchemaOptions.schemaResolver}.
   */
  schemaResolver?: SchemaResolver
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
  /**
   * Resolver to publish to. When set, the SDK skips its own resolver
   * lookup entirely (neither `registry` nor a Universal Resolver are
   * consulted).
   */
  resolver?: `0x${string}`
  /**
   * ENS registry address used to look up `resolver(node)` directly,
   * bypassing viem's UR-based `getEnsResolver`. Ignored when `resolver`
   * is supplied. Required for writes to chains without a Universal
   * Resolver (e.g. Basenames on Base).
   */
  registry?: Address
  ignoreMissing?: boolean
  desired: RecordSet
  existing?: RecordSet
  /**
   * See {@link GetSchemaOptions.ipfsGateway}. Used when the writer needs to
   * resolve the name's `schema` URI to validate / diff records (i.e. when
   * `schema` and `existing` are not both supplied).
   */
  ipfsGateway?: string
  /**
   * See {@link GetSchemaOptions.schemaResolver}. Consulted when the writer
   * fetches the name's schema itself (i.e. `schema` is not pre-supplied).
   */
  schemaResolver?: SchemaResolver
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
