import { context } from '@/config/web3'
import { http, createPublicClient, formatUnits, getContract } from 'viem'
import { baseSepolia } from 'viem/chains'
import { create } from 'zustand'

interface Balance {
  raw: string
  formatted: string
}

type Address = `0x${string}`

interface BalancesState {
  gas: Balance
  balances: Map<Address, Balance>
  isFetching: boolean
  error?: string
  batchFetchBalances: (address: Address) => Promise<void>
}

export const useBalancesStore = create<BalancesState>((set, get) => ({
  gas: { raw: '0', formatted: '0' },
  balances: new Map(),
  isFetching: false,
  error: undefined,

  fetchBalance: async (address: Address) => {
    const balance = await get().balances.get(address)
    if (!balance) {
    }

    return balance
  },

  batchFetchBalances: async (address: Address) => {
    // Prevent duplicate fetches
    if (get().isFetching) return

    set({ isFetching: true })

    const readClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.BASE_SEPOLIA_RPC!),
    })

    const mockToken = getContract({
      address: context.contracts.MockToken.address,
      abi: context.contracts.MockToken.abi,
      client: readClient,
    })

    const mockUSDC = getContract({
      address: context.contracts.USDC.address,
      abi: context.contracts.USDC.abi,
      client: readClient,
    })

    const [mockTokenBalance, mockUSDCBalance] = await Promise.all([
      mockToken.read.balanceOf([address]),
      mockUSDC.read.balanceOf([address]),
    ])
    set({
      balances: new Map([
        [
          context.contracts.MockToken.address,
          {
            raw: mockTokenBalance.toString(),
            formatted: formatUnits(mockTokenBalance, context.contracts.MockToken.decimals),
          },
        ],
        [
          context.contracts.USDC.address,
          {
            raw: mockUSDCBalance.toString(),
            formatted: formatUnits(mockUSDCBalance, context.contracts.USDC.decimals),
          },
        ],
      ]),
    })

    // Set gas balance
    const gasBalance = await readClient.getBalance({ address })
    const formattedGasBalance = formatUnits(gasBalance, 18)
    set({
      gas: { raw: gasBalance.toString(), formatted: formattedGasBalance },
    })
    set({ isFetching: false })
  },
}))
