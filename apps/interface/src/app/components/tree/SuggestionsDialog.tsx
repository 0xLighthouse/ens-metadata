'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTreeData } from '@/hooks/useTreeData'
import { type TreeNode } from '@/lib/tree/types'
import { HandCoins, Sparkles, UserCheck, Vault } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { CreateNodeDrawer } from './drawers/CreateNodeDrawer'

interface Suggestion {
  id: string
  title: string
  description: string
  icon: LucideIcon
  getNodes: (rootName: string) => TreeNode[]
}

interface SuggestionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SuggestionsDialog({ open, onOpenChange }: SuggestionsDialogProps) {
  const { sourceTree } = useTreeData()

  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<{
    id: string
    title: string
    nodes: TreeNode[]
  } | null>(null)

  if (!sourceTree) {
    return null
  }

  // Simple presets following convention: title, description, fields
  const suggestions: Suggestion[] = [
    {
      id: 'treasury',
      title: 'Treasury',
      description: 'Create a node which points to a shared treasury or vault',
      icon: Vault,
      getNodes: (rootName) => [
        {
          name: `treasury.${rootName}`,
        } as TreeNode,
      ],
    },
    {
      id: 'grant',
      title: 'Grant',
      description: 'Create a node to represent a grant program',
      icon: HandCoins,
      getNodes: (rootName) => [
        {
          name: `grant.${rootName}`,
        } as TreeNode,
      ],
    },
    {
      id: 'delegate',
      title: 'Delegate Information',
      description: 'Publish your delegate statement and conflict of interest',
      icon: UserCheck,
      getNodes: (rootName) => [
        {
          name: `delegate.${rootName}`,
        } as TreeNode,
      ],
    },
  ]

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    setSelectedSuggestion({
      id: suggestion.id,
      title: suggestion.title,
      nodes: suggestion.getNodes(sourceTree.name),
    })
    setCreateDrawerOpen(true)
    onOpenChange(false)
  }

  const handleCloseCreateDrawer = () => {
    setCreateDrawerOpen(false)
    setSelectedSuggestion(null)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              Add a node
            </DialogTitle>
            <DialogDescription>Add a node to fulfill one of these roles</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-4">
            {suggestions.map((suggestion) => {
              const Icon = suggestion.icon
              return (
                <button
                  type="button"
                  key={suggestion.id}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="group relative flex flex-col items-start gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-all text-left cursor-pointer"
                >
                  {/* Icon */}
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800 transition-colors">
                    <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>

                  {/* Content */}
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      {suggestion.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {suggestion.description}
                    </p>
                  </div>

                  {/* Hover indicator */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-indigo-600"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      {selectedSuggestion && (
        <CreateNodeDrawer
          isOpen={createDrawerOpen}
          onClose={handleCloseCreateDrawer}
          suggestionId={selectedSuggestion.id}
          suggestionTitle={selectedSuggestion.title}
          nodes={selectedSuggestion.nodes}
        />
      )}
    </>
  )
}
