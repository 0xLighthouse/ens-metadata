import { BadgeholderAvatar } from '@/components/badgeholder-avatar'
import { HandlePill } from '@/components/handle-pill'
import { isAddressOnly, rowLabel } from '@/lib/identity'
import type { BadgeholderRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export type ListView = 'list' | 'grid'

/**
 * The card's email/X/Telegram/badge pills. A set pill must sit above the card's stretched overlay
 * link (`relative z-10`) to stay clickable. An unset record is omitted rather than shown as a
 * placeholder; the badge is always set, so every card carries at least that one.
 */
const Pills = ({ row, className }: { row: BadgeholderRow; className?: string }) => {
  const { email, x, telegram } = row.records
  return (
    <div className={cn('relative z-10 flex flex-wrap items-center gap-1.5 sm:shrink-0', className)}>
      {email.state !== 'empty' && <HandlePill platform="email" field={email} />}
      {x.state !== 'empty' && <HandlePill platform="x" field={x} />}
      {telegram.state !== 'empty' && <HandlePill platform="telegram" field={telegram} />}
      <HandlePill platform="badge" field={{ state: 'unverifiable', handle: row.tokenId }} />
    </div>
  )
}

const EnsName = ({ name }: { name: string }) => (
  <span className="font-normal text-neutral-500 dark:text-neutral-400"> ({name})</span>
)

/** One badgeholder, as a row (`list`) or a tile (`grid`). Styled after the platform delegate card. */
export function BadgeholderCard({ row, view }: { row: BadgeholderRow; view: ListView }) {
  const { primary, secondary } = rowLabel(row)
  const description = row.records.description ?? 'No description provided'

  if (view === 'grid') {
    const unnamed = isAddressOnly(row)

    return (
      <div className="relative flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
        {/* The card itself can't be a link — the handle pills inside are anchors, and nesting
            anchors is invalid HTML. This overlay covers the card and carries the row's click. */}
        <Link href={`/view/${row.address}`} className="absolute inset-0 rounded-xl">
          <span className="sr-only">View {primary}</span>
        </Link>
        <div className="flex items-center gap-3">
          <BadgeholderAvatar row={row} className="size-12" />
          <div className="min-w-0 flex-1">
            {unnamed ? (
              <p className="truncate font-normal text-neutral-400 text-sm italic dark:text-neutral-500">
                No name specified
              </p>
            ) : (
              <p className="truncate font-semibold text-neutral-900 text-sm dark:text-neutral-50">
                {primary}
                {secondary && <EnsName name={secondary} />}
              </p>
            )}
            <p className="break-all font-mono text-neutral-400 text-xs dark:text-neutral-500">
              {row.address}
            </p>
          </div>
        </div>
        <p className="line-clamp-2 min-h-[40px] text-neutral-500 text-sm dark:text-neutral-400">
          {description}
        </p>
        <Pills row={row} className="justify-end" />
      </div>
    )
  }

  return (
    <div className="relative flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-4 transition-colors hover:border-neutral-300 sm:flex-row sm:items-center sm:px-5 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
      {/* The card itself can't be a link — the handle pills inside are anchors, and nesting
          anchors is invalid HTML. This overlay covers the card and carries the row's click. */}
      <Link href={`/view/${row.address}`} className="absolute inset-0 rounded-xl">
        <span className="sr-only">View {primary}</span>
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <BadgeholderAvatar row={row} className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 truncate font-semibold text-neutral-900 text-sm dark:text-neutral-50">
            {primary}
            {secondary && <EnsName name={secondary} />}
          </p>
          <p className="truncate text-neutral-500 text-xs dark:text-neutral-400">{description}</p>
        </div>
      </div>
      <Pills row={row} />
    </div>
  )
}
