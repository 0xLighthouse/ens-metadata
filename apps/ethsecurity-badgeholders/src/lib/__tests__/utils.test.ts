import { badgeholderAvatarUrl, cn, resolveAvatar, shortenAddress } from '@/lib/utils'
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

  // `cb` is not decoration: without it stamp serves a cached image from any resolver and the
  // `resolver=ens` restriction is silently lost.
  it('pins the ens resolver behind its own cache namespace', () => {
    expect(resolveAvatar('0xabc')).toBe(
      'https://cdn.stamp.fyi/avatar/0xabc?resolver=ens&cb=esb-ens',
    )
  })

  it('adds an optional size', () => {
    expect(resolveAvatar('0xabc', 64)).toBe(
      'https://cdn.stamp.fyi/avatar/0xabc?resolver=ens&cb=esb-ens&s=64',
    )
  })
})

describe('badgeholderAvatarUrl', () => {
  // Lives in utils, not avatars: it is reached from under a 'use client' boundary, and
  // @/lib/avatars imports revalidateTag, which cannot be bundled for the client.
  it('points at our own cached route, not stamp.fyi', () => {
    expect(badgeholderAvatarUrl('0xabc')).toBe('/api/avatar/0xabc')
  })

  it('lowercases so one avatar has one url', () => {
    expect(badgeholderAvatarUrl('0xAbC')).toBe('/api/avatar/0xabc')
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
