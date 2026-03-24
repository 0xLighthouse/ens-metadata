'use client'

import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useTreeData } from '@/hooks/useTreeData'
import { useEffect } from 'react'
import { ChangesBar } from './ChangesBar'
import { Tree } from './Tree'
import { TreeControls } from './TreeControls'
import { EditNodeDrawer } from './drawers/EditNodeDrawer'

export function TreeContainer() {
  const { previewTree, isLoading, hasHydrated, loadTree } = useTreeData()

  useEffect(() => {
    if (!hasHydrated) return
    void loadTree()
  }, [hasHydrated, loadTree])

  const showLoader = isLoading || !previewTree

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChangesBar />
      <div className="relative flex-1 min-h-0 w-full overflow-hidden">
        <TreeControls />
        <div className="absolute inset-0">{previewTree && <Tree data={previewTree} />}</div>
        {showLoader && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-600 dark:text-gray-300">
            <LoadingSpinner size={54} />
            <span className="text-sm font-medium">Fetching nodes...</span>
          </div>
        )}
      </div>
      <EditNodeDrawer />
    </div>
  )
}
