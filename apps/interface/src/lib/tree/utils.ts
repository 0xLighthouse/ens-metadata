import type { TreeNode } from './types'

/**
 * Recursively search for a node in the tree by address and optionally type
 */
export function findNodeByAddress(
  tree: TreeNode | null,
  address: `0x${string}`,
  type?: string,
): TreeNode | null {
  if (!tree) return null
  if (!tree.address) return null // Skip nodes without addresses

  // Normalize addresses to lowercase for comparison
  const normalizedSearchAddress = address.toLowerCase()
  const normalizedNodeAddress = tree.address.toLowerCase()

  // Check if address matches
  const addressMatches = normalizedNodeAddress === normalizedSearchAddress

  // If type is specified, check if it matches too
  if (addressMatches) {
    if (type === undefined) {
      // No type filter, just return the node
      return tree
    }
    // Check if type matches
    const nodeType = tree.texts?.class
    if (nodeType === type) {
      return tree
    }
  }

  // Search in children
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNodeByAddress(child, address, type)
      if (found) return found
    }
  }

  return null
}

/**
 * Find all nodes with the same address (regardless of type)
 */
export function findAllNodesByAddress(tree: TreeNode | null, address: `0x${string}`): TreeNode[] {
  const matches: TreeNode[] = []

  if (!tree) return matches

  const normalizedSearchAddress = address.toLowerCase()

  const collect = (node: TreeNode) => {
    // Skip nodes without addresses
    if (node.address && node.address.toLowerCase() === normalizedSearchAddress) {
      matches.push(node)
    }
    if (node.children) {
      node.children.forEach(collect)
    }
  }

  collect(tree)
  return matches
}

/**
 * Check if a node with the given address and type exists in the tree
 */
export function nodeExists(tree: TreeNode | null, address: `0x${string}`, type?: string): boolean {
  return findNodeByAddress(tree, address, type) !== null
}
