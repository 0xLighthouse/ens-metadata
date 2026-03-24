'use client'

import { useTreeData } from '@/hooks/useTreeData'
import type { TreeNode } from '@/lib/tree/types'
import { findAllNodesByAddress } from '@/lib/tree/utils'
import { useTreeControlsStore } from '@/stores/tree-controls'
import { useTreeEditStore } from '@/stores/tree-edits'
import type { Node, NodeProps } from '@xyflow/react'
import { Loader2, Search } from 'lucide-react'
import { memo, useState } from 'react'
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

const TreasuryNodeWrapper = ({ data }: NodeProps<DomainTreeNode>) => {
  const { node } = data
  const [isInspecting, setIsInspecting] = useState(false)
  const { upsertEdit } = useTreeEditStore()
  const { triggerLayout } = useTreeControlsStore()
  const { previewTree } = useTreeData()

  const handleInspect = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsInspecting(true)

    try {
      const response = await fetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node }),
      })

      if (!response.ok) {
        throw new Error('Failed to inspect node')
      }

      const result = await response.json()

      // biome-ignore lint/suspicious/noExplicitAny: computed children shape is dynamic
      let computedChildren: any[] | undefined
      let computedReferences: string[] | undefined

      if (result.detectedType === 'Safe Multisig' && result.metadata?.signers) {
        // biome-ignore lint/suspicious/noExplicitAny: computed child shape is dynamic
        const newChildren: any[] = []
        const existingRefs: string[] = []

        for (const [index, signer] of result.metadata.signers.entries()) {
          const signerAddress = signer.address as `0x${string}`
          const existingNodes = findAllNodesByAddress(previewTree, signerAddress)
          const existingSignerNode = existingNodes.find(
            // biome-ignore lint/suspicious/noExplicitAny: class may exist on pending mutation merge
            (n) => ((n as any).class || n.texts?.class) === 'Signer',
          )

          if (existingSignerNode) {
            existingRefs.push(existingSignerNode.name)
          } else {
            newChildren.push({
              name: `signer-${index + 1}.${node.name}`,
              address: signerAddress,
              owner: signerAddress,
              subdomainCount: 0,
              class: 'Signer',
              title: signer.ensName || `Signer ${index + 1}`,
              description: 'Safe multisig signer',
              ensName: signer.ensName,
              ensAvatar: signer.ensAvatar,
              isComputed: true,
            })
          }
        }

        computedChildren = newChildren.length > 0 ? newChildren : undefined
        computedReferences = existingRefs.length > 0 ? existingRefs : undefined
      }

      upsertEdit(
        node.name,
        {},
        {
          inspectionData: {
            detectedType: result.detectedType,
            metadata: result.metadata,
            inspectedAt: new Date().toISOString(),
            computedChildren,
            computedReferences,
          },
          // biome-ignore lint/suspicious/noExplicitAny: inspectionData is a dynamic extension
        } as any,
        [],
      )

      if (
        (computedChildren && computedChildren.length > 0) ||
        (computedReferences && computedReferences.length > 0)
      ) {
        setTimeout(() => {
          triggerLayout()
        }, 100)
      }
    } catch (error) {
      console.error('Error inspecting node:', error)
    } finally {
      setIsInspecting(false)
    }
  }

  const stopNodeInteraction = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const isSuggested = node.isSuggested || false

  const inspectButton = !isSuggested ? (
    <button
      type="button"
      onMouseDown={stopNodeInteraction}
      onClick={handleInspect}
      disabled={isInspecting}
      className="nodrag nopan absolute left-1/2 -translate-x-1/2 -bottom-4 w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center z-10 cursor-pointer"
      aria-label="Inspect contract"
      title="Detect contract type and metadata"
      style={{ border: '2px solid white' }}
    >
      {isInspecting ? (
        <Loader2 size={16} color="white" className="animate-spin" />
      ) : (
        <Search size={16} color="white" />
      )}
    </button>
  ) : null

  return (
    <BaseNodeCard
      node={data.node}
      isSelected={data.isSelected}
      hasChildren={data.hasChildren}
      isCollapsed={data.isCollapsed}
      hasPendingEdits={data.hasPendingEdits}
      onToggleCollapse={data.onToggleCollapse}
      childrenCount={data.childrenCount}
      overflow="visible"
      footerSlot={inspectButton}
    />
  )
}

export const TreasuryNode = memo(TreasuryNodeWrapper)
