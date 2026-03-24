'use client'

import { DiscardChangesDialog } from '@/components/dialogs/discard-changes-dialog'
import { NotAuthorizedDialog } from '@/components/dialogs/not-authorized-dialog'
import { useWeb3 } from '@/contexts/Web3Provider'
import { useTreeData } from '@/hooks/useTreeData'
import type { TreeNode } from '@/lib/tree/types'
import { useMutationsStore } from '@/stores/mutations'
import { useTreeEditStore } from '@/stores/tree-edits'
import { useCallback, useState } from 'react'
import { ApplyChangesDialog } from './ApplyChangesDialog'

export function ChangesBar() {
  const { pendingMutations, clearPendingMutations } = useTreeEditStore()
  const { submitMutations, submitCreation, status: mutationsStatus } = useMutationsStore()
  const { walletClient, publicClient } = useWeb3()
  const { sourceTree } = useTreeData()

  // Each entry in pendingMutations is one mutation (flattened)
  const changesCount = pendingMutations.size

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [unauthorizedNodes, setUnauthorizedNodes] = useState<string[]>([])
  const [isNotAuthorizedOpen, setIsNotAuthorizedOpen] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)

  const findNode = useCallback(
    (name: string, node: TreeNode | null = sourceTree): TreeNode | null => {
      if (!node) return null
      if (node.name === name) return node
      if (node.children) {
        for (const child of node.children) {
          const found = findNode(name, child)
          if (found) return found
        }
      }
      return null
    },
    [sourceTree],
  )

  const handleApplyChanges = async (mutationIds: string[]) => {
    if (!walletClient || !publicClient) return
    await submitMutations({ mutationIds, findNode, walletClient, publicClient })
  }

  const handleCreateSubname = useCallback(
    async (nodeName: string) => {
      if (!walletClient || !publicClient) return
      const mutation = pendingMutations.get(nodeName)

      if (!mutation?.createNode) return
      const parentNode = findNode(mutation.parentName ?? '')

      if (!parentNode) return
      await submitCreation({ nodeName, parentNode, walletClient, publicClient })
    },
    [walletClient, publicClient, pendingMutations, findNode, submitCreation],
  )

  if (changesCount === 0) return null

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full shadow-lg">
        {/* Changes Count */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-yellow-500 rounded-full" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {changesCount} {changesCount === 1 ? 'Change' : 'Changes'}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDiscardDialog(true)}
            className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer"
          >
            Reset
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-full hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            onClick={() => {
              const connectedAddress = walletClient?.account?.address?.toLowerCase()

              // Wallet not yet connected/initialized — don't show an auth error
              if (!connectedAddress) return

              // Collect nodes the connected wallet is NOT owner/manager of
              const notOwned: string[] = []
              for (const [nodeName] of pendingMutations.entries()) {
                const node = findNode(nodeName)
                // If node is absent from sourceTree (e.g. pending creation) treat it as
                // unauthorized — there is no owner record to verify against.
                const nodeOwner = node?.owner?.toLowerCase()
                if (!nodeOwner || connectedAddress !== nodeOwner) {
                  notOwned.push(nodeName)
                }
              }

              if (notOwned.length > 0) {
                setUnauthorizedNodes(notOwned)
                setIsNotAuthorizedOpen(true)
              } else {
                setIsDialogOpen(true)
              }
            }}
            disabled={mutationsStatus === 'executing'}
          >
            {mutationsStatus === 'executing' ? 'Publishing...' : 'Publish Changes'}
          </button>
        </div>
      </div>

      <ApplyChangesDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onConfirm={handleApplyChanges}
        onCreateSubname={handleCreateSubname}
      />

      <NotAuthorizedDialog
        open={isNotAuthorizedOpen}
        onOpenChange={setIsNotAuthorizedOpen}
        unauthorizedNodes={unauthorizedNodes}
      />

      <DiscardChangesDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
        onConfirm={clearPendingMutations}
      />
    </>
  )
}
