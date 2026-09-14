'use client'

import { getAvatarFallback } from '@/lib/getAvatarFallback'
import type { BadgeholderRow } from '@/lib/types'
import { badgeholderAvatarUrl, cn, shortenAddress } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

/** Shared by the image and its replacement, so swapping one for the other cannot shift layout. */
const FRAME = 'size-8 shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800'

/**
 * A badgeholder's avatar, served by our own `/api/avatar` route rather than fetched from
 * stamp.fyi by the browser. That route caches the image server-side, restricts it to the ENS
 * avatar record, and refuses any address that does not hold the badge. Every avatar arrives at
 * one fixed size as webp, so a record holding an NFT reference — `eip155:…`, which an `<img>`
 * cannot load — renders instead of breaking.
 *
 * The two-character placeholder is a swap-in which replaces the image only once loading has
 * actually failed.
 *
 * Size is presentational only: pass size classes via `className`.
 */
export function BadgeholderAvatar({
  row,
  className,
}: {
  row: BadgeholderRow
  className?: string
}) {
  const name = row.ensName ?? shortenAddress(row.address)
  const [failed, setFailed] = useState(false)
  const image = useRef<HTMLImageElement>(null)

  // An image that fails before hydration never fires React's `onError`, because the listener is
  // attached after the event. A finished-but-zero-width image is the only trace it leaves.
  useEffect(() => {
    const element = image.current
    if (element?.complete && element.naturalWidth === 0) setFailed(true)
  }, [])

  if (failed) {
    return (
      <div
        role="img"
        aria-label={name}
        className={cn(
          FRAME,
          'flex items-center justify-center font-mono text-neutral-500 dark:text-neutral-400',
          className,
        )}
      >
        {getAvatarFallback(row.address)}
      </div>
    )
  }

  return (
    <img
      ref={image}
      src={badgeholderAvatarUrl(row.address)}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn(FRAME, 'object-cover', className)}
    />
  )
}
