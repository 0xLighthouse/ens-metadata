'use client'

import { Button } from '@/components/ui/button'

/** The "throw away your edits?" confirmation, after the interface app's drawer. */
export function DiscardDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismissal only needs click */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-labelledby="discard-title"
        className="relative mx-4 w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h3
          id="discard-title"
          className="mb-6 font-semibold text-lg text-neutral-900 dark:text-neutral-50"
        >
          Discard your changes?
        </h3>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Keep editing
          </Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>
            Discard
          </Button>
        </div>
      </div>
    </div>
  )
}
