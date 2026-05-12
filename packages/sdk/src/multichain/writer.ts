import type { WalletClient } from 'viem'
import { BASE_CHAIN_ID, getBaseResolverAddress } from '../chains/base'
import {
  type ChainClients,
  type ChainWalletClients,
  MissingChainClientError,
  type SupportedChain,
  chainForName,
} from './routing'
import type {
  ApplyDeltaOptions,
  EstimateResult,
  EstimateSetMetadataOptions,
  PrepareResult,
  PrepareSetMetadataOptions,
  SetMetadataOptions,
  SetMetadataResult,
} from '../types'
import { MetadataWriteError, metadataEstimator, metadataWriter } from '../write'

type WriterApi = ReturnType<ReturnType<typeof metadataWriter>>
type EstimatorApi = ReturnType<typeof metadataEstimator>

/**
 * Assert the wallet client paired with `chain` is connected to that chain's
 * id. Mainnet (chain 1) is permissive — many wallets surface as
 * `chain.id === undefined` for read-only or signer-only modes — so we only
 * enforce when we have a positive expected id (currently Base).
 */
function assertWalletOnChain(walletClient: WalletClient, chain: SupportedChain, name: string) {
  if (chain !== 'base') return
  if (walletClient.chain?.id !== BASE_CHAIN_ID) {
    throw new MetadataWriteError(
      `wallet for '${name}' must be connected to Base (chain ${BASE_CHAIN_ID})`,
      [],
      'wrong-chain',
    )
  }
}

/**
 * For basename writes, the resolver address lives on the L2 registry rather
 * than the mainnet universal resolver. The single-chain writer no longer
 * routes by chain, so the multichain wrapper pre-resolves the resolver here
 * and forwards it to the core writer via `opts.resolverAddress`. Mainnet
 * names are left untouched — the core writer reads the resolver itself.
 */
async function withBasenameResolver<T extends { name: string; resolverAddress?: `0x${string}` }>(
  chain: SupportedChain,
  publicClients: ChainClients,
  opts: T,
): Promise<T> {
  if (chain !== 'base') return opts
  if (opts.resolverAddress) return opts
  const baseClient = publicClients.base
  if (!baseClient) throw new MissingChainClientError('base', opts.name)
  const resolverAddress = await getBaseResolverAddress(baseClient, opts.name)
  return { ...opts, resolverAddress }
}

/**
 * Multichain wrapper around `metadataWriter`. Holds one core writer per
 * configured chain and dispatches each call to the writer for
 * `chainForName(opts.name)`. Throws `MissingChainClientError` when the
 * required chain's clients are not in the maps. Enforces the wallet-on-
 * correct-chain guard on each write so a misconfigured wallet fails fast
 * instead of producing a transaction on the wrong network.
 */
export function multichainMetadataWriter(config: {
  publicClients: ChainClients
  walletClients: ChainWalletClients
}) {
  const writers: { mainnet: WriterApi; base: WriterApi | null } = {
    mainnet: metadataWriter({ publicClient: config.publicClients.mainnet })(
      config.walletClients.mainnet,
    ),
    base:
      config.publicClients.base && config.walletClients.base
        ? metadataWriter({ publicClient: config.publicClients.base })(config.walletClients.base)
        : null,
  }

  function pick(name: string): { writer: WriterApi; chain: SupportedChain } {
    const chain = chainForName(name)
    if (chain === 'base') {
      if (!writers.base) throw new MissingChainClientError('base', name)
      return { writer: writers.base, chain }
    }
    return { writer: writers.mainnet, chain }
  }

  function pickAndGuard(name: string): WriterApi {
    const { writer, chain } = pick(name)
    const wallet =
      chain === 'base' ? (config.walletClients.base as WalletClient) : config.walletClients.mainnet
    assertWalletOnChain(wallet, chain, name)
    return writer
  }

  // The methods are async so synchronous dispatch errors (missing chain
  // client, wallet on the wrong chain) surface as promise rejections rather
  // than throwing into the caller's call site.
  return {
    setMetadata: async (opts: SetMetadataOptions): Promise<SetMetadataResult> => {
      const writer = pickAndGuard(opts.name)
      const chain = chainForName(opts.name)
      return writer.setMetadata(await withBasenameResolver(chain, config.publicClients, opts))
    },
    applyDelta: async (opts: ApplyDeltaOptions): Promise<SetMetadataResult> =>
      pickAndGuard(opts.name).applyDelta(opts),
    setMetadataWithDelta: async (opts: PrepareSetMetadataOptions): Promise<SetMetadataResult> => {
      const writer = pickAndGuard(opts.name)
      const chain = chainForName(opts.name)
      return writer.setMetadataWithDelta(
        await withBasenameResolver(chain, config.publicClients, opts),
      )
    },
    prepareSetMetadata: async (opts: PrepareSetMetadataOptions): Promise<PrepareResult> => {
      const { writer, chain } = pick(opts.name)
      return writer.prepareSetMetadata(await withBasenameResolver(chain, config.publicClients, opts))
    },
    estimateSetMetadata: async (opts: EstimateSetMetadataOptions): Promise<EstimateResult> => {
      const { writer, chain } = pick(opts.name)
      return writer.estimateSetMetadata(
        await withBasenameResolver(chain, config.publicClients, opts),
      )
    },
  }
}

/**
 * Multichain estimator. No wallet client required; same dispatch rules as
 * `multichainMetadataWriter`, exposing only the prepare/estimate methods.
 */
export function multichainMetadataEstimator(config: { publicClients: ChainClients }) {
  const estimators: { mainnet: EstimatorApi; base: EstimatorApi | null } = {
    mainnet: metadataEstimator({ publicClient: config.publicClients.mainnet }),
    base: config.publicClients.base
      ? metadataEstimator({ publicClient: config.publicClients.base })
      : null,
  }

  function pick(name: string): { estimator: EstimatorApi; chain: SupportedChain } {
    const chain = chainForName(name)
    if (chain === 'base') {
      if (!estimators.base) throw new MissingChainClientError('base', name)
      return { estimator: estimators.base, chain }
    }
    return { estimator: estimators.mainnet, chain }
  }

  return {
    prepareSetMetadata: async (opts: PrepareSetMetadataOptions): Promise<PrepareResult> => {
      const { estimator, chain } = pick(opts.name)
      return estimator.prepareSetMetadata(
        await withBasenameResolver(chain, config.publicClients, opts),
      )
    },
    estimateSetMetadata: async (opts: EstimateSetMetadataOptions): Promise<EstimateResult> => {
      const { estimator, chain } = pick(opts.name)
      return estimator.estimateSetMetadata(
        await withBasenameResolver(chain, config.publicClients, opts),
      )
    },
  }
}
