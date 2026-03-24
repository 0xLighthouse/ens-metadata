'use client'

import { resolveLink } from '@/lib/links'
import { shortAddress } from '@/lib/shortAddress'
import type { TreeNode } from '@/lib/tree/types'
import type { Node, NodeProps } from '@xyflow/react'
import { Sparkles, UserCheck } from 'lucide-react'
import { memo } from 'react'
import { ExternalActionButton } from './ExternalActionButton'
import { NodeContainer } from './NodeContainer'
import { NodeIcon } from './NodeIcon'

interface DomainTreeNodeData {
  [key: string]: unknown
  node: TreeNode
  isSelected: boolean
  hasChildren: boolean
  isCollapsed: boolean
  hasPendingEdits: boolean
  childrenCount: number
  orientation: 'vertical' | 'horizontal'
  onToggleCollapse: () => void
}

type DomainTreeNode = Node<DomainTreeNodeData>

interface SignerNodeProps {
  node: TreeNode
  isSelected: boolean
  hasChildren?: boolean
  isCollapsed?: boolean
  hasPendingEdits?: boolean
  onToggleCollapse?: () => void
  childrenCount?: number
}

const SignerNodeCard = ({
  node,
  isSelected,
  hasChildren = false,
  isCollapsed = false,
  hasPendingEdits = false,
  onToggleCollapse,
  childrenCount = 0,
}: SignerNodeProps) => {
  const displayName = node.name.split('.')[0]
  // biome-ignore lint/suspicious/noExplicitAny: ensName added by inspection computed nodes
  const ensName = (node as any).ensName
  // biome-ignore lint/suspicious/noExplicitAny: ensAvatar added by inspection computed nodes
  const ensAvatar = (node as any).ensAvatar

  const accentColor = '#6366f1' // indigo for signers

  const isSuggested = node.isSuggested || false
  const isPendingCreation = node.isPendingCreation || false

  // Resolve the appropriate link for this node
  const link = resolveLink(node)

  return (
    <NodeContainer
      isSelected={isSelected}
      isPendingCreation={isPendingCreation}
      hasPendingEdits={hasPendingEdits}
      isSuggested={isSuggested}
      isCollapsed={isCollapsed}
      hasChildren={hasChildren}
      accentColor={accentColor}
    >
      {/* Header with icon and name */}
      <div
        className="relative flex items-center gap-3 p-4 border-b"
        style={{
          backgroundColor: isSuggested
            ? '#f8fafc'
            : isPendingCreation
              ? '#eef2ff'
              : hasPendingEdits
                ? '#e0e7ff'
                : 'white',
          borderBottomColor: isSuggested
            ? '#e2e8f0'
            : isPendingCreation
              ? '#c7d2fe'
              : hasPendingEdits
                ? '#a5b4fc'
                : '#c7d2fe',
        }}
      >
        <NodeIcon
          avatarUrl={ensAvatar || node.texts?.avatar}
          fallback={<UserCheck size={24} color="white" strokeWidth={2} />}
          accentColor={accentColor}
          size={40}
          isSuggested={isSuggested}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-800 rounded">
              SIGNER
            </span>
          </div>
          <div className="text-xs text-gray-500 truncate mt-0.5">
            {shortAddress(node.address ?? '')}
          </div>
        </div>
        {/* biome-ignore lint/suspicious/noExplicitAny: isComputed added dynamically by inspection */}
        {(node as any).isComputed && (
          <div className="absolute top-4 right-4" title="Auto-detected signer">
            <Sparkles size={16} className="text-indigo-400" />
          </div>
        )}
      </div>

      {/* Address info */}
      <div
        className="px-4 py-3 text-sm"
        style={{
          backgroundColor: isSuggested
            ? '#f8fafc'
            : isPendingCreation
              ? '#ddd6fe'
              : hasPendingEdits
                ? '#ddd6fe'
                : '#ddd6fe',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs truncate flex items-center gap-1.5">
            <span className="truncate">{ensName || displayName}</span>
            <ExternalActionButton
              url={link.url}
              label={`${link.label} (new tab)`}
              className="hover:bg-indigo-200"
            />
          </span>
        </div>
      </div>
    </NodeContainer>
  )
}

// Wrapper component for React Flow
const SignerNodeWrapper = ({ data }: NodeProps<DomainTreeNode>) => {
  return (
    <SignerNodeCard
      node={data.node}
      isSelected={data.isSelected}
      hasChildren={data.hasChildren}
      isCollapsed={data.isCollapsed}
      hasPendingEdits={data.hasPendingEdits}
      onToggleCollapse={data.onToggleCollapse}
      childrenCount={data.childrenCount}
    />
  )
}

export const SignerNode = memo(SignerNodeWrapper)
