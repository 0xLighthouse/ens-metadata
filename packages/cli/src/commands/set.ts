import { readFileSync } from 'node:fs'
import { metadataWriter, validateMetadataSchema } from '@ensmetadata/sdk'
import type { Schema } from '@ensmetadata/schemas/types'
import { type PublicClient, createPublicClient, createWalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { z } from 'zod'
import {
  buildFallbackTransport,
  globalEnv,
  globalOptions,
  resolveRpcUrl,
  validateName,
} from '../lib/context.js'
import {
  estimateEnsTextRecordsCost,
  formatCost,
  validateEnsTextRecordsCost,
} from '../lib/ens-write.js'
import { fetchSchemaByUri } from '../lib/schema-fetch.js'

const setOptions = globalOptions.extend({
  privateKey: z.string().describe('Private key for signing (hex, prefixed with 0x)'),
  broadcast: z
    .boolean()
    .default(false)
    .describe('Broadcast the transaction on-chain (default: dry run)'),
  includeEmpty: z
    .boolean()
    .default(false)
    .describe(
      'Include payload entries whose value is an empty string. By default empty entries are skipped (use this to deliberately clear ENS records).',
    ),
  ipfsGateway: z
    .string()
    .optional()
    .describe(
      'IPFS gateway origin used to fetch schema documents (defaults to https://ipfs.io, env: IPFS_GATEWAY).',
    ),
})

const setEnv = globalEnv.extend({
  IPFS_GATEWAY: z.string().optional().describe('IPFS gateway origin (e.g. https://ipfs.io)'),
})

type SchemaSource = 'payload' | 'ens' | 'none'

interface ResolvedSchema {
  schema: Schema | null
  source: SchemaSource
  uri: string | null
}

/**
 * Filter payload entries that should be sent to ENS. By default, entries with
 * empty-string values are dropped (so the user's blank template fields don't
 * clobber existing ENS records). Pass `includeEmpty: true` to keep them.
 */
export function filterPayloadEntries(
  payload: Record<string, unknown>,
  opts: { includeEmpty: boolean },
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value !== 'string') continue
    if (!opts.includeEmpty && value === '') continue
    out[key] = value
  }
  return out
}

/**
 * Build an ENS-aware viem PublicClient. We need ensjs's extensions
 * (`getEnsText`) to read existing schema records.
 */
async function buildPublicClient(rpcUrl?: string): Promise<PublicClient> {
  const { addEnsContracts } = await import('@ensdomains/ensjs')
  const chain = addEnsContracts(mainnet)
  const transport = buildFallbackTransport(mainnet.id, rpcUrl, mainnet.rpcUrls.default.http)
  return createPublicClient({ chain, transport }) as PublicClient
}

/**
 * Read the `schema` text record directly off ENS without the SDK's
 * error-swallowing wrapper. We need to distinguish "RPC failure" (hard-fail)
 * from "no record set" (skip validation).
 */
async function readEnsSchemaUri(client: PublicClient, ensName: string): Promise<string | null> {
  // biome-ignore lint/suspicious/noExplicitAny: ensjs extends PublicClient with getEnsText
  const value = await (client as any).getEnsText({ name: ensName, key: 'schema' })
  if (typeof value !== 'string' || value.length === 0) return null
  return value
}

/**
 * Resolve the schema to validate against following the documented cascade:
 *  - If the payload includes `schema`, fetch it (hard-fail on any error).
 *  - Otherwise read the `schema` text record off ENS. If the read itself
 *    fails (RPC error, timeout) → hard-fail. If the read succeeds and no
 *    record is set → no validation. If a URI comes back → fetch it
 *    (hard-fail on any error).
 */
export async function resolveSchemaForPayload(args: {
  payload: Record<string, unknown>
  ensName: string
  publicClient: PublicClient
  ipfsGateway?: string
}): Promise<ResolvedSchema> {
  const payloadSchema =
    typeof args.payload.schema === 'string' && args.payload.schema.length > 0
      ? args.payload.schema
      : null

  if (payloadSchema) {
    const schema = await fetchSchemaByUri(payloadSchema, { ipfsGateway: args.ipfsGateway })
    return { schema, source: 'payload', uri: payloadSchema }
  }

  let ensUri: string | null
  try {
    ensUri = await readEnsSchemaUri(args.publicClient, args.ensName)
  } catch (err) {
    throw new Error(
      `Failed to read 'schema' text record from ENS for ${args.ensName}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!ensUri) {
    return { schema: null, source: 'none', uri: null }
  }

  const schema = await fetchSchemaByUri(ensUri, { ipfsGateway: args.ipfsGateway })
  return { schema, source: 'ens', uri: ensUri }
}

export const setCommand = {
  description: 'Set ENS metadata text records from a payload file',
  args: z.object({
    name: z.string().describe('ENS name (e.g. myagent.eth)'),
    payload: z.string().describe('Path to payload.json'),
  }),
  options: setOptions,
  env: setEnv,
  async run(c: {
    args: { name: string; payload: string }
    options: z.infer<typeof setOptions>
    env: z.infer<typeof setEnv>
  }) {
    const ensName = validateName(c.args.name)
    const { privateKey, broadcast, includeEmpty } = c.options
    const rpcUrl = resolveRpcUrl(mainnet.id, c.options, c.env as Record<string, string | undefined>)
    const ipfsGateway = c.options.ipfsGateway ?? c.env.IPFS_GATEWAY

    const raw: unknown = JSON.parse(readFileSync(c.args.payload, 'utf8'))
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error('Payload must be a JSON object.')
    }
    const rawRecord = raw as Record<string, unknown>

    const filtered = filterPayloadEntries(rawRecord, { includeEmpty })

    const publicClient = await buildPublicClient(rpcUrl)

    const resolved = await resolveSchemaForPayload({
      payload: rawRecord,
      ensName,
      publicClient,
      ipfsGateway,
    })

    if (resolved.schema) {
      const result = validateMetadataSchema(filtered, resolved.schema)
      if (!result.success) {
        throw new Error(
          `Invalid payload (validated against schema from ${resolved.source}${resolved.uri ? `: ${resolved.uri}` : ''}):\n${result.errors
            .map((e) => `[${e.key}] ${e.message}`)
            .join('\n')}`,
        )
      }
    }

    const texts = Object.entries(filtered).map(([key, value]) => ({ key, value }))

    if (texts.length === 0) {
      throw new Error(
        'No records to write. The payload contained no non-empty entries (use --include-empty to send empty strings).',
      )
    }

    const schemaInfo = {
      source: resolved.source,
      uri: resolved.uri,
      validated: resolved.schema !== null,
    }

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
        schema: schemaInfo,
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

    const account = privateKeyToAccount(privateKey as `0x${string}`)
    const { addEnsContracts } = await import('@ensdomains/ensjs')
    const chain = addEnsContracts(mainnet)
    const transport = buildFallbackTransport(mainnet.id, rpcUrl, mainnet.rpcUrls.default.http)
    const walletClient = createWalletClient({ account, chain, transport })

    const records = Object.fromEntries(texts.map((t) => [t.key, t.value]))
    const writer = metadataWriter({ publicClient })(walletClient)
    const result = await writer.setMetadata({ name: ensName, records })

    return {
      broadcast: true,
      name: ensName,
      schema: schemaInfo,
      txHash: result.txHash,
      explorerUrl: `https://etherscan.io/tx/${result.txHash}`,
    }
  },
}
