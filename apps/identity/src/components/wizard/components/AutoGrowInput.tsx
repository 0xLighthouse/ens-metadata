'use client'

import { cn } from '@/lib/utils'
import type { ChangeEvent, TextareaHTMLAttributes } from 'react'
import { useEffect, useRef } from 'react'

type AutoGrowInputProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value'
> & {
  value: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
}

/** Textarea styled to match `<Input>` but grows vertically with its content.
 *  rows={1} is the baseline; we resize to scrollHeight on every value change. */
export function AutoGrowInput({ value, onChange, className, ...props }: AutoGrowInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={onChange}
      className={cn(
        'flex min-h-9 w-full min-w-0 resize-none overflow-hidden rounded-md border border-neutral-200 bg-transparent px-3 py-[0.4375rem] text-base leading-snug shadow-xs outline-none transition-[color,box-shadow] placeholder:text-neutral-500 selection:bg-neutral-900 selection:text-neutral-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-neutral-950 focus-visible:ring-neutral-950/50 focus-visible:ring-[3px]',
        'dark:border-neutral-800 dark:bg-neutral-200/30 dark:placeholder:text-neutral-400 dark:selection:bg-neutral-50 dark:selection:text-neutral-900 dark:focus-visible:border-neutral-300 dark:focus-visible:ring-neutral-300/50 dark:dark:bg-neutral-800/30',
        className,
      )}
      {...props}
    />
  )
}
