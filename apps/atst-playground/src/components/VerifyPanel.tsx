'use client'

import type { Handoff, TraceStep, VerifyTrace } from '@/lib/trace'
import { DEFAULT_ATTESTER_ENS } from '@ensmetadata/sdk'
import { useState } from 'react'
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
          <Rows rows={step.detail} />
        </div>
      ) : null}
      {step.note ? <p className="mt-2 pl-6 text-muted">{step.note}</p> : null}
    </li>
  )
}

export function VerifyPanel({ onInspect }: { onInspect: (handoff: Handoff) => void }) {
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState('com.x')
  const [attester, setAttester] = useState(DEFAULT_ATTESTER_ENS)
  const [mode, setMode] = useState<'handle' | 'uid'>('handle')
  const [uid, setUid] = useState('')
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
        body: JSON.stringify({ name, platform, attester, mode, uid }),
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
      <Panel title="Subject">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="ENS name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nick.eth" />
          </Field>
          <Field
            label="Platform"
            hint="Reverse-DNS identifier, and the text record key holding the handle."
          >
            <input
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="com.x"
            />
          </Field>
          <Field label="Attester ENS name">
            <input value={attester} onChange={(e) => setAttester(e.target.value)} />
          </Field>
          <Field label="Attestation type">
            <select value={mode} onChange={(e) => setMode(e.target.value as 'handle' | 'uid')}>
              <option value="handle">handle — attestations[p][attester]</option>
              <option value="uid">uid — uid[p][attester] (Section 9)</option>
            </select>
          </Field>
          {mode === 'uid' ? (
            <Field
              label="UID"
              hint="Section 9 leaves out of scope how a verifier obtains this, so you supply it."
            >
              <input value={uid} onChange={(e) => setUid(e.target.value)} />
            </Field>
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={verify} disabled={busy || name.trim().length === 0}>
            {busy ? 'Reading mainnet…' : 'Verify'}
          </Button>
          <span className="text-muted">
            Reads mainnet over a public endpoint. No key, no writes.
          </span>
        </div>
      </Panel>

      {error ? (
        <Panel>
          <p style={{ color: 'var(--fail)' }}>{error}</p>
        </Panel>
      ) : null}

      {trace ? (
        <Panel title="Section 7 — verification">
          <Verdict valid={trace.valid} reason={trace.reason} />
          <ol className="mt-4 space-y-3">
            {trace.steps.map((step) => (
              <Step key={step.n} step={step} />
            ))}
          </ol>
          {trace.handoff ? (
            <div className="mt-4 border-t border-rule pt-3">
              <Button onClick={() => onInspect(trace.handoff as Handoff)}>
                Open in inspector →
              </Button>
              <p className="mt-2 text-muted">
                Takes this envelope and its reconstruction into the inspector, where you can change
                a field and watch recovery diverge.
              </p>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  )
}
