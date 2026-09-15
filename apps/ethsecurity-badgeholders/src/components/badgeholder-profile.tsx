import { BadgeholderAvatar } from '@/components/badgeholder-avatar'
import { CopyButton } from '@/components/copy-button'
import { EditProfileButton } from '@/components/edit-profile/edit-profile-button'
import { HandlePill } from '@/components/handle-pill'
import { VerifiedMark } from '@/components/verified-mark'
import { isAddressOnly, rowLabel } from '@/lib/identity'
import type { BadgeholderRow } from '@/lib/types'
import { isProfileVerified } from '@/lib/verification'

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
          {/* An address-only row has no ENS name and so can't carry attestations; no mark here. */}
          {isAddressOnly(row) ? (
            <h1 className="truncate font-bold text-3xl text-neutral-400 italic dark:text-neutral-500">
              Name unspecified
            </h1>
          ) : (
            <h1 className="flex min-w-0 items-center gap-2 font-bold text-3xl text-neutral-900 dark:text-neutral-50">
              <span className="min-w-0 truncate">
                {primary}
                {secondary && (
                  <span className="font-normal text-neutral-500 dark:text-neutral-400">
                    {' '}
                    ({secondary})
                  </span>
                )}
              </span>
              {isProfileVerified(row) && <VerifiedMark className="size-7" />}
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
            <Value value={records.alias} />
          </Row>
          <Row label="Bio">
            <Value value={records.description} />
          </Row>
          <Row label="Email address">
            <Value value={records.email.state === 'empty' ? null : records.email.handle} />
          </Row>
          <Row label="X account">
            {records.x.state === 'empty' ? (
              <Value value={null} />
            ) : (
              <HandlePill platform="x" field={records.x} />
            )}
          </Row>
          <Row label="Telegram account">
            {records.telegram.state === 'empty' ? (
              <Value value={null} />
            ) : (
              <HandlePill platform="telegram" field={records.telegram} />
            )}
          </Row>
        </div>
      </div>

      {editEnabled && (
        <div className="-mt-1 flex justify-end px-6">
          <EditProfileButton row={row} />
        </div>
      )}
    </div>
  )
}
