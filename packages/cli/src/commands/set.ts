import { readFileSync } from 'node:fs'
import { computeDelta, metadataWriter, validateMetadataSchema } from '@ensmetadata/sdk'
import type { MetadataDelta } from '@ensmetadata/sdk'
import type { Schema } from '@ensmetadata/schemas/types'
import { type Address, type PublicClient, createPublicClient, createWalletClient } from 'viem'
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
import { queryDomainStrict } from '../lib/subgraph.js'

const setOptions = globalOptions.extend({
  privateKey: z
    .string()
    .optional()
    .describe(
      'Private key for signing (hex, prefixed with 0x). Required for --broadcast; optional for dry-run (the ENS manager is used as the from-address when omitted).',
    ),
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
 * Batch-read ENS text records for `keys` in parallel. Returns `null` for keys
 * that are unset or hold an empty string. RPC errors propagate (we want to
 * hard-fail rather than silently treat a transport blip as "no record").
 */
export async function readExistingTextRecords(
  client: PublicClient,
  ensName: string,
  keys: string[],
): Promise<Record<string, string | null>> {
  const results = await Promise.all(
    keys.map(async (key) => {
      // biome-ignore lint/suspicious/noExplicitAny: ensjs extends PublicClient with getEnsText
      const value = await (client as any).getEnsText({ name: ensName, key })
      return [key, typeof value === 'string' && value.length > 0 ? value : null] as const
    }),
  )
  return Object.fromEntries(results)
}

export interface PayloadDiff {
  added: { key: string; value: string }[]
  updated: { key: string; from: string; to: string }[]
  deleted: { key: string; from: string }[]
  unchanged: { key: string; value: string }[]
}

/**
 * Bucket the desired payload against existing ENS values using the delta from
 * `computeDelta`. Used both to drive the dry-run output and to give the
 * broadcast path a "nothing to do" early-exit.
 */
export function buildPayloadDiff(
  existing: Record<string, string | null>,
  desired: Record<string, string>,
  delta: MetadataDelta,
): PayloadDiff {
  const diff: PayloadDiff = { added: [], updated: [], deleted: [], unchanged: [] }
  const deletedSet = new Set(delta.deleted)

  for (const [key, value] of Object.entries(desired)) {
    const orig = existing[key] ?? null
    if (Object.prototype.hasOwnProperty.call(delta.changes, key)) {
      if (orig === null || orig === '') {
        diff.added.push({ key, value })
      } else {
        diff.updated.push({ key, from: orig, to: value })
      }
    } else if (deletedSet.has(key)) {
      diff.deleted.push({ key, from: orig ?? '' })
    } else if (value !== '') {
      diff.unchanged.push({ key, value })
    }
  }

  return diff
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/**
 * Look up the address authorised to set records on `ensName` via ENSNode (the
 * project's standard indexed-data source). Used as the `from` address for
 * dry-run gas estimation when no `--private-key` is supplied.
 *
 * Resolution: prefer `wrappedOwnerId` when set (wrapped names hold the
 * NameWrapper as the registry owner), otherwise fall back to `ownerId`.
 */
export async function readEnsManager(ensName: string): Promise<Address> {
  const domain = await queryDomainStrict(ensName)
  if (!domain) {
    throw new Error(
      `ENSNode has no record of ${ensName}. Pass --private-key to provide a from-address explicitly.`,
    )
  }

  const candidate =
    domain.wrappedOwnerId && domain.wrappedOwnerId !== ZERO_ADDRESS
      ? domain.wrappedOwnerId
      : domain.ownerId

  if (!candidate || candidate === ZERO_ADDRESS) {
    throw new Error(
      `Could not determine the manager of ${ensName} from ENSNode. Pass --private-key to provide a from-address explicitly.`,
    )
  }

  return candidate as Address
}

/**
 * Resolve the schema to validate against following the documented cascade:
 *  - If the payload includes `schema`, fetch it (hard-fail on any error).
 *  - Otherwise read the `schema` text record off ENS. If the read itself
 *    fails (RPC error, timeout) → hard-fail. If the read succeeds and no
 *    record is set → no validation. If a URI comes back → fetch it
 *    (hard-fail on any error).
 *
 * `ensSchemaUri`, when provided, replaces the per-call ENS read — the caller
 * has already fetched the `schema` record (e.g. as part of a delta batch) and
 * a `null`/empty string means "no record set" exactly as it does after a
 * direct read.
 */
export async function resolveSchemaForPayload(args: {
  payload: Record<string, unknown>
  ensName: string
  publicClient: PublicClient
  ipfsGateway?: string
  ensSchemaUri?: string | null
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
  if (args.ensSchemaUri !== undefined) {
    ensUri = args.ensSchemaUri && args.ensSchemaUri.length > 0 ? args.ensSchemaUri : null
  } else {
    try {
      ensUri = await readEnsSchemaUri(args.publicClient, args.ensName)
    } catch (err) {
      throw new Error(
        `Failed to read 'schema' text record from ENS for ${args.ensName}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
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

    if (broadcast && !privateKey) {
      throw new Error('--private-key is required when --broadcast is set.')
    }

    const raw: unknown = JSON.parse(readFileSync(c.args.payload, 'utf8'))
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error('Payload must be a JSON object.')
    }
    const rawRecord = raw as Record<string, unknown>

    const filtered = filterPayloadEntries(rawRecord, { includeEmpty })

    const publicClient = await buildPublicClient(rpcUrl)

    /**
     * Batch-read existing values for every payload key plus `schema` (always
     * needed for schema resolution). Doing this once here lets us
     *   1. compute a delta and skip records that already match on-chain, and
     *   2. reuse the `schema` value inside `resolveSchemaForPayload` instead
     *      of issuing a second `getEnsText('schema')` call.
     */
    const keysToRead = Array.from(new Set([...Object.keys(filtered), 'schema']))
    let existing: Record<string, string | null>
    try {
      existing = await readExistingTextRecords(publicClient, ensName, keysToRead)
    } catch (err) {
      throw new Error(
        `Failed to read existing text records from ENS for ${ensName}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const resolved = await resolveSchemaForPayload({
      payload: rawRecord,
      ensName,
      publicClient,
      ipfsGateway,
      ensSchemaUri: existing.schema ?? null,
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

    const delta = computeDelta(existing, filtered)
    const diff = buildPayloadDiff(existing, filtered, delta)

    const texts = [
      ...Object.entries(delta.changes).map(([key, value]) => ({ key, value })),
      ...delta.deleted.map((key) => ({ key, value: '' })),
    ]

    const schemaInfo = {
      source: resolved.source,
      uri: resolved.uri,
      validated: resolved.schema !== null,
    }

    if (texts.length === 0) {
      const hint =
        Object.keys(filtered).length === 0
          ? 'The payload contained no non-empty entries (use --include-empty to send empty strings).'
          : 'All values in the payload already match the existing ENS records.'
      return {
        dryRun: !broadcast,
        name: ensName,
        schema: schemaInfo,
        noOp: true,
        diff,
        hint,
      }
    }

    /**
     * Resolve the from-address used for gas estimation:
     *   - private key supplied → derive from it
     *   - otherwise            → look up the ENS manager
     */
    const signerAddress: Address = privateKey
      ? privateKeyToAccount(privateKey as `0x${string}`).address
      : await readEnsManager(ensName)
    const signerSource: 'privateKey' | 'ensManager' = privateKey ? 'privateKey' : 'ensManager'

    if (!broadcast) {
      let estimate: Awaited<ReturnType<typeof estimateEnsTextRecordsCost>> | null = null
      try {
        estimate = await estimateEnsTextRecordsCost(ensName, texts, signerAddress, rpcUrl)
      } catch {
        // estimate is best-effort
      }
      return {
        dryRun: true,
        name: ensName,
        schema: schemaInfo,
        signer: { address: signerAddress, source: signerSource },
        records: texts,
        diff,
        ...(estimate
          ? {
              estimatedCost: formatCost(estimate),
              balance: estimate.balance,
            }
          : {}),
        hint:
          signerSource === 'ensManager'
            ? 'Run with --private-key 0x<KEY> --broadcast to submit on-chain.'
            : 'Run with --broadcast to submit on-chain.',
      }
    }

    // privateKey is guaranteed non-null here by the early check above.
    await validateEnsTextRecordsCost(ensName, texts, signerAddress, rpcUrl)

    const account = privateKeyToAccount(privateKey as `0x${string}`)
    const { addEnsContracts } = await import('@ensdomains/ensjs')
    const chain = addEnsContracts(mainnet)
    const transport = buildFallbackTransport(mainnet.id, rpcUrl, mainnet.rpcUrls.default.http)
    const walletClient = createWalletClient({ account, chain, transport })

    const writer = metadataWriter({ publicClient })(walletClient)
    const result = await writer.setMetadata({
      name: ensName,
      records: delta.changes,
      deleted: delta.deleted,
    })

    return {
      broadcast: true,
      name: ensName,
      schema: schemaInfo,
      txHash: result.txHash,
      explorerUrl: `https://etherscan.io/tx/${result.txHash}`,
      diff,
    }
  },
}
