'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useWeb3 } from '@/contexts/Web3Provider'
import { useOutsideClick } from '@/hooks/useOutsideClick'
import { useTreeData } from '@/hooks/useTreeData'
import type { TreeNode } from '@/lib/tree/types'
import { useTxnsStore } from '@/stores/txns'
import type { ClientWithAccount } from '@ensdomains/ensjs/contracts'
import { createSubname } from '@ensdomains/ensjs/wallet'
import { CheckCircle2, ChevronDown, ExternalLink, Loader2, Search, XCircle } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type TxState =
  | { status: 'idle' }
  | { status: 'simulating' }
  | { status: 'signing' }
  | { status: 'submitted'; hash: `0x${string}` }

function collectAllNodes(node: TreeNode): { name: string; depth: number }[] {
  const result: { name: string; depth: number }[] = []
  const traverse = (n: TreeNode, depth: number) => {
    result.push({ name: n.name, depth })
    if (n.children) for (const child of n.children) traverse(child, depth + 1)
  }
  traverse(node, 0)
  return result
}

function findNodeByName(root: TreeNode, name: string): TreeNode | null {
  if (root.name === name) return root
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeByName(child, name)
      if (found) return found
    }
  }
  return null
}

function parseUserError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Transaction failed'
  if (message.includes('denied') || message.includes('rejected the request')) {
    return 'Transaction rejected by user'
  }
  if (message.includes('execution reverted')) {
    // Extract a human-readable reason if present, otherwise generic message
    const reasonMatch = message.match(/reason:\s*(.+?)(?:\n|$)/)
    if (reasonMatch?.[1]) return `Transaction would revert: ${reasonMatch[1].trim()}`
    return 'Transaction would revert. You may not have permission to create subnames on this node.'
  }
  // Strip verbose viem details (everything after "Details:" or "Raw Call Arguments:")
  const shortMessage = message.split(/Details:|Raw Call Arguments:/)[0]?.trim()
  return shortMessage || message
}

export function CreateSubnameDialog({ open, onOpenChange }: Props) {
  const { publicClient, walletClient } = useWeb3()
  const { previewTree, refreshTree } = useTreeData()
  const { addTxn, watchTxn, getByLabel } = useTxnsStore()

  const [selectedParent, setSelectedParent] = useState('')
  const [parentSearch, setParentSearch] = useState('')
  const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [txState, setTxState] = useState<TxState>({ status: 'idle' })
  const [error, setError] = useState<string | null>(null)

  const parentDropdownRef = useRef<HTMLDivElement>(null)
  useOutsideClick(parentDropdownRef, () => setIsParentDropdownOpen(false), isParentDropdownOpen)

  const fullName = label && selectedParent ? `${label}.${selectedParent}` : ''
  const txn = fullName ? getByLabel(fullName) : undefined
  const isConfirmed = txn?.status === 'confirmed'
  const isConfirming = txn?.status === 'confirming'
  const isPending = txn?.status === 'pending'
  const isFailed = txn?.status === 'failed'
  const inFlight =
    txState.status === 'simulating' || txState.status === 'signing' || isPending || isConfirming

  const availableParents = previewTree ? collectAllNodes(previewTree) : []
  const filteredParents = availableParents.filter((p) =>
    p.name.toLowerCase().includes(parentSearch.toLowerCase()),
  )

  const canSubmit = label.trim() && selectedParent && walletClient && !inFlight && !isConfirmed

  const handleCreate = useCallback(async () => {
    if (!walletClient?.account || !walletClient.chain || !publicClient || !previewTree || !fullName)
      return

    const parentNode = findNodeByName(previewTree, selectedParent)
    if (!parentNode) {
      setError(`Parent node "${selectedParent}" not found`)
      return
    }

    setError(null)
    setTxState({ status: 'simulating' })

    const subnameParams = {
      name: fullName,
      owner: walletClient.account.address as `0x${string}`,
      contract: (parentNode.isWrapped ? 'nameWrapper' : 'registry') as 'nameWrapper' | 'registry',
    }

    try {
      // Simulate the transaction to catch reverts before prompting the wallet
      const txData = createSubname.makeFunctionData(
        walletClient as unknown as ClientWithAccount,
        subnameParams,
      )
      await publicClient.call({
        to: txData.to,
        data: txData.data,
        account: walletClient.account,
      })
    } catch (err: unknown) {
      setError(parseUserError(err))
      setTxState({ status: 'idle' })
      return
    }

    setTxState({ status: 'signing' })

    try {
      const hash = await createSubname(walletClient as unknown as ClientWithAccount, {
        ...subnameParams,
        account: walletClient.account,
      })

      setTxState({ status: 'submitted', hash })
      addTxn({ hash, type: 'createSubname', label: fullName })
      watchTxn(hash, publicClient)
    } catch (err: unknown) {
      setError(parseUserError(err))
      setTxState({ status: 'idle' })
    }
  }, [walletClient, publicClient, previewTree, fullName, selectedParent, addTxn, watchTxn])

  const handleClose = () => {
    setSelectedParent('')
    setLabel('')
    setParentSearch('')
    setTxState({ status: 'idle' })
    setError(null)
    if (isConfirmed) {
      refreshTree()
    }
    onOpenChange(false)
  }

  const txHash = txState.status === 'submitted' ? txState.hash : txn?.hash

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Create Subname</DialogTitle>
          <DialogDescription>
            Create a new subname under an existing node in your tree.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Parent node selector */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Parent Node
            </span>
            <div ref={parentDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setIsParentDropdownOpen(!isParentDropdownOpen)}
                disabled={inFlight || isConfirmed}
                className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span
                  className={
                    selectedParent ? 'font-mono text-gray-900 dark:text-gray-100' : 'text-gray-400'
                  }
                >
                  {selectedParent || 'Select a parent node…'}
                </span>
                <ChevronDown className="size-4 text-gray-400 shrink-0" />
              </button>

              {isParentDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-60 overflow-hidden">
                  <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search nodes…"
                        value={parentSearch}
                        onChange={(e) => setParentSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-900 outline-none focus:ring-1 focus:ring-indigo-500"
                        // biome-ignore lint/a11y/noAutofocus: dropdown search needs immediate focus
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-48">
                    {filteredParents.map((parent) => (
                      <button
                        key={parent.name}
                        type="button"
                        onClick={() => {
                          setSelectedParent(parent.name)
                          setIsParentDropdownOpen(false)
                          setParentSearch('')
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 font-mono ${
                          selectedParent === parent.name
                            ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                            : ''
                        }`}
                        style={{ paddingLeft: `${12 + parent.depth * 12}px` }}
                      >
                        {parent.name}
                      </button>
                    ))}
                    {filteredParents.length === 0 && (
                      <div className="px-3 py-3 text-sm text-gray-400 text-center">
                        No nodes found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Subname label input */}
          <div className="space-y-1.5">
            <label
              htmlFor="subname-label"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Subname Label
            </label>
            <input
              id="subname-label"
              type="text"
              placeholder="e.g. treasury"
              value={label}
              onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              disabled={inFlight || isConfirmed}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
            />
            {fullName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{fullName}</p>
            )}
          </div>

          {/* Transaction status */}
          {(txState.status !== 'idle' || txn) && (
            <div
              className={`rounded-lg border p-3 ${
                isConfirmed
                  ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
                  : isFailed
                    ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                {txState.status === 'simulating' && (
                  <>
                    <Loader2 className="size-4 animate-spin text-indigo-500" />
                    <span className="text-gray-600 dark:text-gray-400">
                      Simulating transaction…
                    </span>
                  </>
                )}
                {txState.status === 'signing' && (
                  <>
                    <Loader2 className="size-4 animate-spin text-indigo-500" />
                    <span className="text-gray-600 dark:text-gray-400">
                      Waiting for wallet signature…
                    </span>
                  </>
                )}
                {isPending && (
                  <>
                    <Loader2 className="size-4 animate-spin text-indigo-500" />
                    <span className="text-gray-600 dark:text-gray-400">
                      Transaction submitted, waiting for confirmation…
                    </span>
                  </>
                )}
                {isConfirming && (
                  <>
                    <Loader2 className="size-4 animate-spin text-indigo-500" />
                    <span className="text-gray-600 dark:text-gray-400">
                      Confirming ({txn?.confirmations ?? 1}/2)…
                    </span>
                  </>
                )}
                {isConfirmed && (
                  <>
                    <CheckCircle2 className="size-4 text-green-500" />
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      Subname created
                    </span>
                  </>
                )}
                {isFailed && (
                  <>
                    <XCircle className="size-4 text-red-500" />
                    <span className="text-red-600 dark:text-red-400">
                      {txn?.error ?? 'Transaction failed'}
                    </span>
                  </>
                )}
              </div>

              {txHash && (
                <a
                  href={`https://etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-500 font-mono"
                >
                  {txHash.slice(0, 10)}…{txHash.slice(-8)}
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          )}

          {/* Error from signing failure */}
          {error && !txn && (
            <p className="text-sm text-red-600 dark:text-red-400 break-words">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {isConfirmed ? 'Close' : 'Cancel'}
          </Button>
          {!isConfirmed && (
            <Button onClick={handleCreate} disabled={!canSubmit}>
              {inFlight && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {isFailed ? 'Retry' : 'Create'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
