import type { TreeNode } from './tree/types'

export type LinkType = 'ens' | 'safe' | 'explorer'

export interface ResolvedLink {
  url: string
  type: LinkType
  label: string
}

/**
 * Programmatically determine the best link for a node
 *
 * @param node - Tree node with address and metadata
 * @param chainId - Optional chain ID override (defaults to 1 for mainnet)
 * @returns Resolved link with URL, type, and label
 */
export function resolveLink(node: TreeNode, chainId = 1): ResolvedLink {
  const address = node.address
  // biome-ignore lint/suspicious/noExplicitAny: ensName added dynamically by inspection
  const ensName = (node as any).ensName
  const detectedType = node.inspectionData?.detectedType

  // If it's detected as a Safe Multisig, link to Safe UI
  if (detectedType === 'Safe Multisig' || detectedType?.toLowerCase().includes('safe')) {
    return {
      url: safeLink(address ?? '', chainId),
      type: 'safe',
      label: 'View on Safe',
    }
  }

  // If it has an ENS name or the node name looks like an ENS name
  if (ensName || node.name.includes('.')) {
    return {
      url: ensLink(ensName || node.name),
      type: 'ens',
      label: 'View on ENS',
    }
  }

  // Default to block explorer
  return {
    url: explorerLink(address ?? '', chainId),
    type: 'explorer',
    label: 'View on Explorer',
  }
}

/**
 * Generate a Safe UI link
 */
export function safeLink(address: string, chainId = 1): string {
  // Safe supports multiple chains with different prefixes
  const chainPrefix = getChainPrefix(chainId)
  return `https://app.safe.global/${chainPrefix}:${address}`
}

/**
 * Generate a block explorer link based on chain ID
 */
export function explorerLink(address: string, chainId = 1): string {
  const explorerBase = getExplorerBase(chainId)
  return `${explorerBase}/address/${address}`
}

/**
 * Generate an ENS app link
 */
export function ensLink(name: string): string {
  return `https://app.ens.domains/${name}`
}

/**
 * Get chain prefix for Safe UI URLs
 */
function getChainPrefix(chainId: number): string {
  switch (chainId) {
    case 1:
      return 'eth'
    case 10:
      return 'oeth'
    case 56:
      return 'bnb'
    case 100:
      return 'gno'
    case 137:
      return 'matic'
    case 8453:
      return 'base'
    case 42161:
      return 'arb1'
    case 43114:
      return 'avax'
    case 11155111:
      return 'sep' // Sepolia
    case 84532:
      return 'base-sep' // Base Sepolia
    case 421614:
      return 'arb-sep' // Arbitrum Sepolia
    default:
      return 'eth'
  }
}

/**
 * Get block explorer base URL for chain
 */
function getExplorerBase(chainId: number): string {
  switch (chainId) {
    case 1:
      return 'https://etherscan.io'
    case 10:
      return 'https://optimistic.etherscan.io'
    case 56:
      return 'https://bscscan.com'
    case 100:
      return 'https://gnosisscan.io'
    case 137:
      return 'https://polygonscan.com'
    case 8453:
      return 'https://basescan.org'
    case 42161:
      return 'https://arbiscan.io'
    case 43114:
      return 'https://snowtrace.io'
    case 11155111:
      return 'https://sepolia.etherscan.io'
    case 84532:
      return 'https://sepolia.basescan.org'
    case 421614:
      return 'https://sepolia.arbiscan.io'
    default:
      return 'https://etherscan.io'
  }
}
