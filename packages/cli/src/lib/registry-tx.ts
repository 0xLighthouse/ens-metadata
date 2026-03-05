import { encodeFunctionData, formatEther, http, createPublicClient, createWalletClient } from 'viem'
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
  /** Lines shown between header and cost in dry-run output */
  dryRunDetails: string[]
  /** e.g. "✅ Agent registered on base-sepolia" */
  successMessage: string
  /** Additional lines after success message (e.g. "   Agent URI: ...") */
  successDetails?: string[]
  /** Prefix for error messages, e.g. "Registration" → "Registration failed: ..." */
  errorPrefix: string
}

export type RegistryCallResult = {
  status: 'done' | 'error'
  message: string
}

/**
 * Shared executor for registry contract calls. Handles both dry-run and broadcast paths:
 * - Dry-run: encodes function data, estimates cost + balance, formats display
 * - Broadcast: validateCost, simulateContract, writeContract, explorer URL
 */
export async function executeRegistryCall(
  params: RegistryCallParams,
  onWorking?: (message: string) => void,
): Promise<RegistryCallResult> {
  const { chainName, privateKey, broadcast, functionName, contractArgs, dryRunDetails, successMessage, successDetails, errorPrefix } = params
  const { chain, registryAddress } = resolveChain(chainName)
  const account = privateKeyToAccount(privateKey as `0x${string}`)

  const data = encodeFunctionData({
    abi: IdentityRegistryABI,
    functionName,
    args: [...contractArgs],
  })

  if (!broadcast) {
    const publicClient = createPublicClient({ chain, transport: http() })

    let costLine = '  Est. Cost: unable to estimate'
    let balanceLine = ''
    try {
      const [est, balance] = await Promise.all([
        estimateCost(publicClient, { account: account.address, to: registryAddress, data }),
        publicClient.getBalance({ address: account.address }),
      ])
      costLine = `  Est. Cost: ${formatCost(est)}`
      balanceLine = `  Balance:   ${Number.parseFloat(formatEther(balance)).toFixed(6)} ETH`
    } catch {}

    return {
      status: 'done',
      message: [
        `Dry run — would call ${functionName} on ${chainName}:`,
        '',
        `  Registry:  ${registryAddress}`,
        ...dryRunDetails,
        `  Signer:    ${account.address}`,
        balanceLine,
        costLine,
        '',
        'Run with --broadcast to submit on-chain.',
      ].join('\n'),
    }
  }

  onWorking?.(`Broadcasting ${functionName} on ${chainName}…`)

  try {
    const publicClient = createPublicClient({ chain, transport: http() })
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

    const explorerUrl = chain.blockExplorers?.default?.url
    return {
      status: 'done',
      message: [
        successMessage,
        ...(successDetails ?? []),
        `   Tx Hash:  ${explorerUrl ? `${explorerUrl}/tx/${txHash}` : txHash}`,
      ].join('\n'),
    }
  } catch (err) {
    return {
      status: 'error',
      message: `${errorPrefix} failed: ${(err as Error).message}`,
    }
  }
}
