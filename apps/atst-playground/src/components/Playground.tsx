'use client'

import type { Handoff } from '@/lib/trace'
import { useState } from 'react'
import { InspectPanel } from './InspectPanel'
import { SignPanel } from './SignPanel'
import { VerifyPanel } from './VerifyPanel'

const TABS = [
  {
    id: 'sign',
    label: 'Attest',
    blurb: 'Create an attestation and sign it with a signing key',
  },
  {
    id: 'verify',
    label: 'Verify',
    blurb: 'Verify an existing, on-chain attestation.',
  },
  {
    id: 'inspect',
    label: 'Inspect',
    blurb:
      'Enter an attestation envelope (including signature) and interactively work through the verification process.',
  },
] as const

type TabId = (typeof TABS)[number]['id']

export function Playground() {
  const [tab, setTab] = useState<TabId>('sign')
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
          Tools for learning how to create and verify ENS text record attestations.
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
