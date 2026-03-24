import { buildRawTree } from '@/lib/tree/buildRawTree'
import type { TreeNode } from '@/lib/tree/types'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TreeLoaderState {
  /**
   * The canonical raw tree data (domain and subnames) as expressed on-chain.
   */
  sourceTree: TreeNode | null
  treeRootName: string | null
  lastFetchedAt: number | null
  isLoading: boolean
  isRefreshing: boolean
  hasHydrated: boolean

  setHasHydrated: () => void
  loadTree: (rootName: string) => Promise<void>
  refreshTree: (rootName: string) => Promise<void>
  setTree: (tree: TreeNode | null) => void
}

export const useTreeLoaderStore = create<TreeLoaderState>()(
  persist(
    (set, get) => ({
      sourceTree: null,
      treeRootName: null,
      lastFetchedAt: null,
      isLoading: true,
      isRefreshing: false,
      hasHydrated: false,

      setHasHydrated: () => {
        const { sourceTree } = get()
        set({ hasHydrated: true, isLoading: !sourceTree })
      },

      loadTree: async (rootName) => {
        if (!rootName) {
          set({ isLoading: false })
          return
        }

        const { sourceTree, treeRootName } = get()
        if (sourceTree && treeRootName === rootName) {
          set({ isLoading: false })
          return
        }

        if (treeRootName !== rootName) {
          set({ sourceTree: null, treeRootName: rootName })
        }

        set({ isLoading: true })
        try {
          const tree = await buildRawTree(rootName)
          set({ sourceTree: tree, treeRootName: rootName, lastFetchedAt: Date.now() })
        } finally {
          set({ isLoading: false })
        }
      },

      refreshTree: async (rootName) => {
        if (!rootName) {
          set({ isRefreshing: false, isLoading: false })
          return
        }

        const { sourceTree, treeRootName } = get()
        const shouldReset = treeRootName !== rootName

        if (shouldReset) {
          set({ sourceTree: null, treeRootName: rootName, isLoading: true })
        }

        set({ isRefreshing: true, isLoading: shouldReset || !sourceTree })
        try {
          const tree = await buildRawTree(rootName)
          set({ sourceTree: tree, treeRootName: rootName, lastFetchedAt: Date.now() })
        } finally {
          set({ isRefreshing: false, isLoading: false })
        }
      },

      setTree: (tree) => {
        set({ sourceTree: tree })
      },
    }),
    {
      name: 'tree-loader-store',
      partialize: (state) => ({
        sourceTree: state.sourceTree,
        treeRootName: state.treeRootName,
        lastFetchedAt: state.lastFetchedAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated()
      },
    },
  ),
)
