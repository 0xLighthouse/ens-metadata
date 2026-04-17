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
import { AlertCircle, Check, Copy, ExternalLink, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Hex } from 'viem'

type Phase = 'idle' | 'ens-missing' | 'signing' | 'submitting' | 'success' | 'error'

interface Props {
  buildConfig: () => IntentConfig | null
}

export function IntentCreator({ buildConfig }: Props) {
  const { login, authenticated, user, ready: privyReady } = usePrivy()
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
    if (!config) {
      setError('Pick a schema before creating the link.')
      setPhase('error')
      return
    }

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
      const { id } = await createIntent({ address, ensName, config, signature, expiry })
      setShareUrl(`${window.location.origin}/?intent=${id}`)
      setPhase('success')
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

  // Gate 1: not signed into Privy yet.
  if (!authenticated) {
    return (
      <GateCard title="Connect your wallet to share this link">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          You need a connected wallet with a primary ENS name so recipients know who's asking.
        </p>
        <Button onClick={login} disabled={!privyReady} full>
          <Wallet className="mr-2 h-4 w-4" />
          Connect wallet
        </Button>
      </GateCard>
    )
  }

  // Gate 2: Privy authed but wallet client not ready yet.
  if (!walletClient || !address) {
    return (
      <GateCard title="Preparing your wallet…">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Waiting for the wallet provider to initialize.
        </p>
      </GateCard>
    )
  }

  // Gate 3: reverse-record lookup in flight.
  if (ensLoading) {
    return (
      <GateCard title="Looking up your ENS name…">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Reading the primary name for your connected address.
        </p>
      </GateCard>
    )
  }

  // Gate 4: connected, but no primary ENS — blocked with a helpful link.
  if (!ensName) {
    return (
      <GateCard title="Set a primary ENS name">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Your connected address doesn't have a primary ENS name set. Recipients identify the sender
          by this name, so it's required.
        </p>
        <a
          href="https://app.ens.domains/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center text-sm font-medium text-rose-600 hover:underline dark:text-rose-400"
        >
          Set one at app.ens.domains
          <ExternalLink className="ml-1 h-3 w-3" />
        </a>
      </GateCard>
    )
  }

  // Ready to create. Button state reflects the sign → submit progression.
  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium uppercase tracking-wider text-neutral-500">Signing as</span>
        <span className="font-mono text-neutral-700 dark:text-neutral-200">{ensName}</span>
      </div>

      {shareUrl ? (
        <>
          <div className="overflow-x-auto rounded-md bg-neutral-50 px-3 py-2 font-mono text-xs dark:bg-neutral-800">
            {shareUrl}
          </div>
          <div className="flex gap-2">
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
            <Button variant="outline" full onClick={() => window.open(shareUrl, '_blank')}>
              <ExternalLink className="mr-2 h-4 w-4" /> Preview
            </Button>
          </div>
        </>
      ) : (
        <Button
          full
          onClick={handleCreate}
          isLoading={phase === 'signing' || phase === 'submitting'}
          disabled={phase === 'signing' || phase === 'submitting'}
        >
          {phase === 'signing'
            ? 'Waiting for signature…'
            : phase === 'submitting'
              ? 'Creating link…'
              : 'Create shareable link'}
        </Button>
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

function GateCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="text-sm font-medium">{title}</div>
      {children}
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
