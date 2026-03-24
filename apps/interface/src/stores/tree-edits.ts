import type { TreeNode } from '@/lib/tree/types'
import { create } from 'zustand'

export interface TreeMutation {
  createNode: boolean
  /** Snapshot of current on-chain text records (empty for creations) */
  texts: Record<string, string | null>
  /** Only the changed text record key/value pairs (the delta) */
  changes: Record<string, string | null>
  /** Keys explicitly cleared by the user (should become empty-string writes) */
  deleted: string[]
  /** For creations: direct parent node name */
  parentName?: string
}

interface TreeEditState {
  // Track all changes (edits and creations) keyed by node name
  pendingMutations: Map<string, TreeMutation>
  // Currently selected node for editing
  selectedNode: string | null
  // Drawer open state
  isEditDrawerOpen: boolean

  // Actions
  upsertEdit: (
    nodeName: string,
    texts: Record<string, string | null>,
    changes: Record<string, string | null>,
    deleted?: string[],
  ) => void
  queueCreation: (parentName: string, nodes: TreeNode[]) => void
  discardPendingMutation: (id: string) => void
  clearPendingMutations: () => void
  setSelectedNode: (nodeName: string | null) => void
  openEditDrawer: (nodeName: string) => void
  closeEditDrawer: () => void
  getPendingEdit: (nodeName: string) => TreeMutation | undefined
  hasPendingEdit: (nodeName: string) => boolean
}

export const useTreeEditStore = create<TreeEditState>((set, get) => ({
  pendingMutations: new Map(),
  selectedNode: null,
  isEditDrawerOpen: false,

  upsertEdit: (nodeName, texts, changes, deleted = []) =>
    set((state) => {
      const newMutations = new Map(state.pendingMutations)
      const existing = newMutations.get(nodeName)

      if (existing) {
        // Merge changes, keep original texts baseline
        newMutations.set(nodeName, {
          ...existing,
          changes: { ...existing.changes, ...changes },
          deleted: [...new Set([...existing.deleted, ...deleted])],
        })
      } else {
        newMutations.set(nodeName, { createNode: false, texts, changes, deleted })
      }
      return { pendingMutations: newMutations }
    }),

  queueCreation: (parentName, nodes) =>
    set((state) => {
      const newMutations = new Map(state.pendingMutations)

      const flatten = (nodes: TreeNode[], parent: string) => {
        for (const node of nodes) {
          // biome-ignore lint/suspicious/noExplicitAny: node property values are dynamic
          const changes: Record<string, any> = {}
          for (const [key, value] of Object.entries(node)) {
            if (key === 'children' || key === 'name') continue
            changes[key] = value
          }
          newMutations.set(node.name, {
            createNode: true,
            parentName: parent,
            texts: {},
            changes,
            deleted: [],
          })
          if (node.children) flatten(node.children, node.name)
        }
      }

      flatten(nodes, parentName)
      return { pendingMutations: newMutations }
    }),

  discardPendingMutation: (id) =>
    set((state) => {
      const newMutations = new Map(state.pendingMutations)
      newMutations.delete(id)
      return { pendingMutations: newMutations }
    }),

  clearPendingMutations: () => set({ pendingMutations: new Map() }),

  setSelectedNode: (nodeName) => set({ selectedNode: nodeName }),

  openEditDrawer: (nodeName) => set({ isEditDrawerOpen: true, selectedNode: nodeName }),

  closeEditDrawer: () => set({ isEditDrawerOpen: false, selectedNode: null }),

  getPendingEdit: (nodeName) => {
    const mutation = get().pendingMutations.get(nodeName)
    return mutation && !mutation.createNode ? mutation : undefined
  },

  hasPendingEdit: (nodeName) => {
    const mutation = get().pendingMutations.get(nodeName)
    return !!mutation && !mutation.createNode
  },
}))
