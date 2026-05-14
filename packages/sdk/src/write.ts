import { type PublicClient, type WalletClient, zeroAddress } from 'viem'
import { normalize } from 'viem/ens'
import { getMetadata, getResolverFromRegistry, getSchema } from './read'
import { validateMetadata } from './schema'
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
 * are left untouched.
 */
export function computeDelta(
  desired: RecordSet,
  existing: RecordSet,
  options?: { ignoreMissing?: boolean },
): RecordSet {
  const ignoreMissing = options?.ignoreMissing ?? false
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
  const subOpts = registry ? { registry } : {}

  const resolver = await resolveResolverAddress(publicClient, opts, name)

  const schema = opts.schema ?? (await getSchema(publicClient, { name, ...subOpts })).schema
  if (!schema) throw new Error(`No schema found for ${name}`)

  const existing: RecordSet =
    opts.existing ?? (await getMetadata(publicClient, { name, schema, ...subOpts })).properties

  const changes = computeDelta(opts.desired, existing, {
    ignoreMissing: opts.ignoreMissing ?? false,
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
 */
async function setPreparedMetadata(
  walletClient: WalletClient,
  prepared: PreparedMetadata,
): Promise<SetMetadataResult> {
  return broadcast(walletClient, {
    name: prepared.name,
    records: prepared.changePreview.changes,
    resolver: prepared.resolver,
  })
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

export function metadataWriter(config: { publicClient: PublicClient }) {
  return (walletClient: WalletClient) => ({
    prepareSetMetadata: (opts: SetMetadataOptions) => prepareSetMetadata(config.publicClient, opts),
    setPreparedMetadata: (prepared: PreparedMetadata) =>
      setPreparedMetadata(walletClient, prepared),
    estimateSetMetadata: (opts: EstimateSetMetadataOptions) =>
      estimateSetMetadata(config.publicClient, opts),
    setMetadata: (opts: SetMetadataOptions) => setMetadata(walletClient, config.publicClient, opts),
  })
}

/** Prepare / estimate without a wallet client (for dry-run flows). */
export function metadataEstimator(config: { publicClient: PublicClient }) {
  return {
    prepareSetMetadata: (opts: SetMetadataOptions) => prepareSetMetadata(config.publicClient, opts),
    estimateSetMetadata: (opts: EstimateSetMetadataOptions) =>
      estimateSetMetadata(config.publicClient, opts),
  }
}
