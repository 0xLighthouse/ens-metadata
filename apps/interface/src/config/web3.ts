import { http, Abi, createPublicClient, erc20Abi } from 'viem'
import { arbitrumSepolia, hardhat } from 'viem/chains'

// Default public client for server components or initial loading
// Components should prefer using the context via useWeb3() whenever possible
export const readClient = createPublicClient({
  chain: process.env.NEXT_PUBLIC_SIGNALS_ENV === 'dev' ? hardhat : arbitrumSepolia,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL!),
})

export const MockERC20ABI = [
  ...erc20Abi,
  {
    inputs: [
      {
        internalType: 'address',
        name: 'to',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'value',
        type: 'uint256',
      },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] satisfies Abi

export const INDEXER_ENDPOINT = process.env.NEXT_PUBLIC_INDEXER_ENDPOINT!

/**
 * Critical addresses
 */
export const context = {
  network: {
    explorerUri: 'https://sepolia.basescan.org',
    baseSepolia: {
      chainId: 84532,
      transport: http(process.env.BASE_SEPOLIA_RPC!),
    },
  },
  contracts: {
    USDC: {
      abi: MockERC20ABI,
      address: '0xF4C486d930222986bA639024259Cb36a07B31490' as `0x${string}`,
      label: 'mUSDC',
      decimals: 18,
    },
    MockToken: {
      abi: MockERC20ABI,
      address: '0x6b0745C8765Fc45084BB1dE4D7D7F0C9f71ec903' as `0x${string}`,
      label: 'MCK',
      decimals: 18, // TODO: Should be dynamic
    },
  },
}
