'use client'

import { addEnsContracts } from '@ensdomains/ensjs'
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { createContext, useContext, useEffect, useState } from 'react'
import { http, type WalletClient, createPublicClient, createWalletClient, custom } from 'viem'
import { base, mainnet } from 'viem/chains'

const chain = addEnsContracts(mainnet)

const publicClient = createPublicClient({
  chain,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
})

// Exposes the ENS-extended PublicClient shape — consumers can pass this to
// both ensjs actions and viem's base `PublicClient` parameter sites.
export type EnsPublicClient = typeof publicClient

const noop = async () => {}

interface IWeb3Context {
  publicClient: EnsPublicClient
  walletClient: WalletClient | null
  isInitialized: boolean
  switchChain: (chainId: number) => Promise<void>
}

const Web3Context = createContext<IWeb3Context>({
  publicClient,
  walletClient: null,
  isInitialized: false,
  switchChain: noop,
})

export const useWeb3 = () => useContext(Web3Context)

const Web3ContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null)
  const { ready: privyReady, authenticated } = usePrivy()
  const { wallets } = useWallets()

  const isInitialized = privyReady && authenticated && wallets.length > 0

  useEffect(() => {
    const makeWalletClient = async () => {
      if (!wallets[0]) return
      await wallets[0].switchChain(chain.id)
      const provider = await wallets[0].getEthereumProvider()
      if (!provider) return
      const next = createWalletClient({
        account: wallets[0].address as `0x${string}`,
        chain,
        transport: custom(provider),
      })
      setWalletClient(next)
    }

    if (isInitialized) {
      makeWalletClient()
    } else {
      setWalletClient(null)
    }
  }, [isInitialized, wallets])

  const switchChain = async (chainId: number) => {
    if (wallets[0]) await wallets[0].switchChain(chainId)
  }

  return (
    <Web3Context.Provider value={{ publicClient, walletClient, isInitialized, switchChain }}>
      {children}
    </Web3Context.Provider>
  )
}

export const Web3Provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID as string}
      config={{
        appearance: { theme: 'dark' },
        supportedChains: [chain, base],
        defaultChain: chain,
      }}
    >
      <Web3ContextProvider>{children}</Web3ContextProvider>
    </PrivyProvider>
  )
}
