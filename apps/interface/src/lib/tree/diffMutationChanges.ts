import type { TreeNode } from './types'

export interface MutationDiff {
  /** New text records not previously set on-chain */
  added: [string, string][]
  /** Text records that had a previous value and are being updated */
  modified: [string, string][]
}

/**
 * Categorise a mutation's changes against the original node into added vs modified fields.
 * Skips unchanged values, empty/null new values, and internal keys like inspectionData.
 */
export function diffMutationChanges(
  originalNode: TreeNode | null,
  changes: Record<string, string | null> | undefined,
): MutationDiff {
  if (!changes) return { added: [], modified: [] }

  const entries = Object.entries(changes).filter(([key, newValue]) => {
    const originalValue = originalNode?.texts?.[key]
    if (newValue === originalValue) return false
    if (newValue === null || newValue === undefined || newValue === '') return false
    if (key === 'inspectionData') return false
    return true
  }) as [string, string][]

  const added = entries.filter(([key]) => {
    const ov = originalNode?.texts?.[key]
    return ov === undefined || ov === null || ov === ''
  })

  const modified = entries.filter(([key]) => {
    const ov = originalNode?.texts?.[key]
    return ov !== undefined && ov !== null && ov !== ''
  })

  return { added, modified }
}
