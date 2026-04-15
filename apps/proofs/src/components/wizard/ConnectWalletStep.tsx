'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWeb3 } from '@/contexts/Web3Provider'
import { resolveOwner } from '@/lib/ens'
import { shortAddress } from '@/lib/utils'
import { usePrivy } from '@privy-io/react-auth'
import { AlertCircle, Wallet } from 'lucide-react'
import { useState } from 'react'

interface Props {
  onComplete: (name: string) => void
}

export function ConnectWalletStep({ onComplete }: Props) {
  const { login, logout, authenticated, user, ready } = usePrivy()
  const { publicClient, isInitialized } = useWeb3()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const address = user?.wallet?.address as `0x${string}` | undefined

  const handleContinue = async () => {
    setError(null)
    const trimmed = name.trim().toLowerCase()
    if (!trimmed) {
      setError('Enter your ENS name')
      return
    }
    if (!trimmed.includes('.')) {
      setError('Looks like this is not a valid ENS name')
      return
    }
    if (!address) {
      setError('Connect a wallet first')
      return
    }
    setChecking(true)
    try {
      const owner = await resolveOwner(publicClient, trimmed)
      if (!owner) {
        setError(`Could not resolve owner for ${trimmed}`)
        return
      }
      if (owner.toLowerCase() !== address.toLowerCase()) {
        setError(
          `${trimmed} is owned by ${shortAddress(owner)}, not ${shortAddress(address)}. Connect the right wallet.`,
        )
        return
      }
      onComplete(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check ownership')
    } finally {
      setChecking(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your wallet</CardTitle>
        <CardDescription>
          We will verify that your connected wallet owns the ENS name you want to attach a proof to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!authenticated ? (
          <Button onClick={login} disabled={!ready} full>
            <Wallet className="h-4 w-4 mr-2" />
            Connect wallet
          </Button>
        ) : (
          <div className="flex items-center justify-between rounded-md border border-neutral-200 dark:border-neutral-700 px-4 py-3">
            <div className="text-sm">
              <div className="text-neutral-500 dark:text-neutral-400">Connected</div>
              <div className="font-mono">{shortAddress(address)}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>
              Disconnect
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="ens-name">ENS name</Label>
          <Input
            id="ens-name"
            placeholder="alice.eth"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!authenticated}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          full
          onClick={handleContinue}
          disabled={!authenticated || !isInitialized || !name.trim()}
          isLoading={checking}
        >
          Continue
        </Button>
      </CardContent>
    </Card>
  )
}
