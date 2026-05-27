import type { Schema } from '@ensmetadata/schemas/types'
import { describe, expect, it } from 'vitest'
import { validate, validateMetadata, validateSchema } from '../schema'

const testSchema: Schema = {
  $id: 'test',
  source: 'test',
  title: 'Test',
  version: '1.0',
  description: 'Validation test schema',
  type: 'object',
  required: ['schema', 'class'],
  properties: {
    schema: { type: 'string', description: 'Schema CID' },
    class: { type: 'string', description: 'Node class' },
    description: { type: 'string', description: 'Description' },
  },
  patternProperties: {
    '^x-': { type: 'string', description: 'Custom x- prefixed attribute' },
  },
}

describe('validateMetadata', () => {
  it('returns success for valid data', () => {
    const result = validateMetadata(
      { schema: 'ipfs://Qm...', class: 'Test', description: 'hello' },
      testSchema,
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ schema: 'ipfs://Qm...', class: 'Test', description: 'hello' })
    }
  })

  it('returns success with pattern properties', () => {
    const result = validateMetadata(
      { schema: 'ipfs://Qm...', class: 'Test', 'x-custom': 'value' },
      testSchema,
    )
    expect(result.success).toBe(true)
  })

  it('fails on missing required fields', () => {
    const result = validateMetadata({ description: 'no schema or class' }, testSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      const keys = result.errors.map((e) => e.key)
      expect(keys).toContain('schema')
      expect(keys).toContain('class')
    }
  })

  it('fails on unknown fields', () => {
    const result = validateMetadata(
      { schema: 'ipfs://Qm...', class: 'Test', bogus: 'field' },
      testSchema,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors[0].key).toBe('bogus')
    }
  })

  it('fails on non-object input', () => {
    expect(validateMetadata(null, testSchema).success).toBe(false)
    expect(validateMetadata('string', testSchema).success).toBe(false)
    expect(validateMetadata([], testSchema).success).toBe(false)
    expect(validateMetadata(42, testSchema).success).toBe(false)
  })

  it('fails on empty required fields', () => {
    const result = validateMetadata({ schema: '', class: '' }, testSchema)
    expect(result.success).toBe(false)
  })
})

describe('validate', () => {
  it('returns true for valid data', () => {
    expect(validate(testSchema, { schema: 'ipfs://Qm...', class: 'Test' })).toBe(true)
  })

  it('returns false for invalid data', () => {
    expect(validate(testSchema, { bogus: 'field' })).toBe(false)
  })
})

// --------------------------------------------------------------------------
// Array-pattern validation
// --------------------------------------------------------------------------

const arraySchema: Schema = {
  $id: 'arr',
  source: 'test',
  title: 'Arr',
  version: '1.0',
  description: 'array test',
  type: 'object',
  required: ['class'],
  properties: {
    class: { type: 'string', description: 'class' },
  },
  patternProperties: {
    '^audits(\\[[^\\]]+\\])?$': {
      type: 'string',
      description: 'audit',
      parameterType: 'array',
    },
    // Map-form pattern, included to make sure validation doesn't conflate.
    '^attestations\\[[^\\]]+\\]\\[[^\\]]+\\]$': {
      type: 'string',
      description: 'attestation',
      parameterType: 'map',
    },
  },
}

describe('validateMetadata — array patterns', () => {
  it('accepts a contiguous array starting at 0', () => {
    const result = validateMetadata(
      {
        class: 'C',
        'audits[0]': 'ipfs://a0',
        'audits[1]': 'ipfs://a1',
        'audits[2]': 'ipfs://a2',
      },
      arraySchema,
    )
    expect(result.success).toBe(true)
  })

  it('accepts an empty array (no entries)', () => {
    const result = validateMetadata({ class: 'C' }, arraySchema)
    expect(result.success).toBe(true)
  })

  it('rejects a sparse array with an internal gap', () => {
    const result = validateMetadata(
      {
        class: 'C',
        'audits[0]': 'a0',
        // audits[1] missing
        'audits[2]': 'a2',
      },
      arraySchema,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.key === 'audits[1]' && /contiguous/.test(e.message))).toBe(
        true,
      )
    }
  })

  it('rejects an array that starts above 0', () => {
    const result = validateMetadata({ class: 'C', 'audits[1]': 'a1' }, arraySchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.key === 'audits[0]')).toBe(true)
    }
  })

  it('rejects malformed array indices (leading zeros, non-numeric, empty)', () => {
    const result = validateMetadata(
      {
        class: 'C',
        'audits[0]': 'a0',
        'audits[01]': 'leading-zero',
        'audits[xyz]': 'non-numeric',
        'audits[]': 'empty',
      },
      arraySchema,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      const badKeys = result.errors
        .filter((e) => /Invalid array index/.test(e.message))
        .map((e) => e.key)
      expect(badKeys).toEqual(expect.arrayContaining(['audits[01]', 'audits[xyz]', 'audits[]']))
    }
  })

  it('rejects the bare array baseKey used as a literal', () => {
    const result = validateMetadata({ class: 'C', audits: 'literal' }, arraySchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.key === 'audits' && /baseKey/.test(e.message))).toBe(true)
    }
  })

  it('still accepts map-form pattern keys alongside arrays', () => {
    const result = validateMetadata(
      {
        class: 'C',
        'audits[0]': 'a0',
        'attestations[com.x][0xabc]': 'envelope-hex',
      },
      arraySchema,
    )
    expect(result.success).toBe(true)
  })
})

// --------------------------------------------------------------------------
// Schema validation (validateSchema)
// --------------------------------------------------------------------------

const validSchemaInput = {
  $id: 'test-schema',
  source: 'https://example.com',
  title: 'Test Schema',
  version: '1.0.0',
  description: 'A test schema',
  type: 'object' as const,
  properties: {
    class: { type: 'string', description: 'Node class' },
    schema: { type: 'string', description: 'Schema URI' },
  },
  required: ['class', 'schema'],
}

describe('validateSchema', () => {
  it('accepts a valid schema with no warnings', () => {
    const result = validateSchema(validSchemaInput)
    expect(result.success).toBe(true)
    expect(result.warnings).toHaveLength(0)
    if (result.success) {
      expect(result.schema).toBe(validSchemaInput)
    }
  })

  it('accepts a schema with no required or patternProperties', () => {
    const { required, ...minimal } = validSchemaInput
    const result = validateSchema(minimal)
    expect(result.success).toBe(true)
  })

  it('accepts a schema with valid patternProperties', () => {
    const result = validateSchema({
      ...validSchemaInput,
      patternProperties: {
        '^x-': { type: 'string', description: 'Custom extension' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts a schema with recommended', () => {
    const result = validateSchema({
      ...validSchemaInput,
      recommended: ['class'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-object input', () => {
    expect(validateSchema(null).success).toBe(false)
    expect(validateSchema('string').success).toBe(false)
    expect(validateSchema([]).success).toBe(false)
    expect(validateSchema(42).success).toBe(false)
  })

  it('rejects missing $id, title, and description', () => {
    const result = validateSchema({ type: 'object', properties: {} })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.errors.map((e) => e.path)
      expect(paths).toContain('$id')
      expect(paths).toContain('title')
      expect(paths).toContain('description')
    }
  })

  it('warns on missing source and version but still succeeds', () => {
    const { source, version, ...noConventionFields } = validSchemaInput
    const result = validateSchema(noConventionFields)
    expect(result.success).toBe(true)
    const paths = result.warnings.map((w) => w.path)
    expect(paths).toContain('source')
    expect(paths).toContain('version')
  })

  it('rejects wrong type value', () => {
    const result = validateSchema({ ...validSchemaInput, type: 'array' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.path === 'type')).toBe(true)
    }
  })

  it('rejects missing properties', () => {
    const { properties, ...noProps } = validSchemaInput
    const result = validateSchema(noProps)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.path === 'properties')).toBe(true)
    }
  })

  it('rejects non-string attribute type (ENSIP-64: all MUST be "string")', () => {
    const result = validateSchema({
      ...validSchemaInput,
      properties: {
        active: { type: 'boolean', description: 'Is active' },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.errors.some((e) => e.path === 'properties.active.type' && /string/.test(e.message)),
      ).toBe(true)
    }
  })

  it('rejects invalid attribute with empty type and description', () => {
    const result = validateSchema({
      ...validSchemaInput,
      properties: {
        bad: { type: 'string', description: '' },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.path === 'properties.bad.description')).toBe(true)
    }
  })

  it('rejects non-kebab-case property key names', () => {
    const result = validateSchema({
      ...validSchemaInput,
      properties: {
        camelCase: { type: 'string', description: 'bad key' },
        UPPER: { type: 'string', description: 'bad key' },
        under_score: { type: 'string', description: 'bad key' },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.errors.map((e) => e.path)
      expect(paths).toContain('properties.camelCase')
      expect(paths).toContain('properties.UPPER')
      expect(paths).toContain('properties.under_score')
    }
  })

  it('accepts kebab-case keys with dot namespacing', () => {
    const { required, ...base } = validSchemaInput
    const result = validateSchema({
      ...base,
      properties: {
        'com.twitter': { type: 'string', description: 'Twitter handle' },
        'org.telegram': { type: 'string', description: 'Telegram handle' },
        'legal-name': { type: 'string', description: 'Legal name' },
        'x402-support': { type: 'string', description: 'x402 support' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects required entries not in properties', () => {
    const result = validateSchema({
      ...validSchemaInput,
      required: ['class', 'ghost'],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.path === 'required[1]' && /ghost/.test(e.message))).toBe(
        true,
      )
    }
  })

  it('accepts recommended entries not in properties (inherited keys)', () => {
    const result = validateSchema({
      ...validSchemaInput,
      recommended: ['ghost'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects recommended with non-string entries', () => {
    const result = validateSchema({
      ...validSchemaInput,
      recommended: [42 as unknown as string],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.path === 'recommended[0]')).toBe(true)
    }
  })

  it('rejects invalid regex in patternProperties', () => {
    const result = validateSchema({
      ...validSchemaInput,
      patternProperties: {
        '[invalid(': { type: 'string', description: 'bad regex' },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => /Invalid regular expression/.test(e.message))).toBe(true)
    }
  })

  it('rejects invalid attribute fields', () => {
    const result = validateSchema({
      ...validSchemaInput,
      properties: {
        a: {
          type: 'string',
          description: 'valid',
          format: '',
          default: 123,
          examples: 'not-array',
          inherit: 'yes',
          enum: [],
          recordType: 'binary',
          parameterType: 'set',
        },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.errors.map((e) => e.path)
      expect(paths).toContain('properties.a.format')
      expect(paths).toContain('properties.a.default')
      expect(paths).toContain('properties.a.examples')
      expect(paths).toContain('properties.a.inherit')
      expect(paths).toContain('properties.a.enum')
      expect(paths).toContain('properties.a.recordType')
      expect(paths).toContain('properties.a.parameterType')
    }
  })

  it('rejects enum with non-string values', () => {
    const result = validateSchema({
      ...validSchemaInput,
      properties: {
        a: { type: 'string', description: 'test', enum: ['ok', 42 as unknown as string] },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.path === 'properties.a.enum')).toBe(true)
    }
  })

  // Known non-conforming published schemas: agent@1.0.0 (boolean type),
  // contract@1.1.1 (json type). These predate the strict type rule and are
  // skipped here — new schemas must use type "string".
  it('validates all published schemas (except known non-conforming versions)', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const publishedDir = join(__dirname, '..', '..', '..', 'schemas', 'published')
    let schemaCount = 0
    const skip = new Set(['globals'])
    const skipVersions = new Set(['agent@1.0.0', 'contract@1.1.1'])
    for (const schemaDir of readdirSync(publishedDir)) {
      if (skip.has(schemaDir)) continue
      const versionsDir = join(publishedDir, schemaDir, 'versions')
      let versions: string[]
      try {
        versions = readdirSync(versionsDir)
      } catch {
        continue
      }
      for (const version of versions) {
        if (skipVersions.has(`${schemaDir}@${version}`)) continue
        const schemaPath = join(versionsDir, version, 'schema.json')
        let raw: string
        try {
          raw = readFileSync(schemaPath, 'utf8')
        } catch {
          continue
        }
        const parsed = JSON.parse(raw)
        const result = validateSchema(parsed)
        if (!result.success) {
          throw new Error(
            `Published schema ${schemaDir}@${version} failed validation:\n${result.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`,
          )
        }
        schemaCount++
      }
    }
    expect(schemaCount).toBeGreaterThan(0)
  })
})
