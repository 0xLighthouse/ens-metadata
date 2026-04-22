'use client'

import { Button } from '@/components/ui/button'
import type { usePublishFlow } from '@/hooks/use-publish-flow'
import { useWizardStore } from '@/stores/wizard'
import { AlertCircle, ArrowLeft } from 'lucide-react'

interface Props {
  publish: ReturnType<typeof usePublishFlow>
}

/** Bottom action bar: Back → compose, Publish → on-chain write. Surfaces any
 *  publish-flow error inline. */
export function PublishBar({ publish }: Props) {
  const backToCompose = useWizardStore((s) => s.backToCompose)

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex gap-2">
        <Button variant="outline" onClick={backToCompose} disabled={publish.busy}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          full
          onClick={publish.runPublish}
          isLoading={publish.busy}
          disabled={publish.busy || !publish.hasAnything}
        >
          {publish.phase === 'writing'
            ? 'Writing to ENS…'
            : publish.phase === 'confirming'
              ? 'Waiting for confirmations…'
              : 'Publish'}
        </Button>
      </div>
      {publish.error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{publish.error}</span>
        </div>
      )}
    </div>
  )
}
