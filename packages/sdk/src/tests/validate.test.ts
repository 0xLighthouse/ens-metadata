import type { Schema } from '@ensmetadata/schemas/types'
import { describe, expect, it } from 'vitest'
import { validate, validateMetadata } from '../schema'

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
