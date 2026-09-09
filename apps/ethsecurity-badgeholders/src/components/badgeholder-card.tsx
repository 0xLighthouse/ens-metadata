import { BadgeholderAvatar } from '@/components/badgeholder-avatar'
import { HandlePill } from '@/components/handle-pill'
import type { BadgeholderRow } from '@/lib/types'
import { shortenAddress } from '@/lib/utils'
import Link from 'next/link'

export type ListView = 'list' | 'grid'

/**
 * The card's X/Telegram pills. A set pill renders as a real anchor, so it must sit above the
 * card's stretched overlay link (`relative z-10`) to stay clickable.
 */
const Handles = ({ row }: { row: BadgeholderRow }) => (
  <div className="relative z-10 flex flex-wrap items-center gap-1.5 sm:shrink-0">
    <HandlePill platform="email" field={row.records.email} />
    <HandlePill platform="x" field={row.records.x} />
    <HandlePill platform="telegram" field={row.records.telegram} />
  </div>
)

const BadgeLabel = ({ row }: { row: BadgeholderRow }) => (
  <span className="text-xs text-neutral-400 dark:text-neutral-500">Badge #{row.tokenId}</span>
)

/** One badgeholder, as a row (`list`) or a tile (`grid`). Styled after the platform delegate card. */
export function BadgeholderCard({ row, view }: { row: BadgeholderRow; view: ListView }) {
  const name = row.ensName ?? shortenAddress(row.address)
  const description = row.records.description ?? 'No description provided'

  if (view === 'grid') {
    return (
      <div className="relative flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
        {/* The card itself can't be a link — the handle pills inside are anchors, and nesting
            anchors is invalid HTML. This overlay covers the card and carries the row's click. */}
        <Link href={`/view/${row.address}`} className="absolute inset-0 rounded-xl">
          <span className="sr-only">View {name}</span>
        </Link>
        <div className="flex items-center gap-3">
          <BadgeholderAvatar row={row} className="size-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-neutral-900 text-sm dark:text-neutral-50">
              {name}
            </p>
          </div>
        </div>
        <p className="line-clamp-2 min-h-[40px] text-neutral-500 text-sm dark:text-neutral-400">
          {description}
        </p>
        <Handles row={row} />
        <div className="flex items-center justify-between border-neutral-100 border-t pt-1 dark:border-neutral-800">
          <BadgeLabel row={row} />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-4 transition-colors hover:border-neutral-300 sm:flex-row sm:items-center sm:px-5 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
      {/* The card itself can't be a link — the handle pills inside are anchors, and nesting
          anchors is invalid HTML. This overlay covers the card and carries the row's click. */}
      <Link href={`/view/${row.address}`} className="absolute inset-0 rounded-xl">
        <span className="sr-only">View {name}</span>
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <BadgeholderAvatar row={row} className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 truncate font-semibold text-neutral-900 text-sm dark:text-neutral-50">
            {name}
          </p>
          <p className="truncate text-neutral-500 text-xs dark:text-neutral-400">{description}</p>
        </div>
      </div>
      <Handles row={row} />
      <div className="shrink-0 sm:min-w-[72px] sm:text-right">
        <BadgeLabel row={row} />
      </div>
    </div>
  )
}
