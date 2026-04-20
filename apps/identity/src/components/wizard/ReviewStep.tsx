'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useWeb3 } from '@/contexts/Web3Provider'
import { attest, evictSession } from '@/lib/attester-client'
import { type RecordDiff, diffHasChanges, diffToWriteMap } from '@/lib/record-diff'
import { metadataWriter } from '@ensmetadata/sdk'
import { CheckCircle2, ExternalLink, FileSignature, Minus, PencilLine, Plus } from 'lucide-react'
import { useState } from 'react'
import { mainnet } from 'viem/chains'
import type { AnyDraftFullProof } from './Wizard'

interface Props {
  name: string
  /** Draft full-proof for the proof-issuance path. Null when the wizard
   *  was launched in attrs-only mode (no platforms requested). */
  draft: AnyDraftFullProof | null
  /** Diff between on-chain records and what the user submitted. Drives
   *  the add/update/remove preview and the write payload. */
  recordDiff: RecordDiff
  sessionId: string
  onBack: () => void
  /** Written directly when the attrs step was skipped (no user-facing fields). */
  classValue?: string
  schemaUri?: string
}

type Phase = 'idle' | 'attesting' | 'writing' | 'confirming' | 'done' | 'error'

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

export function ReviewStep({ name, draft, recordDiff, sessionId, onBack, classValue, schemaUri }: Props) {
  const { walletClient, publicClient } = useWeb3()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const recordKey = draft ? `social-proofs[${draft.claim.p}]` : null
  const hasRecordChanges = diffHasChanges(recordDiff) || !!(classValue || schemaUri)

  const runFlow = async () => {
    if (!walletClient) {
      setError('Wallet not ready.')
      setPhase('error')
      return
    }
    if (!draft && !hasRecordChanges) {
      setError('Nothing to write — no proof or attribute changes.')
      setPhase('error')
      return
    }
    setError(null)

    try {
      const recordsToWrite = diffToWriteMap(recordDiff)
      if (classValue) recordsToWrite.class = classValue
      if (schemaUri) recordsToWrite.schema = schemaUri

      if (draft && recordKey) {
        setPhase('attesting')
        const { claimHex } = await attest({ sessionId, name })
        recordsToWrite[recordKey] = claimHex
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

  const busy = phase === 'attesting' || phase === 'writing' || phase === 'confirming'
  const phaseLabel: Record<Phase, string> = {
    idle: 'Publish profile',
    attesting: 'Issuing attestation…',
    writing: 'Writing to ENS…',
    confirming: 'Waiting for confirmations…',
    done: 'Done',
    error: 'Publish profile',
  }

  const explorerUrl = txHash
    ? `${mainnet.blockExplorers.default.url}/tx/${txHash}`
    : null

  const changeCount =
    recordDiff.added.length +
    recordDiff.updated.length +
    recordDiff.removed.length +
    (draft ? 1 : 0) +
    (classValue ? 1 : 0) +
    (schemaUri ? 1 : 0)

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

  const platformLabel = (() => {
    if (!draft) return ''
    if (draft.claim.p === 'com.x') return 'X'
    if (draft.claim.p === 'org.telegram') return 'Telegram'
    return draft.claim.p
  })()

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
        {/* Proof record — treated as "new" since we don't read the current
            proof to diff against yet. */}
        {draft && recordKey && (
          <DiffSection tone="add" title="New proof">
            <DiffRow
              icon={<Plus className="h-3.5 w-3.5" />}
              tone="add"
              k={recordKey}
              value={
                <span>
                  {platformLabel}{' '}
                  <span className="font-semibold">@{draft.claim.h}</span> signed by attester
                </span>
              }
            />
          </DiffSection>
        )}

        {(classValue || schemaUri) && (
          <DiffSection tone="add" title="Structural records">
            {classValue && (
              <DiffRow
                icon={<Plus className="h-3.5 w-3.5" />}
                tone="add"
                k="class"
                value={classValue}
              />
            )}
            {schemaUri && (
              <DiffRow
                icon={<Plus className="h-3.5 w-3.5" />}
                tone="add"
                k="schema"
                value={schemaUri}
              />
            )}
          </DiffSection>
        )}

        {recordDiff.added.length > 0 && (
          <DiffSection tone="add" title={`Added (${recordDiff.added.length})`}>
            {recordDiff.added.map((r) => (
              <DiffRow
                key={r.key}
                icon={<Plus className="h-3.5 w-3.5" />}
                tone="add"
                k={r.key}
                value={r.next}
              />
            ))}
          </DiffSection>
        )}

        {recordDiff.updated.length > 0 && (
          <DiffSection tone="update" title={`Updated (${recordDiff.updated.length})`}>
            {recordDiff.updated.map((r) => (
              <DiffRow
                key={r.key}
                icon={<PencilLine className="h-3.5 w-3.5" />}
                tone="update"
                k={r.key}
                value={
                  <span className="flex flex-col gap-0.5">
                    <span className="line-through opacity-60">{r.prev}</span>
                    <span>{r.next}</span>
                  </span>
                }
              />
            ))}
          </DiffSection>
        )}

        {recordDiff.removed.length > 0 && (
          <DiffSection tone="remove" title={`Removed (${recordDiff.removed.length})`}>
            {recordDiff.removed.map((r) => (
              <DiffRow
                key={r.key}
                icon={<Minus className="h-3.5 w-3.5" />}
                tone="remove"
                k={r.key}
                value={<span className="line-through opacity-60">{r.prev}</span>}
              />
            ))}
          </DiffSection>
        )}

        {!draft && !hasRecordChanges && (
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
              disabled={busy || (!draft && !hasRecordChanges)}
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

type Tone = 'add' | 'update' | 'remove'

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
}

function DiffSection({
  tone,
  title,
  children,
}: {
  tone: Tone
  title: string
  children: React.ReactNode
}) {
  const s = TONE_STYLES[tone]
  return (
    <div className={`rounded-lg border ${s.border} ${s.bg} overflow-hidden`}>
      <div
        className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${s.label}`}
      >
        {title}
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
