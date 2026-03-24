'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTreeData } from '@/hooks/useTreeData'
import { useTreeEditStore } from '@/stores/tree-edits'
import { useTxnsStore } from '@/stores/txns'
import { ExternalLink, Loader2, Receipt, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface ApplyChangesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (mutationIds: string[]) => void
  onCreateSubname: (nodeName: string) => Promise<void>
}

export function ApplyChangesDialog({
  open,
  onOpenChange,
  onConfirm,
  onCreateSubname,
}: ApplyChangesDialogProps) {
  const { pendingMutations } = useTreeEditStore()
  const { sourceTree } = useTreeData()
  const { getByLabel } = useTxnsStore()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [creatingSubnames, setCreatingSubnames] = useState<Set<string>>(new Set())

  // Array of [nodeName, mutation] entries
  const changesArray = useMemo(() => Array.from(pendingMutations.entries()), [pendingMutations])

  // Select all by default when dialog opens or mutations change
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(changesArray.map(([nodeName]) => nodeName)))
    }
  }, [open, changesArray])

  const findNode = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: recursive tree search returns dynamic node
    (name: string, node = sourceTree): any => {
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

  const groupedChanges = useMemo(() => {
    const groups = new Map<string, typeof changesArray>()
    for (const [nodeName, change] of changesArray) {
      let resolverAddress: string
      if (change.createNode) {
        resolverAddress = findNode(change.parentName ?? '')?.resolverAddress ?? 'unknown'
      } else {
        resolverAddress = findNode(nodeName)?.resolverAddress ?? 'unknown'
      }
      const existing = groups.get(resolverAddress)
      if (existing) {
        existing.push([nodeName, change])
      } else {
        groups.set(resolverAddress, [[nodeName, change]])
      }
    }
    return Array.from(groups.entries())
  }, [changesArray, findNode])

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Get key/value rows for a created node from its mutation changes
  // biome-ignore lint/suspicious/noExplicitAny: mutation change values are dynamic
  const getCreationRows = (changes: Record<string, any>): { key: string; value: string }[] => {
    const rows: { key: string; value: string }[] = []
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === '') continue
      rows.push({ key, value: String(value) })
    }
    return rows
  }

  if (!sourceTree) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Apply Changes</DialogTitle>
        </DialogHeader>

        {/* Scrollable cards */}
        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {groupedChanges.map(([resolverAddress, mutations]) => (
            <div key={resolverAddress}>
              {/* Group header */}
              <div className="flex items-center gap-2 px-1 py-1.5 mb-2">
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                  Resolver:
                </span>
                {resolverAddress !== 'unknown' ? (
                  <a
                    href={`https://etherscan.io/address/${resolverAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View Resolver on Etherscan"
                    className="text-xs text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 font-mono flex items-center gap-1"
                  >
                    {`${resolverAddress.slice(0, 6)}...${resolverAddress.slice(-4)}`}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                    Detecting…
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {mutations.map(([nodeName, change]) => {
                  const isSelected = selectedIds.has(nodeName)

                  if (change.createNode) {
                    const rows = getCreationRows(change.changes)
                    const txn = getByLabel(nodeName)
                    const isCreating = creatingSubnames.has(nodeName)
                    const isPending = txn?.status === 'pending'
                    const isConfirming = txn?.status === 'confirming'
                    const isConfirmed = txn?.status === 'confirmed'
                    const isFailed = txn?.status === 'failed'
                    const inFlight = isCreating || isPending || isConfirming

                    const handleCreate = async () => {
                      setCreatingSubnames((prev) => new Set(prev).add(nodeName))
                      try {
                        await onCreateSubname(nodeName)
                      } finally {
                        setCreatingSubnames((prev) => {
                          const next = new Set(prev)
                          next.delete(nodeName)
                          return next
                        })
                      }
                    }

                    return (
                      <div
                        key={nodeName}
                        className={`border rounded-lg p-3 transition-colors ${
                          isConfirmed
                            ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
                            : isFailed
                              ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
                              : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-2">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelection(nodeName)}
                            disabled={isConfirmed}
                          />
                          <span className="font-mono font-bold text-sm truncate">{nodeName}</span>
                          <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800 text-[10px] px-1.5 py-0 shrink-0">
                            New
                          </Badge>
                        </div>

                        {/* Key/value table */}
                        <table className="w-full text-xs">
                          <tbody>
                            {rows.map(({ key, value }) => (
                              <tr
                                key={key}
                                className="border-t border-gray-100 dark:border-gray-800"
                              >
                                <td className="py-1 pr-3 text-gray-500 dark:text-gray-400 font-medium w-36 align-top">
                                  {key}
                                </td>
                                <td className="py-1 text-green-600 dark:text-green-400 break-all">
                                  {value}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Txn status + action */}
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                          {/* Status indicator */}
                          <div className="flex items-center gap-1.5 text-xs">
                            {inFlight && (
                              <>
                                <Loader2 className="size-3 animate-spin text-indigo-500" />
                                <span className="text-gray-500 dark:text-gray-400">
                                  {isConfirming ? 'Confirming (1/2)…' : 'Waiting for transaction…'}
                                </span>
                              </>
                            )}
                            {isConfirmed && (
                              <>
                                <Receipt className="size-3 text-green-500" />
                                <span className="text-green-600 dark:text-green-400">
                                  Confirmed
                                </span>
                              </>
                            )}
                            {isFailed && (
                              <>
                                <XCircle className="size-3 text-red-500" />
                                <span className="text-red-600 dark:text-red-400 truncate max-w-48">
                                  {txn.error ?? 'Failed'}
                                </span>
                              </>
                            )}
                            {txn?.hash && (
                              <a
                                href={`https://etherscan.io/tx/${txn.hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 text-gray-400 hover:text-indigo-500 flex items-center gap-0.5"
                              >
                                <ExternalLink className="size-3" />
                              </a>
                            )}
                          </div>

                          {/* Action button */}
                          {!isConfirmed && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleCreate}
                              disabled={inFlight}
                            >
                              {inFlight ? <Loader2 className="size-3 animate-spin mr-1.5" /> : null}
                              {isFailed ? 'Retry' : 'Create Subname'}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  }

                  // Edit mutation
                  const editTxn = getByLabel(nodeName)
                  const originalNode = findNode(nodeName)

                  // Resolve original value: check node.texts first, then top-level
                  const resolveOriginal = (key: string) =>
                    // biome-ignore lint/suspicious/noExplicitAny: dynamic tree node shape for text record resolution
                    (originalNode as any)?.texts?.[key] ?? (originalNode as any)?.[key]

                  const entries = change.changes
                    ? Object.entries(change.changes).filter(([key, newValue]) => {
                        const originalValue = resolveOriginal(key)
                        if (newValue === originalValue) return false
                        if (newValue === null || newValue === undefined || newValue === '')
                          return false
                        if (key === 'inspectionData') return false
                        return true
                      })
                    : []

                  const addedFields = entries.filter(([key]) => {
                    const ov = resolveOriginal(key)
                    return ov === undefined || ov === null || ov === ''
                  })

                  const modifiedFields = entries.filter(([key]) => {
                    const ov = resolveOriginal(key)
                    return ov !== undefined && ov !== null && ov !== ''
                  })

                  return (
                    <div
                      key={nodeName}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                    >
                      {/* Header */}
                      <div className="flex items-center gap-2 mb-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelection(nodeName)}
                        />
                        <span className="font-mono font-bold text-sm truncate">{nodeName}</span>
                        {originalNode?.address && (
                          <a
                            href={`https://etherscan.io/address/${originalNode.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-mono flex items-center gap-1 shrink-0"
                          >
                            {`${originalNode.address.slice(0, 6)}...${originalNode.address.slice(-4)}`}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <Badge className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800 text-[10px] px-1.5 py-0 shrink-0">
                          Modified
                        </Badge>
                      </div>

                      {/* Key/value table */}
                      <table className="w-full text-xs">
                        <tbody>
                          {addedFields.map(([key, newValue]) => (
                            <tr key={key} className="border-t border-gray-100 dark:border-gray-800">
                              <td className="py-1 pr-3 text-gray-500 dark:text-gray-400 font-medium w-36 align-top">
                                {key}
                              </td>
                              <td className="py-1 text-green-600 dark:text-green-400 break-all">
                                {String(newValue)}
                              </td>
                            </tr>
                          ))}
                          {modifiedFields.map(([key, newValue]) => {
                            const originalValue = resolveOriginal(key)
                            return (
                              <tr
                                key={key}
                                className="border-t border-gray-100 dark:border-gray-800"
                              >
                                <td className="py-1 pr-3 text-gray-500 dark:text-gray-400 font-medium w-36 align-top">
                                  {key}
                                </td>
                                <td className="py-1 break-all">
                                  <span className="text-red-500 dark:text-red-400 line-through mr-2">
                                    {String(originalValue)}
                                  </span>
                                  <span className="text-green-600 dark:text-green-400">
                                    {String(newValue)}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                          {change.deleted?.map((key) => {
                            const originalValue = resolveOriginal(key)
                            return (
                              <tr
                                key={key}
                                className="border-t border-gray-100 dark:border-gray-800"
                              >
                                <td className="py-1 pr-3 text-red-500 dark:text-red-400 font-medium w-36 align-top line-through">
                                  {key}
                                </td>
                                <td className="py-1 text-red-500 dark:text-red-400 line-through break-all">
                                  {String(originalValue)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>

                      {/* Txn status + action */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-1.5 text-xs">
                          {(editTxn?.status === 'pending' || editTxn?.status === 'confirming') && (
                            <>
                              <Loader2 className="size-3 animate-spin text-indigo-500" />
                              <span className="text-gray-500 dark:text-gray-400">
                                {editTxn.status === 'confirming'
                                  ? 'Confirming (1/2)…'
                                  : 'Waiting for transaction…'}
                              </span>
                            </>
                          )}
                          {editTxn?.status === 'confirmed' && (
                            <>
                              <Receipt className="size-3 text-green-500" />
                              <span className="text-green-600 dark:text-green-400">Confirmed</span>
                            </>
                          )}
                          {editTxn?.status === 'failed' && (
                            <>
                              <XCircle className="size-3 text-red-500" />
                              <span className="text-red-600 dark:text-red-400 truncate max-w-48">
                                {editTxn.error ?? 'Failed'}
                              </span>
                            </>
                          )}
                          {editTxn?.hash && (
                            <a
                              href={`https://etherscan.io/tx/${editTxn.hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 text-gray-400 hover:text-indigo-500 flex items-center gap-0.5"
                            >
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                        {editTxn?.status !== 'confirmed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onConfirm([nodeName])}
                            disabled={
                              editTxn?.status === 'pending' || editTxn?.status === 'confirming'
                            }
                          >
                            {editTxn?.status === 'failed' ? 'Retry' : 'Save'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {selectedIds.size} of {changesArray.length} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Only submit edit mutations via bulk save — creations use per-card flow
                const editIds = Array.from(selectedIds).filter(
                  (id) => !pendingMutations.get(id)?.createNode,
                )
                onConfirm(editIds)
              }}
              disabled={
                Array.from(selectedIds).filter((id) => !pendingMutations.get(id)?.createNode)
                  .length === 0
              }
            >
              Publish Selected (
              {Array.from(selectedIds).filter((id) => !pendingMutations.get(id)?.createNode).length}
              )
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
