'use client'

import { Minus, Pencil, Plus } from 'lucide-react'

/** Circular +/✎/− badge used by the raw-records view. */
export function StatusBadge({ status }: { status: 'added' | 'updated' | 'removed' }) {
  if (status === 'added') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
        <Plus className="h-3 w-3" />
      </span>
    )
  }
  if (status === 'updated') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400">
        <Pencil className="h-2.5 w-2.5" />
      </span>
    )
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
      <Minus className="h-3 w-3" />
    </span>
  )
}
