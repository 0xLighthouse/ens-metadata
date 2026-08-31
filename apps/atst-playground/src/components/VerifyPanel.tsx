'use client'

import type { Handoff, TraceStep, VerifyTrace } from '@/lib/trace'
import { DEFAULT_ATTESTER_ENS } from '@ensmetadata/sdk'
import { Fragment, useState } from 'react'
import { Button, Field, Panel, Rows, Verdict } from './ui'

const STATUS_MARK: Record<TraceStep['status'], string> = {
  ok: '✓',
  fail: '✗',
  skipped: '·',
}

const STATUS_COLOR: Record<TraceStep['status'], string> = {
  ok: 'var(--ok)',
  fail: 'var(--fail)',
  skipped: 'var(--muted)',
}

/**
 * Derived values worth copying out of a step, by step number. `'all'` marks
 * every row in that step as copyable.
 */
const COPYABLE: Record<number, readonly string[] | 'all'> = {
  1: ['namehash', "owner's address (a)"],
  3: ['attestation envelope', 'signature'],
  4: ['bytes'],
  5: 'all',
  6: ['attester address'],
}

function copyableIn(n: number): ((label: string) => boolean) | undefined {
  const marked = COPYABLE[n]
  if (!marked) return undefined
  if (marked === 'all') return () => true
  return (label) => marked.includes(label)
}

function Step({ step }: { step: TraceStep }) {
  return (
    <li className="border-t border-rule pt-3">
      <p className="flex gap-2">
        <span style={{ color: STATUS_COLOR[step.status] }}>{STATUS_MARK[step.status]}</span>
        <span className="text-muted">{step.n}.</span>
        <span>{step.label}</span>
      </p>
      {step.detail.length > 0 ? (
        <div className="mt-2 pl-6">
          <Rows rows={step.detail} copyable={copyableIn(step.n)} />
        </div>
      ) : null}
      {step.note ? <p className="mt-2 pl-6 text-muted">{step.note}</p> : null}
    </li>
  )
}

export function VerifyPanel({ onInspect }: { onInspect: (handoff: Handoff) => void }) {
  const [name, setName] = useState('jkm.eth')
  const [platform, setPlatform] = useState('com.x')
  const [attester, setAttester] = useState(DEFAULT_ATTESTER_ENS)
  const [trace, setTrace] = useState<VerifyTrace | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function verify() {
    setBusy(true)
    setError(null)
    setTrace(null)
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, platform, attester, mode: 'handle' }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Verification failed')
      setTrace(body as VerifyTrace)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Attestation Details">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="User ENS Name (n)">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nick.eth" />
          </Field>
          <Field label="Key name (k)">
            <input
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="com.x"
            />
          </Field>
          <Field label="Attester ENS name">
            <input value={attester} onChange={(e) => setAttester(e.target.value)} />
          </Field>
          <Field label="Attestation record key name">
            <div className="border border-rule px-3 py-2 text-muted">
              {`attestations[${platform}][${attester}]`}
            </div>
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={verify} disabled={busy || name.trim().length === 0}>
            {busy ? 'Verifying…' : 'Verify'}
          </Button>
        </div>
      </Panel>

      {error ? (
        <Panel>
          <p style={{ color: 'var(--fail)' }}>{error}</p>
        </Panel>
      ) : null}

      {trace ? (
        <Panel title="Verification Steps">
          <ol className="mt-4 space-y-3">
            {trace.steps.map((step) => (
              <Fragment key={step.n}>
                <Step step={step} />
                {!trace.valid && step.status === 'fail' ? (
                  <li>
                    <Verdict valid={trace.valid} reason={trace.reason} />
                  </li>
                ) : null}
              </Fragment>
            ))}
          </ol>
          {trace.valid ? (
            <div className="mt-4">
              <Verdict valid={trace.valid} reason={trace.reason} />
            </div>
          ) : null}
          {trace.handoff ? (
            <div className="mt-4 border-t border-rule pt-3">
              <Button onClick={() => onInspect(trace.handoff as Handoff)}>
                Open in inspector →
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  )
}
