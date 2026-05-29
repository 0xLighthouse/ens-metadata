import type { Attribute, Schema } from './types'

// --------------------------------------------------------------------------
// Validation result types
// --------------------------------------------------------------------------

export type SchemaValidationError = { path: string; message: string }
export type SchemaValidationWarning = { path: string; message: string }
export type SchemaValidationResult =
  | { success: true; schema: Schema; warnings: SchemaValidationWarning[] }
  | { success: false; errors: SchemaValidationError[]; warnings: SchemaValidationWarning[] }

// --------------------------------------------------------------------------
// Schema validation
// --------------------------------------------------------------------------

const VALID_RECORD_TYPES = new Set(['text', 'data'])
const VALID_PARAMETER_TYPES = new Set(['map', 'array'])

/**
 * Kebab-case with optional dot-delimited namespacing (per ENSIP-5).
 * Matches: `alias`, `legal-name`, `com.twitter`, `org.telegram`,
 *          `x402-support`. Rejects: `camelCase`, `UPPER`, `under_score`.
 */
const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)*$/

function validateAttribute(
  attr: unknown,
  path: string,
  errors: SchemaValidationError[],
): attr is Attribute {
  if (typeof attr !== 'object' || attr === null || Array.isArray(attr)) {
    errors.push({ path, message: 'Must be an object' })
    return false
  }
  const a = attr as Record<string, unknown>

  // ENSIP-64: "All properties MUST be of type "string""
  if (a.type !== 'string') {
    errors.push({ path: `${path}.type`, message: 'Must be "string" (ENSIP-64)' })
  }

  if (typeof a.description !== 'string' || a.description.length === 0) {
    errors.push({ path: `${path}.description`, message: 'Must be a non-empty string' })
  }

  if (a.format !== undefined) {
    if (typeof a.format !== 'string' || a.format.length === 0) {
      errors.push({ path: `${path}.format`, message: 'Must be a non-empty string' })
    }
  }

  if (a.default !== undefined && typeof a.default !== 'string') {
    errors.push({ path: `${path}.default`, message: 'Must be a string' })
  }

  if (a.examples !== undefined) {
    if (!Array.isArray(a.examples) || !a.examples.every((e: unknown) => typeof e === 'string')) {
      errors.push({ path: `${path}.examples`, message: 'Must be an array of strings' })
    }
  }

  if (a.inherit !== undefined && typeof a.inherit !== 'boolean') {
    errors.push({ path: `${path}.inherit`, message: 'Must be a boolean' })
  }

  if (a.enum !== undefined) {
    if (!Array.isArray(a.enum) || a.enum.length === 0) {
      errors.push({ path: `${path}.enum`, message: 'Must be a non-empty array' })
    } else if (!a.enum.every((e: unknown) => typeof e === 'string')) {
      errors.push({ path: `${path}.enum`, message: 'All values must be strings' })
    }
  }

  if (a.recordType !== undefined) {
    if (typeof a.recordType !== 'string' || !VALID_RECORD_TYPES.has(a.recordType)) {
      errors.push({
        path: `${path}.recordType`,
        message: `Must be one of: ${[...VALID_RECORD_TYPES].join(', ')}`,
      })
    }
  }

  if (a.parameterType !== undefined) {
    if (typeof a.parameterType !== 'string' || !VALID_PARAMETER_TYPES.has(a.parameterType)) {
      errors.push({
        path: `${path}.parameterType`,
        message: `Must be one of: ${[...VALID_PARAMETER_TYPES].join(', ')}`,
      })
    }
  }

  return true
}

/**
 * Validate that `value` is a well-formed Schema per ENSIP-64.
 *
 * **Errors** (hard failures) are raised for MUST-level rules:
 *  - `type` must be `'object'`, `properties` must be present
 *  - All attribute `type` values must be `"string"`
 *  - Property key names must be kebab-case (with optional dot namespacing)
 *  - `required` entries must reference declared properties
 *  - `patternProperties` keys must be valid regular expressions
 *
 * **Warnings** are raised for project-convention fields that are missing but
 * don't make the schema structurally invalid: `source`, `version`.
 */
export function validateSchema(value: unknown): SchemaValidationResult {
  const errors: SchemaValidationError[] = []
  const warnings: SchemaValidationWarning[] = []

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      success: false,
      errors: [{ path: '(root)', message: 'Schema must be an object' }],
      warnings: [],
    }
  }
  const s = value as Record<string, unknown>

  // -- Required fields (errors) --
  if (typeof s.$id !== 'string' || s.$id.length === 0) {
    errors.push({ path: '$id', message: 'Must be a non-empty string identifying the schema' })
  }

  if (typeof s.title !== 'string' || s.title.length === 0) {
    errors.push({
      path: 'title',
      message: 'Must be a non-empty string identifying the entity described by the schema',
    })
  }

  if (typeof s.description !== 'string' || s.description.length === 0) {
    errors.push({
      path: 'description',
      message:
        'Must be a non-empty string explaining the organizational role of nodes using this schema',
    })
  }

  // -- Convention fields (warnings) --
  if (typeof s.source !== 'string' || s.source.length === 0) {
    warnings.push({ path: 'source', message: 'Should be a non-empty string' })
  }

  if (typeof s.version !== 'string' || s.version.length === 0) {
    warnings.push({ path: 'version', message: 'Should be a non-empty string' })
  }

  if (s.type !== 'object') {
    errors.push({ path: 'type', message: "Must be 'object'" })
  }

  // -- properties --
  if (typeof s.properties !== 'object' || s.properties === null || Array.isArray(s.properties)) {
    errors.push({ path: 'properties', message: 'Must be an object' })
  } else {
    const props = s.properties as Record<string, unknown>
    for (const [key, attr] of Object.entries(props)) {
      if (!KEBAB_CASE_RE.test(key)) {
        errors.push({
          path: `properties.${key}`,
          message:
            'Key name must be kebab-case (lowercase, hyphen-delimited, with optional dot namespacing)',
        })
      }
      validateAttribute(attr, `properties.${key}`, errors)
    }
  }

  const propertyKeys =
    typeof s.properties === 'object' && s.properties !== null && !Array.isArray(s.properties)
      ? new Set(Object.keys(s.properties as Record<string, unknown>))
      : new Set<string>()

  // -- required --
  if (s.required !== undefined) {
    if (!Array.isArray(s.required)) {
      errors.push({ path: 'required', message: 'Must be an array' })
    } else {
      for (let i = 0; i < s.required.length; i++) {
        const entry = s.required[i]
        if (typeof entry !== 'string') {
          errors.push({ path: `required[${i}]`, message: 'Must be a string' })
        } else if (!propertyKeys.has(entry)) {
          errors.push({
            path: `required[${i}]`,
            message: `"${entry}" is not declared in properties`,
          })
        }
      }
    }
  }

  // -- recommended (advisory — entries may reference inherited keys not in properties) --
  if (s.recommended !== undefined) {
    if (!Array.isArray(s.recommended)) {
      errors.push({ path: 'recommended', message: 'Must be an array' })
    } else {
      for (let i = 0; i < s.recommended.length; i++) {
        if (typeof s.recommended[i] !== 'string') {
          errors.push({ path: `recommended[${i}]`, message: 'Must be a string' })
        }
      }
    }
  }

  // -- patternProperties --
  if (s.patternProperties !== undefined) {
    if (
      typeof s.patternProperties !== 'object' ||
      s.patternProperties === null ||
      Array.isArray(s.patternProperties)
    ) {
      errors.push({ path: 'patternProperties', message: 'Must be an object' })
    } else {
      const pp = s.patternProperties as Record<string, unknown>
      for (const [pattern, attr] of Object.entries(pp)) {
        try {
          new RegExp(pattern)
        } catch {
          errors.push({
            path: `patternProperties["${pattern}"]`,
            message: 'Invalid regular expression',
          })
        }
        validateAttribute(attr, `patternProperties["${pattern}"]`, errors)
      }
    }
  }

  if (errors.length > 0) return { success: false, errors, warnings }
  return { success: true, schema: value as Schema, warnings }
}
