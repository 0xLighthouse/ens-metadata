import type { TreeNode } from './types'

export interface GroupedEdit {
  ensName: string
  resolverAddress: string
  delta: { changes: Record<string, string>; deleted: string[] }
}

/**
 * Separate pending mutations into creations and edits, then group edits by
 * ENS name with their resolver address and a flattened delta.
 *
 * Returns only the entries whose IDs appear in `selectedIds`.
 */
export function buildMutationQueue(
  selectedIds: string[],
  pendingMutations: Map<
    string,
    {
      createNode: boolean
      changes: Record<string, string | null>
      deleted: string[]
      parentName?: string
    }
  >,
  findNode: (name: string) => TreeNode | null,
): { creations: string[]; edits: GroupedEdit[] } {
  const selected = selectedIds
    .map((id) => {
      const m = pendingMutations.get(id)
      return m ? ([id, m] as const) : null
    })
    .filter(Boolean) as [
    string,
    {
      createNode: boolean
      changes: Record<string, string | null>
      deleted: string[]
      parentName?: string
    },
  ][]

  const creations = selected.filter(([_, m]) => m.createNode).map(([id]) => id)

  const editsByName = new Map<string, GroupedEdit>()

  for (const [ensName, edit] of selected.filter(([_, m]) => !m.createNode)) {
    const node = findNode(ensName)
    const resolverAddress = node?.resolverAddress
    if (!resolverAddress) continue

    const changes: Record<string, string> = {}
    if (edit.changes) {
      for (const [key, value] of Object.entries(edit.changes)) {
        if (value === null || value === undefined) continue
        changes[key] = String(value)
      }
    }

    const existing = editsByName.get(ensName)
    if (existing) {
      Object.assign(existing.delta.changes, changes)
      existing.delta.deleted.push(...(edit.deleted ?? []))
    } else {
      editsByName.set(ensName, {
        ensName,
        resolverAddress,
        delta: { changes, deleted: edit.deleted ?? [] },
      })
    }
  }

  return { creations, edits: Array.from(editsByName.values()) }
}
