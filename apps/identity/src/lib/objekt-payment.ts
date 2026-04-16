import type { WalletClient } from 'viem'

// Ported verbatim from apps/interface/src/lib/objekt.ts.
// Wraps globalThis.fetch with an x402 payment handler so that 402 responses
// from Objekt (for paid storage tiers like IPFS) are automatically settled
// with a USDC payment on Base. The switch-to-Base-then-back-to-mainnet dance
// inside `signTypedData` is load-bearing: Privy wallets stay on mainnet for
// ENS writes, but x402's ExactEvmScheme needs to sign on Base (chain 8453).
export async function createPaymentFetch(
  walletClient: WalletClient,
  switchChain: (chainId: number) => Promise<void>,
): Promise<typeof globalThis.fetch> {
  const { wrapFetchWithPayment, x402Client } = await import('@x402/fetch')
  const { ExactEvmScheme } = await import('@x402/evm/exact/client')

  const signer = {
    address: walletClient.account!.address,
    signTypedData: async (msg: Record<string, unknown>) => {
      // x402 payments settle on Base (8453) but the Privy wallet is connected
      // to mainnet. Switch to Base for signing, then restore mainnet.
      await switchChain(8453)
      try {
        return await walletClient.signTypedData({
          account: walletClient.account!,
          ...msg,
        } as never)
      } finally {
        await switchChain(1)
      }
    },
  }

  const client = new x402Client()
  client.register('eip155:8453', new ExactEvmScheme(signer as never))

  return wrapFetchWithPayment(fetch, client)
}
