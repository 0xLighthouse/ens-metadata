'use client'

import { Button } from '@/components/ui/button'
import { cn, resolveAvatar, shortenAddress } from '@/lib/utils'
import { usePrivy, useWallets } from '@privy-io/react-auth'

const EXPECTED_CHAIN_ID = 'eip155:1'
const NETWORK_NAMES: Record<string, string> = { 'eip155:1': 'Ethereum' }

/**
 * Wallet connect control, after apps/interface. Shows a skeleton until Privy is ready, a
 * "Connect Wallet" button when signed out, and the wallet avatar, short address, network, and
 * a Disconnect button when signed in. `compact` drops the address block for narrow headers.
 */
export function ConnectButton({
  compact = false,
  className,
}: { compact?: boolean; className?: string }) {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { wallets } = useWallets()

  if (!ready) {
    return (
      <div className={cn('animate-pulse', className)}>
        <div className="h-10 w-24 rounded-md bg-neutral-200 dark:bg-neutral-700" />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <Button onClick={login} className={className}>
        Connect Wallet
      </Button>
    )
  }

  const address = user?.wallet?.address
  const wallet = wallets.find((w) => w.address === address) ?? wallets[0]
  const chainId = wallet?.chainId
  const wrongNetwork = chainId !== undefined && chainId !== EXPECTED_CHAIN_ID
  const network = chainId ? NETWORK_NAMES[chainId] : undefined

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg bg-neutral-50 p-2 dark:bg-neutral-800/50',
        className,
      )}
    >
      {address && (
        <div className="flex items-center gap-2">
          <img
            src={resolveAvatar(address, 32)}
            alt=""
            className="size-8 rounded-full bg-neutral-200 dark:bg-neutral-700"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
          {!compact && (
            <div className="flex flex-col">
              <span className="font-medium text-neutral-900 text-sm dark:text-neutral-50">
                {shortenAddress(address)}
              </span>
              {wrongNetwork ? (
                <button
                  type="button"
                  onClick={() => wallet?.switchChain(1)}
                  className="text-left text-amber-600 text-xs hover:underline dark:text-amber-400"
                >
                  Switch to Ethereum
                </button>
              ) : (
                <span className="text-neutral-500 text-xs dark:text-neutral-400">
                  {network ?? 'Connected'}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      <Button onClick={logout} variant="outline" size="sm">
        Disconnect
      </Button>
    </div>
  )
}
