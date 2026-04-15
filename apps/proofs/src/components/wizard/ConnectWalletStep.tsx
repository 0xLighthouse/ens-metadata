'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWeb3 } from '@/contexts/Web3Provider'
import { bindWallet, createSession } from '@/lib/attester-client'
import { resolveOwner } from '@/lib/ens'
import { shortAddress } from '@/lib/utils'
import { usePrivy } from '@privy-io/react-auth'
import { AlertCircle, FileSignature, Wallet } from 'lucide-react'
import { useState } from 'react'
import type { Hex } from 'viem'
import { createSiweMessage } from 'viem/siwe'

interface Props {
  onComplete: (name: string, sessionId: string) => void
}

type Phase = 'idle' | 'checking-owner' | 'creating-session' | 'awaiting-siwe' | 'binding-wallet'

export function ConnectWalletStep({ onComplete }: Props) {
  const { login, logout, authenticated, user, ready } = usePrivy()
  const { publicClient, walletClient, isInitialized } = useWeb3()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')

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
    if (!walletClient) {
      setError('Wallet client not ready')
      return
    }

    try {
      // 1. Local ownership check — friendlier UX than waiting for the
      //    attester to fail at attest time. The attester will also enforce
      //    this via the staleness check at verify time.
      setPhase('checking-owner')
      const owner = await resolveOwner(publicClient, trimmed)
      if (!owner) {
        throw new Error(`Could not resolve owner for ${trimmed}`)
      }
      if (owner.toLowerCase() !== address.toLowerCase()) {
        throw new Error(
          `${trimmed} is owned by ${shortAddress(owner)}, not ${shortAddress(address)}. Connect the right wallet.`,
        )
      }

      // 2. Open a session on the attester. Returns a fresh sessionId + nonce
      //    bound to a Durable Object that lives until SESSION_TTL_SECONDS.
      setPhase('creating-session')
      const session = await createSession()

      // 3. Build a SIWE message. The domain MUST match the attester's
      //    SIWE_DOMAIN env — both ends use window.location.host in dev,
      //    which keeps them in sync without extra config.
      const domain = window.location.host
      const origin = window.location.origin
      const chainId = publicClient?.chain?.id ?? 1
      const message = createSiweMessage({
        address,
        chainId,
        domain,
        nonce: session.nonce,
        uri: origin,
        version: '1',
        statement: 'Sign in to ENS Metadata to issue an attestation for this ENS name.',
        issuedAt: new Date(),
      })

      // 4. Wallet signs the SIWE message via personal_sign. This is the only
      //    wallet signature in the whole flow — the claim itself is signed
      //    by the attester key, not by this wallet.
      setPhase('awaiting-siwe')
      const signature = (await walletClient.signMessage({
        account: address,
        message,
      })) as Hex

      // 5. POST to the attester. The worker verifies the SIWE message
      //    against the session nonce and binds the recovered address to
      //    the session.
      setPhase('binding-wallet')
      await bindWallet({
        sessionId: session.sessionId,
        message,
        signature,
      })

      onComplete(trimmed, session.sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bind wallet')
      setPhase('idle')
    }
  }

  const checking = phase !== 'idle'
  const phaseLabel = (() => {
    switch (phase) {
      case 'checking-owner':
        return 'Checking ENS ownership…'
      case 'creating-session':
        return 'Opening attestation session…'
      case 'awaiting-siwe':
        return 'Waiting for wallet signature…'
      case 'binding-wallet':
        return 'Binding wallet to session…'
      default:
        return 'Continue'
    }
  })()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your wallet</CardTitle>
        <CardDescription>
          Connect the wallet that owns the ENS name. You'll sign a sign-in message — this proves
          control of the wallet to the attester service. The claim itself is signed by the attester,
          not by your wallet.
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
          {phase === 'awaiting-siwe' ? (
            <>
              <FileSignature className="h-4 w-4 mr-2" />
              {phaseLabel}
            </>
          ) : (
            phaseLabel
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
