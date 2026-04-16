'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useWeb3 } from '@/contexts/Web3Provider'
import { attest } from '@/lib/attester-client'
import { type StorageTier, type UploadProofResult, uploadProof } from '@/lib/ipfs'
import { metadataWriter } from '@ensmetadata/sdk'
import { encode as cborEncode } from '@ipld/dag-cbor'
import { AlertTriangle, CheckCircle2, FileSignature } from 'lucide-react'
import { useEffect, useState } from 'react'
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

type Phase = 'idle' | 'uploading' | 'attesting' | 'writing' | 'done' | 'error'

interface PendingUpload {
  reference: string
  tier: StorageTier
  timestamp: number
  ensName: string
}

const PENDING_KEY_PREFIX = 'proofs-pending-upload-'
const PENDING_TTL_MS = 60 * 60 * 1000 // 1 hour

function pendingKey(ensName: string): string {
  return `${PENDING_KEY_PREFIX}${ensName}`
}

function readPending(ensName: string): PendingUpload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(pendingKey(ensName))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingUpload
    if (
      typeof parsed.reference !== 'string' ||
      typeof parsed.timestamp !== 'number' ||
      parsed.ensName !== ensName
    ) {
      return null
    }
    if (Date.now() - parsed.timestamp > PENDING_TTL_MS) {
      window.sessionStorage.removeItem(pendingKey(ensName))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writePending(p: PendingUpload): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(pendingKey(p.ensName), JSON.stringify(p))
}

function clearPending(ensName: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(pendingKey(ensName))
}

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
  const { walletClient, publicClient, switchChain } = useWeb3()
  const [tier, setTier] = useState<StorageTier>('cdn')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [existingReference, setExistingReference] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingUpload | null>(null)

  // ENS text record key for this proof, e.g. "com.x.proof" — derived from
  // the platform field on the draft. Null when the wizard is in attrs-only
  // mode and there's no proof to write.
  const recordKey = draft ? `${draft.claim.p}.proof` : null
  const hasExtras = Object.keys(extraRecords).length > 0

  // Check for an abandoned upload on mount. If we find a recent one for this
  // name, surface the recovery card. Don't auto-use it — user must opt in.
  useEffect(() => {
    setPending(readPending(name))
  }, [name])

  // With v3 envelopes, the attester returns the fully-encoded hex. We
  // no longer preview a draft encoding in the frontend — the envelope
  // includes unsigned metadata (method, issuedAt) that only exist after
  // the attester signs.

  const runFlow = async (useExistingReference: string | null) => {
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
      // The records map we'll hand to setMetadata at the end. Build it up
      // from extras first; the proof claim is added after the attester
      // signs it, in the proof branch below.
      const recordsToWrite: Record<string, string> = { ...extraRecords }
      let effectiveTier: StorageTier = tier

      // Proof branch: pin the IPFS doc, ask the attester to sign, encode
      // the signed claim, and stick it in recordsToWrite under the
      // platform's text key. Skipped entirely when there's no draft
      // (attrs-only mode).
      if (draft && recordKey) {
        let reference = useExistingReference

        if (!reference) {
          // 1. Encode full proof doc (not the claim) as dag-cbor bytes.
          const proofDocBytes = cborEncode(draft as unknown as Record<string, unknown>)

          // 2. Upload it — CDN or paid IPFS via x402.
          setPhase('uploading')
          const result: UploadProofResult = await uploadProof({
            bytes: proofDocBytes,
            ensName: name,
            key: recordKey,
            tier,
            walletClient,
            switchChain,
          })
          reference = result.reference

          // Persist immediately after a successful upload and before any
          // signing. If the user bails between here and the ENS write we
          // can recover.
          writePending({
            reference,
            tier,
            timestamp: Date.now(),
            ensName: name,
          })
          setExistingReference(reference)
        } else {
          // Recovery path — we already paid; infer the tier from the
          // pending record only for display. The reference is authoritative.
          effectiveTier = pending?.tier ?? tier
        }

        // 3. Ask the attester to sign. The worker builds a v3 envelope
        //    (signed payload + unsigned metadata), encodes it as tagged
        //    CBOR, and returns the hex. We write it directly to ENS — no
        //    client-side encoding needed.
        setPhase('attesting')
        const { claimHex } = await attest({
          sessionId,
          name,
          chainId: draft.claim.chainId,
          expSeconds: draft.claim.exp,
          prf: reference,
        })

        recordsToWrite[recordKey] = claimHex
      }

      // 5. Write everything (proof + attrs) in a single multicall via the
      //    SDK's metadataWriter. This is the only on-chain transaction in
      //    the flow — and the only thing the user's wallet does after the
      //    SIWE sign-in.
      setPhase('writing')
      const writer = metadataWriter({ publicClient })(walletClient)
      const { txHash: hash } = await writer.setMetadata({
        name,
        records: recordsToWrite,
      })

      // 6. Success — clear the recovery record.
      clearPending(name)
      setPending(null)
      setTxHash(hash)
      setPhase('done')
      // effectiveTier is only read for the success card description
      void effectiveTier
    } catch (err) {
      setError(friendlyError(err))
      setPhase('error')
    }
  }

  const handleSignAndPublish = () => {
    void runFlow(null)
  }

  const handleFinishWithExisting = () => {
    if (!pending) return
    setExistingReference(pending.reference)
    void runFlow(pending.reference)
  }

  const handleStartOver = () => {
    clearPending(name)
    setPending(null)
    setExistingReference(null)
    setError(null)
    setPhase('idle')
  }

  const handleRetry = () => {
    setError(null)
    // If we already have an upload reference, skip straight to signing.
    if (existingReference) {
      void runFlow(existingReference)
    } else {
      setPhase('idle')
    }
  }

  const busy = phase === 'uploading' || phase === 'attesting' || phase === 'writing'
  const phaseLabel: Record<Phase, string> = {
    idle: 'Issue and publish',
    uploading: tier === 'ipfs' ? 'Pinning to IPFS…' : 'Uploading to CDN…',
    attesting: 'Issuing attestation…',
    writing: 'Writing to ENS…',
    done: 'Done',
    error: 'Issue and publish',
  }

  // Human-friendly summary of what was/will be written.
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

  // Platform display name for the summary labels — derived from the
  // draft's claim.p so Telegram doesn't get labelled as Twitter.
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
            ? 'Pin the proof document, get the attester to sign, and write the proof + profile records to ENS in one transaction.'
            : draft
              ? `Pin the proof document, get the attester to issue a signed claim, and write ${recordKey} on ${name}.`
              : `Write ${Object.keys(extraRecords).length} profile record${Object.keys(extraRecords).length === 1 ? '' : 's'} to ${name}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {pending && phase === 'idle' && (
          <div className="rounded-md border border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
              <div className="space-y-3 flex-1">
                <div>
                  <div className="font-medium text-yellow-900 dark:text-yellow-100">
                    Unfinished upload detected
                  </div>
                  <p className="text-yellow-800 dark:text-yellow-200 mt-1">
                    You already pinned a proof for <span className="font-mono">{name}</span> a few
                    minutes ago but didn&apos;t finish writing it to ENS. Reuse the existing upload
                    or start over?
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleFinishWithExisting}>
                    Finish with existing upload
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleStartOver}>
                    Start over
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

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
              <div className="flex justify-between">
                <dt className="text-neutral-500 dark:text-neutral-400">Attestation method</dt>
                <dd className="font-mono">{draft.method}</dd>
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

        {draft && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Storage</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setTier('cdn')}
                className={`text-left rounded-md border p-3 transition-colors ${
                  tier === 'cdn'
                    ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-800'
                    : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-sm font-medium">CDN (Free)</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  90-day cache. Good for testing.
                </div>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setTier('ipfs')}
                className={`text-left rounded-md border p-3 transition-colors ${
                  tier === 'ipfs'
                    ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-800'
                    : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-sm font-medium">IPFS ($0.20/MB)</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  12-month pin. Real on-chain proof.
                </div>
              </button>
            </div>
          </div>
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
