import { describe, expect, it } from 'vitest'
import { computeDelta, hasChanges } from '../delta'

describe('computeDelta', () => {
  it('detects added fields', () => {
    const delta = computeDelta({}, { description: 'new' })
    expect(delta.changes).toEqual({ description: 'new' })
    expect(delta.deleted).toEqual([])
  })

  it('detects changed fields', () => {
    const delta = computeDelta({ description: 'old' }, { description: 'new' })
    expect(delta.changes).toEqual({ description: 'new' })
    expect(delta.deleted).toEqual([])
  })

  it('detects deleted fields (value emptied)', () => {
    const delta = computeDelta({ description: 'old' }, { description: '' })
    expect(delta.changes).toEqual({})
    expect(delta.deleted).toEqual(['description'])
  })

  it('detects deleted fields (value nulled)', () => {
    const delta = computeDelta({ description: 'old' }, { description: null })
    expect(delta.changes).toEqual({})
    expect(delta.deleted).toEqual(['description'])
  })

  it('ignores unchanged fields', () => {
    const delta = computeDelta(
      { description: 'same', url: 'https://x.com' },
      { description: 'same', url: 'https://x.com' },
    )
    expect(delta.changes).toEqual({})
    expect(delta.deleted).toEqual([])
  })

  it('ignores both-empty fields', () => {
    const delta = computeDelta({ description: '' }, { description: '' })
    expect(delta.changes).toEqual({})
    expect(delta.deleted).toEqual([])
  })

  it('ignores null-to-empty transitions', () => {
    const delta = computeDelta({ description: null }, { description: '' })
    expect(delta.changes).toEqual({})
    expect(delta.deleted).toEqual([])
  })

  it('respects ignoreKeys option', () => {
    const delta = computeDelta(
      { description: 'old', internal: 'x' },
      { description: 'new', internal: 'y' },
      { ignoreKeys: new Set(['internal']) },
    )
    expect(delta.changes).toEqual({ description: 'new' })
    expect(delta.deleted).toEqual([])
  })

  it('handles mixed add, change, delete', () => {
    const delta = computeDelta(
      { a: 'keep', b: 'old', c: 'remove' },
      { a: 'keep', b: 'new', c: '', d: 'added' },
    )
    expect(delta.changes).toEqual({ b: 'new', d: 'added' })
    expect(delta.deleted).toEqual(['c'])
  })
})

describe('hasChanges', () => {
  it('returns false for identical records', () => {
    expect(hasChanges({ a: 'x' }, { a: 'x' })).toBe(false)
  })

  it('returns true when a field changed', () => {
    expect(hasChanges({ a: 'x' }, { a: 'y' })).toBe(true)
  })

  it('returns true when a field is deleted', () => {
    expect(hasChanges({ a: 'x' }, { a: '' })).toBe(true)
  })

  it('returns true when a field is added', () => {
    expect(hasChanges({}, { a: 'x' })).toBe(true)
  })

  it('returns false for empty records', () => {
    expect(hasChanges({}, {})).toBe(false)
  })
})
