import { cn } from '@/lib/utils'
import * as React from 'react'

export const inputClassName =
  'flex w-full min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-xs outline-none transition-[color,box-shadow] placeholder:text-neutral-400 focus-visible:border-neutral-900 focus-visible:ring-[3px] focus-visible:ring-neutral-900/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-red-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:placeholder:text-neutral-500 dark:focus-visible:border-neutral-300 dark:focus-visible:ring-neutral-300/30 dark:aria-invalid:border-red-500'

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(inputClassName, 'h-9', className)} {...props} />
}

export { Input }
