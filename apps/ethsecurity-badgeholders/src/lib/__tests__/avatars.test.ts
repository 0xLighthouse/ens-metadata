import { avatarCacheTag, fetchBadgeholderAvatar, refreshBadgeholderAvatar } from '@/lib/avatars'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag }))

const ADDRESS = '0xD8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const LOWER = ADDRESS.toLowerCase()

describe('avatarCacheTag', () => {
  it('tags per address so one image can be refreshed alone', () => {
    expect(avatarCacheTag(ADDRESS)).toBe(`esb-avatar:${LOWER}`)
  })
})

const imageResponse = (body: ArrayBuffer, contentType = 'image/webp') => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': contentType }),
  arrayBuffer: async () => body,
})

describe('fetchBadgeholderAvatar', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The tag and TTL are asserted as literals rather than through the constants the source reads,
  // so that loosening either is a deliberate test change.
  it('requests the fixed size and caches under the address tag', async () => {
    const body = new ArrayBuffer(8)
    fetchMock.mockResolvedValue(imageResponse(body))

    await expect(fetchBadgeholderAvatar(ADDRESS)).resolves.toEqual({
      body,
      contentType: 'image/webp',
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://cdn.stamp.fyi/avatar/${ADDRESS}?resolver=ens&cb=esb-ens&s=96`)
    expect(init).toEqual({ next: { revalidate: 43200, tags: [`esb-avatar:${LOWER}`] } })
  })

  // Next does not cache a throw, so an outage costs a retry rather than pinning a broken image.
  it('throws on a non-2xx so the failure is never cached', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    })

    await expect(fetchBadgeholderAvatar(ADDRESS)).rejects.toThrow('503')
  })

  // The one failure Next would cache: a 200 whose body is an error page, not an image.
  it('rejects a 200 that is not an image', async () => {
    fetchMock.mockResolvedValue(imageResponse(new ArrayBuffer(4), 'text/html; charset=utf-8'))

    await expect(fetchBadgeholderAvatar(ADDRESS)).rejects.toThrow('expected an image')
  })
})

describe('refreshBadgeholderAvatar', () => {
  it('drops only the given address', () => {
    revalidateTag.mockClear()
    refreshBadgeholderAvatar(ADDRESS)
    expect(revalidateTag).toHaveBeenCalledWith(`esb-avatar:${LOWER}`)
  })
})
