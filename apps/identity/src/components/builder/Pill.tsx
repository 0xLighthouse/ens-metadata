'use client'

import { cn } from '@/lib/utils'
import { type ReactNode, useEffect, useRef, useState } from 'react'

interface PillProps {
  /** Rendered text inside the pill. When empty, `placeholder` is shown instead. */
  label: ReactNode
  placeholder?: string
  /** Visual "unset" state — dashed border, muted text. */
  unset?: boolean
  /** Controlled open state. Leave undefined for uncontrolled behavior. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}

/**
 * Inline pill that opens a popover on click. The pill is an inline-block so
 * it flows inside a sentence; the popover absolutely positions below it and
 * closes on outside click or Escape.
 *
 * No Radix/Floating-UI dep — the interface app has those, but for this
 * lightweight generator a 30-line hook is enough.
 */
export function Pill({ label, placeholder, unset, open, onOpenChange, children }: PillProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  const containerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
    // setOpen identity is stable enough for this effect; pulling it into deps
    // would retrigger the listeners on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  return (
    <span ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-3 py-0.5 align-baseline',
          'text-[0.95em] font-semibold transition-colors',
          'border-2 border-dashed',
          unset
            ? 'border-rose-300 bg-rose-50 text-rose-500 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
            : 'border-rose-500 bg-rose-100 text-rose-700 hover:bg-rose-200 dark:border-rose-400 dark:bg-rose-900/50 dark:text-rose-100',
          isOpen && 'ring-2 ring-rose-400 ring-offset-2',
        )}
      >
        <span className="whitespace-normal">{unset ? placeholder : label}</span>
        <span aria-hidden className="text-xs">
          ▾
        </span>
      </button>
      {isOpen && (
        <span
          role="dialog"
          className={cn(
            'absolute left-0 top-[calc(100%+6px)] z-50 min-w-[16rem] max-w-[22rem]',
            'rounded-lg border border-neutral-200 bg-white p-3 shadow-lg',
            'dark:border-neutral-700 dark:bg-neutral-900',
          )}
        >
          {children}
        </span>
      )}
    </span>
  )
}
