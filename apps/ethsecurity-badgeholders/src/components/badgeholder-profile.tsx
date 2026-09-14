import { BadgeholderAvatar } from '@/components/badgeholder-avatar'
import { CopyButton } from '@/components/copy-button'
import { EditProfileButton } from '@/components/edit-profile/edit-profile-button'
import { HandlePill } from '@/components/handle-pill'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isAddressOnly, rowLabel } from '@/lib/identity'
import type { BadgeholderRow, HandleField } from '@/lib/types'
import { TriangleAlert } from 'lucide-react'

const CARD =
  'rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 px-6 py-3">
    <span className="shrink-0 font-semibold text-neutral-900 text-sm dark:text-neutral-50">
      {label}
    </span>
    <div className="flex min-w-0 items-center gap-3">{children}</div>
  </div>
)

const Value = ({ value }: { value: string | null }) =>
  value ? (
    <span className="truncate text-neutral-900 text-sm dark:text-neutral-50">{value}</span>
  ) : (
    <span className="text-neutral-400 text-sm italic dark:text-neutral-500">Not set</span>
  )

/**
 * A social handle's value, marked with a triangle when it is unattested. The `sr-only` text
 * repeats what the tooltip says, since Radix only wires up `aria-describedby` while it is open.
 */
const HandleValue = ({ name, field }: { name: string; field: HandleField }) => {
  if (field.state === 'empty') return <Value value={null} />
  if (field.state === 'attested') return <Value value={field.handle} />

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-neutral-900 text-sm dark:text-neutral-50">
            {field.handle}
          </span>
          <TriangleAlert
            className="size-3.5 shrink-0 text-orange-500 dark:text-orange-400"
            aria-hidden="true"
          />
          <span className="sr-only">, unverified</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{`This ${name} handle is unverified`}</TooltipContent>
    </Tooltip>
  )
}

/**
 * One badgeholder's profile: who they are, then everything they have published. `editEnabled`
 * adds the Edit button, which needs Privy to be configured.
 */
export function BadgeholderProfile({
  row,
  editEnabled = false,
}: { row: BadgeholderRow; editEnabled?: boolean }) {
  const { primary, secondary } = rowLabel(row)
  const { records } = row

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} flex gap-5 p-5`}>
        <BadgeholderAvatar row={row} className="size-32 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col">
          {isAddressOnly(row) ? (
            <h1 className="truncate font-bold text-3xl text-neutral-400 italic dark:text-neutral-500">
              Name unspecified
            </h1>
          ) : (
            <h1 className="truncate font-bold text-3xl text-neutral-900 dark:text-neutral-50">
              {primary}
              {secondary && (
                <span className="font-normal text-neutral-500 dark:text-neutral-400">
                  {' '}
                  ({secondary})
                </span>
              )}
            </h1>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="truncate font-mono text-neutral-900 text-sm dark:text-neutral-50">
              {row.address}
            </span>
            <CopyButton value={row.address} label="address" />
          </div>
          <div className="mt-auto flex justify-end pt-4">
            <HandlePill platform="badge" field={{ state: 'unverifiable', handle: row.tokenId }} />
          </div>
        </div>
      </div>

      <h2 className="text-center font-semibold text-base text-neutral-900 dark:text-neutral-50">
        ETHSecurity Badgeholder
      </h2>

      <div className={`${CARD} overflow-hidden`}>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          <Row label="Name">
            <Value value={records.name} />
          </Row>
          <Row label="Bio">
            <Value value={records.description} />
          </Row>
          <Row label="Email address">
            <Value value={records.email.state === 'empty' ? null : records.email.handle} />
          </Row>
          <Row label="X account">
            <HandleValue name="X" field={records.x} />
          </Row>
          <Row label="Telegram account">
            <HandleValue name="Telegram" field={records.telegram} />
          </Row>
        </div>
        {editEnabled && (
          <div className="flex justify-end border-neutral-100 border-t px-6 py-3 dark:border-neutral-800">
            <EditProfileButton row={row} />
          </div>
        )}
      </div>
    </div>
  )
}
