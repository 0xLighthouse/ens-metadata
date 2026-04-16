'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useWeb3 } from '@/contexts/Web3Provider'
import { attest } from '@/lib/attester-client'
import { metadataWriter } from '@ensmetadata/sdk'
import { CheckCircle2, FileSignature } from 'lucide-react'
import { useState } from 'react'
import type { AnyDraftFullProof } from './Wizard'

interface Props {
  name: string
  /** Draft full-proof for the proof-issuance path. Null when the wizard
   *  was launched in attrs-only mode (no platforms requested). */
  draft: AnyDraftFullProof | null
  /** Plain ENS text records to write alongside the proof — comes from
   *  the EnterAttributesStep. May be empty in proof-only mode. */
  extraRecords: Record<string, string>
  sessionId: string
  onBack: () => void
}

type Phase = 'idle' | 'attesting' | 'writing' | 'done' | 'error'

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()
  if (
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('rejected the request')
  ) {
    return 'You rejected the signature — try again.'
  }
  return raw
}

export function ReviewStep({ name, draft, extraRecords, sessionId, onBack }: Props) {
  const { walletClient, publicClient } = useWeb3()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const recordKey = draft ? `${draft.claim.p}.proof` : null
  const hasExtras = Object.keys(extraRecords).length > 0

  const runFlow = async () => {
    if (!walletClient) {
      setError('Wallet not ready.')
      setPhase('error')
      return
    }
    if (!draft && !hasExtras) {
      setError('Nothing to write — no proof or attributes provided.')
      setPhase('error')
      return
    }
    setError(null)

    try {
      const recordsToWrite: Record<string, string> = { ...extraRecords }

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

  const busy = phase === 'attesting' || phase === 'writing'
  const phaseLabel: Record<Phase, string> = {
    idle: 'Issue and publish',
    attesting: 'Issuing attestation…',
    writing: 'Writing to ENS…',
    done: 'Done',
    error: 'Issue and publish',
  }

  const writeSummary = (() => {
    const parts: string[] = []
    if (recordKey) parts.push(recordKey)
    const extraCount = Object.keys(extraRecords).length
    if (extraCount > 0) {
      parts.push(`${extraCount} profile record${extraCount === 1 ? '' : 's'}`)
    }
    return parts.join(' + ')
  })()

  if (phase === 'done') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Records published</CardTitle>
          <CardDescription>
            <span className="font-mono">{writeSummary || 'Records'}</span> set on{' '}
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
          <a
            href={`/proofs/${name}`}
            className="inline-flex w-full items-center justify-center rounded-md bg-neutral-900 text-neutral-50 hover:bg-neutral-900/90 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-50/90 h-10 px-4 py-2 text-sm font-medium transition-colors"
          >
            View proof
          </a>
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
        <CardTitle>Review and write</CardTitle>
        <CardDescription>
          {draft && hasExtras
            ? 'Get the attester to sign and write the proof + profile records to ENS in one transaction.'
            : draft
              ? `Get the attester to issue a signed claim and write ${recordKey} on ${name}.`
              : `Write ${Object.keys(extraRecords).length} profile record${Object.keys(extraRecords).length === 1 ? '' : 's'} to ${name}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-500 dark:text-neutral-400">ENS name</dt>
            <dd className="font-mono">{name}</dd>
          </div>

          {draft && recordKey && (
            <>
              <div className="flex justify-between">
                <dt className="text-neutral-500 dark:text-neutral-400">Record key</dt>
                <dd className="font-mono">{recordKey}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500 dark:text-neutral-400">{platformLabel} handle</dt>
                <dd className="font-mono">@{draft.claim.h}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500 dark:text-neutral-400">{platformLabel} user id</dt>
                <dd className="font-mono">{draft.claim.uid}</dd>
              </div>
            </>
          )}

          {hasExtras && (
            <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-700">
              <dt className="text-neutral-500 dark:text-neutral-400 text-xs uppercase tracking-wide">
                Profile records
              </dt>
              {Object.entries(extraRecords).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4">
                  <dd className="font-mono text-neutral-500 dark:text-neutral-400">{key}</dd>
                  <dd className="font-mono truncate max-w-[16rem]" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </div>
          )}
        </dl>

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
            <Button full onClick={handleSignAndPublish} disabled={busy} isLoading={busy}>
              {!busy && <FileSignature className="h-4 w-4 mr-2" />}
              {phaseLabel[phase]}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
