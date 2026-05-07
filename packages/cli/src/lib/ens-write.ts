import { getResolverAddressStrict } from '@ensmetadata/sdk'
import type { Address, Hex, PublicClient } from 'viem'
import { createPublicClient, encodeFunctionData, formatEther } from 'viem'
import { mainnet } from 'viem/chains'
import { buildFallbackTransport } from './context.js'
import { type CostEstimate, estimateCost, formatCost, validateCost } from './estimate-cost.js'

export type TextRecord = { key: string; value: string }

async function ensSetup(rpcUrl?: string) {
  const { addEnsContracts } = await import('@ensdomains/ensjs')
  const chain = addEnsContracts(mainnet)
  const transport = buildFallbackTransport(mainnet.id, rpcUrl, mainnet.rpcUrls.default.http)
  const publicClient = createPublicClient({ chain, transport })
  return { chain, publicClient }
}

async function resolveEns(publicClient: PublicClient, ensName: string) {
  return getResolverAddressStrict({ client: publicClient, name: ensName })
}

async function encodeEnsTextRecords(ensName: string, texts: TextRecord[], rpcUrl?: string) {
  const { publicClient } = await ensSetup(rpcUrl)
  const { namehash, generateRecordCallArray } = await import('@ensdomains/ensjs/utils')
  const resolverAddress = await resolveEns(publicClient, ensName)
  const node = namehash(ensName)

  const calls = generateRecordCallArray({
    namehash: node,
    texts: texts.map((t) => ({ key: t.key, value: t.value })),
    coins: [],
  })

  const data =
    calls.length === 1
      ? calls[0]!
      : encodeFunctionData({
          abi: [
            {
              name: 'multicall',
              type: 'function',
              inputs: [{ name: 'data', type: 'bytes[]' }],
              outputs: [{ name: '', type: 'bytes[]' }],
            },
          ] as const,
          functionName: 'multicall',
          args: [calls as Hex[]],
        })

  return { publicClient, resolverAddress, data }
}

export async function estimateEnsTextRecordsCost(
  ensName: string,
  texts: TextRecord[],
  signerAddress: Address,
  rpcUrl?: string,
): Promise<CostEstimate & { balance: string }> {
  const { publicClient, resolverAddress, data } = await encodeEnsTextRecords(
    ensName,
    texts,
    rpcUrl,
  )
  const [est, balance] = await Promise.all([
    estimateCost(publicClient, { account: signerAddress, to: resolverAddress, data }),
    publicClient.getBalance({ address: signerAddress }),
  ])
  return { ...est, balance: `${Number.parseFloat(formatEther(balance)).toFixed(6)} ETH` }
}

export { formatCost }

export async function validateEnsTextRecordsCost(
  ensName: string,
  texts: TextRecord[],
  signerAddress: Address,
  rpcUrl?: string,
): Promise<CostEstimate> {
  const { publicClient, resolverAddress, data } = await encodeEnsTextRecords(ensName, texts, rpcUrl)
  return validateCost(publicClient, { account: signerAddress, to: resolverAddress, data })
}
