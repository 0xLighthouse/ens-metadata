'use client'

import { publicClient, waitForProviderChainId } from '@/lib/viem'
import { MAINNET_CHAIN } from '@ensmetadata/shared/chains'
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { createContext, useCallback, useContext, useMemo } from 'react'
import {
  type Address,
  type PublicClient,
  type WalletClient,
  createWalletClient,
  custom,
} from 'viem'

interface Web3ContextValue {
  /** Mainnet client for reads and receipts. */
  publicClient: PublicClient
  /** The connected wallet's address, or `null` when signed out. */
  address: Address | null
  /** Privy is ready, the user is signed in, and a wallet is available. */
  isReady: boolean
  /**
   * A wallet client bound to mainnet, built on demand right before signing or broadcasting.
   * Switches the wallet to mainnet first and waits for the provider to agree, so viem's chain
   * check never trips. Throws when no wallet is connected.
   */
  getMainnetWalletClient: () => Promise<WalletClient>
}

const Web3Context = createContext<Web3ContextValue>({
  publicClient,
  address: null,
  isReady: false,
  getMainnetWalletClient: async () => {
    throw new Error('No wallet connected')
  },
})

export const useWeb3 = () => useContext(Web3Context)

function Web3ContextProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user } = usePrivy()
  const { wallets } = useWallets()

  // Prefer the wallet Privy considers the user's, as the header does, so the address shown,
  // the ownership check and the signer all agree.
  const wallet = wallets.find((w) => w.address === user?.wallet?.address) ?? wallets[0]
  const address = (wallet?.address as Address | undefined) ?? null
  const isReady = ready && authenticated && wallet !== undefined

  const getMainnetWalletClient = useCallback(async (): Promise<WalletClient> => {
    if (!wallet) throw new Error('No wallet connected')
    await wallet.switchChain(MAINNET_CHAIN.id)
    const provider = await wallet.getEthereumProvider()
    if (!provider) throw new Error('The wallet exposed no provider')
    await waitForProviderChainId(provider, MAINNET_CHAIN.id)
    return createWalletClient({
      account: wallet.address as Address,
      chain: MAINNET_CHAIN.viemChain,
      transport: custom(provider),
    })
  }, [wallet])

  const value = useMemo<Web3ContextValue>(
    () => ({ publicClient, address, isReady, getMainnetWalletClient }),
    [address, isReady, getMainnetWalletClient],
  )

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>
}

/**
 * Privy wallet auth plus a viem context, mirroring apps/identity. `appId` comes from
 * `ESB_PRIVY_APP_ID` on the server; without it this provider is not mounted at all, and
 * `useWeb3()` returns its signed-out default.
 */
export function Web3Provider({ appId, children }: { appId: string; children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: { theme: 'dark' },
        supportedChains: [MAINNET_CHAIN.viemChain],
        defaultChain: MAINNET_CHAIN.viemChain,
      }}
    >
      <Web3ContextProvider>{children}</Web3ContextProvider>
    </PrivyProvider>
  )
}
