import { BadgeholderAvatar } from '@/components/badgeholder-avatar'
import { type RecordState, RecordStatus } from '@/components/record-status'
import { ShareButton } from '@/components/share-button'
import { BADGE_CONTRACT_ADDRESS } from '@/lib/constants'
import type { BadgeholderRow, HandleField } from '@/lib/types'
import { shortenAddress } from '@/lib/utils'
import { ExternalLink, Send, ShieldCheck, Twitter } from 'lucide-react'

const CARD =
  'rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'

const HANDLES = {
  x: { label: 'X', icon: Twitter, base: 'https://x.com/' },
  telegram: { label: 'Telegram', icon: Send, base: 'https://t.me/' },
} as const

const handleState = (field: HandleField): RecordState =>
  field.state === 'empty' ? 'empty' : field.state === 'attested' ? 'attested' : 'populated'

const formatIssued = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** A set social handle as a platform-style chip linking out, marked when attested. */
const HandleChip = ({ kind, field }: { kind: keyof typeof HANDLES; field: HandleField }) => {
  if (field.state === 'empty') return null
  const { label, icon: Icon, base } = HANDLES[kind]
  const handle = field.handle.replace(/^@/, '')
  return (
    <a
      href={`${base}${handle}`}
      target="_blank"
      rel="noreferrer"
      title={`${label}: ${field.state === 'attested' ? 'attested' : 'not attested'}`}
      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-neutral-700 text-xs transition-colors hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600"
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span>{handle}</span>
      {field.state === 'attested' && (
        <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="size-3" aria-hidden="true" />
          verified
        </span>
      )}
      <ExternalLink className="size-3 opacity-50" aria-hidden="true" />
    </a>
  )
}

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
  const name = row.ensName ?? shortenAddress(row.address)
  const { records } = row

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <div className={`${CARD} flex flex-col gap-3 p-5 lg:col-span-2`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="truncate font-bold text-base text-neutral-900 dark:text-neutral-50">
                {name}
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
        {(records.x.state !== 'empty' || records.telegram.state !== 'empty') && (
          <div className="flex flex-wrap gap-2 pt-1">
            <HandleChip kind="x" field={records.x} />
            <HandleChip kind="telegram" field={records.telegram} />
          </div>
        )}
      </div>

      <div className={`${CARD} overflow-hidden lg:row-span-2`}>
        <div className="flex items-center justify-between border-neutral-100 border-b px-4 py-3 dark:border-neutral-800">
          <p className="font-semibold text-neutral-900 text-sm dark:text-neutral-50">Avatar</p>
          <RecordStatus label="Avatar" state={records.avatar ? 'populated' : 'empty'} />
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
          <Row label="X">
            <Value value={records.x.state === 'empty' ? null : records.x.handle} />
            <RecordStatus label="X" state={handleState(records.x)} />
          </Row>
          <Row label="Telegram">
            <Value value={records.telegram.state === 'empty' ? null : records.telegram.handle} />
            <RecordStatus label="Telegram" state={handleState(records.telegram)} />
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
