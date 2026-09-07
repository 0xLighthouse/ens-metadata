'use client'

import { BadgeholderCard, type ListView } from '@/components/badgeholder-card'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SORT_OPTIONS, type SortKey, sortRows } from '@/lib/sort'
import type { BadgeholderRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ChevronDown, LayoutGrid, List } from 'lucide-react'
import { useMemo, useState } from 'react'

/** The badgeholder list with a sort select and a list/grid toggle, after the platform delegates page. */
export function BadgeholderList({ rows }: { rows: BadgeholderRow[] }) {
  const [sort, setSort] = useState<SortKey>('completeness')
  const [view, setView] = useState<ListView>('list')
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort])

  if (rows.length === 0) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>No badgeholders to show</CardTitle>
          <CardDescription>
            The badgeholder list could not be loaded. Try again in a few minutes.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <label className="relative flex h-10 flex-1 items-center rounded-lg border border-neutral-200 text-neutral-500 text-sm transition-colors hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600">
          <span className="sr-only">Sort by</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-full w-full cursor-pointer appearance-none bg-transparent pr-10 pl-4 outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Sort by: {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-4 size-4 shrink-0"
            aria-hidden="true"
          />
        </label>
        <button
          type="button"
          onClick={() => setView((current) => (current === 'list' ? 'grid' : 'list'))}
          aria-label={view === 'list' ? 'Switch to grid view' : 'Switch to list view'}
          aria-pressed={view === 'grid'}
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors',
            view === 'list'
              ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100'
              : 'border-neutral-200 text-neutral-400 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600',
          )}
        >
          {view === 'list' ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
        </button>
      </div>

      <div
        className={
          view === 'list' ? 'flex flex-col gap-3' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'
        }
      >
        {sorted.map((row) => (
          <BadgeholderCard key={row.address} row={row} view={view} />
        ))}
      </div>
    </div>
  )
}
