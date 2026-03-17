'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useWeb3 } from '@/contexts/Web3Provider'
import { useTxnsStore } from '@/stores/txns'
import { transferName } from '@ensdomains/ensjs/wallet'
import type { ClientWithAccount } from '@ensdomains/ensjs/contracts'
import { useState } from 'react'
import type { WalletClient } from 'viem'
import { isAddress } from 'viem'

const asEnsWalletClient = (walletClient: WalletClient): ClientWithAccount =>
  walletClient as unknown as ClientWithAccount

interface TransferManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeName: string
  currentOwner: string
  isWrapped: boolean
}

export function TransferManagerDialog({
  open,
  onOpenChange,
  nodeName,
  currentOwner,
  isWrapped,
}: TransferManagerDialogProps) {
  const { walletClient, publicClient } = useWeb3()
  const { addTxn, watchTxn } = useTxnsStore()
  const [newAddress, setNewAddress] = useState('')
  const [status, setStatus] = useState<'idle' | 'signing' | 'submitted' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const isValidAddress = isAddress(newAddress)
  const isSameAddress = newAddress.toLowerCase() === currentOwner.toLowerCase()

  const handleTransfer = async () => {
    if (!walletClient?.account || !isValidAddress || isSameAddress) return

    setStatus('signing')
    setError(null)

    try {
      const contract = isWrapped ? 'nameWrapper' : 'registry'

      const hash = await transferName(asEnsWalletClient(walletClient), {
        name: nodeName,
        newOwnerAddress: newAddress as `0x${string}`,
        contract,
        account: walletClient.account,
      })

      setStatus('submitted')
      addTxn({ hash, type: 'transferName', label: `Transfer ${nodeName}` })
      watchTxn(hash, publicClient)

      // Close dialog after successful submission
      setTimeout(() => {
        onOpenChange(false)
        setNewAddress('')
        setStatus('idle')
      }, 1500)
    } catch (err: any) {
      const message = err?.shortMessage || err?.message || 'Transaction failed'
      setError(message)
      setStatus('error')
    }
  }

  const handleClose = (open: boolean) => {
    if (status === 'signing') return
    onOpenChange(open)
    if (!open) {
      setNewAddress('')
      setStatus('idle')
      setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Manager</DialogTitle>
          <DialogDescription>
            Transfer management of <span className="font-medium text-gray-700">{nodeName}</span> to
            a new address. This will change who can edit records for this name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label
              htmlFor="new-manager-address"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              New manager address
            </label>
            <input
              id="new-manager-address"
              type="text"
              value={newAddress}
              onChange={(e) => {
                setNewAddress(e.target.value)
                setError(null)
              }}
              placeholder="0x..."
              disabled={status === 'signing' || status === 'submitted'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
            />
            {newAddress && !isValidAddress && (
              <p className="mt-1.5 text-xs text-red-500">Please enter a valid Ethereum address</p>
            )}
            {isSameAddress && isValidAddress && (
              <p className="mt-1.5 text-xs text-amber-500">
                This is already the current manager
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {status === 'submitted' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-600">
                Transaction submitted. The manager will update after confirmation.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => handleClose(false)}
            disabled={status === 'signing'}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleTransfer}
            disabled={!isValidAddress || isSameAddress || status === 'signing' || status === 'submitted'}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'signing' ? 'Confirm in wallet...' : 'Transfer'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
