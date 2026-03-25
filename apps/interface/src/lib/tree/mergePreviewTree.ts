import type { TreeMutation } from '@/stores/tree-edits'
import type { TreeNode } from './types'

/**
 * Build a created subtree by recursively finding children among flattened creations.
 */
function buildCreatedSubtree(
  createdNode: TreeNode,
  pendingMutations: Map<string, TreeMutation>,
): TreeNode {
  const childCreations = Array.from(pendingMutations.entries()).filter(
    ([_, m]) => m.createNode && m.parentName === createdNode.name,
  )

  const children: TreeNode[] = []
  for (const [nodeName, creation] of childCreations) {
    // Only use creation.changes as texts — do NOT inherit parent (createdNode) texts.
    const textOnlyChanges: Record<string, string | null> = {}
    for (const [key, value] of Object.entries(creation.changes)) {
      if (typeof value === 'string' || value === null) {
        textOnlyChanges[key] = value
      }
    }
    const childNode: TreeNode = {
      name: nodeName,
      id: nodeName,
      owner: createdNode.owner,
      resolverId: createdNode.resolverId,
      resolverAddress: createdNode.resolverAddress,
      isWrapped: createdNode.isWrapped,
      subdomainCount: 0,
      isPendingCreation: true,
      texts: textOnlyChanges,
    }
    children.push(buildCreatedSubtree(childNode, pendingMutations))
  }

  return {
    ...createdNode,
    children:
      children.length > 0 ? [...(createdNode.children ?? []), ...children] : createdNode.children,
  }
}

/**
 * Recursively merge pending mutations into a tree, producing a preview tree.
 *
 * Text record changes are merged into `node.texts` only — never spread onto the
 * node top level where they could collide with structural TreeNode properties
 * (e.g. a "name" text record overwriting the ENS domain name).
 */
export function mergePendingChanges(
  node: TreeNode,
  pendingMutations: Map<string, TreeMutation>,
): TreeNode {
  // Apply any pending edits to this node (direct lookup by name)
  const mutation = pendingMutations.get(node.name)
  let mergedNode = { ...node }
  if (mutation && !mutation.createNode) {
    if (mutation.changes) {
      // Separate genuine text-record changes (string values) from structural
      // changes (e.g. inspectionData objects). Text-record changes go into
      // node.texts; structural changes are applied at the top level so that
      // properties like inspectionData are actually updated on the node.
      const textChanges: Record<string, string | null> = {}
      const structuralChanges: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(mutation.changes)) {
        if (typeof value === 'string' || value === null) {
          textChanges[key] = value
        } else {
          structuralChanges[key] = value
        }
      }
      mergedNode = {
        ...mergedNode,
        ...structuralChanges,
        texts: { ...(mergedNode.texts ?? {}), ...textChanges },
      }
    }
    if (mutation.deleted?.length) {
      const newTexts = { ...(mergedNode.texts ?? {}) }
      for (const key of mutation.deleted) {
        delete newTexts[key]
      }
      mergedNode = { ...mergedNode, texts: newTexts }
    }
  }

  // Find any pending creations whose parent is this node
  const creationsForNode = Array.from(pendingMutations.entries()).filter(
    ([_, m]) => m.createNode && m.parentName === node.name,
  )

  const nodesToAdd: TreeNode[] = []
  for (const [nodeName, creation] of creationsForNode) {
    // Only seed texts from creation.changes — do NOT inherit parent texts.
    // Spreading parent texts would incorrectly propagate the parent's ENS
    // text records (description, avatar, etc.) into the child subdomain.
    const textOnlyChanges: Record<string, string | null> = {}
    for (const [key, value] of Object.entries(creation.changes)) {
      if (typeof value === 'string' || value === null) {
        textOnlyChanges[key] = value
      }
    }
    const createdNode: TreeNode = {
      name: nodeName,
      id: nodeName,
      owner: node.owner,
      resolverId: node.resolverId,
      resolverAddress: node.resolverAddress,
      isWrapped: node.isWrapped,
      subdomainCount: 0,
      isPendingCreation: true,
      texts: textOnlyChanges,
    }
    nodesToAdd.push(buildCreatedSubtree(createdNode, pendingMutations))
  }

  // Add computed children from inspection data (e.g., signers from Safe multisig)
  const computedChildren = mergedNode.inspectionData?.computedChildren || []

  // Recursively process existing children
  const processedChildren =
    node.children?.map((child) => mergePendingChanges(child, pendingMutations)) || []

  // Combine existing children with pending nodes and computed nodes
  const allChildren = [...processedChildren, ...nodesToAdd, ...computedChildren]

  return {
    ...mergedNode,
    children: allChildren.length > 0 ? allChildren : undefined,
  }
}
