'use client'

import { Button } from '@/components/ui/button'
import { useWeb3 } from '@/contexts/Web3Provider'
import { AttesterError, createIntent } from '@/lib/attester-client'
import {
  INTENT_EIP712_DOMAIN,
  INTENT_EIP712_TYPES,
  type IntentConfig,
  hashConfig,
} from '@ensmetadata/shared/intent'
import { usePrivy } from '@privy-io/react-auth'
import { AlertCircle, Check, Copy, ExternalLink, PencilLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Hex } from 'viem'

type Phase = 'idle' | 'ens-missing' | 'signing' | 'submitting' | 'success' | 'error'

interface Props {
  buildConfig: () => IntentConfig | null
  /** True when the config has at least one chosen attribute or a non-off
   *  platform — i.e. there's something worth sharing. */
  hasContent: boolean
  /** Notified when a shareable link becomes available or is cleared.
   *  FormBuilder uses it to freeze the config UI while a live link exists. */
  onGeneratedChange?: (generated: boolean) => void
}

export function IntentCreator({ buildConfig, hasContent, onGeneratedChange }: Props) {
  const { authenticated, user } = usePrivy()
  const { publicClient, walletClient } = useWeb3()

  const address = user?.wallet?.address as Hex | undefined
  const [ensName, setEnsName] = useState<string | null>(null)
  const [ensLoading, setEnsLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Resolve primary ENS (reverse record) whenever the connected address changes.
  // null = confirmed no primary name; ensLoading covers the in-flight state.
  useEffect(() => {
    let cancelled = false
    if (!address) {
      setEnsName(null)
      return
    }
    setEnsLoading(true)
    publicClient
      .getEnsName({ address })
      .then((name) => {
        if (cancelled) return
        setEnsName(name ?? null)
        setPhase(name ? 'idle' : 'ens-missing')
      })
      .catch(() => {
        if (cancelled) return
        setEnsName(null)
        setPhase('ens-missing')
      })
      .finally(() => {
        if (!cancelled) setEnsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [address, publicClient])

  const handleCreate = async () => {
    setError(null)
    setShareUrl(null)
    if (!address || !walletClient || !ensName) return

    const config = buildConfig()
    if (!config) return

    try {
      setPhase('signing')
      const configHash = hashConfig(config)
      const expiry = Date.now() + 10 * 60 * 1000
      const signature = await walletClient.signTypedData({
        account: address,
        domain: INTENT_EIP712_DOMAIN,
        types: INTENT_EIP712_TYPES,
        primaryType: 'Intent',
        message: { configHash, ensName, expiry: BigInt(expiry) },
      })

      setPhase('submitting')
      const body = { address, ensName, config, signature, expiry }
      console.log('[intent] POST /api/intent body:', JSON.stringify(body, null, 2))
      const { id } = await createIntent(body)
      setShareUrl(`${window.location.origin}/${id}`)
      setPhase('success')
      onGeneratedChange?.(true)
    } catch (err) {
      if (err instanceof AttesterError) {
        setError(errorMessage(err.message))
      } else {
        setError(err instanceof Error ? err.message : 'Could not create intent')
      }
      setPhase('error')
    }
  }

  const copyLink = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const handleMakeChanges = () => {
    setShareUrl(null)
    setError(null)
    setCopied(false)
    setPhase('idle')
    onGeneratedChange?.(false)
  }

  const inFlight = phase === 'signing' || phase === 'submitting'
  const canCreate =
    authenticated &&
    !!walletClient &&
    !!address &&
    !ensLoading &&
    !!ensName &&
    !inFlight &&
    hasContent

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      {shareUrl ? (
        <>
          <div className="overflow-x-auto rounded-md bg-neutral-50 px-3 py-2 font-mono text-xs dark:bg-neutral-800">
            {shareUrl}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" full onClick={handleMakeChanges}>
              <PencilLine className="mr-2 h-4 w-4" /> Edit form
            </Button>
            <Button onClick={copyLink} full>
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" /> Copy link
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        <Button full onClick={handleCreate} isLoading={inFlight} disabled={!canCreate}>
          {phase === 'signing'
            ? 'Waiting for signature…'
            : phase === 'submitting'
              ? 'Creating link…'
              : 'Get shareable link'}
        </Button>
      )}

      {authenticated && !ensLoading && !ensName && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Your connected address has no primary ENS name. Set one at{' '}
          <a
            href="https://app.ens.domains/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center font-medium text-rose-600 hover:underline dark:text-rose-400"
          >
            app.ens.domains
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
          .
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

function errorMessage(code: string | undefined): string {
  switch (code) {
    case 'invalid_config':
      return 'Form config failed validation — try reselecting schemas.'
    case 'signer_mismatch':
    case 'bad_signature':
      return 'Signature did not match the connected wallet. Try again.'
    case 'ens_not_primary':
      return 'Your primary ENS name changed between signing and submitting. Reload and retry.'
    case 'clock_skew':
      return 'Your device clock is off — signature expired. Fix clock and retry.'
    case 'kv_collision':
      return 'Unlucky id collision — please retry.'
    default:
      return 'Could not create intent. Check your network and retry.'
  }
}
