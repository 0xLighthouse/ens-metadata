import type { TreeNode } from '@/lib/tree/types'
import { useAppStore } from '@/stores/app'
import { useTreeEditStore } from '@/stores/tree-edits'
import { useTreeLoaderStore } from '@/stores/tree-loader'
import { useCallback, useMemo } from 'react'

export const useTreeData = () => {
  const {
    sourceTree: cachedTree,
    treeRootName: cachedRootName,
    lastFetchedAt,
    isLoading,
    isRefreshing,
    hasHydrated,
    loadTree,
    refreshTree,
    setTree,
  } = useTreeLoaderStore()
  const { activeDomain } = useAppStore()
  const { pendingMutations } = useTreeEditStore()

  const activeRootName = activeDomain?.name
  const isActiveTree = !!activeRootName && cachedRootName === activeRootName
  const sourceTree = isActiveTree ? cachedTree : null
  const lastFetchedAtForActiveDomain = isActiveTree ? lastFetchedAt : null

  const loadTreeForRoot = useCallback(async () => {
    if (!activeRootName) return
    await loadTree(activeRootName)
  }, [loadTree, activeRootName])

  const refreshTreeForRoot = useCallback(async () => {
    if (!activeRootName) return
    await refreshTree(activeRootName)
  }, [refreshTree, activeRootName])

  const addNodesToParent = useCallback(
    (parentName: string, newNodes: TreeNode[]) => {
      if (!isActiveTree || !sourceTree) return

      const addNodes = (node: TreeNode): TreeNode => {
        if (node.name === parentName) {
          return {
            ...node,
            children: [...(node.children || []), ...newNodes],
          }
        }
        if (node.children) {
          return {
            ...node,
            children: node.children.map(addNodes),
          }
        }
        return node
      }

      setTree(addNodes(sourceTree))
    },
    [isActiveTree, setTree, sourceTree],
  )

  /**
   * The tree data that is displayed to the user, including pending creations and edits.
   * This is used to render the tree in the UI.
   */
  const previewTree = useMemo(() => {
    if (!sourceTree) return null

    // Build a created subtree by recursively finding children among flattened creations
    const buildCreatedSubtree = (createdNode: TreeNode): TreeNode => {
      const childCreations = Array.from(pendingMutations.entries()).filter(
        ([_, m]) => m.createNode && m.parentName === createdNode.name,
      )

      const children: TreeNode[] = []
      for (const [nodeName, creation] of childCreations) {
        const childNode: TreeNode = {
          name: nodeName,
          id: nodeName,
          owner: createdNode.owner,
          resolverId: createdNode.resolverId,
          resolverAddress: createdNode.resolverAddress,
          isWrapped: createdNode.isWrapped,
          subdomainCount: 0,
          isPendingCreation: true,
          ...creation.changes,
        }
        children.push(buildCreatedSubtree(childNode))
      }

      return {
        ...createdNode,
        children:
          children.length > 0
            ? [...(createdNode.children ?? []), ...children]
            : createdNode.children,
      }
    }

    const mergePendingChanges = (node: TreeNode): TreeNode => {
      // Apply any pending edits to this node (direct lookup by name)
      const mutation = pendingMutations.get(node.name)
      let mergedNode = { ...node }
      if (mutation && !mutation.createNode) {
        if (mutation.changes) {
          mergedNode = { ...mergedNode, ...mutation.changes }
        }
        if (mutation.deleted?.length) {
          const newTexts = { ...(mergedNode.texts ?? {}) }
          for (const key of mutation.deleted) {
            delete newTexts[key]
            // biome-ignore lint/suspicious/noExplicitAny: dynamic tree node property deletion
            delete (mergedNode as any)[key]
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
        const createdNode: TreeNode = {
          name: nodeName,
          id: nodeName,
          owner: node.owner,
          resolverId: node.resolverId,
          resolverAddress: node.resolverAddress,
          isWrapped: node.isWrapped,
          subdomainCount: 0,
          isPendingCreation: true,
          ...creation.changes,
        }
        nodesToAdd.push(buildCreatedSubtree(createdNode))
      }

      // Add computed children from inspection data (e.g., signers from Safe multisig)
      const computedChildren = mergedNode.inspectionData?.computedChildren || []

      // Recursively process existing children
      const processedChildren = node.children?.map(mergePendingChanges) || []

      // Combine existing children with pending nodes and computed nodes
      const allChildren = [...processedChildren, ...nodesToAdd, ...computedChildren]

      return {
        ...mergedNode,
        children: allChildren.length > 0 ? allChildren : undefined,
      }
    }

    return mergePendingChanges(sourceTree)
  }, [sourceTree, pendingMutations])

  return {
    sourceTree,
    previewTree,
    lastFetchedAt: lastFetchedAtForActiveDomain,
    isLoading,
    isRefreshing,
    hasHydrated,
    loadTree: loadTreeForRoot,
    refreshTree: refreshTreeForRoot,
    addNodesToParent,
  }
}
