'use client'

import { useAppStore } from '@/stores/app'
import { addEnsContracts } from '@ensdomains/ensjs'
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { createContext, useContext, useEffect, useState } from 'react'
import { http, WalletClient, createPublicClient, createWalletClient, custom } from 'viem'
import { base, mainnet } from 'viem/chains'

const chain = addEnsContracts(mainnet)

// Create shared public client instance
const publicClient = createPublicClient({
  chain,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL!),
})

const noop = async () => {}

const Web3Context = createContext<IWeb3Context>({
  publicClient,
  walletClient: null,
  isInitialized: false,
  switchChain: noop,
})

export const useWeb3 = () => useContext(Web3Context)

interface IWeb3Context {
  isInitialized: boolean
  // biome-ignore lint/suspicious/noExplicitAny: ensjs-extended PublicClient
  publicClient: any
  walletClient: WalletClient | null
  switchChain: (chainId: number) => Promise<void>
}

// Separate internal component that uses Privy hooks
const Web3ContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null)
  const { ready: privyReady, user } = usePrivy()
  const { ready: walletReady, wallets } = useWallets()
  const { isInitialized, status } = useAppStore()

  useEffect(() => {
    // Initialize the app store only once.
    // walletReady is intentionally excluded: domain fetching only needs user.wallet.address
    // from the Privy User object, which is set before wallets are ready. The wallet client
    // creation below is a separate concern that waits for wallets.
    if (privyReady && user && !isInitialized && status === 'idle') {
      useAppStore.getState().initialize(user)
    }
  }, [privyReady, user, isInitialized, status])

  // Make a viem signer available once the app has initialized
  useEffect(() => {
    const makeWalletClient = async () => {
      await wallets[0].switchChain(chain.id)
      const provider = await wallets[0].getEthereumProvider()
      if (provider) {
        const walletClient = createWalletClient({
          account: wallets[0].address as `0x${string}`,
          chain,
          transport: custom(provider),
        })
        setWalletClient(walletClient)
      }
    }

    if (isInitialized) {
      makeWalletClient()
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

// Main provider that sets up Privy
export const Web3Provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID as string}
      config={{
        appearance: {
          theme: 'dark',
        },
        supportedChains: [chain, base],
        defaultChain: chain,
      }}
    >
      <Web3ContextProvider>{children}</Web3ContextProvider>
    </PrivyProvider>
  )
}
