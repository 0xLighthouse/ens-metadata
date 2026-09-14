'use client'

import { TelegramIcon } from '@/components/icons/telegram'
import { XIcon } from '@/components/icons/x'
import { Button } from '@/components/ui/button'
import type { OnChainSocial } from '@/hooks/use-profile-records'
import type { SocialDraft } from '@/lib/profile-records'
import { PLATFORM_LABELS, type SocialPlatform, X_PLATFORM } from '@/lib/social'
import { cn } from '@/lib/utils'
import { BadgeCheck, Loader2, TriangleAlert } from 'lucide-react'

const PILL =
  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide'

/**
 * One social platform in the editor, after apps/identity's `PlatformRow`. Shows what is
 * on-chain now, what the pending draft will do to it, and the action that moves between
 * the two. Handles only ever come from a Privy-linked account, never from typing.
 */
export function SocialRow({
  platform,
  onChain,
  draft,
  pending,
  disabled,
  onConnect,
  onRemove,
  onUndo,
  onCancelPending,
}: {
  platform: SocialPlatform
  onChain: OnChainSocial
  draft: SocialDraft
  /** A Connect started and the browser has not come back with an account yet. */
  pending: boolean
  disabled: boolean
  onConnect: () => void
  onRemove: () => void
  onUndo: () => void
  onCancelPending: () => void
}) {
  const label = PLATFORM_LABELS[platform]
  const Icon = platform === X_PLATFORM ? XIcon : TelegramIcon
  const highlighted = draft.kind === 'link'
  const connectLabel = !onChain ? 'Connect' : onChain.attested ? 'Reconnect' : 'Verify'

  let status: React.ReactNode
  if (pending) {
    status = (
      <span className="flex items-center gap-2 text-neutral-500 text-sm dark:text-neutral-400">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Waiting for {label}…
      </span>
    )
  } else if (draft.kind === 'link') {
    status = (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-neutral-900 text-sm dark:text-neutral-50">
          @{draft.handle}
        </span>
        <span
          className={cn(
            PILL,
            'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
          )}
        >
          Will be verified
        </span>
      </span>
    )
  } else if (draft.kind === 'remove') {
    status = (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-neutral-400 text-sm line-through dark:text-neutral-500">
          @{onChain?.handle}
        </span>
        <span className={cn(PILL, 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300')}>
          Will be removed
        </span>
      </span>
    )
  } else if (onChain) {
    status = (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-neutral-900 text-sm dark:text-neutral-50">
          @{onChain.handle}
        </span>
        {onChain.attested ? (
          <span
            className={cn(
              PILL,
              'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
            )}
          >
            <BadgeCheck className="size-3" aria-hidden="true" />
            Verified
          </span>
        ) : (
          <span
            className={cn(
              PILL,
              'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
            )}
          >
            <TriangleAlert className="size-3" aria-hidden="true" />
            Unverified
          </span>
        )}
      </span>
    )
  } else {
    status = (
      <span className="text-neutral-400 text-sm italic dark:text-neutral-500">Not connected</span>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4',
        highlighted && 'bg-green-50/60 dark:bg-green-950/20',
      )}
    >
      <div className="flex shrink-0 items-center gap-2 sm:w-28">
        <Icon className="size-4 text-neutral-500 dark:text-neutral-400" />
        <span className="font-semibold text-neutral-900 text-sm dark:text-neutral-50">{label}</span>
      </div>
      <div className="min-w-0 flex-1">{status}</div>
      <div className="flex shrink-0 items-center gap-2">
        {pending ? (
          <Button variant="ghost" size="sm" onClick={onCancelPending} disabled={disabled}>
            Cancel
          </Button>
        ) : draft.kind !== 'keep' ? (
          <Button variant="ghost" size="sm" onClick={onUndo} disabled={disabled}>
            Undo
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={onConnect} disabled={disabled}>
              {connectLabel}
            </Button>
            {onChain && (
              <Button variant="ghost" size="sm" onClick={onRemove} disabled={disabled}>
                Remove
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
