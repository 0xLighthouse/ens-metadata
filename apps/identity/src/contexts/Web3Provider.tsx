'use client'

import { chainForName } from '@ensmetadata/shared/chain-for-name'
import { type ChainConfig, getChainById, getChainByName } from '@ensmetadata/shared/chains'
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  http,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
} from 'viem'

const MAINNET_CHAIN = getChainByName('mainnet')
const BASE_CHAIN = getChainByName('base')

// Per-chain RPC overrides. NEXT_PUBLIC_RPC_URL is the historical mainnet
// override; NEXT_PUBLIC_BASE_RPC_URL is new for Base. Either may be unset —
// the fallback transport then drops to the chain's curated `rpcDefaults`
// (publicnode / 1rpc) before viem's built-in defaults.
const RPC_OVERRIDES: Record<number, string | undefined> = {
  [MAINNET_CHAIN.id]: process.env.NEXT_PUBLIC_RPC_URL,
  [BASE_CHAIN.id]: process.env.NEXT_PUBLIC_BASE_RPC_URL,
}

function buildPublicClient(chain: ChainConfig): PublicClient {
  const override = RPC_OVERRIDES[chain.id]
  const transport = fallback([
    ...(override ? [http(override)] : []),
    ...chain.rpcDefaults.map((url) => http(url)),
    ...chain.viemChain.rpcUrls.default.http.map((url) => http(url)),
  ])
  return createPublicClient({ chain: chain.viemChain, transport }) as PublicClient
}

// Build per-chain clients eagerly at module load. They're cheap, and creating
// them once means the wagmi/viem cache stays warm across renders.
const PUBLIC_CLIENTS: Record<number, PublicClient> = {
  [MAINNET_CHAIN.id]: buildPublicClient(MAINNET_CHAIN),
  [BASE_CHAIN.id]: buildPublicClient(BASE_CHAIN),
}

const DEFAULT_PUBLIC_CLIENT = PUBLIC_CLIENTS[MAINNET_CHAIN.id]

export type EnsPublicClient = PublicClient

/**
 * Returns the PublicClient bound to the chain that hosts `name`. Falls back
 * to mainnet when the name's chain isn't pre-registered.
 */
export function getPublicClientForName(name: string): PublicClient {
  const chain = chainForName(name)
  return PUBLIC_CLIENTS[chain.id] ?? DEFAULT_PUBLIC_CLIENT
}

const noop = async () => {}

interface IWeb3Context {
  /** Mainnet client — used for chain-agnostic reads (avatars, subgraph). */
  publicClient: PublicClient
  /** Wallet client bound to whichever chain the wallet is currently on. */
  walletClient: WalletClient | null
  isInitialized: boolean
  /** Switch the connected wallet to `chainId` and return when ready. */
  switchChain: (chainId: number) => Promise<void>
  /**
   * Build a fresh WalletClient on `chainId` using the wallet's current EIP-1193
   * provider. Use this right before broadcasting to a non-default chain so the
   * client's `chain` reflects the active wallet network. Switches the wallet
   * first if it isn't already on `chainId`. Returns `null` if no wallet.
   */
  getWalletClientForChain: (chainId: number) => Promise<WalletClient | null>
}

const Web3Context = createContext<IWeb3Context>({
  publicClient: DEFAULT_PUBLIC_CLIENT,
  walletClient: null,
  isInitialized: false,
  switchChain: noop,
  getWalletClientForChain: async () => null,
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
      // Default the wallet to mainnet on connect — non-mainnet operations
      // switch on demand from usePublishFlow.
      await wallets[0].switchChain(MAINNET_CHAIN.id)
      const provider = await wallets[0].getEthereumProvider()
      if (!provider) return
      const next = createWalletClient({
        account: wallets[0].address as `0x${string}`,
        chain: MAINNET_CHAIN.viemChain,
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

  const switchChain = useCallback(
    async (chainId: number) => {
      if (wallets[0]) await wallets[0].switchChain(chainId)
    },
    [wallets],
  )

  const getWalletClientForChain = useCallback(
    async (chainId: number): Promise<WalletClient | null> => {
      const wallet = wallets[0]
      if (!wallet) return null
      await wallet.switchChain(chainId)
      const provider = await wallet.getEthereumProvider()
      if (!provider) return null
      const targetChain = getChainById(chainId)?.viemChain
      if (!targetChain) {
        throw new Error(`Unsupported chain id: ${chainId}`)
      }
      return createWalletClient({
        account: wallet.address as `0x${string}`,
        chain: targetChain,
        transport: custom(provider),
      })
    },
    [wallets],
  )

  const value = useMemo<IWeb3Context>(
    () => ({
      publicClient: DEFAULT_PUBLIC_CLIENT,
      walletClient,
      isInitialized,
      switchChain,
      getWalletClientForChain,
    }),
    [walletClient, isInitialized, switchChain, getWalletClientForChain],
  )

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>
}

export const Web3Provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID as string}
      config={{
        appearance: { theme: 'dark' },
        supportedChains: [MAINNET_CHAIN.viemChain, BASE_CHAIN.viemChain],
        defaultChain: MAINNET_CHAIN.viemChain,
      }}
    >
      <Web3ContextProvider>{children}</Web3ContextProvider>
    </PrivyProvider>
  )
}
