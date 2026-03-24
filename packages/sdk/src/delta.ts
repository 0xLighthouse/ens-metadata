import type { ComputeDeltaOptions, MetadataDelta } from './types'

const isEmpty = (v: unknown): boolean => v === '' || v === null || v === undefined

export function computeDelta(
  original: Record<string, string | null | undefined>,
  desired: Record<string, string | null | undefined>,
  options?: ComputeDeltaOptions,
): MetadataDelta {
  const ignoreKeys = options?.ignoreKeys ?? new Set()
  const changes: Record<string, string> = {}
  const deleted: string[] = []

  for (const [key, value] of Object.entries(desired)) {
    if (ignoreKeys.has(key)) continue
    const orig = original[key]
    if (isEmpty(value) && isEmpty(orig)) continue
    if (value === orig) continue
    if (isEmpty(value) && !isEmpty(orig)) {
      deleted.push(key)
    } else if (typeof value === 'string' && value.length > 0) {
      changes[key] = value
    }
  }

  return { changes, deleted }
}

export function hasChanges(
  original: Record<string, string | null | undefined>,
  desired: Record<string, string | null | undefined>,
  options?: ComputeDeltaOptions,
): boolean {
  const delta = computeDelta(original, desired, options)
  return Object.keys(delta.changes).length > 0 || delta.deleted.length > 0
}
