import { createWalletClient, encodeFunctionData, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import IdentityRegistryABI from './abis/IdentityRegistry.json' with { type: 'json' }
import {
  type Context,
  buildFallbackTransport,
  clientFromContext,
  resolveRpcUrl,
} from './context.js'
import { estimateCost, formatCost, validateCost } from './estimate-cost.js'

export type RegistryCallParams = {
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
  to: `0x${string}`
  data: `0x${string}`
  value: '0'
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
 * Shared executor for IdentityRegistry contract calls. Reads chain + RPC from
 * the incur context. Dry-run output includes pipeable `{to, data, value}`
 * alongside the human-readable summary.
 */
export async function executeRegistryCall(
  c: Context,
  params: RegistryCallParams,
): Promise<RegistryDryRunResult | RegistryBroadcastResult> {
  const { privateKey, broadcast, functionName, contractArgs, extraDetails } = params
  const { client: publicClient, chain, registryAddress } = clientFromContext(c)
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const data = encodeFunctionData({
    abi: IdentityRegistryABI,
    functionName,
    args: [...contractArgs],
  })

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
      chain: c.options.chain ?? 'mainnet',
      registry: registryAddress,
      function: functionName,
      signer: account.address,
      to: registryAddress,
      data,
      value: '0',
      ...(estimatedCost ? { estimatedCost } : {}),
      ...(balance ? { balance } : {}),
      ...(extraDetails ?? {}),
      hint: 'Run with --broadcast to submit on-chain.',
    }
  }

  const rpcUrl = resolveRpcUrl(chain.id, c.options, c.env as Record<string, string | undefined>)
  const transport = buildFallbackTransport(chain.id, rpcUrl, chain.rpcUrls.default.http)
  const walletClient = createWalletClient({ account, chain, transport })
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
    chain: c.options.chain ?? 'mainnet',
    registry: registryAddress,
    function: functionName,
    txHash,
    explorerUrl: explorerUrl ? `${explorerUrl}/tx/${txHash}` : null,
    ...(extraDetails ?? {}),
  }
}
