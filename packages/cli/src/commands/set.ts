import { readFileSync } from 'node:fs'
import {
  getBaseRegistryOwner,
  isBasename,
  metadataEstimator,
  metadataWriter,
  readTextRecordsStrict,
  resolveSchemaForName,
} from '@ensmetadata/sdk'
import type { EstimateResult, MetadataDelta, ResolvedSchema } from '@ensmetadata/sdk'
import {
  type Address,
  type PublicClient,
  createPublicClient,
  createWalletClient,
  isAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { z } from 'zod'
import { bundledSchemaResolver } from '../lib/bundled-schemas.js'
import {
  base,
  baseClientForName,
  buildFallbackTransport,
  globalEnv,
  globalOptions,
  resolveRpcUrl,
  validateName,
} from '../lib/context.js'
import { enforceCostPolicy, formatCost, formatEstimate } from '../lib/estimate-cost.js'

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
 * (`getEnsText`, `getOwner`) for mainnet reads.
 */
async function buildPublicClient(rpcUrl?: string): Promise<PublicClient> {
  const { addEnsContracts } = await import('@ensdomains/ensjs')
  const chain = addEnsContracts(mainnet)
  const transport = buildFallbackTransport(mainnet.id, rpcUrl, mainnet.rpcUrls.default.http)
  return createPublicClient({ chain, transport }) as PublicClient
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

/**
 * Look up the address authorised to set records on `ensName` directly on-chain.
 * Used as the `from` address for dry-run gas estimation when no `--private-key`
 * is supplied.
 *
 * For mainnet names this uses ensjs's `getOwner`, which transparently handles
 * the registry / registrar / NameWrapper distinction. For Basenames it reads
 * `owner(node)` from the Base L2 registry.
 */
export async function readEnsManager(
  ensName: string,
  mainnetClient: PublicClient,
  basePublicClient?: PublicClient,
): Promise<Address> {
  if (isBasename(ensName)) {
    if (!basePublicClient) {
      throw new Error(`Basename ${ensName} requires a Base public client.`)
    }
    const owner = await getBaseRegistryOwner(basePublicClient, ensName)
    if (!owner) {
      throw new Error(
        `Could not determine the manager of ${ensName} on Base (registry returned the zero address). Pass --private-key to provide a from-address explicitly.`,
      )
    }
    return owner as Address
  }

  const { getOwner } = await import('@ensdomains/ensjs/public')
  const owner = await getOwner(mainnetClient as never, { name: ensName })
  if (!owner?.owner || !isAddress(owner.owner)) {
    throw new Error(
      `Could not determine the manager of ${ensName} on mainnet. Pass --private-key to provide a from-address explicitly.`,
    )
  }
  return owner.owner as Address
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
    const isBase = isBasename(ensName)
    const { privateKey, broadcast, includeEmpty } = c.options
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

    /**
     * `--rpc` binds to the chain that the subject name lives on (see README).
     * For Basenames the mainnet client takes its RPC from the env-only
     * precedence (`RPC_URL_1` / `MAINNET_RPC_URL` / `ETH_RPC_URL`).
     */
    const mainnetRpcOptions = isBase ? {} : c.options
    const mainnetRpcUrl = resolveRpcUrl(
      mainnet.id,
      mainnetRpcOptions,
      c.env as Record<string, string | undefined>,
    )
    const publicClient = await buildPublicClient(mainnetRpcUrl)
    const basePublicClient = baseClientForName(c, ensName)

    /**
     * Batch-read existing values for every payload key plus `schema` (always
     * needed for schema resolution). Doing this once here lets us
     *   1. compute a delta and skip records that already match on-chain, and
     *   2. reuse the `schema` value inside `resolveSchemaForName` instead
     *      of issuing a second `getEnsText('schema')` call.
     */
    const keysToRead = Array.from(new Set([...Object.keys(filtered), 'schema']))
    let existing: Record<string, string | null>
    try {
      existing = await readTextRecordsStrict({
        client: publicClient,
        ...(basePublicClient ? { basePublicClient } : {}),
        name: ensName,
        keys: keysToRead,
      })
    } catch (err) {
      throw new Error(
        `Failed to read existing text records from ENS for ${ensName}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const payloadSchemaUri =
      typeof rawRecord.schema === 'string' && rawRecord.schema.length > 0 ? rawRecord.schema : null
    const resolved: ResolvedSchema = await resolveSchemaForName({
      client: publicClient,
      name: ensName,
      payloadSchemaUri,
      ensSchemaText: existing.schema ?? null,
      ...(ipfsGateway ? { gateway: ipfsGateway } : {}),
      resolver: bundledSchemaResolver,
    })

    /**
     * Resolve the from-address used for gas estimation and broadcast:
     *   - private key supplied → derive from it
     *   - otherwise            → look up the on-chain manager (ensjs for
     *                            mainnet, Base registry for Basenames)
     */
    const signerAddress: Address = privateKey
      ? privateKeyToAccount(privateKey as `0x${string}`).address
      : await readEnsManager(ensName, publicClient, basePublicClient)
    const signerSource: 'privateKey' | 'ensManager' = privateKey ? 'privateKey' : 'ensManager'

    /**
     * `estimateSetMetadata` produces a `PrepareResult` with the same delta we
     * need for diff display, plus calldata + gas estimate in one call. Reusing
     * the pre-fetched `existing` map avoids a second round trip to ENS.
     */
    const estimator = metadataEstimator({
      publicClient,
      ...(basePublicClient ? { basePublicClient } : {}),
    })
    let estimate: EstimateResult
    try {
      estimate = await estimator.estimateSetMetadata({
        name: ensName,
        desired: filtered,
        existing,
        account: signerAddress,
        ...(resolved.schema ? { schema: resolved.schema } : {}),
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'MetadataWriteError') {
        throw new Error(
          `Invalid payload (validated against schema from ${resolved.source}${resolved.uri ? `: ${resolved.uri}` : ''}):\n${(
            err as Error & { errors: { key: string; message: string }[] }
          ).errors
            .map((e) => `[${e.key}] ${e.message}`)
            .join('\n')}`,
        )
      }
      throw err
    }

    const delta: MetadataDelta = estimate.prepared.delta
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
        chain: isBase ? 'base' : 'mainnet',
        schema: schemaInfo,
        noOp: true,
        diff,
        hint,
      }
    }

    if (!broadcast) {
      let formatted: Awaited<ReturnType<typeof formatEstimate>> | null = null
      try {
        formatted = await formatEstimate(estimate)
      } catch {
        // estimate is best-effort
      }
      return {
        dryRun: true,
        name: ensName,
        chain: isBase ? 'base' : 'mainnet',
        schema: schemaInfo,
        signer: { address: signerAddress, source: signerSource },
        records: texts,
        diff,
        ...(formatted
          ? {
              estimatedCost: formatCost(formatted),
              balance: formatted.balance,
            }
          : {}),
        hint:
          signerSource === 'ensManager'
            ? 'Run with --private-key 0x<KEY> --broadcast to submit on-chain.'
            : 'Run with --broadcast to submit on-chain.',
      }
    }

    // privateKey is guaranteed non-null here by the early check above.
    await enforceCostPolicy(estimate)

    const account = privateKeyToAccount(privateKey as `0x${string}`)

    /**
     * Auto-select the wallet-client chain from the subject name. Basename
     * writes go through the L2 resolver's `multicall(bytes[])` and need a
     * Base-connected wallet; mainnet writes use ensjs's `setRecords`, which
     * needs `addEnsContracts(mainnet)` for its address book.
     */
    let walletChain: { id: number; rpcUrls: { default: { http: readonly string[] } } }
    if (isBase) {
      walletChain = base
    } else {
      const { addEnsContracts } = await import('@ensdomains/ensjs')
      walletChain = addEnsContracts(mainnet) as unknown as typeof walletChain
    }
    const walletRpcUrl = resolveRpcUrl(
      walletChain.id,
      c.options,
      c.env as Record<string, string | undefined>,
    )
    const walletTransport = buildFallbackTransport(
      walletChain.id,
      walletRpcUrl,
      walletChain.rpcUrls.default.http,
    )
    const walletClient = createWalletClient({
      account,
      // biome-ignore lint/suspicious/noExplicitAny: viem's chain types differ between mainnet (ensjs-extended) and base
      chain: walletChain as any,
      transport: walletTransport,
    })

    const writer = metadataWriter({
      publicClient,
      ...(basePublicClient ? { basePublicClient } : {}),
    })(walletClient)
    let result: { txHash: string }
    try {
      result = await writer.setMetadata({
        name: ensName,
        records: delta.changes,
        deleted: delta.deleted,
      })
    } catch (err) {
      // The CLI pre-selects the wallet chain so this normally can't fire.
      // Defence in depth: surface the SDK's `wrong-chain` error code with
      // a friendly message instead of the raw stack.
      if (err instanceof Error && (err as Error & { code?: string }).code === 'wrong-chain') {
        throw new Error(
          `Wallet must be connected to ${isBase ? 'Base (chain 8453)' : 'mainnet'} to write to ${ensName}.`,
        )
      }
      throw err
    }

    const explorerBase = isBase ? 'https://basescan.org/tx/' : 'https://etherscan.io/tx/'

    return {
      broadcast: true,
      name: ensName,
      chain: isBase ? 'base' : 'mainnet',
      schema: schemaInfo,
      txHash: result.txHash,
      explorerUrl: `${explorerBase}${result.txHash}`,
      diff,
    }
  },
}
