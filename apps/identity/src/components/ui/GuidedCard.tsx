'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/**
 * Shared card scaffolding used by both the intent builder and the wizard.
 *
 * The goal is visual parity: what the author composes on one side should
 * look like what the recipient fills out on the other. Both sides render
 * the same outer card and the same numbered sections with soft-reveal
 * gating, so the mental model transfers one-to-one.
 */

export function GuidedCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function GuidedSection({
  number,
  title,
  description,
  active,
  inactiveHint,
  accent = 'rose',
  children,
}: {
  number?: string
  title: string
  description?: string
  active: boolean
  inactiveHint?: string
  /** Tint applied to the section number. Defaults to rose for the intent
   *  builder; the wizard opts into green to match its success accents. */
  accent?: 'rose' | 'green'
  children: ReactNode
}) {
  const indent = number ? 'ml-[calc(1.5rem+0.75rem)]' : ''
  return (
    <section
      aria-disabled={!active}
      className={cn(
        'border-t border-neutral-200 px-5 py-6 transition-opacity duration-300 first:border-t-0 sm:px-8 sm:py-7 dark:border-neutral-800',
        !active && 'pointer-events-none select-none opacity-50',
      )}
    >
      <header className="mb-4">
        <div className="flex items-baseline gap-3">
          {number && (
            <span
              className={cn(
                'font-mono text-xs font-semibold tracking-wider',
                accent === 'green' ? '' : 'text-rose-500/80 dark:text-rose-400/80',
              )}
              style={accent === 'green' ? { color: 'oklab(0.69 -0.21 0.13)' } : undefined}
            >
              {number}
            </span>
          )}
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {title}
          </h3>
        </div>
        {description && (
          <p
            className={cn(
              'mt-1 max-w-prose text-sm leading-snug text-neutral-500 dark:text-neutral-400',
              indent,
            )}
          >
            {description}
          </p>
        )}
        {!active && inactiveHint && (
          <p
            className={cn(
              'mt-2 text-xs italic text-neutral-400 dark:text-neutral-500',
              indent,
            )}
          >
            {inactiveHint}
          </p>
        )}
      </header>
      <div className={indent}>{children}</div>
    </section>
  )
}
