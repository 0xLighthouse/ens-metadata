'use client'

import type { TreeNode } from '@/lib/tree/types'
import type { Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { BaseNodeCard } from './BaseNode'

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

const DefaultNodeWrapper = ({ data }: NodeProps<DomainTreeNode>) => {
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

export const DefaultNode = memo(DefaultNodeWrapper)
