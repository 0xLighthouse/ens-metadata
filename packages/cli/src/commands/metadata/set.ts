import { readFileSync } from 'node:fs'
import { SCHEMA_MAP } from '@ensmetadata/schemas'
import { getPublishedRegistry } from '@ensmetadata/schemas/published'
import { metadataWriter, validateMetadataSchema } from '@ensmetadata/sdk'
import { http, createPublicClient, createWalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { z } from 'zod'
import {
  estimateEnsTextRecordsCost,
  formatCost,
  validateEnsTextRecordsCost,
} from '../../lib/ens-write.js'
import { RPC_OPTION_DESCRIPTION, resolveRpcUrl } from '../../lib/rpc.js'

export const setCommand = {
  description: 'Set ENS metadata text records from a payload file',
  args: z.object({
    name: z.string().describe('ENS name (e.g. myagent.eth)'),
    payload: z.string().describe('Path to payload.json'),
  }),
  options: z.object({
    privateKey: z.string().describe('Private key for signing (hex, prefixed with 0x)'),
    broadcast: z
      .boolean()
      .default(false)
      .describe('Broadcast the transaction on-chain (default: dry run)'),
    rpc: z.string().optional().describe(RPC_OPTION_DESCRIPTION),
  }),
  async run(c: {
    args: { name: string; payload: string }
    options: { privateKey: string; broadcast: boolean; rpc?: string }
  }) {
    const { name: ensName, payload: payloadFile } = c.args
    const { privateKey, broadcast } = c.options
    const rpcUrl = resolveRpcUrl(mainnet.id, c.options)

    const raw: unknown = JSON.parse(readFileSync(payloadFile, 'utf8'))
    const validated = validateMetadataSchema(raw, SCHEMA_MAP.Agent)
    if (!validated.success) {
      throw new Error(
        `Invalid payload:\n${validated.errors.map((e) => `[${e.key}] ${e.message}`).join('\n')}`,
      )
    }
    const payload = validated.data

    try {
      const registry = await getPublishedRegistry()
      const agentSchema = registry.schemas.agent
      if (agentSchema) {
        const latestVersion = agentSchema.published[agentSchema.latest]
        if (latestVersion?.cid) {
          payload.schema = `ipfs://${latestVersion.cid}`
        }
      }
    } catch {
      // Non-fatal — proceed without schema record
    }

    const texts = Object.entries(payload).map(([key, value]) => ({ key, value }))

    if (!broadcast) {
      let estimate: Awaited<ReturnType<typeof estimateEnsTextRecordsCost>> | null = null
      try {
        estimate = await estimateEnsTextRecordsCost(ensName, texts, privateKey, rpcUrl)
      } catch {
        // estimate is best-effort
      }
      return {
        dryRun: true,
        name: ensName,
        records: texts,
        ...(estimate
          ? {
              estimatedCost: formatCost(estimate),
              balance: estimate.balance,
            }
          : {}),
        hint: 'Run with --broadcast to submit on-chain.',
      }
    }

    await validateEnsTextRecordsCost(ensName, texts, privateKey, rpcUrl)

    const { addEnsContracts } = await import('@ensdomains/ensjs')
    const account = privateKeyToAccount(privateKey as `0x${string}`)
    const chain = addEnsContracts(mainnet)
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
    const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) })

    const writer = metadataWriter({ publicClient })(walletClient)
    const result = await writer.setMetadata({ name: ensName, records: payload })

    return {
      broadcast: true,
      name: ensName,
      txHash: result.txHash,
      explorerUrl: `https://etherscan.io/tx/${result.txHash}`,
    }
  },
}
