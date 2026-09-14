'use client'

import { Button } from '@/components/ui/button'
import { shortenAddress } from '@/lib/utils'
import { Wallet } from 'lucide-react'

export type WalletState = 'loading' | 'signed-out' | 'wrong-wallet' | 'ok'

/** Why the user cannot publish yet, or nothing when they can. */
export function PublishNotice({
  state,
  expected,
  onConnect,
}: {
  state: WalletState
  /** The badgeholder address that must sign. */
  expected: string
  onConnect: () => void
}) {
  if (state === 'ok' || state === 'loading') return null

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800 text-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
      <Wallet className="size-4 shrink-0" aria-hidden="true" />
      {state === 'signed-out' ? (
        <>
          <span className="flex-1">Connect the badgeholder wallet to publish changes.</span>
          <Button size="sm" variant="outline" onClick={onConnect}>
            Connect wallet
          </Button>
        </>
      ) : (
        <span className="flex-1">
          Connect as <span className="font-mono">{shortenAddress(expected)}</span> to publish. Only
          the badgeholder can change these records.
        </span>
      )}
    </div>
  )
}
