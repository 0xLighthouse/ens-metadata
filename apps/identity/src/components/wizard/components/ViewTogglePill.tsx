'use client'

import { cn } from '@/lib/utils'
import { Eye, FileJson } from 'lucide-react'

export type PreviewMode = 'pretty' | 'raw'

interface Props {
  view: PreviewMode
  onChange: (next: PreviewMode) => void
}

/** Pill toggle between the pretty profile view and the raw text-record view. */
export function ViewTogglePill({ view, onChange }: Props) {
  const base =
    'flex h-7 w-7 items-center justify-center rounded-full transition-colors focus:outline-none'
  const active = 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
  const inactive =
    'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-neutral-200 bg-white p-0.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => onChange('pretty')}
        aria-label="Profile view"
        aria-pressed={view === 'pretty'}
        className={cn(base, view === 'pretty' ? active : inactive)}
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onChange('raw')}
        aria-label="Raw records view"
        aria-pressed={view === 'raw'}
        className={cn(base, view === 'raw' ? active : inactive)}
      >
        <FileJson className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
