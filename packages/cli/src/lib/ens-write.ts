import type { Hex, PublicClient } from 'viem'
import { encodeFunctionData, formatEther, http, createPublicClient, createWalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { estimateCost, formatCost, validateCost, type CostEstimate } from './estimate-cost.js'

export type TextRecord = { key: string; value: string }

async function ensSetup(privateKey: string) {
  const { addEnsContracts } = await import('@ensdomains/ensjs')
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const chain = addEnsContracts(mainnet)
  const publicClient = createPublicClient({ chain, transport: http() })
  const walletClient = createWalletClient({ account, chain, transport: http() })
  return { account, chain, publicClient, walletClient }
}

async function resolveEns(publicClient: any, ensName: string) {
  const { getResolver } = await import('@ensdomains/ensjs/public')
  const resolverAddress = await getResolver(publicClient, { name: ensName })
  if (!resolverAddress) {
    throw new Error(`No resolver found for ${ensName}. Set a resolver first.`)
  }
  return resolverAddress
}

async function encodeEnsTextRecords(
  ensName: string,
  texts: TextRecord[],
  privateKey: string,
) {
  const { account, publicClient } = await ensSetup(privateKey)
  const { namehash, generateRecordCallArray } = await import('@ensdomains/ensjs/utils')
  const resolverAddress = await resolveEns(publicClient, ensName)
  const node = namehash(ensName)

  const calls = generateRecordCallArray({
    namehash: node,
    texts: texts.map((t) => ({ key: t.key, value: t.value })),
    coins: [],
  })

  const data = calls.length === 1
    ? calls[0]!
    : encodeFunctionData({
        abi: [{ name: 'multicall', type: 'function', inputs: [{ name: 'data', type: 'bytes[]' }], outputs: [{ name: '', type: 'bytes[]' }] }] as const,
        functionName: 'multicall',
        args: [calls as Hex[]],
      })

  return { account, publicClient, resolverAddress, data }
}

export async function estimateEnsTextRecordsCost(
  ensName: string,
  texts: TextRecord[],
  privateKey: string,
): Promise<CostEstimate & { balance: string }> {
  const { account, publicClient, resolverAddress, data } = await encodeEnsTextRecords(ensName, texts, privateKey)
  const [est, balance] = await Promise.all([
    estimateCost(publicClient, { account: account.address, to: resolverAddress, data }),
    publicClient.getBalance({ address: account.address }),
  ])
  return { ...est, balance: `${Number.parseFloat(formatEther(balance)).toFixed(6)} ETH` }
}

export { formatCost }

export async function validateEnsTextRecordsCost(
  ensName: string,
  texts: TextRecord[],
  privateKey: string,
): Promise<CostEstimate> {
  const { account, publicClient, resolverAddress, data } = await encodeEnsTextRecords(ensName, texts, privateKey)
  return validateCost(publicClient, { account: account.address, to: resolverAddress, data })
}

export async function setEnsTextRecords(
  ensName: string,
  texts: TextRecord[],
  privateKey: string,
): Promise<string> {
  const { publicClient, walletClient } = await ensSetup(privateKey)
  const { setRecords } = await import('@ensdomains/ensjs/wallet')
  const resolverAddress = await resolveEns(publicClient, ensName)

  const hash = await setRecords(walletClient, {
    name: ensName,
    texts,
    coins: [],
    resolverAddress,
  })

  return hash
}
