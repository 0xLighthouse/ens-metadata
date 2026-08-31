'use client'

import {
  type ClaimMode,
  type Reconstruction,
  decodeEnvelopeHex,
  reconstruct,
} from '@/lib/reconstruct'
import type { Handoff } from '@/lib/trace'
import { useEffect, useState } from 'react'
import type { Hex } from 'viem'
import { Field, GhostButton, Panel, Rows, Verdict } from './ui'

interface Draft {
  envelopeHex: string
  mode: ClaimMode
  name: string
  addr: string
  platform: string
  identifier: string
  issuedAt: string
}

const EMPTY: Draft = {
  envelopeHex: '',
  mode: 'handle',
  name: '',
  addr: '',
  platform: 'com.x',
  identifier: '',
  issuedAt: '',
}

function draftFrom(handoff: Handoff): Draft {
  return {
    envelopeHex: handoff.envelopeHex,
    mode: handoff.mode,
    name: handoff.name,
    addr: handoff.addr,
    platform: handoff.platform,
    identifier: handoff.identifier,
    issuedAt: String(handoff.issuedAt),
  }
}

export function InspectPanel({ incoming }: { incoming: Handoff | null }) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [expected, setExpected] = useState('')
  const [result, setResult] = useState<Reconstruction | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (incoming) {
      setDraft(draftFrom(incoming))
      setExpected(incoming.expectedAttester ?? '')
    }
  }, [incoming])

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  // Decoding is cheap and synchronous; keep it out of the async effect so the
  // envelope fields stay visible even when reconstruction fails.
  let envelope: ReturnType<typeof decodeEnvelopeHex> | null = null
  let decodeError: string | null = null
  if (draft.envelopeHex.trim()) {
    try {
      envelope = decodeEnvelopeHex(draft.envelopeHex)
    } catch (err) {
      decodeError = err instanceof Error ? err.message : 'Envelope failed to decode.'
    }
  }

  const sig = envelope?.sig
  const issuedAt = Number(draft.issuedAt)

  useEffect(() => {
    let cancelled = false
    if (!sig || !Number.isInteger(issuedAt) || issuedAt < 0) {
      setResult(null)
      setError(null)
      return
    }
    reconstruct(
      {
        mode: draft.mode,
        name: draft.name,
        addr: draft.addr,
        platform: draft.platform,
        identifier: draft.identifier,
        issuedAt,
      },
      sig as Hex,
    )
      .then((next) => {
        if (cancelled) return
        setResult(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult(null)
        setError(err instanceof Error ? err.message : 'Reconstruction failed.')
      })
    return () => {
      cancelled = true
    }
  }, [sig, issuedAt, draft.mode, draft.name, draft.addr, draft.platform, draft.identifier])

  const tampered = envelope !== null && issuedAt !== envelope.issuedAt
  const match =
    result && expected.trim()
      ? result.recovered.toLowerCase() === expected.trim().toLowerCase()
      : null

  return (
    <div className="space-y-4">
      <Panel title="Envelope">
        <Field
          label="Envelope hex"
          hint="Tagged CBOR: 0xda 61 74 73 74, then [version, issuedAt, sig]."
        >
          <textarea
            rows={3}
            value={draft.envelopeHex}
            onChange={(e) => set({ envelopeHex: e.target.value })}
            placeholder="0xda61747374830219..."
            className="break-all"
          />
        </Field>
        {decodeError ? (
          <p className="mt-3" style={{ color: 'var(--fail)' }}>
            {decodeError}
          </p>
        ) : null}
        {envelope ? (
          <div className="mt-3">
            <Rows
              rows={[
                ['version', String(envelope.version)],
                [
                  'issuedAt',
                  `${envelope.issuedAt} — ${new Date(envelope.issuedAt * 1000).toISOString()}`,
                ],
                ['signature', envelope.sig],
              ]}
            />
          </div>
        ) : null}
      </Panel>

      <Panel title="Reconstruction">
        <p className="mb-3 text-muted">
          None of these fields live in the envelope. The verifier rebuilds them, so changing one
          here is the same as the underlying ENS data changing after issuance.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Claim type">
            <select value={draft.mode} onChange={(e) => set({ mode: e.target.value as ClaimMode })}>
              <option value="handle">handle (h)</option>
              <option value="uid">uid (u)</option>
            </select>
          </Field>
          <Field label="Name (n)">
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Address (a)" hint="The manager address at verification time.">
            <input
              value={draft.addr}
              onChange={(e) => set({ addr: e.target.value })}
              placeholder="0x…"
            />
          </Field>
          <Field label="Platform (p)">
            <input value={draft.platform} onChange={(e) => set({ platform: e.target.value })} />
          </Field>
          <Field label={draft.mode === 'handle' ? 'Handle (h)' : 'UID (u)'}>
            <input value={draft.identifier} onChange={(e) => set({ identifier: e.target.value })} />
          </Field>
          <Field
            label="Issued at (t)"
            hint={tampered ? 'Edited — no longer the signed timestamp.' : undefined}
          >
            <input
              value={draft.issuedAt}
              onChange={(e) => set({ issuedAt: e.target.value })}
              inputMode="numeric"
            />
          </Field>
        </div>
        {tampered && envelope ? (
          <div className="mt-3">
            <GhostButton onClick={() => set({ issuedAt: String(envelope.issuedAt) })}>
              Restore t from envelope
            </GhostButton>
          </div>
        ) : null}
      </Panel>

      <Panel title="Recovery">
        {error ? <p style={{ color: 'var(--fail)' }}>{error}</p> : null}
        {result ? (
          <Rows
            rows={[
              ['payload', result.payloadHex],
              ['keccak256', result.digest],
              ['recovered', result.recovered],
            ]}
          />
        ) : null}
        {!result && !error ? <p className="text-muted">Paste an envelope to begin.</p> : null}
        <div className="mt-4">
          <Field label="Expected attester address" hint="The addr record of the attester ENS name.">
            <input
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="0x…"
            />
          </Field>
        </div>
        {match !== null ? (
          <div className="mt-3">
            <Verdict valid={match} reason="recovered signer is not the attester" />
          </div>
        ) : null}
      </Panel>
    </div>
  )
}
