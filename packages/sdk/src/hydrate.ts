import type { Schema } from '@ensmetadata/schemas/types'
import { getSchemaKeys, matchArrayEntry } from './schema'
import type { RecordSet } from './types'

/**
 * The "unflattened" view of a RecordSet: top-level keys map to either a
 * single string (regular keys, map-form pattern keys) or a string[] when
 * the key corresponds to a `parameterType: "array"` patternProperties entry.
 *
 * Use {@link unflatten} to build one from a flat RecordSet (requires a
 * schema), and {@link flatten} for the inverse.
 */
export type HydratedRecordSet = Record<string, string | string[]>

/**
 * Group `parameterType: "array"` pattern entries from a flat RecordSet into
 * actual string[] values. Non-array keys (regular properties, map-form
 * patterns like `attestations[com.x][0x…]`, and anything that doesn't match
 * a known array baseKey) pass through unchanged as strings.
 *
 * Array assembly mirrors {@link import('./read').getMetadata}'s read
 * semantics: indices are walked starting at 0 and assembly stops at the
 * first gap. Entries past a gap are dropped — preserving them as flat keys
 * would create an output that can't round-trip through {@link flatten}.
 *
 * Throws if a regular string key collides with an array-pattern baseKey
 * (e.g. both `audits` and `audits[0]` are present) — this indicates
 * malformed input and silent precedence would mask the bug.
 */
export function unflatten(records: RecordSet, schema: Schema): HydratedRecordSet {
  const { arrayPatterns } = getSchemaKeys(schema)
  if (arrayPatterns.length === 0) {
    return { ...records }
  }

  const baseKeys = new Set(arrayPatterns.map((p) => p.baseKey))
  // baseKey → { index → value } scratch space
  const buckets = new Map<string, Map<number, string>>()
  const out: HydratedRecordSet = {}

  for (const [key, value] of Object.entries(records)) {
    const bucketed = matchArrayEntry(key, baseKeys)
    if (bucketed) {
      const { baseKey, index } = bucketed
      let bucket = buckets.get(baseKey)
      if (!bucket) {
        bucket = new Map()
        buckets.set(baseKey, bucket)
      }
      bucket.set(index, value)
      continue
    }
    if (baseKeys.has(key)) {
      throw new Error(
        `unflatten: key "${key}" collides with an array-pattern baseKey; cannot decide between literal string and grouped array.`,
      )
    }
    out[key] = value
  }

  for (const [baseKey, bucket] of buckets) {
    const values: string[] = []
    for (let i = 0; ; i++) {
      const v = bucket.get(i)
      if (v === undefined) break
      values.push(v)
    }
    if (values.length > 0) out[baseKey] = values
  }

  return out
}

/**
 * Inverse of {@link unflatten}. Convert a HydratedRecordSet back into a
 * flat RecordSet: string values pass through, array values are emitted as
 * `${key}[0]`, `${key}[1]`, ... entries.
 *
 * No schema required — the input shape itself is self-describing. Output
 * is always a valid RecordSet (no array values, no nested objects).
 *
 * **Clearing an array under PATCH semantics:** a length-zero `[]` emits no
 * entries at all, which under PATCH (`ignoreMissing: true`) leaves the
 * existing on-chain array untouched — the flat shape can't distinguish
 * "didn't touch this baseKey" from "touched it and emptied it." To clear an
 * array under PATCH, pass a single empty-string entry instead:
 *
 * ```ts
 * h.audits = ['']            // sentinel: "clear this array"
 * await writer.setMetadata({ desired: flatten(h), ignoreMissing: true, ... })
 * // emits audits[0]='' which marks the audits baseKey as touched; the
 * // diff then clears the explicit entry and any existing tail past it.
 * ```
 *
 * PUT mode (`ignoreMissing: false`) doesn't need this — `[]` works because
 * PUT auto-deletes every existing key absent from `desired`.
 */
export function flatten(hydrated: HydratedRecordSet): RecordSet {
  const out: RecordSet = {}
  for (const [key, value] of Object.entries(hydrated)) {
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        out[`${key}[${i}]`] = v
      })
    } else {
      out[key] = value
    }
  }
  return out
}
