'use client'

import { Button } from '@/components/ui/button'
import { Wallet } from 'lucide-react'

export type WalletState = 'loading' | 'signed-out' | 'wrong-wallet' | 'ok'

/** Why the user cannot publish yet, or nothing when they can. */
export function PublishNotice({
  state,
  onConnect,
}: {
  state: WalletState
  onConnect: () => void
}) {
  if (state === 'ok' || state === 'loading') return null

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800 text-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
      <Wallet className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        To edit this profile, connect a wallet that owns or manages this ENS name.
      </span>
      {state === 'signed-out' && (
        <Button size="sm" variant="outline" onClick={onConnect}>
          Connect wallet
        </Button>
      )}
    </div>
  )
}
