import type { TreeNode } from '@/lib/tree/types'
import { metadataWriter } from '@ens-node-metadata/sdk'
import type { ClientWithAccount } from '@ensdomains/ensjs/contracts'
import { createSubname } from '@ensdomains/ensjs/wallet'
import type { PublicClient, WalletClient } from 'viem'
import { create } from 'zustand'
import { type TreeMutation, useTreeEditStore } from './tree-edits'
import { useTxnsStore } from './txns'

const asEnsWalletClient = (walletClient: WalletClient): ClientWithAccount =>
  walletClient as unknown as ClientWithAccount

export interface MutationJob {
  mutationId: string
  ensName: string
  resolverAddress: string
  status: 'pending' | 'signing' | 'submitted' | 'confirmed' | 'error'
  txHash?: `0x${string}`
  error?: string
}

interface MutationsState {
  jobs: MutationJob[]
  status: 'idle' | 'executing' | 'done' | 'error'
  submitMutations: (params: {
    mutationIds: string[]
    findNode: (name: string) => TreeNode | null
    walletClient: WalletClient
    // biome-ignore lint/suspicious/noExplicitAny: ensjs-extended PublicClient
    publicClient: any
  }) => Promise<void>
  submitCreation: (params: {
    nodeName: string
    parentNode: TreeNode
    walletClient: WalletClient
    // biome-ignore lint/suspicious/noExplicitAny: ensjs-extended PublicClient
    publicClient: any
  }) => Promise<`0x${string}`>
  reset: () => void
}

export const useMutationsStore = create<MutationsState>((set, get) => ({
  jobs: [],
  status: 'idle',

  submitMutations: async ({ mutationIds, findNode, walletClient, publicClient }) => {
    if (!walletClient.chain || !walletClient.account) {
      console.error('[mutations] wallet client missing chain or account')
      set({ status: 'error' })
      return
    }

    const allMutations = useTreeEditStore.getState().pendingMutations
    const selectedMutations: [string, TreeMutation][] = []
    for (const id of mutationIds) {
      const m = allMutations.get(id)
      if (m) selectedMutations.push([id, m])
    }

    if (selectedMutations.length === 0) return

    // Separate creations from edits
    const creations = selectedMutations.filter(([_, m]) => m.createNode)
    const edits = selectedMutations.filter(([_, m]) => !m.createNode)

    // Build initial jobs list
    const jobs: MutationJob[] = []

    // Creations are placeholder — log warning and skip
    for (const [nodeName, creation] of creations) {
      console.warn(
        `[mutations] createSubname not yet implemented — skipping creation for parent "${creation.parentName}"`,
      )
    }

    // Group edits by ensName
    const editsByName = new Map<
      string,
      {
        resolverAddress: string
        delta: { changes: Record<string, string>; deleted: string[] }
        mutationIds: string[]
      }
    >()

    for (const [ensName, edit] of edits) {
      const node = findNode(ensName)
      const resolverAddress = node?.resolverAddress
      if (!resolverAddress) {
        console.warn(`[mutations] No resolver address found for "${ensName}" — skipping`)
        continue
      }

      const changes: Record<string, string> = {}
      if (edit.changes) {
        for (const [key, value] of Object.entries(edit.changes)) {
          if (value === null || value === undefined) continue
          changes[key] = String(value)
        }
      }

      const existing = editsByName.get(ensName)
      if (existing) {
        Object.assign(existing.delta.changes, changes)
        existing.delta.deleted.push(...(edit.deleted ?? []))
        existing.mutationIds.push(ensName)
      } else {
        editsByName.set(ensName, {
          resolverAddress,
          delta: { changes, deleted: edit.deleted ?? [] },
          mutationIds: [ensName],
        })
      }
    }

    // Build jobs from grouped edits
    for (const [ensName, { resolverAddress, mutationIds: mIds }] of editsByName) {
      for (const id of mIds) {
        jobs.push({
          mutationId: id,
          ensName,
          resolverAddress,
          status: 'pending',
        })
      }
    }

    set({ jobs, status: 'executing' })

    // Create SDK wallet extension for writes
    const writer = metadataWriter({ publicClient: publicClient as PublicClient })(walletClient)

    // Submit one applyDelta call per ensName
    for (const [ensName, { resolverAddress, delta, mutationIds: mIds }] of editsByName) {
      // Update jobs to signing
      set({
        jobs: get().jobs.map((j) =>
          mIds.includes(j.mutationId) ? { ...j, status: 'signing' as const } : j,
        ),
      })

      try {
        const result = await writer.applyDelta({
          name: ensName,
          delta,
          resolverAddress: resolverAddress as `0x${string}`,
        })

        // Track in txns store; discard mutation only after on-chain confirmation
        const { addTxn, watchTxn } = useTxnsStore.getState()
        addTxn({ hash: result.txHash, type: 'setRecords', label: ensName })
        watchTxn(result.txHash, publicClient).then(() => {
          const { txns } = useTxnsStore.getState()
          const txn = txns.find((t) => t.hash === result.txHash)
          if (txn?.status === 'confirmed') {
            const { discardPendingMutation } = useTreeEditStore.getState()
            for (const id of mIds) {
              discardPendingMutation(id)
            }
          }
        })

        // Update job to submitted (dialog tracks confirmed state via txns store)
        set({
          jobs: get().jobs.map((j) =>
            mIds.includes(j.mutationId)
              ? { ...j, status: 'submitted' as const, txHash: result.txHash }
              : j,
          ),
        })
        // biome-ignore lint/suspicious/noExplicitAny: catch block error shape
      } catch (err: any) {
        const errorMessage = err?.message ?? 'Transaction failed'
        set({
          jobs: get().jobs.map((j) =>
            mIds.includes(j.mutationId)
              ? { ...j, status: 'error' as const, error: errorMessage }
              : j,
          ),
          status: 'error',
        })
        console.error(`[mutations] setRecords failed for "${ensName}":`, err)
      }
    }

    // Discard creation mutations that were skipped (edit mutations are discarded in watchTxn callbacks)
    const { discardPendingMutation } = useTreeEditStore.getState()
    for (const [nodeName] of creations) {
      discardPendingMutation(nodeName)
    }

    // Set final status
    const finalJobs = get().jobs
    const hasErrors = finalJobs.some((j) => j.status === 'error')
    set({ status: hasErrors ? 'error' : 'done' })
  },

  submitCreation: async ({ nodeName, parentNode, walletClient, publicClient }) => {
    if (!walletClient.chain || !walletClient.account) {
      throw new Error('[mutations] wallet client missing chain or account')
    }

    const { addTxn, watchTxn } = useTxnsStore.getState()

    const hash = await createSubname(asEnsWalletClient(walletClient), {
      name: nodeName,
      owner: walletClient.account.address as `0x${string}`,
      contract: parentNode.isWrapped ? 'nameWrapper' : 'registry',
      account: walletClient.account,
    })

    addTxn({ hash, type: 'createSubname', label: nodeName })

    // Watch in background — discard the pending creation after 2 confirmations
    watchTxn(hash, publicClient).then(() => {
      const { txns } = useTxnsStore.getState()
      const txn = txns.find((t) => t.hash === hash)
      if (txn?.status === 'confirmed') {
        useTreeEditStore.getState().discardPendingMutation(nodeName)
      }
    })

    return hash
  },

  reset: () => set({ jobs: [], status: 'idle' }),
}))
