import type { Schema } from '@ens-node-metadata/schemas/types'
import { describe, expect, it } from 'vitest'
import { validate, validateMetadataSchema } from '../validate'

const testSchema: Schema = {
  $id: 'test',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Test',
  class: 'Test',
  version: '1.0',
  type: 'object',
  required: ['schema', 'class'],
  properties: {
    schema: { type: 'string', description: 'Schema CID' },
    class: { type: 'string', description: 'Node class' },
    description: { type: 'string', description: 'Description' },
  },
  patternProperties: {
    '^x-': { type: 'string' },
  },
}

describe('validateMetadataSchema', () => {
  it('returns success for valid data', () => {
    const result = validateMetadataSchema(
      { schema: 'ipfs://Qm...', class: 'Test', description: 'hello' },
      testSchema,
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ schema: 'ipfs://Qm...', class: 'Test', description: 'hello' })
    }
  })

  it('returns success with pattern properties', () => {
    const result = validateMetadataSchema(
      { schema: 'ipfs://Qm...', class: 'Test', 'x-custom': 'value' },
      testSchema,
    )
    expect(result.success).toBe(true)
  })

  it('fails on missing required fields', () => {
    const result = validateMetadataSchema({ description: 'no schema or class' }, testSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      const keys = result.errors.map((e) => e.key)
      expect(keys).toContain('schema')
      expect(keys).toContain('class')
    }
  })

  it('fails on unknown fields', () => {
    const result = validateMetadataSchema(
      { schema: 'ipfs://Qm...', class: 'Test', bogus: 'field' },
      testSchema,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors[0].key).toBe('bogus')
    }
  })

  it('fails on non-object input', () => {
    expect(validateMetadataSchema(null, testSchema).success).toBe(false)
    expect(validateMetadataSchema('string', testSchema).success).toBe(false)
    expect(validateMetadataSchema([], testSchema).success).toBe(false)
    expect(validateMetadataSchema(42, testSchema).success).toBe(false)
  })

  it('fails on empty required fields', () => {
    const result = validateMetadataSchema({ schema: '', class: '' }, testSchema)
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
