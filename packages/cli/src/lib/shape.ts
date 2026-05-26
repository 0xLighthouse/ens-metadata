import type { Schema } from '@ensmetadata/schemas/types'
import { type HydratedRecordSet, getSchemaKeys, matchArrayEntry } from '@ensmetadata/sdk'

/**
 * Validate that `raw` is a clean nested payload, then return it typed as a
 * {@link HydratedRecordSet} so the caller can hand it to `flatten`.
 *
 * Nested-only is the CLI's input contract: array-pattern fields appear as
 * `string[]`, every other field as `string`. The SDK's flat encoding
 * (`registrations[0]`, `registrations[1]`, ...) is rejected so users learn
 * the canonical shape — and so the failure mode is a clear error rather than
 * a silent passthrough.
 *
 * When `schema` is null we can't tell array-pattern fields from regular
 * ones, so arrays are rejected wholesale; flat indexed keys still slip
 * through (no baseKeys to match against). Callers should fall back to a
 * no-schema warning in that case.
 *
 * Throws an `Error` listing every violation. The whole list is reported at
 * once instead of failing on the first hit, since most violations are
 * independent and the user benefits from seeing them together.
 */
export function assertNestedPayload(raw: unknown, schema: Schema | null): HydratedRecordSet {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Payload must be a JSON object.')
  }
  const record = raw as Record<string, unknown>
  const arrayBaseKeys = new Set(
    schema ? getSchemaKeys(schema).arrayPatterns.map((p) => p.baseKey) : [],
  )
  const errors: string[] = []

  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      if (!schema) {
        errors.push(
          `[${key}] array values require a schema; no schema field in the payload and none set on the name.`,
        )
        continue
      }
      if (!arrayBaseKeys.has(key)) {
        errors.push(`[${key}] not an array-pattern field in the schema; expected a string value.`)
        continue
      }
      const badIndex = value.findIndex((v) => typeof v !== 'string')
      if (badIndex >= 0) {
        errors.push(`[${key}] element at index ${badIndex} is not a string.`)
      }
      continue
    }
    if (typeof value !== 'string') {
      errors.push(`[${key}] must be a string or string[]; got ${typeof value}.`)
      continue
    }
    const flatHit = matchArrayEntry(key, arrayBaseKeys)
    if (flatHit) {
      errors.push(
        `[${key}] flat array form is not accepted; use a nested array: "${flatHit.baseKey}": [...].`,
      )
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid payload shape:\n${errors.join('\n')}`)
  }
  return record as HydratedRecordSet
}
