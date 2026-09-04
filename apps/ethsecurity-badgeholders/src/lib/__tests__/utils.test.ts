import { cn, resolveAvatar, shortenAddress } from '@/lib/utils'
import { describe, expect, it } from 'vitest'

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('flex', 'items-center')).toBe('flex items-center')
  })

  it('drops falsy values', () => {
    expect(cn('flex', false && 'hidden', undefined)).toBe('flex')
  })

  it('lets the last conflicting tailwind class win', () => {
    expect(cn('p-2', 'p-6')).toBe('p-6')
  })
})

describe('resolveAvatar', () => {
  it('returns undefined without an address', () => {
    expect(resolveAvatar()).toBeUndefined()
  })

  it('builds a stamp.fyi url with an optional size', () => {
    expect(resolveAvatar('0xabc')).toBe('https://cdn.stamp.fyi/avatar/0xabc')
    expect(resolveAvatar('0xabc', 64)).toBe('https://cdn.stamp.fyi/avatar/0xabc?s=64')
  })
})

describe('shortenAddress', () => {
  it('truncates the middle of an address', () => {
    expect(shortenAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678')
  })

  it('leaves short values untouched', () => {
    expect(shortenAddress('0x1234')).toBe('0x1234')
  })
})
