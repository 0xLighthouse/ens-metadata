'use client'

import { Button } from '@/components/ui/button'
import { useWeb3 } from '@/contexts/Web3Provider'
import { usePrivy } from '@privy-io/react-auth'
import { LogOut, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Hex } from 'viem'

interface Props {
  message: string
  onMessageChange: (value: string) => void
}

// Doubles as the wallet gate + the message composer + a live preview of how
// the recipient will see the message banner in the wizard. Layout mirrors
// CreatorBanner so authors can see their real framing.
export function CreatorPreviewCard({ message, onMessageChange }: Props) {
  const { login, logout, authenticated, user, ready: privyReady } = usePrivy()
  const { publicClient } = useWeb3()

  const address = user?.wallet?.address as Hex | undefined
  const [ensName, setEnsName] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!address) {
      setEnsName(null)
      setAvatar(null)
      return
    }
    publicClient
      .getEnsName({ address })
      .then(async (name) => {
        if (cancelled) return
        setEnsName(name ?? null)
        if (!name) {
          setAvatar(null)
          return
        }
        try {
          const avatarUrl = await publicClient.getEnsAvatar({ name })
          if (!cancelled) setAvatar(avatarUrl ?? null)
        } catch {
          if (!cancelled) setAvatar(null)
        }
      })
      .catch(() => {
        if (cancelled) return
        setEnsName(null)
        setAvatar(null)
      })
    return () => {
      cancelled = true
    }
  }, [address, publicClient])

  if (!authenticated) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
        {/* Invisible spacer matches the avatar column in the authenticated
         *  state, so the text lines up with the question content below. */}
        <div aria-hidden className="h-10 w-10 shrink-0" />
        <p className="flex-1 text-sm text-neutral-600 dark:text-neutral-300">
          Connect your wallet to begin. You must have an ENS name set as the primary name for the
          address you connect.
        </p>
        <Button onClick={login} disabled={!privyReady} className="shrink-0">
          <Wallet className="mr-2 h-4 w-4" />
          Connect wallet
        </Button>
      </div>
    )
  }

  const identity = ensName ?? (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '…')
  const initial = identity.charAt(0).toUpperCase()

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="shrink-0">
        {avatar ? (
          <img
            src={avatar}
            alt={`${identity} avatar`}
            className="h-10 w-10 rounded-full border border-neutral-200 object-cover dark:border-neutral-700"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {initial}
          </div>
        )}
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm">
            <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
              {identity}
            </span>
            <span className="text-neutral-500 dark:text-neutral-400"> says...</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <LogOut className="h-3 w-3" />
            Disconnect
          </button>
        </div>
        <textarea
          value={message}
          onChange={(e) => onMessageChange(e.target.value.slice(0, 280))}
          rows={2}
          placeholder="(Optional) A message for your users"
          className="w-full resize-none rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm text-neutral-600 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:text-neutral-300 dark:placeholder:text-neutral-500"
        />
      </div>
    </div>
  )
}
