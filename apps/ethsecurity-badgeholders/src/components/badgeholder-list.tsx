'use client'

import { BadgeholderCard, type ListView } from '@/components/badgeholder-card'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { filterRows } from '@/lib/filter'
import {
  DEFAULT_SORT,
  SORT_OPTIONS,
  type SortKey,
  type SortState,
  sortDescription,
  sortRows,
} from '@/lib/sort'
import type { BadgeholderRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import { LayoutGrid, List } from 'lucide-react'
import { type ReactNode, useId, useMemo, useState } from 'react'

/**
 * One button in the sort or display group. `selected` drives the highlight and `aria-pressed`
 * together, so the visual state and the announced state can never disagree.
 */
function Segment({
  label,
  selected,
  onClick,
  icon,
  title,
}: {
  label: string
  selected: boolean
  onClick: () => void
  icon?: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={selected}
      aria-label={icon ? label : undefined}
      className={cn(
        'flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border text-sm ring-offset-white transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 dark:ring-offset-neutral-950 dark:focus-visible:ring-neutral-300',
        icon ? 'size-10' : 'px-3',
        selected
          ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100'
          : 'border-neutral-200 text-neutral-400 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600',
      )}
    >
      {icon ?? label}
    </button>
  )
}

/** The badgeholder list with a sort group and a list/grid display group, after the platform delegates page. */
export function BadgeholderList({ rows }: { rows: BadgeholderRow[] }) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  const [view, setView] = useState<ListView>('list')
  const [query, setQuery] = useState('')
  const visible = useMemo(
    () => sortRows(filterRows(rows, query), sort.key, sort.direction),
    [rows, query, sort],
  )
  const sortLabelId = useId()
  const filterLabelId = useId()
  const displayLabelId = useId()

  const pickSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    )

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
      {/* Nothing on screen shows the direction, and re-picking the current key only reverses it. */}
      <p className="sr-only" aria-live="polite">
        {sortDescription(sort)}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* biome-ignore lint/a11y/useSemanticElements: these are buttons, not form controls, so <fieldset> would be wrong */}
          <div
            role="group"
            aria-labelledby={sortLabelId}
            className="flex flex-wrap items-center gap-2"
          >
            <span id={sortLabelId} className="text-body-sm text-neutral-500 dark:text-neutral-400">
              Sort:
            </span>
            {SORT_OPTIONS.map((option) => (
              <Segment
                key={option.value}
                label={option.label}
                selected={sort.key === option.value}
                onClick={() => pickSort(option.value)}
                title={
                  sort.key === option.value
                    ? `${sortDescription(sort)} — click to reverse`
                    : undefined
                }
              />
            ))}
          </div>

          {/* biome-ignore lint/a11y/useSemanticElements: one input with its own label, not a form section */}
          <div role="group" aria-labelledby={filterLabelId} className="flex items-center gap-2">
            <span
              id={filterLabelId}
              className="text-body-sm text-neutral-500 dark:text-neutral-400"
            >
              Filter:
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-labelledby={filterLabelId}
              placeholder="Name, address or handle"
              className="h-10 w-56 min-w-0 rounded-lg border border-neutral-200 bg-transparent px-3 text-sm text-neutral-900 ring-offset-white placeholder:text-neutral-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 dark:border-neutral-700 dark:text-neutral-100 dark:ring-offset-neutral-950 dark:focus-visible:ring-neutral-300"
            />
          </div>
        </div>

        {/* biome-ignore lint/a11y/useSemanticElements: these are buttons, not form controls, so <fieldset> would be wrong */}
        <div role="group" aria-labelledby={displayLabelId} className="flex items-center gap-2">
          <span id={displayLabelId} className="text-body-sm text-neutral-500 dark:text-neutral-400">
            Display:
          </span>
          <Segment
            label="List view"
            selected={view === 'list'}
            onClick={() => setView('list')}
            icon={<List className="size-4" aria-hidden="true" />}
          />
          <Segment
            label="Square view"
            selected={view === 'grid'}
            onClick={() => setView('grid')}
            icon={<LayoutGrid className="size-4" aria-hidden="true" />}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>No matching badgeholders</CardTitle>
            <CardDescription>
              Nobody matches “{query.trim()}”. Try a different name, address or handle.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div
          className={
            view === 'list' ? 'flex flex-col gap-3' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'
          }
        >
          {visible.map((row) => (
            <BadgeholderCard key={row.address} row={row} view={view} />
          ))}
        </div>
      )}
    </div>
  )
}
