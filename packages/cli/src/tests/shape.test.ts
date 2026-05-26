import type { Schema } from '@ensmetadata/schemas/types'
import { describe, expect, it } from 'vitest'
import { assertNestedPayload } from '../lib/shape.js'

const SCHEMA_WITH_ARRAY: Schema = {
  $id: 'sample',
  source: 'test',
  title: 'Sample',
  version: '1.0.0',
  description: 'sample schema',
  type: 'object',
  properties: {
    class: { type: 'string', default: 'Sample', description: 'class id' },
    schema: { type: 'string', description: 'schema URI' },
    description: { type: 'string', description: 'description' },
  },
  patternProperties: {
    '^audits(\\[[^\\]]+\\])?$': {
      type: 'string',
      parameterType: 'array',
      description: 'audit URIs',
    },
    '^services(\\[[^\\]]+\\])?$': {
      type: 'string',
      parameterType: 'map',
      description: 'service map',
    },
  },
}

describe('assertNestedPayload', () => {
  it('accepts a well-typed nested payload', () => {
    const out = assertNestedPayload(
      {
        class: 'Sample',
        description: 'hi',
        audits: ['ipfs://a0', 'ipfs://a1'],
      },
      SCHEMA_WITH_ARRAY,
    )
    expect(out).toEqual({
      class: 'Sample',
      description: 'hi',
      audits: ['ipfs://a0', 'ipfs://a1'],
    })
  })

  it('accepts map-form pattern entries as plain string values', () => {
    // The CLI's shape validator doesn't know about map-form patterns; those
    // pass through as string-valued keys and get validated by validateMetadata
    // downstream against the patternProperties regex.
    const out = assertNestedPayload(
      { class: 'Sample', 'services[mcp]': 'https://example.com' },
      SCHEMA_WITH_ARRAY,
    )
    expect(out['services[mcp]']).toBe('https://example.com')
  })

  it('rejects flat array-form keys with a "use nested array" message', () => {
    expect(() =>
      assertNestedPayload({ class: 'Sample', 'audits[0]': 'ipfs://a0' }, SCHEMA_WITH_ARRAY),
    ).toThrow(/flat array form is not accepted.*"audits": \[\.\.\.\]/)
  })

  it('rejects arrays on non-array-pattern fields', () => {
    expect(() => assertNestedPayload({ description: ['nope'] }, SCHEMA_WITH_ARRAY)).toThrow(
      /\[description\] not an array-pattern field/,
    )
  })

  it('rejects arrays whose elements are not strings', () => {
    expect(() =>
      assertNestedPayload({ audits: ['ok', 42 as unknown as string] }, SCHEMA_WITH_ARRAY),
    ).toThrow(/\[audits\] element at index 1 is not a string/)
  })

  it('rejects nested objects and other non-string scalars', () => {
    expect(() =>
      assertNestedPayload({ class: { nested: true } as unknown as string }, SCHEMA_WITH_ARRAY),
    ).toThrow(/\[class\] must be a string or string\[\]; got object/)

    expect(() =>
      assertNestedPayload({ description: 7 as unknown as string }, SCHEMA_WITH_ARRAY),
    ).toThrow(/\[description\] must be a string or string\[\]; got number/)
  })

  it('rejects non-object roots', () => {
    expect(() => assertNestedPayload(null, SCHEMA_WITH_ARRAY)).toThrow(/JSON object/)
    expect(() => assertNestedPayload([], SCHEMA_WITH_ARRAY)).toThrow(/JSON object/)
    expect(() => assertNestedPayload('x', SCHEMA_WITH_ARRAY)).toThrow(/JSON object/)
  })

  it('collects every violation into a single error', () => {
    let captured: Error | null = null
    try {
      assertNestedPayload(
        {
          description: 3 as unknown as string,
          'audits[0]': 'x',
          audits: [42 as unknown as string],
        },
        SCHEMA_WITH_ARRAY,
      )
    } catch (err) {
      captured = err as Error
    }
    expect(captured).toBeInstanceOf(Error)
    const msg = captured?.message ?? ''
    expect(msg).toMatch(/\[description\]/)
    expect(msg).toMatch(/\[audits\[0\]\]/)
    expect(msg).toMatch(/\[audits\]/)
  })

  it('with no schema, rejects array values but accepts string values', () => {
    expect(() => assertNestedPayload({ audits: ['x'] }, null)).toThrow(
      /array values require a schema/,
    )
    const out = assertNestedPayload({ class: 'Sample', description: 'hi' }, null)
    expect(out).toEqual({ class: 'Sample', description: 'hi' })
  })
})
