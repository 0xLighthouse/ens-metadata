import { type Hex, type PublicClient, type WalletClient, encodeFunctionData } from 'viem'
import { normalize } from 'viem/ens'
import { computeDelta } from './delta'
import { getResolverAddressStrict, readTextRecordsStrict } from './read'
import type {
  ApplyDeltaOptions,
  EstimateResult,
  EstimateSetMetadataOptions,
  MetadataDelta,
  PrepareResult,
  PrepareSetMetadataOptions,
  SetMetadataOptions,
  SetMetadataResult,
} from './types'
import { validateMetadataSchema } from './schema'

export class MetadataWriteError extends Error {
  errors: { key: string; message: string }[]
  code?: string

  constructor(message: string, errors: { key: string; message: string }[], code?: string) {
    super(message)
    this.name = 'MetadataWriteError'
    this.errors = errors
    if (code !== undefined) this.code = code
  }
}

function deltaToRecords(delta: MetadataDelta): {
  texts: { key: string; value: string }[]
  coins: { coin: string; value: string }[]
} {
  const texts: { key: string; value: string }[] = []
  const coins: { coin: string; value: string }[] = []

  for (const [key, value] of Object.entries(delta.changes)) {
    if (key === 'address') {
      coins.push({ coin: 'ETH', value })
    } else {
      texts.push({ key, value })
    }
  }

  for (const key of delta.deleted) {
    texts.push({ key, value: '' })
  }

  return { texts, coins }
}

async function resolveResolver(publicClient: PublicClient, name: string): Promise<`0x${string}`> {
  try {
    return await getResolverAddressStrict({ client: publicClient, name })
  } catch (err) {
    throw new MetadataWriteError(
      err instanceof Error ? err.message : `No resolver found for ${name}`,
      [],
    )
  }
}

async function setMetadataImpl(
  walletClient: WalletClient,
  publicClient: PublicClient,
  opts: SetMetadataOptions,
): Promise<SetMetadataResult> {
  if (opts.schema) {
    const result = validateMetadataSchema(opts.records, opts.schema)
    if (!result.success) {
      throw new MetadataWriteError('Validation failed', result.errors)
    }
  }

  const delta: MetadataDelta = {
    changes: opts.records,
    deleted: opts.deleted ?? [],
  }

  const name = normalize(opts.name)
  const resolverAddress = opts.resolverAddress ?? (await resolveResolver(publicClient, name))
  const { texts, coins } = deltaToRecords(delta)

  if (texts.length === 0 && coins.length === 0) {
    throw new MetadataWriteError('No records to write', [])
  }

  const { setRecords } = await import('@ensdomains/ensjs/wallet')
  // biome-ignore lint/suspicious/noExplicitAny: ensjs wallet client type mismatch
  const txHash = await setRecords(walletClient as any, {
    name,
    texts,
    coins,
    resolverAddress,
    account: walletClient.account!,
  })

  return { txHash, texts, coins }
}

async function applyDeltaImpl(
  walletClient: WalletClient,
  _publicClient: PublicClient,
  opts: ApplyDeltaOptions,
): Promise<SetMetadataResult> {
  const name = normalize(opts.name)
  const { texts, coins } = deltaToRecords(opts.delta)

  if (texts.length === 0 && coins.length === 0) {
    throw new MetadataWriteError('No records to write', [])
  }

  const { setRecords } = await import('@ensdomains/ensjs/wallet')
  // biome-ignore lint/suspicious/noExplicitAny: ensjs wallet client type mismatch
  const txHash = await setRecords(walletClient as any, {
    name,
    texts,
    coins,
    resolverAddress: opts.resolverAddress,
    account: walletClient.account!,
  })

  return { txHash, texts, coins }
}

/**
 * Compute the multicall calldata for writing the given delta against the
 * resolver. Returns `null` when there is nothing to write.
 */
async function encodeDeltaCalldata(
  name: string,
  delta: MetadataDelta,
): Promise<`0x${string}` | null> {
  const { texts, coins } = deltaToRecords(delta)
  if (texts.length === 0 && coins.length === 0) return null

  const { namehash, generateRecordCallArray } = await import('@ensdomains/ensjs/utils')
  const node = namehash(name)
  const calls = generateRecordCallArray({
    namehash: node,
    texts,
    coins: coins.map((c) => ({ coin: c.coin, value: c.value })),
  })

  if (calls.length === 0) return null
  if (calls.length === 1) return calls[0] as `0x${string}`

  return encodeFunctionData({
    abi: [
      {
        name: 'multicall',
        type: 'function',
        inputs: [{ name: 'data', type: 'bytes[]' }],
        outputs: [{ name: '', type: 'bytes[]' }],
      },
    ] as const,
    functionName: 'multicall',
    args: [calls as Hex[]],
  })
}

function normalizeDesired(
  desired: Record<string, string | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(desired)) {
    if (typeof value === 'string') out[key] = value
    else if (value === null || value === undefined) out[key] = ''
  }
  return out
}

async function prepareSetMetadataImpl(
  publicClient: PublicClient,
  opts: PrepareSetMetadataOptions,
): Promise<PrepareResult> {
  const name = normalize(opts.name)
  const desired = normalizeDesired(opts.desired)

  const validation = opts.schema ? validateMetadataSchema(desired, opts.schema) : null
  if (validation && !validation.success) {
    throw new MetadataWriteError('Validation failed', validation.errors)
  }

  const resolverAddress = opts.resolverAddress ?? (await resolveResolver(publicClient, name))

  let existing: Record<string, string | null>
  if (opts.existing) {
    existing = opts.existing
  } else {
    const keys = Object.keys(desired).filter((k) => k !== 'address')
    if (keys.length === 0) {
      existing = {}
    } else {
      existing = await readTextRecordsStrict({ client: publicClient, name, keys })
    }
  }

  const delta = computeDelta(
    existing,
    desired,
    opts.ignoreKeys ? { ignoreKeys: opts.ignoreKeys } : undefined,
  )
  const calldata = await encodeDeltaCalldata(name, delta)

  return {
    name,
    resolverAddress,
    existing,
    delta,
    calldata,
    to: resolverAddress,
    validation,
  }
}

async function estimateSetMetadataImpl(
  publicClient: PublicClient,
  opts: EstimateSetMetadataOptions,
): Promise<EstimateResult> {
  const prepared = await prepareSetMetadataImpl(publicClient, opts)

  if (!prepared.calldata) {
    const balance = await publicClient.getBalance({ address: opts.account })
    return {
      prepared,
      gas: 0n,
      maxFeePerGas: 0n,
      costWei: 0n,
      balance,
    }
  }

  const [gas, fees, balance] = await Promise.all([
    publicClient.estimateGas({
      account: opts.account,
      to: prepared.to,
      data: prepared.calldata,
    }),
    publicClient.estimateFeesPerGas(),
    publicClient.getBalance({ address: opts.account }),
  ])

  const maxFeePerGas = fees.maxFeePerGas ?? 0n
  return {
    prepared,
    gas,
    maxFeePerGas,
    costWei: gas * maxFeePerGas,
    balance,
  }
}

async function setMetadataWithDeltaImpl(
  walletClient: WalletClient,
  publicClient: PublicClient,
  opts: PrepareSetMetadataOptions,
): Promise<SetMetadataResult> {
  const prepared = await prepareSetMetadataImpl(publicClient, opts)
  const { texts, coins } = deltaToRecords(prepared.delta)
  if (texts.length === 0 && coins.length === 0) {
    throw new MetadataWriteError('No records to write', [])
  }

  const { setRecords } = await import('@ensdomains/ensjs/wallet')
  // biome-ignore lint/suspicious/noExplicitAny: ensjs wallet client type mismatch
  const txHash = await setRecords(walletClient as any, {
    name: prepared.name,
    texts,
    coins,
    resolverAddress: prepared.resolverAddress,
    account: walletClient.account!,
  })

  return { txHash, texts, coins }
}

/**
 * Single-chain metadata writer. The supplied `publicClient` and
 * `walletClient` are assumed to be on the same chain as the names being
 * written; the core does no chain detection. Use `multichainMetadataWriter`
 * from `./multichain` if you need a single object that dispatches across
 * chains and enforces the wallet-on-correct-chain guard.
 */
export function metadataWriter(config: { publicClient: PublicClient }) {
  return (walletClient: WalletClient) => ({
    setMetadata: (opts: SetMetadataOptions) =>
      setMetadataImpl(walletClient, config.publicClient, opts),
    applyDelta: (opts: ApplyDeltaOptions) =>
      applyDeltaImpl(walletClient, config.publicClient, opts),
    setMetadataWithDelta: (opts: PrepareSetMetadataOptions) =>
      setMetadataWithDeltaImpl(walletClient, config.publicClient, opts),
    prepareSetMetadata: (opts: PrepareSetMetadataOptions) =>
      prepareSetMetadataImpl(config.publicClient, opts),
    estimateSetMetadata: (opts: EstimateSetMetadataOptions) =>
      estimateSetMetadataImpl(config.publicClient, opts),
  })
}

/** Estimate without a wallet client (useful for dry-run flows that don't yet have a signer). */
export function metadataEstimator(config: { publicClient: PublicClient }) {
  return {
    prepareSetMetadata: (opts: PrepareSetMetadataOptions) =>
      prepareSetMetadataImpl(config.publicClient, opts),
    estimateSetMetadata: (opts: EstimateSetMetadataOptions) =>
      estimateSetMetadataImpl(config.publicClient, opts),
  }
}
