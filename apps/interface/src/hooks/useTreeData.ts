import { mergePendingChanges } from '@/lib/tree/mergePreviewTree'
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
    return mergePendingChanges(sourceTree, pendingMutations)
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
