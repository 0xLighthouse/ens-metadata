import { MAINNET_RPC_URL } from '@/lib/constants'
import { MAINNET_CHAIN } from '@ensmetadata/shared/chains'
import { http, type PublicClient, createPublicClient, fallback } from 'viem'

/**
 * One mainnet client for live record reads, ownership checks and receipts. Built once at
 * module load, after `apps/identity/src/contexts/Web3Provider.tsx`: the env override first,
 * then the curated public RPCs, then viem's defaults.
 */
export const publicClient: PublicClient = createPublicClient({
  chain: MAINNET_CHAIN.viemChain,
  transport: fallback([
    ...(MAINNET_RPC_URL ? [http(MAINNET_RPC_URL)] : []),
    ...MAINNET_CHAIN.rpcDefaults.map((url) => http(url)),
    ...MAINNET_CHAIN.viemChain.rpcUrls.default.http.map((url) => http(url)),
  ]),
}) as PublicClient

type Eip1193RequestFn = (args: { method: string; params?: unknown[] }) => Promise<unknown>

/**
 * Polls the provider's `eth_chainId` until it reports `expected`. Privy's `switchChain` can
 * resolve before the injected wallet has finished switching, and viem refuses to broadcast
 * on a client whose chain disagrees with the provider.
 */
export async function waitForProviderChainId(
  provider: { request: Eip1193RequestFn },
  expected: number,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const raw = await provider.request({ method: 'eth_chainId' })
    const current = typeof raw === 'string' ? Number.parseInt(raw, 16) : Number(raw)
    if (current === expected) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Wallet did not switch to chain ${expected} in time`)
}
