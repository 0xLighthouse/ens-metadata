import { http, createPublicClient, createWalletClient, encodeFunctionData, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import IdentityRegistryABI from './abis/IdentityRegistry.json' with { type: 'json' }
import { estimateCost, formatCost, validateCost } from './estimate-cost.js'
import { resolveChain } from './registry.js'

export type RegistryCallParams = {
  chainName: string
  privateKey: string
  broadcast: boolean
  functionName: string
  contractArgs: readonly unknown[]
  /** Extra fields surfaced in the result object alongside chain/registry/signer */
  extraDetails?: Record<string, unknown>
}

export type RegistryDryRunResult = {
  dryRun: true
  chain: string
  registry: `0x${string}`
  function: string
  signer: `0x${string}`
  estimatedCost?: string
  balance?: string
  hint: string
} & Record<string, unknown>

export type RegistryBroadcastResult = {
  broadcast: true
  chain: string
  registry: `0x${string}`
  function: string
  txHash: `0x${string}`
  explorerUrl: string | null
} & Record<string, unknown>

/**
 * Shared executor for IdentityRegistry contract calls. Handles both dry-run and
 * broadcast paths and returns a structured result object suitable for incur output.
 */
export async function executeRegistryCall(
  params: RegistryCallParams,
): Promise<RegistryDryRunResult | RegistryBroadcastResult> {
  const { chainName, privateKey, broadcast, functionName, contractArgs, extraDetails } = params
  const { chain, registryAddress } = resolveChain(chainName)
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const data = encodeFunctionData({
    abi: IdentityRegistryABI,
    functionName,
    args: [...contractArgs],
  })

  const publicClient = createPublicClient({ chain, transport: http() })

  if (!broadcast) {
    let estimatedCost: string | undefined
    let balance: string | undefined
    try {
      const [est, bal] = await Promise.all([
        estimateCost(publicClient, { account: account.address, to: registryAddress, data }),
        publicClient.getBalance({ address: account.address }),
      ])
      estimatedCost = formatCost(est)
      balance = `${Number.parseFloat(formatEther(bal)).toFixed(6)} ETH`
    } catch {
      // best-effort
    }

    return {
      dryRun: true,
      chain: chainName,
      registry: registryAddress,
      function: functionName,
      signer: account.address,
      ...(estimatedCost ? { estimatedCost } : {}),
      ...(balance ? { balance } : {}),
      ...(extraDetails ?? {}),
      hint: 'Run with --broadcast to submit on-chain.',
    }
  }

  const walletClient = createWalletClient({ account, chain, transport: http() })
  await validateCost(publicClient, { account: account.address, to: registryAddress, data })

  const { request } = await publicClient.simulateContract({
    account,
    address: registryAddress,
    abi: IdentityRegistryABI,
    functionName,
    args: [...contractArgs],
  })

  const txHash = await walletClient.writeContract(request)
  const explorerUrl = chain.blockExplorers?.default?.url ?? null

  return {
    broadcast: true,
    chain: chainName,
    registry: registryAddress,
    function: functionName,
    txHash,
    explorerUrl: explorerUrl ? `${explorerUrl}/tx/${txHash}` : null,
    ...(extraDetails ?? {}),
  }
}
