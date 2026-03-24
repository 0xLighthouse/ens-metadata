import type { Schema } from '@ensmetadata/schemas/types'
import type { MetadataValidationError, MetadataValidationResult } from './types'

export function validateMetadataSchema(data: unknown, schema: Schema): MetadataValidationResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { success: false, errors: [{ key: '(root)', message: 'Expected an object' }] }
  }

  const record = data as Record<string, unknown>
  const errors: MetadataValidationError[] = []
  const knownKeys = new Set(Object.keys(schema.properties))
  const patternRegexes = Object.keys(schema.patternProperties ?? {}).map((p) => new RegExp(p))

  for (const key of schema.required ?? []) {
    if (!record[key]) errors.push({ key, message: `Required field "${key}" is missing` })
  }

  for (const key of Object.keys(record)) {
    if (!knownKeys.has(key) && !patternRegexes.some((r) => r.test(key))) {
      errors.push({ key, message: `Unknown field "${key}"` })
    }
  }

  return errors.length > 0
    ? { success: false, errors }
    : { success: true, data: record as Record<string, string> }
}

export function validate(schema: Schema, data: unknown): boolean {
  return validateMetadataSchema(data, schema).success
}
