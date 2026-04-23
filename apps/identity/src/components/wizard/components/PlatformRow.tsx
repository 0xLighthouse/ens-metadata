'use client'

import { Button } from '@/components/ui/button'
import type { Platform } from '@/hooks/use-social-accounts'
import type { PrivyTelegramAccount } from '@/lib/telegram-proof'
import type { PrivyTwitterAccount } from '@/lib/twitter-proof'
import { cn } from '@/lib/utils'
import { X as XIcon } from 'lucide-react'

interface Props {
  platform: Platform
  required: boolean
  twitter: PrivyTwitterAccount | null
  telegram: PrivyTelegramAccount | null
  onLink: () => void
  onUnlink: () => void
  disconnecting: boolean
  disabled: boolean
}

/** One row of the social-accounts table: name, linked state, action button. */
export function PlatformRow({
  platform,
  required,
  twitter,
  telegram,
  onLink,
  onUnlink,
  disconnecting,
  disabled,
}: Props) {
  const label = platform === 'com.x' ? 'X.com' : 'Telegram'
  const linked = platform === 'com.x' ? !!twitter : !!telegram
  const handle = platform === 'com.x' ? (twitter?.username ?? null) : (telegram?.username ?? null)
  // Telegram's photoUrl points at t.me/i/userpic/…, which is session-gated and
  // can't be loaded by third-party clients. Privy passes it through unchanged
  // and offers no proxy, so we always fall back to the letter initial there.
  const avatarUrl = platform === 'com.x' ? (twitter?.profilePictureUrl ?? null) : null
  const helperText =
    platform === 'com.x'
      ? 'Log in to X and approve access. Only your X handle will be made public. No other data will be stored or shared.'
      : 'Log in to Telegram and approve access. Your account must have a public @username. Only your username will be made public. No other data will be stored or shared.'
  const initial = (handle ?? label).charAt(0).toUpperCase()

  return (
    <div
      className={cn(
        'flex flex-col gap-3 px-4 py-4 transition-colors sm:flex-row sm:items-center sm:gap-4',
        linked && 'bg-green-50/60 dark:bg-green-950/20',
      )}
    >
      <div className="sm:w-28 sm:shrink-0">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{label}</div>
        <div className="mt-1">
          {linked ? (
            <span className="inline-block rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-700 dark:bg-green-900/50 dark:text-green-300">
              Connected
            </span>
          ) : (
            <span
              className={cn(
                'inline-block rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
                !required && 'invisible',
              )}
              aria-hidden={!required}
            >
              Required
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {linked ? (
          <div className="flex items-center justify-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={handle ? `@${handle}` : `${label} avatar`}
                className="h-8 w-8 rounded-full border border-neutral-200 object-cover dark:border-neutral-700"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                {initial}
              </div>
            )}
            <span className="truncate font-mono text-sm text-neutral-900 dark:text-neutral-100">
              {handle ? `@${handle}` : 'connected'}
            </span>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            {helperText}
          </p>
        )}
      </div>

      <div className="sm:shrink-0">
        {linked ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onUnlink}
            disabled={disabled}
            isLoading={disconnecting}
          >
            {!disconnecting && <XIcon className="mr-1 h-3.5 w-3.5" />}
            Unlink
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onLink} disabled={disabled}>
            Link {platform === 'com.x' ? 'X' : 'Telegram'}
          </Button>
        )}
      </div>
    </div>
  )
}
