import type { Chain } from 'viem'
import {
  mainnet,
  sepolia,
  base,
  baseSepolia,
  abstract as abstractChain,
  abstractTestnet,
  arbitrum,
  arbitrumSepolia,
  avalanche,
  avalancheFuji,
  celo,
  celoAlfajores,
  gnosis,
  linea,
  lineaSepolia,
  mantle,
  mantleSepoliaTestnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  scroll,
  scrollSepolia,
  taiko,
  monadTestnet,
  bsc,
  bscTestnet,
} from 'viem/chains'

/**
 * CREATE2 deterministic addresses for ERC-8004 registries.
 * @see https://github.com/erc-8004/erc-8004-contracts
 */
export const IDENTITY_REGISTRY_MAINNET = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const
export const IDENTITY_REGISTRY_TESTNET = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const

type ChainEntry = {
  chain: Chain
  testnet: boolean
}

const CHAINS: Record<string, ChainEntry> = {
  mainnet: { chain: mainnet, testnet: false },
  sepolia: { chain: sepolia, testnet: true },
  base: { chain: base, testnet: false },
  'base-sepolia': { chain: baseSepolia, testnet: true },
  abstract: { chain: abstractChain, testnet: false },
  'abstract-testnet': { chain: abstractTestnet, testnet: true },
  arbitrum: { chain: arbitrum, testnet: false },
  'arbitrum-sepolia': { chain: arbitrumSepolia, testnet: true },
  avalanche: { chain: avalanche, testnet: false },
  'avalanche-fuji': { chain: avalancheFuji, testnet: true },
  celo: { chain: celo, testnet: false },
  'celo-alfajores': { chain: celoAlfajores, testnet: true },
  gnosis: { chain: gnosis, testnet: false },
  linea: { chain: linea, testnet: false },
  'linea-sepolia': { chain: lineaSepolia, testnet: true },
  mantle: { chain: mantle, testnet: false },
  'mantle-sepolia': { chain: mantleSepoliaTestnet, testnet: true },
  optimism: { chain: optimism, testnet: false },
  'optimism-sepolia': { chain: optimismSepolia, testnet: true },
  polygon: { chain: polygon, testnet: false },
  'polygon-amoy': { chain: polygonAmoy, testnet: true },
  scroll: { chain: scroll, testnet: false },
  'scroll-sepolia': { chain: scrollSepolia, testnet: true },
  taiko: { chain: taiko, testnet: false },
  'monad-testnet': { chain: monadTestnet, testnet: true },
  bsc: { chain: bsc, testnet: false },
  'bsc-testnet': { chain: bscTestnet, testnet: true },
}

export const SUPPORTED_CHAINS = Object.keys(CHAINS) as [string, ...string[]]

export function resolveChain(chainName: string): { chain: Chain; registryAddress: `0x${string}` } {
  const entry = CHAINS[chainName]
  if (!entry) throw new Error(`Unsupported chain: ${chainName}`)
  return {
    chain: entry.chain,
    registryAddress: entry.testnet ? IDENTITY_REGISTRY_TESTNET : IDENTITY_REGISTRY_MAINNET,
  }
}
