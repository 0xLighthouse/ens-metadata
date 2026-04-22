'use client'

import { GuidedCard } from '@/components/ui/GuidedCard'
import type { FetchedSchema } from '@/lib/schema-resolver'
import type { IntentConfig } from '@ensmetadata/shared/intent'
import { ComposeProvider } from './ComposeContext'
import { ActionBar } from './components/ActionBar'
import { AttributesSection } from './components/AttributesSection'
import { PlatformsSection } from './components/PlatformsSection'
import { WalletSection } from './components/WalletSection'

interface Props {
  config: IntentConfig
  schema: FetchedSchema | null
  keyLabels: Record<string, string>
}

/**
 * Compose screen shell. All state/derivation lives in ComposeProvider so the
 * sections below can read via `useCompose()` without prop drilling.
 */
export function ComposeScreen(props: Props) {
  return (
    <ComposeProvider {...props}>
      <div className="space-y-6">
        <GuidedCard>
          <WalletSection />
          <AttributesSection />
          <PlatformsSection />
        </GuidedCard>
        <ActionBar />
      </div>
    </ComposeProvider>
  )
}
