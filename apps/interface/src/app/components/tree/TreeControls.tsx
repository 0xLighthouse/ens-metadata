'use client'

import { useTreeData } from '@/hooks/useTreeData'
import { type TreeNode } from '@/lib/tree/types'
import { useTreeControlsStore } from '@/stores/tree-controls'
import { Maximize2, Plus, RefreshCcw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { SuggestionsDialog } from './SuggestionsDialog'
import { CreateSubnameDialog } from './dialogs/CreateSubnameDialog'

export function TreeControls() {
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false)
  const [isCreateSubnameOpen, setIsCreateSubnameOpen] = useState(false)
  const { previewTree, isLoading, isRefreshing, refreshTree, lastFetchedAt } = useTreeData()
  const {
    orientation,
    collapsedNodes,
    nodePositions,
    setOrientation,
    collapseAll,
    expandAll,
    clearNodePositions,
    triggerLayout,
  } = useTreeControlsStore()

  // Collect all node names that have children
  const getAllNodesWithChildren = (node: TreeNode): string[] => {
    const names: string[] = []
    if (node.children && node.children.length > 0) {
      names.push(node.name)
      for (const child of node.children) {
        names.push(...getAllNodesWithChildren(child))
      }
    }
    return names
  }

  const handleCollapseAll = () => {
    if (!previewTree) return
    const allNodesWithChildren = getAllNodesWithChildren(previewTree)
    collapseAll(allNodesWithChildren)
  }

  const controlsDisabled = isLoading || !previewTree
  const hasCollapsedNodes = collapsedNodes.size > 0
  const refreshTitle = lastFetchedAt
    ? `Last refreshed ${new Date(lastFetchedAt).toLocaleString()}`
    : 'Refresh tree data'
  const refreshLabel = lastFetchedAt
    ? `Updated ${new Date(lastFetchedAt).toLocaleString()}`
    : 'Not updated yet'

  return (
    <>
      {/* Suggestions + refresh - top left */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsSuggestionsOpen(true)}
          disabled={controlsDisabled}
          className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors shadow-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          Add a Node
        </button>

        <button
          type="button"
          onClick={() => setIsCreateSubnameOpen(true)}
          disabled={controlsDisabled}
          className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors shadow-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create Subname
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshTree()}
            disabled={isLoading || isRefreshing}
            title={refreshTitle}
            className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors shadow-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            aria-busy={isRefreshing}
          >
            <RefreshCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {refreshLabel}
          </span>
        </div>
      </div>

      {/* Main controls - bottom left */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOrientation(orientation === 'vertical' ? 'horizontal' : 'vertical')}
          disabled={controlsDisabled}
          className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Flip Tree
        </button>

        <button
          type="button"
          onClick={triggerLayout}
          disabled={controlsDisabled}
          className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
          title="Fit layout to view"
        >
          <Maximize2 className="w-4 h-4" />
          Fit View
        </button>

        <button
          type="button"
          onClick={hasCollapsedNodes ? expandAll : handleCollapseAll}
          disabled={controlsDisabled}
          className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {hasCollapsedNodes ? 'Expand All' : 'Collapse All'}
        </button>

        {nodePositions.size > 0 && (
          <button
            type="button"
            onClick={clearNodePositions}
            disabled={controlsDisabled}
            className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="Reset all custom node positions"
          >
            Reset Layout
          </button>
        )}
      </div>

      <SuggestionsDialog open={isSuggestionsOpen} onOpenChange={setIsSuggestionsOpen} />
      <CreateSubnameDialog open={isCreateSubnameOpen} onOpenChange={setIsCreateSubnameOpen} />
    </>
  )
}
