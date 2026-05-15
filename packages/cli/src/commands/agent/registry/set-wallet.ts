import { createWalletClient, encodeFunctionData, formatEther, verifyTypedData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { z } from 'zod'
import IdentityRegistryABI from '../../../lib/abis/IdentityRegistry.json' with { type: 'json' }
import {
  buildFallbackTransport,
  chainAwareOptions,
  clientFromContext,
  globalEnv,
  resolveRpcUrl,
} from '../../../lib/context.js'
import { estimateCost, formatCost, validateCost } from '../../../lib/estimate-cost.js'

const EIP712_TYPES = {
  AgentWalletSet: [
    { name: 'agentId', type: 'uint256' },
    { name: 'newWallet', type: 'address' },
    { name: 'owner', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

const setWalletOptions = chainAwareOptions.extend({
  privateKey: z.string().describe('Private key for signing (hex, prefixed with 0x)'),
  broadcast: z
    .boolean()
    .default(false)
    .describe('Broadcast the transaction on-chain (default: dry run)'),
  deadline: z.string().optional().describe('Deadline unix timestamp (auto-generated if omitted)'),
  signature: z
    .string()
    .optional()
    .describe('EIP-712 signature from the wallet (auto-signed if omitted)'),
})

export const setWalletCommand = {
  description: 'Link a verified wallet to an agent via EIP-712 signature',
  args: z.object({
    agentId: z.string().describe('Agent token ID'),
    walletAddress: z.string().describe('Wallet address (0x...)'),
  }),
  options: setWalletOptions,
  env: globalEnv,
  async run(ctx: {
    args: { agentId: string; walletAddress: string }
    options: z.infer<typeof setWalletOptions>
    env: z.infer<typeof globalEnv>
  }) {
    const { privateKey, broadcast, deadline: deadlineOpt, signature: signatureOpt } = ctx.options
    const { agentId, walletAddress } = ctx.args

    const { client: publicClient, chain, registryAddress } = clientFromContext(ctx)
    const account = privateKeyToAccount(privateKey as `0x${string}`)
    const tokenId = BigInt(agentId)
    const chainId = await publicClient.getChainId()

    const domain = {
      name: 'ERC8004IdentityRegistry',
      version: '1',
      chainId,
      verifyingContract: registryAddress,
    } as const

    let finalDeadline: bigint
    let finalSignature: `0x${string}`

    const rpcUrl = resolveRpcUrl(chain.id, ctx.options, ctx.env as Record<string, string | undefined>)
    const transport = buildFallbackTransport({ rpcUrl, viemDefaults: chain.rpcUrls.default.http })

    if (signatureOpt && deadlineOpt) {
      finalDeadline = BigInt(deadlineOpt)
      finalSignature = signatureOpt as `0x${string}`

      const valid = await verifyTypedData({
        address: walletAddress as `0x${string}`,
        domain,
        types: EIP712_TYPES,
        primaryType: 'AgentWalletSet',
        message: {
          agentId: tokenId,
          newWallet: walletAddress as `0x${string}`,
          owner: account.address,
          deadline: finalDeadline,
        },
        signature: finalSignature,
      })

      if (!valid) {
        throw new Error(`Signature does not recover to wallet ${walletAddress}`)
      }
    } else {
      const block = await publicClient.getBlock()
      finalDeadline = block.timestamp + 240n

      const walletClient = createWalletClient({ account, chain, transport })
      finalSignature = await walletClient.signTypedData({
        account,
        domain,
        types: EIP712_TYPES,
        primaryType: 'AgentWalletSet',
        message: {
          agentId: tokenId,
          newWallet: walletAddress as `0x${string}`,
          owner: account.address,
          deadline: finalDeadline,
        },
      })
    }

    const contractArgs = [
      tokenId,
      walletAddress as `0x${string}`,
      finalDeadline,
      finalSignature,
    ] as const

    if (!broadcast) {
      const data = encodeFunctionData({
        abi: IdentityRegistryABI,
        functionName: 'setAgentWallet',
        args: [...contractArgs],
      })

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
        chain: ctx.options.chain,
        registry: registryAddress,
        function: 'setAgentWallet',
        agentId: tokenId.toString(),
        wallet: walletAddress,
        deadline: finalDeadline.toString(),
        signer: account.address,
        signature: signatureOpt ? 'provided (verified)' : 'auto-signed',
        to: registryAddress,
        data,
        value: '0',
        ...(estimatedCost ? { estimatedCost } : {}),
        ...(balance ? { balance } : {}),
        ...(signatureOpt
          ? {}
          : {
              eip712: {
                domain,
                primaryType: 'AgentWalletSet',
                message: {
                  agentId: tokenId.toString(),
                  newWallet: '<wallet-address>',
                  owner: account.address,
                  deadline: '<unix-timestamp>',
                },
              },
              hint: 'Run with --broadcast to submit. To use a different signer, pass --signature <0x...> --deadline <timestamp>.',
            }),
        ...(signatureOpt ? { hint: 'Run with --broadcast to submit on-chain.' } : {}),
      }
    }

    const walletClient = createWalletClient({ account, chain, transport })
    const txData = encodeFunctionData({
      abi: IdentityRegistryABI,
      functionName: 'setAgentWallet',
      args: [...contractArgs],
    })
    await validateCost(publicClient, {
      account: account.address,
      to: registryAddress,
      data: txData,
    })

    const { request } = await publicClient.simulateContract({
      account,
      address: registryAddress,
      abi: IdentityRegistryABI,
      functionName: 'setAgentWallet',
      args: [...contractArgs],
    })

    const txHash = await walletClient.writeContract(request)
    const explorerUrl = chain.blockExplorers?.default?.url ?? null

    return {
      broadcast: true,
      chain: ctx.options.chain,
      registry: registryAddress,
      function: 'setAgentWallet',
      agentId: tokenId.toString(),
      wallet: walletAddress,
      txHash,
      explorerUrl: explorerUrl ? `${explorerUrl}/tx/${txHash}` : null,
    }
  },
}
