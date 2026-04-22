'use client'

import { Button } from '@/components/ui/button'
import { GuidedCard, GuidedSection } from '@/components/ui/GuidedCard'
import { useWeb3 } from '@/contexts/Web3Provider'
import { evictSession } from '@/lib/attester-client'
import { type RecordDiff, diffToWriteMap } from '@/lib/record-diff'
import { cn } from '@/lib/utils'
import { metadataWriter } from '@ensmetadata/sdk'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileJson,
  Minus,
  Pencil,
  Plus,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { mainnet } from 'viem/chains'
import type { AttestationProof, UnchangedRecord } from './ComposeScreen'

interface Props {
  name: string
  sessionId: string
  proofs: AttestationProof[]
  recordDiff: RecordDiff
  unchangedRecords: UnchangedRecord[]
  classValue?: string
  schemaUri?: string
  keyLabels: Record<string, string>
  onBack: () => void
}

type Phase = 'idle' | 'writing' | 'confirming' | 'done' | 'error'

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()
  if (
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('rejected the request')
  ) {
    return 'Transaction cancelled, please try again.'
  }
  return raw
}

/**
 * Shows how the profile will look on chain once the user publishes. We flatten
 * the attr diff + the social proofs + class/schema into a single attribute
 * table so the user sees one unified list rather than "added/updated/removed"
 * buckets — this is the what-you-get view, not a diff view.
 */
export function PreviewScreen({
  name,
  sessionId,
  proofs,
  recordDiff,
  unchangedRecords,
  classValue,
  schemaUri,
  keyLabels,
  onBack,
}: Props) {
  const { walletClient, publicClient } = useWeb3()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [view, setView] = useState<'pretty' | 'raw'>('pretty')

  const PLATFORM_LABELS: Record<string, string> = { 'com.x': 'X.com', 'org.telegram': 'Telegram' }

  // Build the final set of records the user will publish. class/schema are
  // hidden here (they're structural, not user-facing profile fields). Social
  // proofs always appear last.
  const entries = useMemo(() => {
    const rows: Array<{
      key: string
      label?: string
      value: string
      tone: 'added' | 'updated' | 'unchanged'
      isProof?: boolean
      handle?: string
    }> = []
    const seen = new Set<string>()

    for (const a of recordDiff.added) {
      if (seen.has(a.key) || a.key === 'class' || a.key === 'schema') continue
      rows.push({ key: a.key, value: a.next, tone: 'added' })
      seen.add(a.key)
    }
    for (const u of recordDiff.updated) {
      if (seen.has(u.key) || u.key === 'class' || u.key === 'schema') continue
      rows.push({ key: u.key, value: u.next, tone: 'updated' })
      seen.add(u.key)
    }
    for (const r of unchangedRecords) {
      if (seen.has(r.key) || r.key === 'class' || r.key === 'schema') continue
      rows.push({ key: r.key, value: r.value, tone: 'unchanged' })
      seen.add(r.key)
    }

    for (const { draft } of proofs) {
      const platform = draft.claim.p
      const handle = draft.claim.h
      rows.push({
        key: `social-proofs[${platform}]`,
        label: PLATFORM_LABELS[platform] ?? platform,
        value: `@${handle}`,
        tone: 'added',
        isProof: true,
        handle,
      })
    }

    return rows
  }, [recordDiff, proofs, unchangedRecords])

  // The raw view: every text record that will actually be written, including
  // structural (class/schema) and the full claimHex for each attestation.
  // No friendly relabeling — keys are shown verbatim.
  const rawEntries = useMemo(() => {
    type RawRow = {
      key: string
      status: 'added' | 'updated' | 'removed'
      newValue?: string
      prevValue?: string
    }
    const rows: RawRow[] = []

    if (classValue) rows.push({ key: 'class', status: 'added', newValue: classValue })
    if (schemaUri) rows.push({ key: 'schema', status: 'added', newValue: schemaUri })

    for (const a of recordDiff.added) {
      if (a.key === 'class' || a.key === 'schema') continue
      rows.push({ key: a.key, status: 'added', newValue: a.next })
    }
    for (const u of recordDiff.updated) {
      if (u.key === 'class' || u.key === 'schema') continue
      rows.push({ key: u.key, status: 'updated', newValue: u.next, prevValue: u.prev })
    }
    for (const r of recordDiff.removed) {
      rows.push({ key: r.key, status: 'removed', prevValue: r.prev })
    }

    for (const { draft, claimHex } of proofs) {
      rows.push({
        key: `social-proofs[${draft.claim.p}]`,
        status: 'added',
        newValue: claimHex,
      })
    }

    return rows
  }, [classValue, schemaUri, recordDiff, proofs])

  const removedEntries = recordDiff.removed

  // Only *changes* gate the Publish button. Unchanged records live in
  // `entries` purely for display, so we check the diff directly.
  const hasAnything =
    recordDiff.added.length +
      recordDiff.updated.length +
      recordDiff.removed.length +
      proofs.length >
    0

  const runPublish = async () => {
    if (!walletClient) {
      setError('Wallet not ready.')
      setPhase('error')
      return
    }
    if (!hasAnything) {
      setError('Nothing to publish — no proof or attribute changes.')
      setPhase('error')
      return
    }
    setError(null)

    try {
      const recordsToWrite = diffToWriteMap(recordDiff)
      if (classValue) recordsToWrite.class = classValue
      if (schemaUri) recordsToWrite.schema = schemaUri
      for (const { draft, claimHex } of proofs) {
        recordsToWrite[`social-proofs[${draft.claim.p}]`] = claimHex
      }

      setPhase('writing')
      const writer = metadataWriter({ publicClient })(walletClient)
      const { txHash: hash } = await writer.setMetadata({ name, records: recordsToWrite })
      setTxHash(hash)
      setPhase('confirming')
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 })
      await evictSession(sessionId).catch(() => {})
      setPhase('done')
    } catch (err) {
      setError(friendlyError(err))
      setPhase('error')
    }
  }

  const busy = phase === 'writing' || phase === 'confirming'

  if (phase === 'done') {
    const explorerUrl = txHash ? `${mainnet.blockExplorers.default.url}/tx/${txHash}` : null
    return (
      <div className="space-y-6">
        <GuidedCard>
          <GuidedSection
            number="✓"
            title="Records published"
            description={`Updates written to ${name}.`}
            active
            accent="green"
          >
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <div className="font-medium">Transaction confirmed</div>
                  {txHash && <div className="font-mono text-xs break-all">{txHash}</div>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-md border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Etherscan
                  </a>
                )}
                <a
                  href={`/proofs/${name}`}
                  className="inline-flex items-center rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-50 dark:text-neutral-900"
                >
                  View proof
                </a>
              </div>
            </div>
          </GuidedSection>
        </GuidedCard>
      </div>
    )
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
              ? `The following details will be published to ${name}.`
              : `The following text records will be written to ${name}.`
          }
          active
          accent="green"
        >
          {view === 'pretty' ? (
            entries.length === 0 && removedEntries.length === 0 ? (
              <p className="text-sm text-neutral-500">Nothing will change.</p>
            ) : (
              <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {entries.map((row) => (
                  <div
                    key={row.key}
                    className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                  >
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 sm:w-40 sm:shrink-0">
                      <span>{row.label ?? keyLabels[row.key] ?? row.key}</span>
                      {row.tone === 'updated' && (
                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          updated
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 text-sm text-neutral-900 dark:text-neutral-100">
                      {row.isProof ? (
                        <span className="inline-flex items-center rounded-full border border-green-300 bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300">
                          Attestation (@{row.handle})
                        </span>
                      ) : (
                        <span className="break-words">{row.value}</span>
                      )}
                    </div>
                  </div>
                ))}
                {removedEntries.map((row) => (
                  <div
                    key={row.key}
                    className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                  >
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 sm:w-40 sm:shrink-0">
                      <span>{keyLabels[row.key] ?? row.key}</span>
                      <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-red-700 dark:bg-red-950/40 dark:text-red-300">
                        cleared
                      </span>
                    </div>
                    <div className="min-w-0 break-words text-sm text-neutral-500 line-through dark:text-neutral-500">
                      {row.prev}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : rawEntries.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing will change.</p>
          ) : (
            <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50/60 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900/40">
              {rawEntries.map((row) => (
                <div key={row.key} className="flex gap-3 px-4 py-3">
                  <div className="shrink-0 pt-0.5">
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="break-all font-mono text-xs text-neutral-500 dark:text-neutral-400">
                      {row.key}
                    </div>
                    {row.prevValue !== undefined && (
                      <div className="break-all font-mono text-xs text-neutral-400 line-through dark:text-neutral-500">
                        {row.prevValue}
                      </div>
                    )}
                    {row.newValue !== undefined && (
                      <div className="break-all font-mono text-xs text-neutral-900 dark:text-neutral-100">
                        {row.newValue}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GuidedSection>
      </GuidedCard>

      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={busy}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button full onClick={runPublish} isLoading={busy} disabled={busy || !hasAnything}>
            {phase === 'writing'
              ? 'Writing to ENS…'
              : phase === 'confirming'
                ? 'Waiting for confirmations…'
                : 'Publish'}
          </Button>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ViewTogglePill({
  view,
  onChange,
}: {
  view: 'pretty' | 'raw'
  onChange: (next: 'pretty' | 'raw') => void
}) {
  const base =
    'flex h-7 w-7 items-center justify-center rounded-full transition-colors focus:outline-none'
  const active = 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
  const inactive =
    'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-neutral-200 bg-white p-0.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => onChange('pretty')}
        aria-label="Profile view"
        aria-pressed={view === 'pretty'}
        className={cn(base, view === 'pretty' ? active : inactive)}
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onChange('raw')}
        aria-label="Raw records view"
        aria-pressed={view === 'raw'}
        className={cn(base, view === 'raw' ? active : inactive)}
      >
        <FileJson className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function StatusBadge({ status }: { status: 'added' | 'updated' | 'removed' }) {
  if (status === 'added') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
        <Plus className="h-3 w-3" />
      </span>
    )
  }
  if (status === 'updated') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400">
        <Pencil className="h-2.5 w-2.5" />
      </span>
    )
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
      <Minus className="h-3 w-3" />
    </span>
  )
}
