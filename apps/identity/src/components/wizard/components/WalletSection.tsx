'use client'

import { GuidedSection } from '@/components/ui/GuidedCard'
import { Button } from '@/components/ui/button'
import { shortAddress } from '@/lib/utils'
import { AlertCircle, CheckCircle2, Wallet } from 'lucide-react'
import { useCompose } from '../ComposeContext'
import { EnsVerification } from './EnsVerification'

/** Section 01: wallet connect + ENS name verification. */
export function WalletSection() {
  const { authenticated, ready, address, login, logout, isInitialized, ens, attestation } =
    useCompose()

  return (
    <GuidedSection
      number="01"
      title="Your wallet & ENS name"
      description="Connect the wallet that owns or manages the ENS name you want to update."
      active
      accent="green"
    >
      <div className="space-y-4">
        {!authenticated ? (
          <Button onClick={login} disabled={!ready} full>
            <Wallet className="mr-2 h-4 w-4" />
            Connect wallet
          </Button>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
            <div className="min-w-0 text-sm">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Connected</div>
              <div className="font-mono text-neutral-900 dark:text-neutral-100">
                {shortAddress(address)}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} disabled={attestation.isSigning}>
              Disconnect
            </Button>
          </div>
        )}

        {authenticated &&
          (ens.confirmed ? (
            <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
              <div className="min-w-0 text-sm">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">ENS name</div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                  <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
                    {ens.ensName}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={ens.reset}
                disabled={attestation.isSigning}
              >
                Change
              </Button>
            </div>
          ) : (
            <EnsVerification ens={ens} disabled={!isInitialized} />
          ))}

        {ens.error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{ens.error}</span>
          </div>
        )}
      </div>
    </GuidedSection>
  )
}
