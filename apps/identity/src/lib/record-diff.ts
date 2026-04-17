import { computeDelta } from '@ensmetadata/sdk'

/**
 * Split the SDK's {changes, deleted} delta into an add/update/remove view
 * that the wizard's review screen can render directly. We do the split
 * client-side because the original (on-chain) values are already loaded
 * at this point — no point pushing the complexity into the SDK.
 */
export interface RecordAdded {
  key: string
  next: string
}

export interface RecordUpdated {
  key: string
  prev: string
  next: string
}

export interface RecordRemoved {
  key: string
  prev: string
}

export interface RecordDiff {
  added: RecordAdded[]
  updated: RecordUpdated[]
  removed: RecordRemoved[]
}

export function computeRecordDiff(
  original: Record<string, string | null | undefined>,
  desired: Record<string, string | null | undefined>,
): RecordDiff {
  const delta = computeDelta(original, desired)
  const added: RecordAdded[] = []
  const updated: RecordUpdated[] = []
  const removed: RecordRemoved[] = []

  for (const [key, next] of Object.entries(delta.changes)) {
    const prev = original[key]
    if (typeof prev === 'string' && prev.length > 0) {
      updated.push({ key, prev, next })
    } else {
      added.push({ key, next })
    }
  }
  for (const key of delta.deleted) {
    const prev = original[key]
    if (typeof prev === 'string' && prev.length > 0) {
      removed.push({ key, prev })
    }
  }
  return { added, updated, removed }
}

export function diffHasChanges(diff: RecordDiff): boolean {
  return diff.added.length + diff.updated.length + diff.removed.length > 0
}

/**
 * Build the flat record map that gets written on-chain. Additions + updates
 * carry their new values; removals are written as empty strings, which is
 * how this project models deletions end-to-end.
 */
export function diffToWriteMap(diff: RecordDiff): Record<string, string> {
  const map: Record<string, string> = {}
  for (const a of diff.added) map[a.key] = a.next
  for (const u of diff.updated) map[u.key] = u.next
  for (const r of diff.removed) map[r.key] = ''
  return map
}

export const EMPTY_DIFF: RecordDiff = { added: [], updated: [], removed: [] }
