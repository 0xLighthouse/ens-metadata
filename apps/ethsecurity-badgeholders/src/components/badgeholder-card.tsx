import { type RecordState, RecordStatus } from '@/components/record-status'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { BadgeholderRow, HandleField } from '@/lib/types'
import { resolveAvatar, shortenAddress } from '@/lib/utils'

export type ListView = 'list' | 'grid'

const handleState = (field: HandleField): RecordState =>
  field.state === 'empty' ? 'empty' : field.state === 'attested' ? 'attested' : 'populated'

const handleHref = (field: HandleField, base: string): string | undefined =>
  field.state === 'empty' ? undefined : `${base}${field.handle.replace(/^@/, '')}`

const BadgeholderAvatar = ({ row, name }: { row: BadgeholderRow; name: string }) => (
  <Avatar className="size-12 rounded-lg">
    <AvatarImage src={row.records.avatar ?? resolveAvatar(row.address, 96)} alt={name} />
    <AvatarFallback className="rounded-lg text-xs">{name.slice(0, 2)}</AvatarFallback>
  </Avatar>
)

const Chips = ({ row }: { row: BadgeholderRow }) => {
  const { name, description, avatar, x, telegram } = row.records
  return (
    <div className="flex flex-wrap gap-1.5">
      <RecordStatus label="Name" state={name ? 'populated' : 'empty'} />
      <RecordStatus label="Description" state={description ? 'populated' : 'empty'} />
      <RecordStatus label="Avatar" state={avatar ? 'populated' : 'empty'} />
      <RecordStatus label="X" state={handleState(x)} href={handleHref(x, 'https://x.com/')} />
      <RecordStatus
        label="Telegram"
        state={handleState(telegram)}
        href={handleHref(telegram, 'https://t.me/')}
      />
    </div>
  )
}

const BadgeLabel = ({ row }: { row: BadgeholderRow }) => (
  <span className="text-xs text-neutral-400 dark:text-neutral-500">Badge #{row.tokenId}</span>
)

/** One badgeholder, as a row (`list`) or a tile (`grid`). Styled after the platform delegate card. */
export function BadgeholderCard({ row, view }: { row: BadgeholderRow; view: ListView }) {
  const name = row.ensName ?? shortenAddress(row.address)
  const description = row.records.description ?? 'No description provided'

  if (view === 'grid') {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <BadgeholderAvatar row={row} name={name} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-neutral-900 text-sm dark:text-neutral-50">
              {name}
            </p>
          </div>
        </div>
        <p className="line-clamp-2 min-h-[40px] text-neutral-500 text-sm dark:text-neutral-400">
          {description}
        </p>
        <Chips row={row} />
        <div className="flex items-center justify-between border-neutral-100 border-t pt-1 dark:border-neutral-800">
          <BadgeLabel row={row} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:px-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <BadgeholderAvatar row={row} name={name} />
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 truncate font-semibold text-neutral-900 text-sm dark:text-neutral-50">
            {name}
          </p>
          <p className="truncate text-neutral-500 text-xs dark:text-neutral-400">{description}</p>
        </div>
      </div>
      <Chips row={row} />
      <div className="shrink-0 sm:min-w-[72px] sm:text-right">
        <BadgeLabel row={row} />
      </div>
    </div>
  )
}
