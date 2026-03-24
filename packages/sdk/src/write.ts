import type { PublicClient, WalletClient } from 'viem'
import { normalize } from 'viem/ens'
import type {
  ApplyDeltaOptions,
  MetadataDelta,
  SetMetadataOptions,
  SetMetadataResult,
} from './types'
import { validateMetadataSchema } from './validate'

export class MetadataWriteError extends Error {
  errors: { key: string; message: string }[]

  constructor(message: string, errors: { key: string; message: string }[]) {
    super(message)
    this.name = 'MetadataWriteError'
    this.errors = errors
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
  const resolver = await (publicClient as any).getEnsResolver({ name })
  if (!resolver) throw new MetadataWriteError(`No resolver found for ${name}`, [])
  const address = typeof resolver === 'string' ? resolver : resolver.address
  return address as `0x${string}`
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
  publicClient: PublicClient,
  opts: ApplyDeltaOptions,
): Promise<SetMetadataResult> {
  const name = normalize(opts.name)
  const { texts, coins } = deltaToRecords(opts.delta)

  if (texts.length === 0 && coins.length === 0) {
    throw new MetadataWriteError('No records to write', [])
  }

  const { setRecords } = await import('@ensdomains/ensjs/wallet')
  const txHash = await setRecords(walletClient as any, {
    name,
    texts,
    coins,
    resolverAddress: opts.resolverAddress,
    account: walletClient.account!,
  })

  return { txHash, texts, coins }
}

export function metadataWriter(config: { publicClient: PublicClient }) {
  return (walletClient: WalletClient) => ({
    setMetadata: (opts: SetMetadataOptions) =>
      setMetadataImpl(walletClient, config.publicClient, opts),
    applyDelta: (opts: ApplyDeltaOptions) =>
      applyDeltaImpl(walletClient, config.publicClient, opts),
  })
}
