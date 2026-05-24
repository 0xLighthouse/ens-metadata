import type { Schema } from '@ensmetadata/schemas/types'
import { describe, expect, it } from 'vitest'
import { flatten, unflatten } from '../hydrate'

function schemaWith(
  patternProperties: Schema['patternProperties'],
  properties: Schema['properties'] = { class: { type: 'string', description: 'c' } },
): Schema {
  return {
    $id: 't',
    source: 't',
    title: 'T',
    version: '1',
    description: 't',
    type: 'object',
    properties,
    patternProperties,
  }
}

const arraySchema = schemaWith({
  '^audits(\\[[^\\]]+\\])?$': {
    type: 'string',
    description: 'audit',
    parameterType: 'array',
  },
})

describe('unflatten', () => {
  it('returns a shallow copy when the schema declares no array patterns', () => {
    const schema = schemaWith({})
    const input = { class: 'Contract', description: 'hi' }
    const out = unflatten(input, schema)
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
  })

  it('groups array-pattern entries into a string[] keyed by baseKey', () => {
    const out = unflatten(
      {
        class: 'Contract',
        'audits[0]': 'ipfs://a0',
        'audits[1]': 'ipfs://a1',
        'audits[2]': 'ipfs://a2',
      },
      arraySchema,
    )
    expect(out).toEqual({
      class: 'Contract',
      audits: ['ipfs://a0', 'ipfs://a1', 'ipfs://a2'],
    })
  })

  it('stops at the first gap and drops sparse entries past it', () => {
    const out = unflatten(
      {
        'audits[0]': 'ipfs://a0',
        'audits[1]': 'ipfs://a1',
        // audits[2] missing → stop here
        'audits[3]': 'ipfs://a3',
        'audits[7]': 'ipfs://a7',
      },
      arraySchema,
    )
    expect(out).toEqual({ audits: ['ipfs://a0', 'ipfs://a1'] })
  })

  it('omits the key entirely when the bucket has no entries from index 0', () => {
    // audits[3] alone — no audits[0], so nothing to assemble
    const out = unflatten({ 'audits[3]': 'ipfs://a3' }, arraySchema)
    expect(out).toEqual({})
  })

  it('passes map-form pattern keys through unchanged (multiple brackets)', () => {
    const mapSchema = schemaWith({
      '^attestations\\[[^\\]]+\\]\\[[^\\]]+\\]$': {
        type: 'string',
        description: 'attestation',
        parameterType: 'map',
      },
    })
    const input = {
      class: 'Person',
      'attestations[com.x][0xabc]': 'envelope-hex',
    }
    const out = unflatten(input, mapSchema)
    expect(out).toEqual(input)
  })

  it('passes through bracketed keys whose base does not match a known array baseKey', () => {
    const out = unflatten({ 'unknown[0]': 'v', class: 'X' }, arraySchema)
    expect(out).toEqual({ 'unknown[0]': 'v', class: 'X' })
  })

  it('ignores malformed indices (leading zeros, non-numeric)', () => {
    const out = unflatten(
      {
        'audits[0]': 'ipfs://a0',
        'audits[01]': 'leading-zero',
        'audits[xyz]': 'non-numeric',
        'audits[]': 'empty',
      },
      arraySchema,
    )
    // Only audits[0] groups; the malformed ones pass through as flat keys.
    expect(out).toEqual({
      audits: ['ipfs://a0'],
      'audits[01]': 'leading-zero',
      'audits[xyz]': 'non-numeric',
      'audits[]': 'empty',
    })
  })

  it('throws when a literal key collides with an array-pattern baseKey', () => {
    expect(() => unflatten({ audits: 'literal', 'audits[0]': 'ipfs://a0' }, arraySchema)).toThrow(
      /collides with an array-pattern baseKey/,
    )
  })

  it('handles multiple array patterns independently', () => {
    const multiSchema = schemaWith({
      '^audits(\\[[^\\]]+\\])?$': {
        type: 'string',
        description: 'a',
        parameterType: 'array',
      },
      '^members(\\[[^\\]]+\\])?$': {
        type: 'string',
        description: 'm',
        parameterType: 'array',
      },
    })
    const out = unflatten(
      {
        'audits[0]': 'a0',
        'audits[1]': 'a1',
        'members[0]': 'm0',
      },
      multiSchema,
    )
    expect(out).toEqual({
      audits: ['a0', 'a1'],
      members: ['m0'],
    })
  })
})

describe('flatten', () => {
  it('passes string values through unchanged', () => {
    expect(flatten({ class: 'Contract', description: 'hi' })).toEqual({
      class: 'Contract',
      description: 'hi',
    })
  })

  it('expands array values into indexed flat keys', () => {
    expect(flatten({ audits: ['ipfs://a0', 'ipfs://a1', 'ipfs://a2'] })).toEqual({
      'audits[0]': 'ipfs://a0',
      'audits[1]': 'ipfs://a1',
      'audits[2]': 'ipfs://a2',
    })
  })

  it('emits nothing for an empty array', () => {
    expect(flatten({ audits: [] })).toEqual({})
  })

  it('mixes string and array values in one pass', () => {
    expect(flatten({ class: 'Contract', audits: ['a0', 'a1'], description: 'hi' })).toEqual({
      class: 'Contract',
      'audits[0]': 'a0',
      'audits[1]': 'a1',
      description: 'hi',
    })
  })
})

describe('round-trip', () => {
  it('unflatten(flatten(h)) returns the original hydrated object', () => {
    const hydrated = {
      class: 'Contract',
      audits: ['ipfs://a0', 'ipfs://a1'],
    }
    expect(unflatten(flatten(hydrated), arraySchema)).toEqual(hydrated)
  })

  it('flatten(unflatten(rs)) returns the original RecordSet (no sparse data)', () => {
    const records = {
      class: 'Contract',
      'audits[0]': 'ipfs://a0',
      'audits[1]': 'ipfs://a1',
    }
    expect(flatten(unflatten(records, arraySchema))).toEqual(records)
  })

  it('empty-array sentinel [""] round-trips as audits[0]=""', () => {
    // The convention for "clear this array under PATCH": flatten produces a
    // sentinel entry that marks the baseKey as touched so the writer's
    // tail-clear runs.
    expect(flatten({ audits: [''] })).toEqual({ 'audits[0]': '' })
    expect(unflatten({ 'audits[0]': '' }, arraySchema)).toEqual({ audits: [''] })
  })
})
