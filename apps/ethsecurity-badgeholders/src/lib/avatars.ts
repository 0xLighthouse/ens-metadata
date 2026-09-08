import { AVATAR_CACHE_TTL_SECONDS, AVATAR_SIZE } from '@/lib/constants'
import { resolveAvatar } from '@/lib/utils'
import { revalidateTag } from 'next/cache'

/** What stamp.fyi serves when it does not say, and what we serve if it says something useless. */
const FALLBACK_CONTENT_TYPE = 'image/webp'

export type BadgeholderAvatar = { body: ArrayBuffer; contentType: string }

/**
 * Cache tag for one badgeholder's avatar. Let's us refresh just one if needed.
 */
export const avatarCacheTag = (address: string) => `esb-avatar:${address.toLowerCase()}`

/**
 * The upstream avatar bytes for `address`, held in Next's data cache under `avatarCacheTag` for
 * `AVATAR_CACHE_TTL_SECONDS`.
 *
 * Throws rather than returning a placeholder on any failure.
 */
export async function fetchBadgeholderAvatar(address: string): Promise<BadgeholderAvatar> {
  const url = resolveAvatar(address, AVATAR_SIZE)
  if (!url) throw new Error('Cannot resolve an avatar without an address')

  const response = await fetch(url, {
    // The route that calls this is `force-dynamic`, and Next treats a fetch on such a route 
    // as uncacheable unless it carries an explicit `cache` or `next.revalidate`.
    next: { revalidate: AVATAR_CACHE_TTL_SECONDS, tags: [avatarCacheTag(address)] },
  })
  if (!response.ok) {
    throw new Error(`stamp.fyi returned ${response.status} for ${address}`)
  }

  // Reject anything that is not an image before it can be served as one.
  const contentType = response.headers.get('content-type') ?? FALLBACK_CONTENT_TYPE
  if (!contentType.startsWith('image/')) {
    throw new Error(`stamp.fyi returned ${contentType} for ${address}, expected an image`)
  }

  return { body: await response.arrayBuffer(), contentType }
}

/**
 * Drops the cached avatar for one address, so the next request refetches it.
 * 
 * This clears our copy only. A browser already holding the image keeps it for up to
 * `AVATAR_BROWSER_TTL_SECONDS`, so a refresh is visible within minutes rather than instantly.
 */
export function refreshBadgeholderAvatar(address: string): void {
  revalidateTag(avatarCacheTag(address))
}
