import React from 'react'
import { encodeFunctionData, formatEther, http, createPublicClient, createWalletClient, verifyTypedData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { z } from 'zod'
import IdentityRegistryABI from '../../../lib/abis/IdentityRegistry.json' with { type: 'json' }
import { estimateCost, formatCost, validateCost } from '../../../lib/estimate-cost.js'
import { SUPPORTED_CHAINS, resolveChain } from '../../../lib/registry.js'
import { useCommand, CommandStatus } from '../../../lib/use-command.js'

export const description = 'Link a verified wallet to an agent via EIP-712 signature'

export const options = z.object({
  chainName: z
    .enum(SUPPORTED_CHAINS)
    .default('mainnet')
    .describe('Chain name (e.g. mainnet, base, arbitrum, optimism)'),
  privateKey: z
    .string()
    .describe('Private key for signing (hex, prefixed with 0x)'),
  broadcast: z
    .boolean()
    .default(false)
    .describe('Broadcast the transaction on-chain (default: dry run)'),
  deadline: z
    .string()
    .optional()
    .describe('Deadline unix timestamp (auto-generated if omitted)'),
  signature: z
    .string()
    .optional()
    .describe('EIP-712 signature from the wallet (auto-signed if omitted)'),
})

export const args = z.tuple([
  z.string().describe('agent-id (token ID)'),
  z.string().describe('wallet-address (0x...)'),
])

type Props = {
  options: z.infer<typeof options>
  args: z.infer<typeof args>
}

const EIP712_TYPES = {
  AgentWalletSet: [
    { name: 'agentId', type: 'uint256' },
    { name: 'newWallet', type: 'address' },
    { name: 'owner', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export default function SetWallet({
  options: { chainName, privateKey, broadcast, deadline: deadlineOpt, signature: signatureOpt },
  args: [agentId, walletAddress],
}: Props) {
  const state = useCommand(
    [chainName, privateKey, broadcast, agentId, walletAddress, deadlineOpt, signatureOpt],
    async (setState) => {
      const { chain, registryAddress } = resolveChain(chainName)
      const account = privateKeyToAccount(privateKey as `0x${string}`)
      const publicClient = createPublicClient({ chain, transport: http() })
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
          setState({ status: 'error', message: `Signature does not recover to wallet ${walletAddress}` })
          return
        }
      } else {
        const block = await publicClient.getBlock()
        finalDeadline = block.timestamp + 240n

        const walletClient = createWalletClient({ account, chain, transport: http() })
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

      const contractArgs = [tokenId, walletAddress as `0x${string}`, finalDeadline, finalSignature] as const

      if (!broadcast) {
        const data = encodeFunctionData({
          abi: IdentityRegistryABI,
          functionName: 'setAgentWallet',
          args: [...contractArgs],
        })

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

        const lines = [
          `Dry run — would call setAgentWallet on ${chainName}:`,
          '',
          `  Registry:  ${registryAddress}`,
          `  Agent ID:  ${tokenId.toString()}`,
          `  Wallet:    ${walletAddress}`,
          `  Deadline:  ${finalDeadline.toString()}`,
          `  Signer:    ${account.address}`,
          `  Signature: ${signatureOpt ? 'provided (verified)' : 'auto-signed'}`,
          balanceLine,
          costLine,
        ]

        if (!signatureOpt) {
          lines.push(
            '',
            'If the wallet is controlled by a different key, have them sign:',
            '',
            '  EIP-712 Domain:',
            `    name:              ERC8004IdentityRegistry`,
            `    version:           1`,
            `    chainId:           ${chainId}`,
            `    verifyingContract: ${registryAddress}`,
            '',
            '  Primary Type: AgentWalletSet',
            '  Message:',
            `    agentId:   ${tokenId.toString()}`,
            `    newWallet: <wallet-address>`,
            `    owner:     ${account.address}`,
            `    deadline:  <unix-timestamp>`,
            '',
            'Then pass --signature <0x...> --deadline <timestamp>',
          )
        }

        lines.push('', 'Run with --broadcast to submit on-chain.')
        setState({ status: 'done', message: lines.join('\n') })
        return
      }

      setState({ status: 'working', message: `Linking wallet on ${chainName}…` })

      try {
        const walletClient = createWalletClient({ account, chain, transport: http() })

        const txData = encodeFunctionData({
          abi: IdentityRegistryABI,
          functionName: 'setAgentWallet',
          args: [...contractArgs],
        })
        await validateCost(publicClient, { account: account.address, to: registryAddress, data: txData })

        const { request } = await publicClient.simulateContract({
          account,
          address: registryAddress,
          abi: IdentityRegistryABI,
          functionName: 'setAgentWallet',
          args: [...contractArgs],
        })

        const txHash = await walletClient.writeContract(request)

        const explorerUrl = chain.blockExplorers?.default?.url
        setState({
          status: 'done',
          message: [
            `✅ Wallet linked on ${chainName}`,
            `   Agent ID: ${tokenId.toString()}`,
            `   Wallet:   ${walletAddress}`,
            `   Tx Hash:  ${explorerUrl ? `${explorerUrl}/tx/${txHash}` : txHash}`,
          ].join('\n'),
        })
      } catch (err) {
        setState({ status: 'error', message: `setAgentWallet failed: ${(err as Error).message}` })
      }
    },
  )

  return <CommandStatus state={state} />
}
