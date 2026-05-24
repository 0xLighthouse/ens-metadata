import type { Schema } from '@ensmetadata/schemas/types'
import { type PublicClient, type WalletClient, zeroAddress } from 'viem'
import { normalize } from 'viem/ens'
import { getMetadata, getResolverFromRegistry, getSchema } from './read'
import { type SchemaResolver, getSchemaKeys, matchArrayEntry, validateMetadata } from './schema'
import type {
  ChangePreview,
  EstimateResult,
  EstimateSetMetadataOptions,
  PreparedMetadata,
  RecordSet,
  SetMetadataOptions,
  SetMetadataResult,
} from './types'

// --- Internal helpers ---

/**
 * Compute the diff between a `desired` changes RecordSet and an `existing`
 * state RecordSet. Returns a broadcast-ready changes RecordSet: non-empty
 * `string` = set new value, `""` = delete the key, absent key = no change.
 *
 * `desired` follows the changes convention: a `""` value deletes the key, a
 * non-empty string sets it, and any key not present is left alone.
 *
 * When `ignoreMissing` is `false` (default), keys present in `existing` but
 * absent from `desired` are also marked for deletion. When `true`, those keys
 * are left untouched — *except* for array baseKeys the caller touched (see
 * below).
 *
 * Array-aware PATCH semantics: if `schema` is supplied and `desired` includes
 * any `${baseKey}[N]` entry for an array-pattern baseKey, the entries `desired`
 * provides are treated as the authoritative new array for that baseKey — any
 * existing `${baseKey}[N]` not mentioned in `desired` is marked for deletion,
 * even under `ignoreMissing: true`. Without this, PATCH mode could never shrink
 * an array, and a flat-RecordSet view of a hydrated `string[]` would silently
 * leave tail entries behind.
 */
export function computeDelta(
  desired: RecordSet,
  existing: RecordSet,
  options?: { ignoreMissing?: boolean; schema?: Schema },
): RecordSet {
  const ignoreMissing = options?.ignoreMissing ?? false
  const schema = options?.schema
  const changes: RecordSet = {}

  for (const [key, value] of Object.entries(desired)) {
    const existingValue = existing[key]
    if (value === '') {
      // Delete only if the key is currently set.
      if (existingValue !== undefined) changes[key] = ''
    } else if (value !== existingValue) {
      changes[key] = value
    }
  }

  if (!ignoreMissing) {
    for (const key of Object.keys(existing)) {
      if (key in desired) continue
      changes[key] = ''
    }
    return changes
  }

  // PATCH (ignoreMissing=true) + array auto-tail-clear: for every array baseKey
  // the caller touched in `desired`, treat the provided entries as the new full
  // array and delete any existing entries for that baseKey not in `desired`.
  if (schema) {
    const { arrayPatterns } = getSchemaKeys(schema)
    if (arrayPatterns.length > 0) {
      const arrayBaseKeys = new Set(arrayPatterns.map((p) => p.baseKey))
      const touchedBaseKeys = new Set<string>()
      for (const key of Object.keys(desired)) {
        const m = matchArrayEntry(key, arrayBaseKeys)
        if (m) touchedBaseKeys.add(m.baseKey)
      }
      if (touchedBaseKeys.size > 0) {
        for (const existingKey of Object.keys(existing)) {
          if (existingKey in desired) continue
          const m = matchArrayEntry(existingKey, arrayBaseKeys)
          if (m && touchedBaseKeys.has(m.baseKey)) {
            changes[existingKey] = ''
          }
        }
      }
    }
  }

  return changes
}

/**
 * Project the state RecordSet that will result from publishing `changes` on
 * top of `existing`. Keys with `""` in `changes` are deletions and don't
 * appear in the result.
 */
export function applyDelta(existing: RecordSet, changes: RecordSet): RecordSet {
  const results: RecordSet = { ...existing }
  for (const [key, value] of Object.entries(changes)) {
    if (value === '') delete results[key]
    else results[key] = value
  }
  return results
}

async function broadcast(
  walletClient: WalletClient,
  args: { name: string; records: RecordSet; resolver: `0x${string}` },
): Promise<SetMetadataResult> {
  const texts = Object.entries(args.records).map(([key, value]) => ({ key, value }))
  if (texts.length === 0) throw new Error('No records to write')

  const { setRecords } = await import('@ensdomains/ensjs/wallet')
  // biome-ignore lint/suspicious/noExplicitAny: ensjs wallet client type mismatch
  const txHash = await setRecords(walletClient as any, {
    name: args.name,
    texts,
    coins: [],
    resolverAddress: args.resolver,
    account: walletClient.account!,
  })
  return { txHash, texts }
}

/**
 * Estimate the gas cost of setting `records` on `resolver` for `name`. Pure
 * gas helper — does no diffing, validation, or PreparedResult construction.
 * Returns zeros (with the current balance) when `records` is empty.
 */
async function gasEstimate(
  publicClient: PublicClient,
  args: {
    name: string
    resolver: `0x${string}`
    records: RecordSet
    account: `0x${string}`
  },
): Promise<{ gas: bigint; maxFeePerGas: bigint; costWei: bigint; balance: bigint }> {
  const texts = Object.entries(args.records).map(([key, value]) => ({ key, value }))

  if (texts.length === 0) {
    const balance = await publicClient.getBalance({ address: args.account })
    return { gas: 0n, maxFeePerGas: 0n, costWei: 0n, balance }
  }

  const { setRecords } = await import('@ensdomains/ensjs/wallet')
  // biome-ignore lint/suspicious/noExplicitAny: makeFunctionData's wallet param is unused
  const { data } = setRecords.makeFunctionData(null as any, {
    name: args.name,
    resolverAddress: args.resolver,
    texts,
    coins: [],
  })

  const [gas, fees, balance] = await Promise.all([
    publicClient.estimateGas({ account: args.account, to: args.resolver, data }),
    publicClient.estimateFeesPerGas(),
    publicClient.getBalance({ address: args.account }),
  ])
  const maxFeePerGas = fees.maxFeePerGas ?? 0n
  return { gas, maxFeePerGas, costWei: gas * maxFeePerGas, balance }
}

// --- Public functions ---

/**
 * Resolver lookup cascade:
 *  1. `opts.resolver` provided → use it.
 *  2. `opts.registry` provided → direct `registry.resolver(node)` read.
 *  3. Neither → viem `publicClient.getEnsResolver({ name })` (UR-based).
 */
async function resolveResolverAddress(
  publicClient: PublicClient,
  opts: SetMetadataOptions,
  name: string,
): Promise<`0x${string}`> {
  if (opts.resolver) return opts.resolver
  if (opts.registry) {
    const addr = await getResolverFromRegistry(publicClient, opts.registry, name)
    if (!addr) throw new Error(`No resolver found for ${name}`)
    return addr
  }
  const addr = (await publicClient.getEnsResolver({ name })) as `0x${string}`
  if (addr === zeroAddress) throw new Error(`No resolver found for ${name}`)
  return addr
}

/**
 * Read whatever isn't supplied, diff `desired` against `existing`, and return
 * a `PreparedMetadata` bundle ready for `setPreparedMetadata` or
 * `estimateSetMetadata`. Throws if the name has no resolver or no schema.
 */
async function prepareSetMetadata(
  publicClient: PublicClient,
  opts: SetMetadataOptions,
): Promise<PreparedMetadata> {
  const name = normalize(opts.name)
  const registry = opts.registry
  const subOpts: {
    registry?: typeof registry
    ipfsGateway?: string
    schemaResolver?: SchemaResolver
  } = {
    ...(registry ? { registry } : {}),
    ...(opts.ipfsGateway ? { ipfsGateway: opts.ipfsGateway } : {}),
    ...(opts.schemaResolver ? { schemaResolver: opts.schemaResolver } : {}),
  }

  const resolver = await resolveResolverAddress(publicClient, opts, name)

  const schema = opts.schema ?? (await getSchema(publicClient, { name, ...subOpts })).schema
  if (!schema) throw new Error(`No schema found for ${name}`)

  const existing: RecordSet =
    opts.existing ?? (await getMetadata(publicClient, { name, schema, ...subOpts })).properties

  const changes = computeDelta(opts.desired, existing, {
    ignoreMissing: opts.ignoreMissing ?? false,
    schema,
  })
  const projected = applyDelta(existing, changes)
  const validation = validateMetadata(projected, schema)

  const changePreview: ChangePreview = {
    name,
    resolver,
    existing,
    changes,
    validation,
  }

  return { name, resolver, schema, changePreview }
}

/**
 * Broadcast a previously prepared `PreparedMetadata`.
 *
 * Throws `MetadataValidationFailedError` when the prepared bundle's
 * `validation.success` is `false`. With array semantics enforcing
 * contiguity, an invalid projection would write on-chain state the reader
 * silently truncates — so the write path always blocks on validation
 * failure. Callers that want to inspect-but-not-fix should use
 * `prepareSetMetadata` and read `prepared.changePreview.validation`
 * themselves.
 */
async function setPreparedMetadata(
  walletClient: WalletClient,
  prepared: PreparedMetadata,
): Promise<SetMetadataResult> {
  assertPreparedValid(prepared)
  return broadcast(walletClient, {
    name: prepared.name,
    records: prepared.changePreview.changes,
    resolver: prepared.resolver,
  })
}

/**
 * Thrown by `setMetadata` / `setPreparedMetadata` when the projected state
 * fails `validateMetadata`. The `errors` array carries the per-key validation
 * errors so callers can surface them directly.
 */
export class MetadataValidationFailedError extends Error {
  readonly errors: ReadonlyArray<{ key: string; message: string }>
  constructor(errors: ReadonlyArray<{ key: string; message: string }>) {
    super(
      `Metadata validation failed; refusing to broadcast:\n${errors
        .map((e) => `  [${e.key}] ${e.message}`)
        .join('\n')}`,
    )
    this.name = 'MetadataValidationFailedError'
    this.errors = errors
  }
}

function assertPreparedValid(prepared: PreparedMetadata): void {
  const v = prepared.changePreview.validation
  if (v && !v.success) throw new MetadataValidationFailedError(v.errors)
}

/**
 * Prepare the change set and return a gas estimate without broadcasting.
 */
async function estimateSetMetadata(
  publicClient: PublicClient,
  opts: EstimateSetMetadataOptions,
): Promise<EstimateResult> {
  const prepared = await prepareSetMetadata(publicClient, opts)
  const estimate = await gasEstimate(publicClient, {
    name: prepared.name,
    resolver: prepared.resolver,
    records: prepared.changePreview.changes,
    account: opts.account,
  })
  return { prepared, ...estimate }
}

/**
 * Prepare and broadcast in one call.
 */
async function setMetadata(
  walletClient: WalletClient,
  publicClient: PublicClient,
  opts: SetMetadataOptions,
): Promise<SetMetadataResult> {
  const prepared = await prepareSetMetadata(publicClient, opts)
  return setPreparedMetadata(walletClient, prepared)
}

// --- Factories ---

/**
 * `ipfsGateway` and `schemaResolver`, when set on the factory config, become
 * the defaults for every call routed through the writer. Per-call options
 * take precedence.
 */
export function metadataWriter(config: {
  publicClient: PublicClient
  ipfsGateway?: string
  schemaResolver?: SchemaResolver
}) {
  const defaultIpfsGateway = config.ipfsGateway
  const defaultSchemaResolver = config.schemaResolver
  const withDefaults = <T extends { ipfsGateway?: string; schemaResolver?: SchemaResolver }>(
    opts: T,
  ): T => ({
    ...opts,
    ipfsGateway: opts.ipfsGateway ?? defaultIpfsGateway,
    schemaResolver: opts.schemaResolver ?? defaultSchemaResolver,
  })
  return (walletClient: WalletClient) => ({
    prepareSetMetadata: (opts: SetMetadataOptions) =>
      prepareSetMetadata(config.publicClient, withDefaults(opts)),
    setPreparedMetadata: (prepared: PreparedMetadata) =>
      setPreparedMetadata(walletClient, prepared),
    estimateSetMetadata: (opts: EstimateSetMetadataOptions) =>
      estimateSetMetadata(config.publicClient, withDefaults(opts)),
    setMetadata: (opts: SetMetadataOptions) =>
      setMetadata(walletClient, config.publicClient, withDefaults(opts)),
  })
}

/** Prepare / estimate without a wallet client (for dry-run flows). */
export function metadataEstimator(config: {
  publicClient: PublicClient
  ipfsGateway?: string
  schemaResolver?: SchemaResolver
}) {
  const defaultIpfsGateway = config.ipfsGateway
  const defaultSchemaResolver = config.schemaResolver
  const withDefaults = <T extends { ipfsGateway?: string; schemaResolver?: SchemaResolver }>(
    opts: T,
  ): T => ({
    ...opts,
    ipfsGateway: opts.ipfsGateway ?? defaultIpfsGateway,
    schemaResolver: opts.schemaResolver ?? defaultSchemaResolver,
  })
  return {
    prepareSetMetadata: (opts: SetMetadataOptions) =>
      prepareSetMetadata(config.publicClient, withDefaults(opts)),
    estimateSetMetadata: (opts: EstimateSetMetadataOptions) =>
      estimateSetMetadata(config.publicClient, withDefaults(opts)),
  }
}
