import type { PublicClient, WalletClient } from 'viem'
import { isBasename } from '../chains/base'

/**
 * Chains the multichain wrapper layer knows how to dispatch to. Extend this
 * union when adding a new chain — `chainForName` and the wrapper layer pick
 * up new variants automatically once the type is updated.
 */
export type SupportedChain = 'mainnet' | 'base'

/**
 * Map of viem `PublicClient`s keyed by chain. `mainnet` is always required
 * because the multichain layer uses it for cross-chain operations like
 * resolving the attester ENS during attestation verification.
 */
export type ChainClients = {
  mainnet: PublicClient
  base?: PublicClient
}

/**
 * Map of viem `WalletClient`s keyed by chain. `mainnet` is always required;
 * other chains are optional and only needed when callers want to write to a
 * name that lives on that chain.
 */
export type ChainWalletClients = {
  mainnet: WalletClient
  base?: WalletClient
}

/**
 * Single source of truth for "given an ENS name, which chain does it live
 * on?". Apps that want to write their own dispatcher should use this helper
 * directly rather than re-implementing the suffix logic.
 */
export function chainForName(name: string): SupportedChain {
  return isBasename(name) ? 'base' : 'mainnet'
}

/**
 * Thrown when the multichain wrapper is asked to operate on a name whose
 * chain is not present in the supplied `ChainClients` map. `chain` and
 * `name` are populated so callers can surface a precise error message
 * ("missing Base client for foo.base.eth") to users.
 */
export class MissingChainClientError extends Error {
  chain: SupportedChain
  name: string

  constructor(chain: SupportedChain, name: string) {
    super(
      `Missing public client for chain '${chain}' required to operate on '${name}'. ` +
        `Provide a '${chain}' client in the ChainClients map.`,
    )
    this.chain = chain
    this.name = name
  }
}
