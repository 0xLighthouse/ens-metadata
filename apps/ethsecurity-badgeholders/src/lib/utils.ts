import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Our own stamp cache namespace. See `resolveAvatar` for why this exists. */
const STAMP_CACHE_NAMESPACE = 'esb-ens'

/**
 * A stamp.fyi avatar URL for `address`, restricted to the ENS avatar record.
 *
 * `resolver=ens` pins the source.
 * 
 * The `cb` parameter ensures we always get ENS avatars by preventing stamp.fyi from returning a cached image from another source.
 *
 * An address with no primary ENS name, or a name with no avatar record, gets stamp's generated
 * blockie rather than an error.
 */
export const resolveAvatar = (address?: string, size?: string | number) => {
  if (!address) return
  const params = new URLSearchParams({ resolver: 'ens', cb: STAMP_CACHE_NAMESPACE })
  if (size) params.set('s', String(size))
  return `https://cdn.stamp.fyi/avatar/${address}?${params.toString()}`
}

/**
 * The URL a component points an `<img>` at for a badgeholder's avatar: our own cached route
 * rather than stamp.fyi directly. Lowercased so one avatar is one URL and one cache entry.
 *
 * This lives here rather than beside the rest of the avatar cache in `@/lib/avatars` on purpose.
 * It is reached from under a `'use client'` boundary (badgeholder-list → card → avatar), and
 * `@/lib/avatars` imports `revalidateTag`, which cannot be pulled into a client bundle. Keep any
 * client-reachable avatar helper in this module.
 */
export const badgeholderAvatarUrl = (address: string) => `/api/avatar/${address.toLowerCase()}`

/**
 * Shortens an address for display, e.g. 0x1234…abcd
 */
export const shortenAddress = (address: string, chars = 4) => {
  if (address.length <= chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}
