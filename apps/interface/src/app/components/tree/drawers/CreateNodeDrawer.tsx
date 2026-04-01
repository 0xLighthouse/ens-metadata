'use client'

import { useOutsideClick } from '@/hooks/useOutsideClick'
import { useTreeData } from '@/hooks/useTreeData'
import { type TreeNode } from '@/lib/tree/types'
import { useNodeEditorStore } from '@/stores/node-editor'
import { useSchemaStore } from '@/stores/schemas'
import { useTreeEditStore } from '@/stores/tree-edits'
import { ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { AddressField } from './AddressField'
import { SchemaEditor } from './SchemaEditor'

interface Props {
  isOpen: boolean
  onClose: () => void
  suggestionId: string
  suggestionTitle: string
  nodes: TreeNode[]
}

export function CreateNodeDrawer({ isOpen, onClose, suggestionId, suggestionTitle, nodes }: Props) {
  const { sourceTree, previewTree } = useTreeData()
  const { queueCreation } = useTreeEditStore()
  const { schemas, fetchSchemas } = useSchemaStore()

  const {
    formData,
    currentSchemaId,
    isLoadingSchemas,
    resetEditor,
    updateField,
    setCurrentSchema,
    setIsLoadingSchemas,
  } = useNodeEditorStore()

  const [selectedParent, setSelectedParent] = useState<string>('')
  const [parentSearch, setParentSearch] = useState('')
  const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)

  const parentDropdownRef = useRef<HTMLDivElement>(null)

  useOutsideClick(parentDropdownRef, () => setIsParentDropdownOpen(false), isParentDropdownOpen)

  // Fetch schemas if not yet loaded
  useEffect(() => {
    if (schemas.length === 0 && !isLoadingSchemas) {
      setIsLoadingSchemas(true)
      fetchSchemas().finally(() => setIsLoadingSchemas(false))
    }
  }, [schemas.length, fetchSchemas, isLoadingSchemas, setIsLoadingSchemas])

  // On open: reset state and auto-select matching schema
  useEffect(() => {
    if (!isOpen || !sourceTree) return

    setSelectedParent(sourceTree.name)
    setParentSearch('')
    setIsParentDropdownOpen(false)
    resetEditor()

    const matched = schemas
      .filter((s) => s.isLatest)
      .find((s) => s.class.toLowerCase() === suggestionId.toLowerCase())

    if (matched) {
      setCurrentSchema(matched.id, matched, undefined)
    }
  }, [isOpen, sourceTree, suggestionId, schemas, resetEditor, setCurrentSchema])

  if (!sourceTree || !previewTree) return null

  // Build flat list of all nodes for parent combobox
  const collectAllNodes = (node: TreeNode): { name: string; depth: number }[] => {
    const result: { name: string; depth: number }[] = []
    const traverse = (n: TreeNode, depth: number) => {
      result.push({ name: n.name, depth })
      if (n.children) for (const child of n.children) traverse(child, depth + 1)
    }
    traverse(node, 0)
    return result
  }

  const availableParents = collectAllNodes(previewTree)
  const filteredParents = availableParents.filter((p) =>
    p.name.toLowerCase().includes(parentSearch.toLowerCase()),
  )

  const activeSchema = currentSchemaId ? schemas.find((s) => s.id === currentSchemaId) : null
  const addressFields = activeSchema?.properties
    ? Object.entries(activeSchema.properties).filter(([key]) => key === 'address')
    : []
  const addressFieldKeys = new Set(addressFields.map(([key]) => key))

  // Check if there are any form changes
  const hasChanges = useMemo(() => {
    return Object.values(formData).some((value) => {
      return value !== '' && value !== null && value !== undefined
    })
  }, [formData])

  const handleSelectSchema = (schemaId: string) => {
    const schema = schemas.find((s) => s.id === schemaId)
    if (!schema) return
    setCurrentSchema(schemaId, schema, undefined)
  }

  const handleCreate = () => {
    // Collect non-empty form values to merge into the primary node
    // biome-ignore lint/suspicious/noExplicitAny: form data values are dynamic
    const schemaChanges: Record<string, any> = {}
    for (const [key, value] of Object.entries(formData)) {
      if (value !== '' && value !== null && value !== undefined) {
        schemaChanges[key] = value
      }
    }

    // Merge schema fields only into the first (primary) node
    const augmentedNodes = nodes.map((node, i) => (i === 0 ? { ...node, ...schemaChanges } : node))

    queueCreation(selectedParent, augmentedNodes)
    handleClose()
  }

  // Called by onOpenChange (click outside, Escape) - ignores close if changes exist
  const handleClose = () => {
    if (hasChanges) {
      // Ignore the close attempt when there are unsaved changes
      return
    }
    // No changes, close immediately
    onClose()
    resetEditor()
  }

  // Called by X button and Cancel button - shows confirmation if changes exist
  const handleCloseWithConfirmation = () => {
    if (hasChanges) {
      setShowDiscardDialog(true)
      return
    }
    onClose()
    resetEditor()
  }

  const handleConfirmDiscard = () => {
    setShowDiscardDialog(false)
    onClose()
    resetEditor()
  }

  const handleCancelDiscard = () => {
    setShowDiscardDialog(false)
  }

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      direction="right"
      handleOnly={true}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          className="right-4 top-20 bottom-4 fixed z-50 outline-none w-[500px] flex"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          // biome-ignore lint/suspicious/noExplicitAny: CSS custom property not in React CSSProperties
          style={{ '--initial-transform': 'calc(100% + 16px)' } as any}
        >
          <div className="h-full w-full grow p-6 flex flex-col rounded-[16px] border-l border-white bg-[rgb(247,247,248)] dark:bg-neutral-900">
            {/* Header */}
            <div className="mb-6 relative">
              <button
                type="button"
                onClick={handleCloseWithConfirmation}
                className="absolute -top-2 -right-2 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer"
                aria-label="Close drawer"
              >
                <X size={20} />
              </button>
              <Drawer.Title className="font-semibold text-lg text-gray-900 dark:text-white mb-1">
                Create Node
              </Drawer.Title>
              <Drawer.Description className="text-sm text-gray-600 dark:text-gray-400">
                {suggestionTitle}
              </Drawer.Description>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {/* Parent Node Combobox */}
              <div ref={parentDropdownRef} className="relative">
                {/* biome-ignore lint/a11y/noLabelWithoutControl: controlled externally */}
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Parent Node
                </label>
                <button
                  type="button"
                  onClick={() => setIsParentDropdownOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500 transition-colors cursor-pointer"
                >
                  <span className="text-gray-900 dark:text-white font-mono text-xs truncate">
                    {selectedParent || 'Select parent…'}
                  </span>
                  <ChevronDown
                    size={16}
                    className="text-gray-500 dark:text-gray-400 shrink-0 ml-2"
                  />
                </button>

                {isParentDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50">
                    <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                        />
                        <input
                          type="text"
                          placeholder="Search nodes…"
                          value={parentSearch}
                          onChange={(e) => setParentSearch(e.target.value)}
                          className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          // biome-ignore lint/a11y/noAutofocus: intentional UX
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                      {filteredParents.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                          No nodes found
                        </div>
                      ) : (
                        filteredParents.map((parent) => (
                          <button
                            key={parent.name}
                            type="button"
                            onClick={() => {
                              setSelectedParent(parent.name)
                              setIsParentDropdownOpen(false)
                              setParentSearch('')
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${
                              selectedParent === parent.name
                                ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
                            }`}
                          >
                            <span
                              className="font-mono text-xs"
                              style={{ paddingLeft: `${parent.depth * 12}px` }}
                            >
                              {parent.name}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Lifted address fields */}
              {addressFields.length > 0 && (
                <>
                  <div className="space-y-2">
                    {addressFields.map(([key]) => (
                      <AddressField
                        key={key}
                        label={key}
                        value={formData[key] ?? ''}
                        onChange={(v) => updateField(key, v)}
                      />
                    ))}
                  </div>
                  <hr className="border-gray-200 dark:border-gray-700" />
                </>
              )}

              {/* Schema Fields */}
              <SchemaEditor
                activeSchema={activeSchema ?? null}
                addressFieldKeys={addressFieldKeys}
                onSelectSchema={handleSelectSchema}
                ensName={selectedParent}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={handleCloseWithConfirmation}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Create Node
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>

      {/* Discard Changes Confirmation Dialog */}
      {showDiscardDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismissal only needs click */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleCancelDiscard}
            aria-hidden="true"
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
              Are you sure you want to discard your changes?
            </h3>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancelDiscard}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              >
                No, continue editing
              </button>
              <button
                type="button"
                onClick={handleConfirmDiscard}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
              >
                Yes, discard
              </button>
            </div>
          </div>
        </div>
      )}
    </Drawer.Root>
  )
}
