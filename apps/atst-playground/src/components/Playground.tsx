'use client'

import type { Handoff } from '@/lib/trace'
import { useState } from 'react'
import { InspectPanel } from './InspectPanel'
import { SignPanel } from './SignPanel'
import { VerifyPanel } from './VerifyPanel'

const TABS = [
  {
    id: 'verify',
    label: 'Verify',
    blurb: 'Walk a live ENS name through Section 7, one step at a time.',
  },
  {
    id: 'inspect',
    label: 'Inspect',
    blurb: 'Take an envelope apart and change what the verifier reconstructs.',
  },
  {
    id: 'sign',
    label: 'Sign',
    blurb: 'Act as an attester with a throwaway key and build an envelope.',
  },
] as const

type TabId = (typeof TABS)[number]['id']

export function Playground() {
  const [tab, setTab] = useState<TabId>('verify')
  const [handoff, setHandoff] = useState<Handoff | null>(null)

  function openInInspector(next: Handoff) {
    setHandoff(next)
    setTab('inspect')
  }

  const active = TABS.find((t) => t.id === tab)

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-base">ATST Playground</h1>
        <p className="mt-1 text-muted">
          ENS social media account attestations, taken apart. Reads mainnet; never writes.
        </p>
      </header>

      <nav className="mb-6 flex border-b border-rule">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="-mb-px border-b px-4 py-2"
            style={{
              borderColor: t.id === tab ? 'var(--ink)' : 'transparent',
              color: t.id === tab ? 'var(--ink)' : 'var(--muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <p className="mb-6 text-muted">{active?.blurb}</p>

      {tab === 'verify' ? <VerifyPanel onInspect={openInInspector} /> : null}
      {tab === 'inspect' ? <InspectPanel incoming={handoff} /> : null}
      {tab === 'sign' ? <SignPanel onInspect={openInInspector} /> : null}
    </main>
  )
}
