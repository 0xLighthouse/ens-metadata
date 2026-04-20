'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useWeb3 } from '@/contexts/Web3Provider'
import { evictSession } from '@/lib/attester-client'
import { type RecordDiff, diffToWriteMap } from '@/lib/record-diff'
import { formatKeyName } from '@/lib/utils'
import { metadataWriter } from '@ensmetadata/sdk'
import { CheckCircle2, ExternalLink, FileSignature, Minus, PencilLine, Plus } from 'lucide-react'
import { useState } from 'react'
import { mainnet } from 'viem/chains'
import type { AttestationProof } from './LinkAccountsStep'

interface Props {
  name: string
  /** Signed attestation proofs from the social linking step. Empty when
   *  the wizard was launched in attrs-only mode (no platforms requested). */
  proofs: AttestationProof[]
  /** Diff between on-chain records and what the user submitted. Drives
   *  the add/update/remove preview and the write payload. */
  recordDiff: RecordDiff
  sessionId: string
  onBack: () => void
  /** Written directly when the attrs step was skipped (no user-facing fields). */
  classValue?: string
  schemaUri?: string
  keyLabels: Record<string, string>
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

export function ReviewStep({ name, proofs, recordDiff, sessionId, onBack, classValue, schemaUri, keyLabels }: Props) {
  const { walletClient, publicClient } = useWeb3()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Split recordDiff into structural (class/schema) and non-structural entries.
  const STRUCTURAL_KEYS = new Set(['class', 'schema'])
  const addedNonStructural = recordDiff.added.filter((r) => !STRUCTURAL_KEYS.has(r.key))
  const updatedNonStructural = recordDiff.updated.filter((r) => !STRUCTURAL_KEYS.has(r.key))
  const removedNonStructural = recordDiff.removed.filter((r) => !STRUCTURAL_KEYS.has(r.key))

  // Structural entries for category 3. Direct props (skipped attrs step) take
  // precedence; fall back to whatever the diff computed.
  const classFromDiff =
    recordDiff.added.find((r) => r.key === 'class') ??
    recordDiff.updated.find((r) => r.key === 'class')
  const schemaFromDiff =
    recordDiff.added.find((r) => r.key === 'schema') ??
    recordDiff.updated.find((r) => r.key === 'schema')
  const effectiveClass = classValue ?? classFromDiff?.next
  const effectiveSchema = schemaUri ?? schemaFromDiff?.next
  const structuralEntries: Array<{ key: string; value: string }> = []
  if (effectiveClass) structuralEntries.push({ key: 'class', value: effectiveClass })
  if (effectiveSchema) structuralEntries.push({ key: 'schema', value: effectiveSchema })

  const hasRecordChanges =
    addedNonStructural.length > 0 ||
    updatedNonStructural.length > 0 ||
    removedNonStructural.length > 0 ||
    structuralEntries.length > 0

  const runFlow = async () => {
    if (!walletClient) {
      setError('Wallet not ready.')
      setPhase('error')
      return
    }
    if (!proofs.length && !hasRecordChanges) {
      setError('Nothing to write — no proof or attribute changes.')
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
      const { txHash: hash } = await writer.setMetadata({
        name,
        records: recordsToWrite,
      })

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

  const handleSignAndPublish = () => {
    void runFlow()
  }

  const handleRetry = () => {
    setError(null)
    setPhase('idle')
  }

  const busy = phase === 'writing' || phase === 'confirming'
  const phaseLabel: Record<Phase, string> = {
    idle: 'Publish profile',
    writing: 'Writing to ENS…',
    confirming: 'Waiting for confirmations…',
    done: 'Done',
    error: 'Publish profile',
  }

  const explorerUrl = txHash
    ? `${mainnet.blockExplorers.default.url}/tx/${txHash}`
    : null

  const changeCount =
    addedNonStructural.length +
    updatedNonStructural.length +
    removedNonStructural.length +
    proofs.length +
    structuralEntries.length

  if (phase === 'done') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Records published</CardTitle>
          <CardDescription>
            {changeCount} record{changeCount === 1 ? '' : 's'} written to{' '}
            <span className="font-mono">{name}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950 p-4 text-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div className="space-y-1">
                <div className="font-medium text-green-900 dark:text-green-100">
                  Transaction confirmed
                </div>
                {txHash && (
                  <div className="font-mono text-xs break-all text-green-800 dark:text-green-200">
                    {txHash}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 hover:bg-neutral-100 dark:hover:bg-neutral-800 h-10 px-4 py-2 text-sm font-medium transition-colors"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Etherscan
              </a>
            )}
            <a
              href={`/proofs/${name}`}
              className="inline-flex w-full items-center justify-center rounded-md bg-neutral-900 text-neutral-50 hover:bg-neutral-900/90 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-50/90 h-10 px-4 py-2 text-sm font-medium transition-colors"
            >
              View proof
            </a>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Final review</CardTitle>
        <CardDescription>
          The following records will be written to the on-chain profile for{' '}
          <span className="font-mono">{name}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Category 1: New records (proofs + added non-structural) */}
        {(proofs.length > 0 || addedNonStructural.length > 0) && (
          <DiffSection tone="add" title="Values to add" subtitle="These new records will be added to your profile.">
            {proofs.map(({ draft }) => {
              const platformLabel =
                draft.claim.p === 'com.x' ? 'X'
                : draft.claim.p === 'org.telegram' ? 'Telegram'
                : draft.claim.p
              return (
                <DiffRow
                  key={draft.claim.p}
                  icon={<Plus className="h-3.5 w-3.5" />}
                  tone="add"
                  k={`social-proofs[${draft.claim.p}]`}
                  value={
                    <span>
                      {platformLabel}{' '}
                      <span className="font-semibold">@{draft.claim.h}</span> signed by attester
                    </span>
                  }
                />
              )
            })}
            {addedNonStructural.map((r) => (
              <DiffRow
                key={r.key}
                icon={<Plus className="h-3.5 w-3.5" />}
                tone="add"
                k={keyLabels[r.key] ?? formatKeyName(r.key)}
                value={r.next}
              />
            ))}
          </DiffSection>
        )}

        {/* Category 2: Updated/removed non-structural records */}
        {(updatedNonStructural.length > 0 || removedNonStructural.length > 0) && (
          <DiffSection tone="update" title="Values to update" subtitle="These existing records will be updated on your profile.">
            {updatedNonStructural.map((r) => (
              <DiffRow
                key={r.key}
                icon={<PencilLine className="h-3.5 w-3.5" />}
                tone="update"
                k={keyLabels[r.key] ?? formatKeyName(r.key)}
                value={
                  <span className="flex flex-col gap-0.5">
                    <span className="line-through opacity-60">{r.prev}</span>
                    <span>{r.next}</span>
                  </span>
                }
              />
            ))}
            {removedNonStructural.map((r) => (
              <DiffRow
                key={r.key}
                icon={<Minus className="h-3.5 w-3.5" />}
                tone="remove"
                k={keyLabels[r.key] ?? formatKeyName(r.key)}
                value={<span className="line-through opacity-60">{r.prev}</span>}
              />
            ))}
          </DiffSection>
        )}

        {/* Category 3: Structural records (class/schema only) */}
        {structuralEntries.length > 0 && (
          <DiffSection
            tone="neutral"
            title="Additional records"
            subtitle="These records will be updated to make your profile discoverable."
          >
            {structuralEntries.map((entry) => (
              <DiffRow
                key={entry.key}
                icon={<Plus className="h-3.5 w-3.5" />}
                tone="neutral"
                k={entry.key}
                value={entry.value}
              />
            ))}
          </DiffSection>
        )}

        {!proofs.length && !hasRecordChanges && (
          <div className="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
            Nothing has changed vs. what&apos;s currently on chain. Go back to edit.
          </div>
        )}

        {phase === 'confirming' && explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View on Etherscan
          </a>
        )}

        {phase === 'error' && error && (
          <div className="rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-900 dark:text-red-100">
            <div className="font-medium">Something went wrong</div>
            <div className="mt-1 break-words">{error}</div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={busy} full>
            Back
          </Button>
          {phase === 'error' ? (
            <Button full onClick={handleRetry}>
              <FileSignature className="h-4 w-4 mr-2" />
              Try again
            </Button>
          ) : (
            <Button
              full
              onClick={handleSignAndPublish}
              disabled={busy || (!proofs.length && !hasRecordChanges)}
              isLoading={busy}
            >
              {!busy && <FileSignature className="h-4 w-4 mr-2" />}
              {phaseLabel[phase]}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

type Tone = 'add' | 'update' | 'remove' | 'neutral'

const TONE_STYLES: Record<
  Tone,
  { border: string; bg: string; badge: string; label: string }
> = {
  add: {
    border: 'border-green-200 dark:border-green-900',
    bg: 'bg-green-50/60 dark:bg-green-950/30',
    badge: 'bg-green-500 text-white',
    label: 'text-green-700 dark:text-green-300',
  },
  update: {
    border: 'border-amber-200 dark:border-amber-900',
    bg: 'bg-amber-50/60 dark:bg-amber-950/30',
    badge: 'bg-amber-500 text-white',
    label: 'text-amber-700 dark:text-amber-300',
  },
  remove: {
    border: 'border-red-200 dark:border-red-900',
    bg: 'bg-red-50/60 dark:bg-red-950/30',
    badge: 'bg-red-500 text-white',
    label: 'text-red-700 dark:text-red-300',
  },
  neutral: {
    border: 'border-neutral-200 dark:border-neutral-700',
    bg: 'bg-transparent',
    badge: 'bg-neutral-400 text-white',
    label: 'text-neutral-500 dark:text-neutral-400',
  },
}

function DiffSection({
  tone,
  title,
  subtitle,
  children,
}: {
  tone: Tone
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  const s = TONE_STYLES[tone]
  return (
    <div className={`rounded-lg border ${s.border} ${s.bg} overflow-hidden`}>
      <div className={`px-3 pt-2.5 pb-2 ${s.label}`}>
        <div className="text-xs font-semibold uppercase tracking-wide">{title}</div>
        <div className="text-xs mt-0.5 opacity-80">{subtitle}</div>
      </div>
      <div className="divide-y divide-neutral-200/60 dark:divide-neutral-800/60">{children}</div>
    </div>
  )
}

function DiffRow({
  icon,
  tone,
  k,
  value,
}: {
  icon: React.ReactNode
  tone: Tone
  k: string
  value: React.ReactNode
}) {
  const s = TONE_STYLES[tone]
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 text-sm">
      <span
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.badge}`}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">{k}</span>
        <div className="break-words font-mono text-sm">{value}</div>
      </div>
    </div>
  )
}
