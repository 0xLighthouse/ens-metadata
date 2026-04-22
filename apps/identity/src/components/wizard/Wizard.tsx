'use client'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { IntentResponse } from '@/lib/attester-client'
import type { FetchedSchema } from '@/lib/schema-resolver'
import { WizardProvider, useWizardStore } from '@/stores/wizard'
import { useEffect } from 'react'
import { ComposeScreen } from './ComposeScreen'
import { CreatorBanner } from './CreatorBanner'
import { PreviewScreen } from './PreviewScreen'

interface WizardProps {
  intentId: string
  intent: IntentResponse
  schema: FetchedSchema | null
  keyLabels: Record<string, string>
}

export function Wizard(props: WizardProps) {
  return (
    <WizardProvider intentId={props.intentId}>
      <WizardBody {...props} />
    </WizardProvider>
  )
}

function WizardBody({ intent, schema, keyLabels }: Omit<WizardProps, 'intentId'>) {
  const config = intent.config
  const hasHydrated = useWizardStore((s) => s.hasHydrated)
  const screen = useWizardStore((s) => s.screen)
  const sessionId = useWizardStore((s) => s.sessionId)
  const seedEnsName = useWizardStore((s) => s.seedEnsName)

  // Seed the creator-provided name once, and only when nothing has claimed
  // the field yet — the store's `seedEnsName` is a no-op otherwise.
  useEffect(() => {
    if (!hasHydrated) return
    if (config.name) seedEnsName(config.name)
  }, [hasHydrated, config.name, seedEnsName])

  // Brief gate while zustand's persist middleware rehydrates from localStorage.
  // Schema + intent are already resolved server-side, so this is the only
  // async wait left.
  if (!hasHydrated) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Loading…</CardTitle>
            <CardDescription>Restoring your draft.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {config.message && (
        <CreatorBanner
          ensName={intent.creator.ensName}
          avatar={intent.creator.avatar}
          message={config.message}
        />
      )}

      {screen === 'compose' && (
        <ComposeScreen config={config} schema={schema} keyLabels={keyLabels} />
      )}

      {screen === 'preview' && sessionId && <PreviewScreen config={config} keyLabels={keyLabels} />}
    </div>
  )
}
