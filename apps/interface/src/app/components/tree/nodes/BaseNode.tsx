'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { type NodeTypeConfig, getNodeConfig } from '@/config/nodes'
import { getAvatarFallback } from '@/lib/getAvatarFallback'
import { shortAddress } from '@/lib/shortAddress'
import type { TreeNode } from '@/lib/tree/types'
import type { Node, NodeProps } from '@xyflow/react'
import { type ReactNode, memo } from 'react'
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

export interface BaseNodeCardProps {
  node: TreeNode
  isSelected: boolean
  hasChildren?: boolean
  isCollapsed?: boolean
  hasPendingEdits?: boolean
  onToggleCollapse?: () => void
  childrenCount?: number
  configOverride?: Partial<NodeTypeConfig>
  footerSlot?: ReactNode
  overflow?: 'hidden' | 'visible'
}

export const BaseNodeCard = ({
  node,
  isSelected,
  hasChildren = false,
  isCollapsed = false,
  hasPendingEdits = false,
  onToggleCollapse,
  childrenCount = 0,
  configOverride,
  footerSlot,
  overflow = 'hidden',
}: BaseNodeCardProps) => {
  // Computed nodes (e.g. signer nodes from inspection) carry `class` as a
  // top-level field rather than inside `texts`. Fall back to node.class.
  // biome-ignore lint/suspicious/noExplicitAny: class is a dynamic top-level field on computed nodes
  const schemaType = (node.texts?.class ?? (node as any).class) as string | undefined
  const baseConfig = getNodeConfig(schemaType)
  const config = configOverride ? { ...baseConfig, ...configOverride } : baseConfig

  const Icon = config.icon
  const displayName = node.name.split('.')[0]
  const ensUrl = `https://app.ens.domains/${node.name}`
  const addressUrl = node.address ? `https://etherscan.io/address/${node.address}` : null
  const managerUrl = `https://etherscan.io/address/${node.owner}`

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleCollapse?.()
  }

  const stopNodeInteraction = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const isSuggested = node.isSuggested || false
  const isPendingCreation = node.isPendingCreation || false

  return (
    <NodeContainer
      isSelected={isSelected}
      isPendingCreation={isPendingCreation}
      hasPendingEdits={hasPendingEdits}
      isSuggested={isSuggested}
      isCollapsed={isCollapsed}
      hasChildren={hasChildren}
      accentColor={config.accentColor}
      overflow={overflow}
      width="320px"
    >
      {/* Header with icon and name */}
      <div
        className="flex items-center gap-4 p-4 border-b"
        style={{
          backgroundColor: isSuggested
            ? '#f8fafc'
            : isPendingCreation
              ? '#f0fdf4'
              : hasPendingEdits
                ? '#fff7ed'
                : 'white',
          borderBottomColor: isSuggested
            ? '#e2e8f0'
            : isPendingCreation
              ? '#bbf7d0'
              : hasPendingEdits
                ? '#fed7aa'
                : '#e5e7eb',
        }}
      >
        <NodeIcon
          avatarUrl={node.texts?.avatar}
          fallback={<Icon size={28} color="white" strokeWidth={2} />}
          accentColor={config.accentColor}
          size={48}
          isSuggested={isSuggested}
        />
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-gray-900 truncate text-left flex items-center gap-2">
            {displayName}
            {config.badgeLabel && (
              <span
                className={`px-2 py-0.5 text-xs font-bold ${config.badgeBg} ${config.badgeText} rounded flex-shrink-0`}
              >
                {config.badgeLabel}
              </span>
            )}
          </div>
          <div className="text-sm text-blue-700 truncate flex items-center gap-1.5">
            <span className="truncate">{node.name}</span>
            <ExternalActionButton
              url={ensUrl}
              label={`Open ${node.name} in ENS app (new tab)`}
              className="hover:bg-blue-100"
            />
          </div>
        </div>
        {hasChildren && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isCollapsed && childrenCount > 0 && (
              <span className="px-2 py-1 text-xs font-semibold bg-indigo-100 text-indigo-700 rounded-md">
                +{childrenCount}
              </span>
            )}
            <button
              type="button"
              onMouseDown={stopNodeInteraction}
              onClick={handleToggleCollapse}
              className="nodrag nopan p-1 rounded hover:bg-gray-100 transition-colors cursor-pointer"
              aria-label={isCollapsed ? 'Expand' : 'Collapse'}
              title={isCollapsed ? 'Expand children' : 'Collapse children'}
            >
              {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${isCollapsed ? 'rotate-0' : 'rotate-180'}`}
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Address info bar */}
      {!isSuggested && (
        <>
          <div className="px-4 py-3 border-b border-gray-100 text-left">
            {node.address ? (
              <div className="text-sm text-gray-700 font-mono truncate flex items-center gap-1.5">
                <span className="text-xs font-sans font-medium text-gray-500 uppercase tracking-wide mr-0.5">
                  Address:
                </span>
                <span className="truncate">{shortAddress(node.address)}</span>
                {addressUrl && (
                  <ExternalActionButton
                    url={addressUrl}
                    label="Open node address in Etherscan (new tab)"
                    className="hover:bg-blue-100 hover:text-blue-700"
                  />
                )}
              </div>
            ) : (
              <span className="text-sm text-gray-500 uppercase tracking-wide">No address set</span>
            )}
          </div>

          {/* Manager row */}
          <div
            data-manager-row
            className="nodrag nopan w-full px-4 py-2.5 bg-gray-50/50 hover:bg-gray-100/80 transition-colors cursor-pointer text-left"
            title="Click to transfer manager"
          >
            <div className="flex items-center gap-2 leading-none">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex-shrink-0">
                Manager:
              </span>
              <Avatar className="size-4 flex-shrink-0 inline-flex">
                <AvatarImage
                  src={node.ownerEnsAvatar || `https://avatar.vercel.sh/${node.owner}`}
                />
                <AvatarFallback className="text-[8px] font-medium bg-gradient-to-br from-purple-400 to-pink-500 text-white">
                  {getAvatarFallback(node.owner)}
                </AvatarFallback>
              </Avatar>
              <span
                className="text-sm text-gray-700 truncate leading-none"
                style={{ fontFamily: node.ownerEnsName ? 'inherit' : 'monospace' }}
              >
                {node.ownerEnsName || shortAddress(node.owner)}
              </span>
              <ExternalActionButton
                url={managerUrl}
                label="Manager on Etherscan (new tab)"
                className="hover:bg-gray-200 text-gray-400 hover:text-gray-600"
              />
            </div>
          </div>
        </>
      )}

      {footerSlot}

      {isSuggested && (
        <div className="px-4 py-3 border-t border-gray-200">
          <div className="text-sm text-gray-500 italic text-center">
            {config.suggestedCta || 'Click to add subdomain'}
          </div>
        </div>
      )}
    </NodeContainer>
  )
}

// Wrapper component for React Flow
const BaseNodeWrapper = ({ data }: NodeProps<DomainTreeNode>) => {
  return (
    <BaseNodeCard
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

export const BaseNode = memo(BaseNodeWrapper)
