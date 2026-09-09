import { BadgeholderAvatar } from '@/components/badgeholder-avatar'
import { HandlePill } from '@/components/handle-pill'
import { ShareButton } from '@/components/share-button'
import { BADGE_CONTRACT_ADDRESS } from '@/lib/constants'
import { rowLabel } from '@/lib/identity'
import type { BadgeholderRow } from '@/lib/types'
import { shortenAddress } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'

const CARD =
  'rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'

const formatIssued = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 px-6 py-3">
    <span className="shrink-0 text-neutral-500 text-sm dark:text-neutral-400">{label}</span>
    <div className="flex min-w-0 items-center gap-3">{children}</div>
  </div>
)

const Value = ({ value }: { value: string | null }) =>
  value ? (
    <span className="truncate text-neutral-900 text-sm dark:text-neutral-50">{value}</span>
  ) : (
    <span className="text-neutral-400 text-sm italic dark:text-neutral-500">Not set</span>
  )

/** One badgeholder's profile, laid out after the platform delegate page. */
export function BadgeholderProfile({ row }: { row: BadgeholderRow }) {
  const { primary, secondary } = rowLabel(row)
  const { records } = row

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <div className={`${CARD} flex flex-col gap-3 p-5 lg:col-span-2`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="truncate font-bold text-base text-neutral-900 dark:text-neutral-50">
                {primary}
                {secondary && (
                  <span className="font-normal text-neutral-500 dark:text-neutral-400">
                    {' '}
                    ({secondary})
                  </span>
                )}
              </h1>
              <span className="font-mono text-neutral-400 text-xs dark:text-neutral-500">
                {shortenAddress(row.address)}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ShareButton />
          </div>
        </div>
        {records.description ? (
          <p className="text-neutral-500 text-sm dark:text-neutral-400">{records.description}</p>
        ) : (
          <p className="text-neutral-500 text-sm italic dark:text-neutral-400">
            No description provided
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <HandlePill platform="email" field={records.email} />
          <HandlePill platform="x" field={records.x} warning="triangle" />
          <HandlePill platform="telegram" field={records.telegram} warning="triangle" />
        </div>
      </div>

      <div className={`${CARD} overflow-hidden lg:row-span-2`}>
        <div className="border-neutral-100 border-b px-4 py-3 dark:border-neutral-800">
          <p className="font-semibold text-neutral-900 text-sm dark:text-neutral-50">Avatar</p>
        </div>
        {records.avatar ? (
          <div className="p-4">
            <BadgeholderAvatar row={row} className="aspect-square h-auto w-full rounded-xl" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-10">
            <BadgeholderAvatar
              row={row}
              className="size-24 rounded-xl [image-rendering:pixelated]"
            />
            <p className="text-neutral-400 text-sm italic dark:text-neutral-500">
              No avatar record
            </p>
          </div>
        )}
      </div>

      <div className={`${CARD} overflow-hidden lg:col-span-2`}>
        <div className="border-neutral-100 border-b px-6 py-4 dark:border-neutral-800">
          <p className="font-semibold text-neutral-900 text-sm dark:text-neutral-50">ENS records</p>
        </div>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          <Row label="ENS name">
            <Value value={row.ensName} />
          </Row>
          <Row label="Name">
            <Value value={records.name} />
          </Row>
          <Row label="Description">
            <Value value={records.description} />
          </Row>
          <Row label="Avatar">
            <Value value={records.avatar} />
          </Row>
          <Row label="Email">
            <Value value={records.email.state === 'empty' ? null : records.email.handle} />
          </Row>
          <Row label="X">
            <Value value={records.x.state === 'empty' ? null : records.x.handle} />
          </Row>
          <Row label="Telegram">
            <Value value={records.telegram.state === 'empty' ? null : records.telegram.handle} />
          </Row>
          <Row label="Badge">
            <span className="truncate text-neutral-900 text-sm dark:text-neutral-50">
              #{row.tokenId} · issued {formatIssued(row.issuedAt)}
            </span>
            <a
              href={`https://etherscan.io/token/${BADGE_CONTRACT_ADDRESS}?a=${row.tokenId}`}
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center gap-1 font-mono text-neutral-400 text-xs hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
            >
              {shortenAddress(BADGE_CONTRACT_ADDRESS)}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </Row>
        </div>
      </div>
    </div>
  )
}
