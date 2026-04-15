'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useWeb3 } from '@/contexts/Web3Provider'
import { attest } from '@/lib/attester-client'
import { type StorageTier, type UploadProofResult, uploadProof } from '@/lib/ipfs'
import type { DraftFullProof } from '@/lib/twitter-proof'
import { type Claim, encodeClaim, metadataWriter } from '@ensmetadata/sdk'
import { encode as cborEncode } from '@ipld/dag-cbor'
import { AlertTriangle, CheckCircle2, FileSignature } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { bytesToHex } from 'viem'

interface Props {
  name: string
  draft: DraftFullProof
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

function truncateHex(hex: string): string {
  if (hex.length <= 18) return hex
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`
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

export function ReviewStep({ name, draft, sessionId, onBack }: Props) {
  const { walletClient, publicClient, switchChain } = useWeb3()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState(false)
  const [tier, setTier] = useState<StorageTier>('cdn')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [existingReference, setExistingReference] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingUpload | null>(null)

  // Check for an abandoned upload on mount. If we find a recent one for this
  // name, surface the recovery card. Don't auto-use it — user must opt in.
  useEffect(() => {
    setPending(readPending(name))
  }, [name])

  const { claimHex, byteLen } = useMemo(() => {
    // The real claim is signed by the attester after we POST /api/attest;
    // its `att` field is whatever attester key the worker is running. For
    // the local preview we use the zero address so the bytes encode and
    // the byte count is approximately right — the attester address adds
    // the same number of bytes regardless of which key it is.
    const previewAtt = '0x0000000000000000000000000000000000000000' as const
    const bytes = encodeClaim({ ...draft.claim, att: previewAtt })
    const hex = bytesToHex(bytes)
    return { claimHex: hex, byteLen: bytes.length }
  }, [draft.claim])

  const openDialog = () => dialogRef.current?.showModal()
  const closeDialog = () => dialogRef.current?.close()

  const copyHex = async () => {
    try {
      await navigator.clipboard.writeText(claimHex)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard may be unavailable; ignore
    }
  }

  const runFlow = async (useExistingReference: string | null) => {
    if (!walletClient) {
      setError('Wallet not ready.')
      setPhase('error')
      return
    }
    setError(null)

    try {
      let reference = useExistingReference
      let effectiveTier: StorageTier = tier

      if (!reference) {
        // 1. Encode full proof doc (not the claim) as dag-cbor bytes.
        const proofDocBytes = cborEncode(draft as unknown as Record<string, unknown>)

        // 2. Upload it — CDN or paid IPFS via x402.
        setPhase('uploading')
        const result: UploadProofResult = await uploadProof({
          bytes: proofDocBytes,
          ensName: name,
          key: 'com.x.proof',
          tier,
          walletClient,
          switchChain,
        })
        reference = result.reference

        // Persist immediately after a successful upload and before any signing.
        // If the user bails between here and the ENS write we can recover.
        writePending({
          reference,
          tier,
          timestamp: Date.now(),
          ensName: name,
        })
        setExistingReference(reference)
      } else {
        // Recovery path — we already paid; infer the tier from the pending
        // record only for display. The reference is authoritative.
        effectiveTier = pending?.tier ?? tier
      }

      // 3. Ask the attester to sign a claim. The worker checks that the
      //    session has both a SIWE-bound wallet AND a validated platform
      //    binding, then constructs the claim from session state (it never
      //    trusts client-supplied uid/handle/addr) and signs with its own
      //    key. The wallet does not sign the claim.
      setPhase('attesting')
      const signed: Claim = await attest({
        sessionId,
        name,
        chainId: draft.claim.chainId,
        expSeconds: draft.claim.exp,
        prf: reference,
      })

      // 4. Encode the SIGNED claim. encodeClaim(ClaimFields | Claim) handles
      //    both branches: when `sig` is present it's included as 65 raw bytes
      //    in the canonical dag-cbor map. This is the on-chain text record.
      const signedBytes = encodeClaim(signed)
      const textRecordHex = bytesToHex(signedBytes)

      // 5. Write to ENS via the SDK's metadataWriter factory. This is the
      //    only on-chain transaction in the flow — and the only thing the
      //    user's wallet does after the SIWE sign-in.
      setPhase('writing')
      const writer = metadataWriter({ publicClient })(walletClient)
      const { txHash: hash } = await writer.setMetadata({
        name,
        records: { 'com.x.proof': textRecordHex },
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

  if (phase === 'done') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Proof published</CardTitle>
          <CardDescription>
            <span className="font-mono">com.x.proof</span> is now set on{' '}
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review and write</CardTitle>
        <CardDescription>
          Pin the proof document, get the attester to issue a signed claim, and write the{' '}
          <span className="font-mono">com.x.proof</span> text record on{' '}
          <span className="font-mono">{name}</span>.
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
          <div className="flex justify-between">
            <dt className="text-neutral-500 dark:text-neutral-400">Record key</dt>
            <dd className="font-mono">com.x.proof</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-neutral-500 dark:text-neutral-400">Claim payload (draft)</dt>
            <dd>
              <button
                type="button"
                onClick={openDialog}
                className="font-mono text-xs rounded-md border border-neutral-200 dark:border-neutral-700 px-2 py-1 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                {truncateHex(claimHex)} · {byteLen} B
              </button>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500 dark:text-neutral-400">Twitter handle</dt>
            <dd className="font-mono">@{draft.claim.h}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500 dark:text-neutral-400">Twitter user id</dt>
            <dd className="font-mono">{draft.claim.uid}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500 dark:text-neutral-400">Attestation method</dt>
            <dd className="font-mono">{draft.method}</dd>
          </div>
        </dl>

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

        {/* biome-ignore lint/a11y/useKeyWithClickEvents: native <dialog> handles Esc via the cancel event; onClick here is only for backdrop-click-to-close */}
        <dialog
          ref={dialogRef}
          onClick={(e) => {
            if (e.target === dialogRef.current) closeDialog()
          }}
          className="backdrop:bg-black/60 rounded-lg p-0 max-w-2xl w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xl"
        >
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Claim payload</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Canonical CBOR (dag-cbor), pre-signature. This is exactly what gets hashed and
                signed by your wallet. The on-chain value will differ because{' '}
                <span className="font-mono">prf</span> is backfilled with the upload reference
                before signing.
              </p>
            </div>

            <div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                Fields (JSON view)
              </div>
              <pre className="text-xs font-mono bg-neutral-50 dark:bg-neutral-800 rounded-md p-3 overflow-x-auto">
                {JSON.stringify(draft.claim, null, 2)}
              </pre>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  CBOR bytes ({byteLen} B, hex)
                </div>
                <button
                  type="button"
                  onClick={copyHex}
                  className="text-xs rounded border border-neutral-200 dark:border-neutral-700 px-2 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="text-xs font-mono bg-neutral-50 dark:bg-neutral-800 rounded-md p-3 overflow-x-auto break-all whitespace-pre-wrap">
                {claimHex}
              </pre>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={closeDialog}>
                Close
              </Button>
            </div>
          </div>
        </dialog>

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
