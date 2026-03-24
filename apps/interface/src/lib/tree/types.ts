/**
 * An ENS record/subdomain fetched from the subgraph and normalized into a tree node
 */
export interface NormalizedTreeNode {
  [key: string]: unknown

  /**
   * The ID of the node as expressed on-chain
   */
  id: string

  /**
   * The name of the node as expressed on-chain (e.g. "ens.eth")
   */
  name: string

  /**
   * The number of subdomains this node has
   */
  subdomainCount: number
  resolverId: string
  resolverAddress: string

  /**
   * The ID of the parent node
   */
  parentId?: string

  /**
   * (Optional) address this node points to
   */
  address?: `0x${string}`

  /**
   * The address of the owner of the node derived from [ownerId] or [wrappedOwnerId]
   */
  owner: `0x${string}`

  /**
   * (Optional) ENS name for the owner address
   */
  ownerEnsName?: string | null

  /**
   * (Optional) ENS avatar URL for the owner address
   */
  ownerEnsAvatar?: string | null

  // Optional metadata for display
  ttl?: number

  /**
   * (Optional) children of this node
   */
  children?: TreeNode[]

  texts?: Record<string, string | null>

  // Additional fields (will be refactored to BaseNode, TreasuryNode, etc later)
  schema?: string // Schema ID used for this node
  // True when the name is registered in the ENS NameWrapper contract
  isWrapped: boolean
  // Suggested nodes are placeholders for sparse trees
  isSuggested?: boolean
  // Pending creation nodes
  isPendingCreation?: boolean
  // Computed nodes (derived from on-chain data, not user-created)
  isComputed?: boolean
  // Inspection metadata from on-chain detection
  inspectionData?: {
    detectedType?: string
    // biome-ignore lint/suspicious/noExplicitAny: inspection metadata is dynamic
    metadata?: Record<string, any>
    inspectedAt?: string
    isInspecting?: boolean
    computedChildren?: TreeNode[] // New computed child nodes (e.g., signers)
    computedReferences?: string[] // References to existing nodes by name (edges only, no new nodes)
  }
}

export type TreeNode = NormalizedTreeNode
