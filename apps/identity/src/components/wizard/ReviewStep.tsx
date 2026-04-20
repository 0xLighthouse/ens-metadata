'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useWeb3 } from '@/contexts/Web3Provider'
import { evictSession } from '@/lib/attester-client'
import { type RecordDiff, diffToWriteMap } from '@/lib/record-diff'
import { formatKeyName } from '@/lib/utils'
import { wizardStyles as s } from './wizardStyles'
import { metadataWriter } from '@ensmetadata/sdk'
import { CheckCircle2, ChevronDown, ExternalLink, FileSignature, PencilLine, Plus } from 'lucide-react'
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
  const [openProofKey, setOpenProofKey] = useState<string | null>(null)
  const [isAdditionalOpen, setIsAdditionalOpen] = useState(false)

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
            <span className={s.mono}>{name}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={s.successBox}>
            <div className="flex items-start gap-3">
              <CheckCircle2 className={s.successIcon} />
              <div className="space-y-1">
                <div className={s.successTitle}>
                  Transaction confirmed
                </div>
                {txHash && (
                  <div className={s.successHash}>
                    {txHash}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className={s.buttonRow}>
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={s.outlineLink}
              >
                <ExternalLink className={s.iconSm} />
                Etherscan
              </a>
            )}
            <a
              href={`/proofs/${name}`}
              className={s.primaryLink}
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
          <span className={s.mono}>{name}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Category 1: New records (proofs + added non-structural) */}
        {(proofs.length > 0 || addedNonStructural.length > 0) && (
          <DiffSection tone="add" icon={<Plus className="h-3.5 w-3.5" />} title="Values to add" subtitle="These new records will be added to your profile.">
            {addedNonStructural.map((r) => (
              <DiffRow
                key={r.key}
                tone="add"
                k={keyLabels[r.key] ?? formatKeyName(r.key)}
                value={r.next}
              />
            ))}
            {proofs.length > 0 && (
              <div className="px-3 py-2.5">
                <div className="flex min-w-0 flex-col gap-2">
                  <span className={`${s.mono} text-xs ${s.mutedText}`}>Attestations</span>
                  <div className="flex flex-col gap-2">
                    {proofs.map((proof) => (
                      <ProofPillRow
                        key={proof.draft.claim.p}
                        proof={proof}
                        isOpen={openProofKey === proof.draft.claim.p}
                        onToggle={() =>
                          setOpenProofKey((k) =>
                            k === proof.draft.claim.p ? null : proof.draft.claim.p,
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </DiffSection>
        )}

        {/* Category 2: Updated/removed non-structural records */}
        {(updatedNonStructural.length > 0 || removedNonStructural.length > 0) && (
          <DiffSection tone="update" icon={<PencilLine className="h-3.5 w-3.5" />} title="Values to update" subtitle="These existing records will be updated on your profile.">
            {updatedNonStructural.map((r) => (
              <DiffRow
                key={r.key}
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
            icon={<Plus className="h-3.5 w-3.5" />}
            title="Additional records"
            subtitle="These records will be updated to make your profile discoverable."
            isOpen={isAdditionalOpen}
            onToggle={() => setIsAdditionalOpen((v) => !v)}
          >
            {structuralEntries.map((entry) => (
              <DiffRow
                key={entry.key}
                tone="neutral"
                k={entry.key}
                value={entry.value}
              />
            ))}
          </DiffSection>
        )}

        {!proofs.length && !hasRecordChanges && (
          <div className={s.emptyStateBox}>
            Nothing has changed vs. what&apos;s currently on chain. Go back to edit.
          </div>
        )}

        {phase === 'confirming' && explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={s.subtleLink}
          >
            <ExternalLink className={s.iconXs} />
            View on Etherscan
          </a>
        )}

        {phase === 'error' && error && (
          <div className={s.errorBox}>
            <div className="font-medium">Something went wrong</div>
            <div className="mt-1 break-words">{error}</div>
          </div>
        )}

        <div className={s.buttonRow}>
          <Button variant="outline" onClick={onBack} disabled={busy} full>
            Back
          </Button>
          {phase === 'error' ? (
            <Button full onClick={handleRetry}>
              <FileSignature className={s.iconSm} />
              Try again
            </Button>
          ) : (
            <Button
              full
              onClick={handleSignAndPublish}
              disabled={busy || (!proofs.length && !hasRecordChanges)}
              isLoading={busy}
            >
              {!busy && <FileSignature className={s.iconSm} />}
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
    border: 'border-blue-200 dark:border-blue-800',
    bg: 'bg-blue-50/60 dark:bg-blue-950/30',
    badge: 'bg-blue-500 text-white',
    label: 'text-blue-900 dark:text-blue-100',
  },
}

function ProofPillRow({
  proof,
  isOpen,
  onToggle,
}: {
  proof: AttestationProof
  isOpen: boolean
  onToggle: () => void
}) {
  const { draft, claimHex } = proof
  const platformLabel =
    draft.claim.p === 'com.x' ? 'X'
    : draft.claim.p === 'org.telegram' ? 'Telegram'
    : draft.claim.p
  const recordKey = `social-proofs[${draft.claim.p}]`

  return (
    <div
      className="bg-green-100 dark:bg-green-900/40 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 overflow-hidden rounded-2xl"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between gap-2 w-full px-4 py-1.5 text-sm font-medium hover:bg-green-200/60 dark:hover:bg-green-800/30 transition-colors"
      >
        <span>
          {platformLabel} Account (
          <span className="font-semibold">@{draft.claim.h}</span>)
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-3 pt-1 border-t border-green-200 dark:border-green-800 space-y-2 text-xs">
          <div>
            <div className="opacity-60 mb-0.5">Key</div>
            <div className={s.mono}>{recordKey}</div>
          </div>
          <div>
            <div className="opacity-60 mb-0.5">Value</div>
            <div className={`${s.mono} break-all opacity-80`}>{claimHex}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function DiffSection({
  tone,
  icon,
  title,
  subtitle,
  children,
  isOpen,
  onToggle,
}: {
  tone: Tone
  icon?: React.ReactNode
  title: string
  subtitle: string
  children: React.ReactNode
  isOpen?: boolean
  onToggle?: () => void
}) {
  const t = TONE_STYLES[tone]
  const expandable = onToggle !== undefined
  const header = (
    <div className="flex items-start gap-3">
      {icon && (
        <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${t.badge}`}>
          {icon}
        </span>
      )}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide">{title}</div>
        <div className="text-xs mt-0.5 opacity-80">{subtitle}</div>
      </div>
    </div>
  )
  return (
    <div className={`rounded-lg border ${t.border} ${t.bg} overflow-hidden`}>
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          className={`w-full flex items-start justify-between gap-2 px-3 pt-2.5 pb-2 ${t.label} text-left`}
        >
          {header}
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 mt-0.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      ) : (
        <div className={`px-3 pt-2.5 pb-2 ${t.label}`}>{header}</div>
      )}
      {(!expandable || isOpen) && (
        <div className="divide-y divide-neutral-200/60 dark:divide-neutral-800/60">{children}</div>
      )}
    </div>
  )
}

function DiffRow({
  tone,
  k,
  value,
}: {
  tone: Tone
  k: string
  value: React.ReactNode
}) {
  return (
    <div className="px-3 py-2.5 text-sm">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={`${s.mono} text-xs ${s.mutedText}`}>{k}</span>
        <div className={`${s.mono} break-words text-sm`}>{value}</div>
      </div>
    </div>
  )
}
