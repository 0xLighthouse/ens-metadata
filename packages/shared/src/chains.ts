/**
 * Per-chain configuration used to build chain-aware viem clients.
 *
 * Each entry is the single source of truth for everything chain-specific:
 *   - the viem `Chain` to build clients on (mainnet/sepolia get ensjs's
 *     `addEnsContracts` for built-in ENS contract metadata)
 *   - the RPC URL defaults applied last in the fallback chain
 *   - optional ENS-on-L2 addresses (registry + dedicated L2 resolver) used
 *     when writing to names whose subject lives on this chain
 *
 * Adding support for a new chain is one entry here plus one entry in
 * `chain-for-name.ts`.
 */
import { addEnsContracts } from '@ensdomains/ensjs'
import type { Address, Chain } from 'viem'
import { base, mainnet, sepolia } from 'viem/chains'

export interface ChainConfig {
  /** Numeric chain id (also the env var suffix: `RPC_URL_<id>`). */
  id: number
  /** Short slug used in chain-for-name rules and human output. */
  name: 'mainnet' | 'base' | 'sepolia'
  /**
   * viem `Chain` object used to build PublicClient/WalletClient. For mainnet
   * and sepolia this is `addEnsContracts(chain)` so ensjs's contract address
   * book is present; for Base we use the bare viem chain because ensjs's
   * `addEnsContracts` only supports mainnet and sepolia.
   */
  viemChain: Chain
  /** Curated supplemental RPCs used after `--rpc`/env, before viem defaults. */
  rpcDefaults: readonly string[]
  /**
   * Block explorer base URL for tx hashes. Trailing slash included.
   */
  explorerTxBase: string
  /**
   * ENS-on-L2 registry. Set when this chain hosts its own ENS registry
   * (e.g. Basenames on Base). Used by manager-lookup helpers when the SDK's
   * mainnet-bound `getOwner` can't resolve the name.
   */
  ensRegistry?: Address
  /**
   * Dedicated L2 resolver address. Pre-supplied to the SDK's
   * `prepareSetMetadata` via `opts.resolver` when writing to a name that
   * lives on this chain, bypassing the SDK's mainnet `getEnsResolver` lookup.
   */
  l2Resolver?: Address
}

const MAINNET: ChainConfig = {
  id: mainnet.id,
  name: 'mainnet',
  viemChain: addEnsContracts(mainnet),
  rpcDefaults: ['https://ethereum-rpc.publicnode.com', 'https://1rpc.io/eth'],
  explorerTxBase: 'https://etherscan.io/tx/',
}

const SEPOLIA: ChainConfig = {
  id: sepolia.id,
  name: 'sepolia',
  viemChain: addEnsContracts(sepolia),
  rpcDefaults: ['https://1rpc.io/sepolia', 'https://ethereum-sepolia-rpc.publicnode.com'],
  explorerTxBase: 'https://sepolia.etherscan.io/tx/',
}

const BASE: ChainConfig = {
  id: base.id,
  name: 'base',
  viemChain: base,
  rpcDefaults: ['https://base-rpc.publicnode.com', 'https://1rpc.io/base'],
  explorerTxBase: 'https://basescan.org/tx/',
  // Basenames deployment on Base mainnet
  // https://github.com/base/basenames
  ensRegistry: '0xb94704422c2a1e396835a571837aa5ae53285a95',
  l2Resolver: '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD',
}

const CHAINS: readonly ChainConfig[] = [MAINNET, SEPOLIA, BASE]

export function getChainById(id: number): ChainConfig | undefined {
  return CHAINS.find((c) => c.id === id)
}

export function getChainByName(name: ChainConfig['name']): ChainConfig {
  const chain = CHAINS.find((c) => c.name === name)
  if (!chain) throw new Error(`Unknown chain: ${name}`)
  return chain
}

export const MAINNET_CHAIN = MAINNET
