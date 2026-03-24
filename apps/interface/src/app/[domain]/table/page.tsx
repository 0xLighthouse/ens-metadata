'use client'

import { ApplyChangesDialog } from '@/app/components/tree/ApplyChangesDialog'
import { EditNodeDrawer } from '@/app/components/tree/drawers/EditNodeDrawer'
import { DiscardChangesDialog } from '@/components/dialogs/discard-changes-dialog'
import { NotAuthorizedDialog } from '@/components/dialogs/not-authorized-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useWeb3 } from '@/contexts/Web3Provider'
import { useTreeData } from '@/hooks/useTreeData'
import { getAvatarFallback } from '@/lib/getAvatarFallback'
import { shortAddress } from '@/lib/shortAddress'
import type { TreeNode } from '@/lib/tree/types'
import { useMutationsStore } from '@/stores/mutations'
import { useSchemaStore } from '@/stores/schemas'
import { useTreeEditStore } from '@/stores/tree-edits'
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, ChevronsUpDown, ExternalLink, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenTree(node: TreeNode, depth = 0): Array<{ node: TreeNode; depth: number }> {
  const result: Array<{ node: TreeNode; depth: number }> = []
  result.push({ node, depth })
  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenTree(child, depth + 1))
    }
  }
  return result
}

type SortKey = 'name' | 'parent' | 'class' | 'address'
type SortDir = 'asc' | 'desc' | null

interface TableColumn {
  id: string
  label: string
  sortKey?: SortKey
  defaultWidth: number
  minWidth: number
  maxWidth?: number
  resizable: boolean
}

const DEFAULT_COLUMNS: TableColumn[] = [
  {
    id: 'name',
    label: 'Name',
    sortKey: 'name',
    defaultWidth: 200,
    minWidth: 120,
    resizable: true,
  },
  {
    id: 'parent',
    label: 'Parent',
    sortKey: 'parent',
    defaultWidth: 250,
    minWidth: 150,
    resizable: true,
  },
  {
    id: 'class',
    label: 'Class',
    sortKey: 'class',
    defaultWidth: 180,
    minWidth: 120,
    resizable: true,
  },
  {
    id: 'address',
    label: 'Address',
    sortKey: 'address',
    defaultWidth: 200,
    minWidth: 140,
    resizable: true,
  },
  {
    id: 'owner',
    label: 'Owner',
    defaultWidth: 220,
    minWidth: 160,
    resizable: true,
  },
]

function useSortState(initial: SortKey) {
  const [key, setKey] = useState<SortKey>(initial)
  const [dir, setDir] = useState<SortDir>(null)

  const toggle = (col: SortKey) => {
    if (key !== col) {
      setKey(col)
      setDir('asc')
    } else if (dir === null) {
      setDir('asc')
    } else if (dir === 'asc') {
      setDir('desc')
    } else {
      setDir(null)
    }
  }

  return { key, dir, toggle }
}

/**
 * Compares two ENS names by namespace hierarchy (right-to-left).
 * Example: "def.abc.eth" < "abc.def.eth" because:
 *   - Both end with "eth"
 *   - Next level: "abc" < "def"
 *
 * @param nameA - First ENS name (e.g., "alice.dao.eth")
 * @param nameB - Second ENS name (e.g., "bob.dao.eth")
 * @returns negative if nameA < nameB, positive if nameA > nameB, 0 if equal
 */
function compareByNamespaceHierarchy(nameA: string, nameB: string): number {
  const partsA = nameA.split('.').reverse()
  const partsB = nameB.split('.').reverse()

  // Compare each segment from right to left (TLD first, then moving left)
  const minLength = Math.min(partsA.length, partsB.length)
  for (let i = 0; i < minLength; i++) {
    const comparison = partsA[i].localeCompare(partsB[i])
    if (comparison !== 0) {
      return comparison
    }
  }

  // If all compared segments are equal, shorter path comes first
  return partsA.length - partsB.length
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function SortIcon({ col, sortKey, dir }: { col: string; sortKey: string; dir: SortDir }) {
  if (col !== sortKey || dir === null) return <ChevronsUpDown size={14} className="text-gray-400" />
  if (dir === 'asc') return <ChevronUp size={14} className="text-indigo-500" />
  return <ChevronDown size={14} className="text-indigo-500" />
}

function ClassBadge({ label }: { label: string }) {
  const colorMap: Record<string, string> = {
    Agent: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    Treasury: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    Signer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    Delegate: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    Person: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
    Org: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    Application: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  }
  const cls = colorMap[label] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${cls}`}>
      {label}
    </span>
  )
}

function StatusBadge({ node }: { node: TreeNode }) {
  if (node.isPendingCreation)
    return (
      <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
        Pending creation
      </span>
    )
  if (node.isSuggested)
    return (
      <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        Suggested
      </span>
    )
  return (
    <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
      Live
    </span>
  )
}

function ResizeHandle({
  onResize,
}: {
  onResize: (delta: number) => void
}) {
  const [isResizing, setIsResizing] = useState(false)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation() // Prevent triggering column header click/drag
    setIsResizing(true)

    const startX = e.clientX

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX
      onResize(delta)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize transition-colors ${
        isResizing
          ? 'bg-indigo-500'
          : 'bg-gray-300 dark:bg-gray-600 hover:bg-indigo-400 dark:hover:bg-indigo-500'
      }`}
      style={{
        zIndex: 10,
        marginRight: '-4px', // Extend clickable area beyond column edge
      }}
    />
  )
}

function DraggableColHeader({
  column,
  sortKey,
  sortDir,
  onSort,
  onResize,
  width,
}: {
  column: TableColumn
  sortKey: string
  sortDir: SortDir
  onSort: (key: SortKey) => void
  onResize: (delta: number) => void
  width: number
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: `${width}px`,
    position: 'relative' as const,
    opacity: isDragging ? 0.5 : 1,
  }

  const handleHeaderClick = () => {
    if (column.sortKey) {
      onSort(column.sortKey)
    }
  }

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap"
      {...attributes}
      {...listeners}
      onClick={handleHeaderClick}
    >
      <span className="inline-flex items-center gap-1">
        {column.label}
        {column.sortKey && <SortIcon col={column.sortKey} sortKey={sortKey} dir={sortDir} />}
      </span>
      {column.resizable && (
        <ResizeHandle
          onResize={(delta) => {
            onResize(delta)
          }}
        />
      )}
    </th>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TablePage() {
  const { sourceTree, isLoading, hasHydrated, loadTree } = useTreeData()
  const { schemas, fetchSchemas } = useSchemaStore()
  const { pendingMutations, openEditDrawer, clearPendingMutations, hasPendingEdit } =
    useTreeEditStore()
  const { submitMutations, submitCreation, status: mutationsStatus } = useMutationsStore()
  const { walletClient, publicClient } = useWeb3()
  const [search, setSearch] = useState('')
  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false)
  const [unauthorizedNodes, setUnauthorizedNodes] = useState<string[]>([])
  const [isNotAuthorizedOpen, setIsNotAuthorizedOpen] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)

  // Column customization state (session-based, resets on page reload)
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_COLUMNS.map((c) => c.id))
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    Object.fromEntries(DEFAULT_COLUMNS.map((c) => [c.id, c.defaultWidth])),
  )

  // Trigger tree and schema loading on mount
  useEffect(() => {
    if (!hasHydrated) return
    void loadTree()
  }, [hasHydrated, loadTree])

  useEffect(() => {
    if (schemas.length === 0) void fetchSchemas()
  }, [schemas.length, fetchSchemas])
  const { key: sortKey, dir: sortDir, toggle: toggleSort } = useSortState('name')

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement to activate drag
      },
    }),
    useSensor(KeyboardSensor),
  )

  // Get ordered columns
  const orderedColumns = useMemo(
    () => columnOrder.map((id) => DEFAULT_COLUMNS.find((c) => c.id === id)!),
    [columnOrder],
  )

  // Helper to find a node in the tree
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

  // Handle applying changes
  const handleApplyChanges = async (mutationIds: string[]) => {
    if (!walletClient || !publicClient) return
    await submitMutations({ mutationIds, findNode, walletClient, publicClient })
  }

  // Handle creating subname
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

  // Handle clear button click - show confirmation dialog
  const handleClearClick = () => {
    setShowDiscardDialog(true)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setColumnOrder((prev) => {
        const oldIndex = prev.indexOf(active.id as string)
        const newIndex = prev.indexOf(over.id as string)
        const newOrder = [...prev]
        newOrder.splice(oldIndex, 1)
        newOrder.splice(newIndex, 0, active.id as string)
        return newOrder
      })
    }
  }

  const handleResize = (columnId: string, delta: number) => {
    setColumnWidths((prev) => {
      const column = DEFAULT_COLUMNS.find((c) => c.id === columnId)!
      const currentWidth = prev[columnId]
      const newWidth = Math.max(
        column.minWidth,
        Math.min(column.maxWidth ?? Number.POSITIVE_INFINITY, currentWidth + delta),
      )
      return { ...prev, [columnId]: newWidth }
    })
  }

  const rows = useMemo(() => {
    if (!sourceTree) return []
    return flattenTree(sourceTree)
  }, [sourceTree])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(({ node }) => {
      // biome-ignore lint/suspicious/noExplicitAny: class may exist on pending mutation merge
      const currentClass = ((node as any).class || node.texts?.class) as string | undefined
      const mutation = pendingMutations.get(node.name)
      const pendingClass = mutation?.changes?.class as string | undefined
      const classToSearch = pendingClass || currentClass
      const parentPath = node.name.split('.').slice(1).join('.')
      return (
        node.name.toLowerCase().includes(q) ||
        parentPath.toLowerCase().includes(q) ||
        (classToSearch?.toLowerCase().includes(q) ?? false) ||
        (node.address?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [rows, search, pendingMutations])

  const sorted = useMemo(() => {
    if (sortDir === null) return filtered
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort(({ node: a }, { node: b }) => {
      switch (sortKey) {
        case 'name': {
          const nameA = a.name.split('.')[0]
          const nameB = b.name.split('.')[0]
          return dir * nameA.localeCompare(nameB)
        }
        case 'parent': {
          const parentA = a.name.split('.').slice(1).join('.')
          const parentB = b.name.split('.').slice(1).join('.')
          // Use namespace-aware comparison for parent paths
          return dir * compareByNamespaceHierarchy(parentA, parentB)
        }
        case 'class': {
          // biome-ignore lint/suspicious/noExplicitAny: class may exist on pending mutation merge
          const currentClassA = ((a as any).class || a.texts?.class) ?? ''
          // biome-ignore lint/suspicious/noExplicitAny: class may exist on pending mutation merge
          const currentClassB = ((b as any).class || b.texts?.class) ?? ''
          const mutation = pendingMutations.get(a.name)
          const pendingClassA = mutation?.changes?.class as string | undefined
          const mutation2 = pendingMutations.get(b.name)
          const pendingClassB = mutation2?.changes?.class as string | undefined
          const ca = pendingClassA || currentClassA
          const cb = pendingClassB || currentClassB
          return dir * ca.localeCompare(cb)
        }
        case 'address':
          return dir * (a.address ?? '').localeCompare(b.address ?? '')
        default:
          return 0
      }
    })
  }, [filtered, sortKey, sortDir, pendingMutations])

  const schemaById = useMemo(() => new Map(schemas.map((s) => [s.id, s])), [schemas])

  // Helper to get pending class value if it exists
  const getPendingClassChange = (nodeName: string): string | null => {
    const mutation = pendingMutations.get(nodeName)
    if (!mutation || mutation.createNode) return null

    // Check if 'class' is in the changes
    if (mutation.changes && 'class' in mutation.changes) {
      return mutation.changes.class as string
    }
    return null
  }

  const renderCell = (column: TableColumn, node: TreeNode) => {
    const ensUrl = `https://app.ens.domains/${node.name}`
    const addressUrl = node.address ? `https://etherscan.io/address/${node.address}` : null
    const ownerUrl = `https://etherscan.io/address/${node.owner}`
    const displayName = node.name.split('.')[0]
    const parentPath = node.name.split('.').slice(1).join('.') || '—'

    switch (column.id) {
      case 'name':
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-gray-900 dark:text-white">
              {displayName}
            </span>
            <a
              href={ensUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer flex-shrink-0"
              title="Open in ENS app"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={10} />
            </a>
          </div>
        )

      case 'parent':
        return (
          <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{parentPath}</span>
        )

      case 'class': {
        // biome-ignore lint/suspicious/noExplicitAny: class may exist on pending mutation merge
        const currentClass = ((node as any).class || node.texts?.class) as string | undefined
        const pendingClass = getPendingClassChange(node.name)
        const displayClass = pendingClass || currentClass
        const hasPendingClassChange = !!pendingClass

        if (!displayClass) {
          return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
        }

        return (
          <div className="flex items-center gap-1.5">
            <div
              className={hasPendingClassChange ? 'relative' : ''}
              title={hasPendingClassChange ? `Class will change to "${displayClass}"` : ''}
            >
              {hasPendingClassChange && (
                <div className="absolute -inset-1 bg-orange-100 dark:bg-orange-900/20 rounded-full" />
              )}
              <div className="relative">
                <ClassBadge label={displayClass} />
              </div>
            </div>
            {hasPendingClassChange && (
              <div
                className="flex-shrink-0 w-2 h-2 rounded-full bg-orange-500 dark:bg-orange-400"
                title="Pending change"
              />
            )}
          </div>
        )
      }

      case 'address':
        return node.address ? (
          <a
            href={addressUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-mono text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            {shortAddress(node.address)}
            <ExternalLink size={10} className="text-gray-400" />
          </a>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
        )

      case 'owner':
        return (
          <a
            href={ownerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            <Avatar className="size-4 flex-shrink-0">
              <AvatarImage src={node.ownerEnsAvatar || `https://avatar.vercel.sh/${node.owner}`} />
              <AvatarFallback className="text-[8px] font-medium bg-gradient-to-br from-purple-400 to-pink-500 text-white">
                {getAvatarFallback(node.owner)}
              </AvatarFallback>
            </Avatar>
            <span style={{ fontFamily: node.ownerEnsName ? 'inherit' : 'monospace' }}>
              {node.ownerEnsName || shortAddress(node.owner)}
            </span>
            <ExternalLink size={10} className="text-gray-400" />
          </a>
        )

      default:
        return null
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading nodes…</p>
      </div>
    )
  }

  if (!sourceTree) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <p className="text-sm text-gray-500 dark:text-gray-400">No tree data available.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6 gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-xs w-full">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          />
          <input
            type="text"
            placeholder="Filter by name, class or address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
          {sorted.length} of {rows.length} nodes
        </span>

        {/* Pending changes bar (only show if changes exist) */}
        {pendingMutations.size > 0 && (
          <>
            <div className="flex-1" /> {/* Spacer to push to right */}
            <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-500 rounded-full" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {pendingMutations.size} {pendingMutations.size === 1 ? 'Change' : 'Changes'}
                </span>
              </div>
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
              <button
                type="button"
                onClick={handleClearClick}
                className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  const connectedAddress = walletClient?.account?.address?.toLowerCase()
                  if (!connectedAddress) return

                  const notOwned: string[] = []
                  for (const [nodeName] of pendingMutations.entries()) {
                    const node = findNode(nodeName)
                    const nodeOwner = node?.owner?.toLowerCase()
                    if (!nodeOwner || connectedAddress !== nodeOwner) {
                      notOwned.push(nodeName)
                    }
                  }

                  if (notOwned.length > 0) {
                    setUnauthorizedNodes(notOwned)
                    setIsNotAuthorizedOpen(true)
                  } else {
                    setIsApplyDialogOpen(true)
                  }
                }}
                disabled={mutationsStatus === 'executing'}
                className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-full hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mutationsStatus === 'executing' ? 'Publishing...' : 'Publish Changes'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60 sticky top-0 z-10">
              <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                <tr>
                  {orderedColumns.map((column) => (
                    <DraggableColHeader
                      key={column.id}
                      column={column}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      onResize={(delta) => handleResize(column.id, delta)}
                      width={columnWidths[column.id]}
                    />
                  ))}
                </tr>
              </SortableContext>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={orderedColumns.length}
                    className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    No nodes match your search.
                  </td>
                </tr>
              ) : (
                sorted.map(({ node, depth }) => (
                  <tr
                    key={node.name}
                    onClick={() => openEditDrawer(node.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') openEditDrawer(node.name)
                    }}
                    className={`transition-colors cursor-pointer ${
                      hasPendingEdit(node.name)
                        ? 'bg-orange-100 dark:bg-orange-900/20 hover:bg-orange-200 dark:hover:bg-orange-900/30 border-l-4 border-orange-400 dark:border-orange-500'
                        : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40'
                    }`}
                  >
                    {orderedColumns.map((column) => (
                      <td
                        key={column.id}
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ width: `${columnWidths[column.id]}px` }}
                      >
                        {renderCell(column, node)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DndContext>
      </div>

      <EditNodeDrawer />

      <ApplyChangesDialog
        open={isApplyDialogOpen}
        onOpenChange={setIsApplyDialogOpen}
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
    </div>
  )
}
