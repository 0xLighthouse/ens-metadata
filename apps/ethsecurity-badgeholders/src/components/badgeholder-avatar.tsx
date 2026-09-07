import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarFallback } from '@/lib/getAvatarFallback'
import type { BadgeholderRow } from '@/lib/types'
import { cn, resolveAvatar, shortenAddress } from '@/lib/utils'

/**
 * A badgeholder's avatar: the ENS avatar record when set, else a generated one. An avatar record
 * is an arbitrary third-party URL, so a load failure falls back to a two-character placeholder
 * rather than a broken image. Pass size classes via `className`; `size` is the pixel hint for
 * the generated fallback image.
 */
export function BadgeholderAvatar({
  row,
  size,
  className,
}: {
  row: BadgeholderRow
  size: number
  className?: string
}) {
  const name = row.ensName ?? shortenAddress(row.address)
  return (
    <Avatar className={cn('rounded-lg', className)}>
      <AvatarImage
        src={row.records.avatar ?? resolveAvatar(row.address, size)}
        alt={name}
        className="object-cover [image-rendering:inherit]"
      />
      <AvatarFallback className="rounded-[inherit] bg-neutral-100 font-mono text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
        {getAvatarFallback(row.address)}
      </AvatarFallback>
    </Avatar>
  )
}
