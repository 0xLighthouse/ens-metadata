'use client'

import { GuidedCard, GuidedSection } from '@/components/ui/GuidedCard'
import { usePublishFlow } from '@/hooks/use-publish-flow'
import { useWizardStore } from '@/stores/wizard'
import type { IntentConfig } from '@ensmetadata/shared/intent'
import { useState } from 'react'
import { PreviewPretty } from './components/PreviewPretty'
import { PreviewRaw } from './components/PreviewRaw'
import { PublishBar } from './components/PublishBar'
import { PublishSuccessCard } from './components/PublishSuccessCard'
import { type PreviewMode, ViewTogglePill } from './components/ViewTogglePill'

interface Props {
  config: IntentConfig
  keyLabels: Record<string, string>
}

/**
 * Final-review shell: renders the pretty/raw toggle + whichever view is
 * selected + the publish action bar. Flips to the success card once the
 * publish flow confirms.
 */
export function PreviewScreen({ config, keyLabels }: Props) {
  const classValue = config.classValues[0]
  const schemaUri = config.schemaUris[0]
  const ensName = useWizardStore((s) => s.ensName)
  const publish = usePublishFlow({ classValue, schemaUri })
  const [view, setView] = useState<PreviewMode>('pretty')

  if (publish.phase === 'done') {
    return <PublishSuccessCard txHash={publish.txHash} />
  }

  return (
    <div className="space-y-6">
      <GuidedCard className="relative">
        <div className="absolute right-5 top-5 z-10 sm:right-7 sm:top-7">
          <ViewTogglePill view={view} onChange={setView} />
        </div>
        <GuidedSection
          title="Final review"
          description={
            view === 'pretty'
              ? `The following details will be published to ${ensName}.`
              : `The following text records will be written to ${ensName}.`
          }
          active
          accent="green"
        >
          {view === 'pretty' ? (
            <PreviewPretty keyLabels={keyLabels} />
          ) : (
            <PreviewRaw classValue={classValue} schemaUri={schemaUri} />
          )}
        </GuidedSection>
      </GuidedCard>

      <PublishBar publish={publish} />
    </div>
  )
}
