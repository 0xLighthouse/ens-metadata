import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TxnStatus = 'pending' | 'confirming' | 'confirmed' | 'failed'
export type TxnType = 'createSubname' | 'setRecords' | 'transferName'

export interface Txn {
  hash: `0x${string}`
  type: TxnType
  label: string
  status: TxnStatus
  confirmations: number
  submittedAt: number
  confirmedAt?: number
  error?: string
}

interface TxnsState {
  txns: Txn[]
  addTxn: (txn: Pick<Txn, 'hash' | 'type' | 'label'>) => void
  updateTxn: (hash: `0x${string}`, update: Partial<Txn>) => void
  watchTxn: (
    hash: `0x${string}`,
    // biome-ignore lint/suspicious/noExplicitAny: ensjs-extended PublicClient
    publicClient: any,
    requiredConfirmations?: number,
  ) => Promise<void>
  getByLabel: (label: string) => Txn | undefined
}

export const useTxnsStore = create<TxnsState>()(
  persist(
    (set, get) => ({
      txns: [],

      addTxn: ({ hash, type, label }) =>
        set((state) => ({
          txns: [
            {
              hash,
              type,
              label,
              status: 'pending',
              confirmations: 0,
              submittedAt: Date.now(),
            },
            ...state.txns,
          ],
        })),

      updateTxn: (hash, update) =>
        set((state) => ({
          txns: state.txns.map((t) => (t.hash === hash ? { ...t, ...update } : t)),
        })),

      getByLabel: (label) => get().txns.find((t) => t.label === label),

      watchTxn: async (hash, publicClient, requiredConfirmations = 2) => {
        const { updateTxn } = get()
        try {
          // Wait for inclusion (1st confirmation)
          const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
          if (receipt.status === 'reverted') {
            updateTxn(hash, { status: 'failed', error: 'Transaction reverted' })
            return
          }
          updateTxn(hash, { status: 'confirming', confirmations: 1 })

          // Wait for remaining confirmations
          if (requiredConfirmations > 1) {
            const final = await publicClient.waitForTransactionReceipt({
              hash,
              confirmations: requiredConfirmations,
            })
            if (final.status === 'reverted') {
              updateTxn(hash, { status: 'failed', error: 'Transaction reverted' })
              return
            }
          }

          updateTxn(hash, {
            status: 'confirmed',
            confirmations: requiredConfirmations,
            confirmedAt: Date.now(),
          })
          // biome-ignore lint/suspicious/noExplicitAny: catch block error shape
        } catch (err: any) {
          updateTxn(hash, { status: 'failed', error: err?.message ?? 'Transaction failed' })
        }
      },
    }),
    {
      name: 'txns-store',
      partialize: (state) => ({ txns: state.txns }),
    },
  ),
)
