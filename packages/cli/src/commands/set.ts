import { readFileSync } from 'node:fs'
import {
  type EstimateResult,
  type MetadataDelta,
  type PreparedMetadata,
  type SetMetadataOptions,
  computeDelta,
  metadataEstimator,
  metadataWriter,
} from '@ensmetadata/sdk'
import { type Address, type PublicClient, isAddress, namehash } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { z } from 'zod'
import { bundledSchemaResolver } from '../lib/bundled-schemas.js'
import { chainForName } from '../lib/chain-for-name.js'
import type { ChainConfig } from '../lib/chains.js'
import {
  globalEnv,
  globalOptions,
  publicClientForChain,
  validateName,
  walletClientForChain,
} from '../lib/context.js'
import { enforceCostPolicy, formatCost, formatEstimate } from '../lib/estimate-cost.js'
import { resolveSchemaForName } from '../lib/resolve-schema.js'

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

const BASE_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

/**
 * Look up the address authorised to set records on `ensName` directly
 * on-chain. Used as the `from` address for dry-run gas estimation when no
 * `--private-key` is supplied.
 *
 * For mainnet names this uses ensjs's `getOwner`, which transparently
 * handles the registry / registrar / NameWrapper distinction. For names
 * hosted on an L2 registry (e.g. Basenames), reads `owner(node)` directly
 * off the L2 registry declared in the chain config.
 */
export async function readEnsManager(
  ensName: string,
  mainnetClient: PublicClient,
  chain: ChainConfig,
  chainClient: PublicClient,
): Promise<Address> {
  if (chain.ensRegistry) {
    const node = namehash(ensName)
    const owner = (await chainClient.readContract({
      address: chain.ensRegistry,
      abi: BASE_REGISTRY_ABI,
      functionName: 'owner',
      args: [node],
    })) as Address
    if (!owner || owner === '0x0000000000000000000000000000000000000000') {
      throw new Error(
        `Could not determine the manager of ${ensName} on ${chain.name} (registry returned the zero address). Pass --private-key to provide a from-address explicitly.`,
      )
    }
    return owner
  }

  const { getOwner } = await import('@ensdomains/ensjs/public')
  const owner = await getOwner(mainnetClient as never, { name: ensName })
  if (!owner?.owner || !isAddress(owner.owner)) {
    throw new Error(
      `Could not determine the manager of ${ensName} on ${chain.name}. Pass --private-key to provide a from-address explicitly.`,
    )
  }
  return owner.owner as Address
}

/**
 * Convert the SDK's flat `RecordSet` changes (where `""` means delete) into
 * the CLI's `MetadataDelta` shape (changes/deleted split) used by
 * `buildPayloadDiff` and the dry-run output.
 */
function changesToDelta(changes: Record<string, string>): MetadataDelta {
  const out: MetadataDelta = { changes: {}, deleted: [] }
  for (const [key, value] of Object.entries(changes)) {
    if (value === '') out.deleted.push(key)
    else out.changes[key] = value
  }
  return out
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
     * One chain hosts both the reads and writes for `ensName`. The SDK
     * does direct registry+resolver lookups when `registry` is passed,
     * so there's no UR dependency on the chain.
     */
    const chain = chainForName(ensName)
    const client = publicClientForChain(c, chain)
    const registryOpt = chain.ensRegistry ? { registry: chain.ensRegistry } : {}

    /**
     * Resolve the schema before reading metadata: with the schema in hand
     * the SDK's `getMetadata` knows which property keys to read. The
     * cascade lets a payload-supplied URI override what's on ENS.
     */
    const payloadSchemaUri =
      typeof rawRecord.schema === 'string' && rawRecord.schema.length > 0 ? rawRecord.schema : null
    const resolved = await resolveSchemaForName({
      client,
      name: ensName,
      payloadSchemaUri,
      ...(ipfsGateway ? { gateway: ipfsGateway } : {}),
      resolver: bundledSchemaResolver,
      ...registryOpt,
    })

    /**
     * Read existing values for every payload key (and any schema-declared
     * keys) in one batched call. The SDK returns a state RecordSet (only
     * set keys present); we widen it to `string | null` here so
     * `buildPayloadDiff` and the SDK delta agree on "key currently unset".
     */
    const { metadataReader } = await import('@ensmetadata/sdk')
    const reader = metadataReader()(client)
    const payloadKeys = Array.from(new Set(Object.keys(filtered)))
    let existing: Record<string, string | null>
    try {
      const result = await reader.getMetadata({
        name: ensName,
        ...(resolved.schema ? { schema: resolved.schema } : {}),
        ...(payloadKeys.length > 0 ? { keys: payloadKeys } : {}),
        ...registryOpt,
      })
      existing = {}
      for (const key of payloadKeys) {
        existing[key] = result.properties[key] ?? null
      }
      // Include any schema-declared keys the reader returned beyond the
      // payload set so `computeDelta` can mark them for deletion if
      // `ignoreMissing: false` applies.
      for (const [key, value] of Object.entries(result.properties)) {
        if (!(key in existing)) existing[key] = value
      }
    } catch (err) {
      throw new Error(
        `Failed to read existing text records from ENS for ${ensName}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    /**
     * Resolve the from-address used for gas estimation and broadcast:
     *   - private key supplied → derive from it
     *   - otherwise            → look up the on-chain manager (ensjs for
     *                            mainnet, the L2 registry for Basenames)
     */
    const signerAddress: Address = privateKey
      ? privateKeyToAccount(privateKey as `0x${string}`).address
      : await readEnsManager(ensName, client, chain, client)
    const signerSource: 'privateKey' | 'ensManager' = privateKey ? 'privateKey' : 'ensManager'

    /**
     * Build the SetMetadata options. Threading `registry` through lets
     * the SDK do its own direct lookups for chains without a Universal
     * Resolver. We also pre-supply `existing` so the SDK doesn't re-read.
     */
    const sdkExisting: Record<string, string> = {}
    for (const [key, value] of Object.entries(existing)) {
      if (value !== null) sdkExisting[key] = value
    }
    const baseOpts: SetMetadataOptions = {
      name: ensName,
      desired: filtered,
      existing: sdkExisting,
      ...(resolved.schema ? { schema: resolved.schema } : {}),
      ...registryOpt,
    }

    const estimator = metadataEstimator({ publicClient: client })
    let estimate: EstimateResult
    try {
      estimate = await estimator.estimateSetMetadata({ ...baseOpts, account: signerAddress })
    } catch (err) {
      throw new Error(
        `Failed to estimate transaction for ${ensName}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const validation = estimate.prepared.changePreview.validation
    if (validation && !validation.success) {
      throw new Error(
        `Invalid payload (validated against schema from ${resolved.source}${resolved.uri ? `: ${resolved.uri}` : ''}):\n${validation.errors
          .map((e) => `[${e.key}] ${e.message}`)
          .join('\n')}`,
      )
    }

    const delta = changesToDelta(estimate.prepared.changePreview.changes)
    // Recompute against the CLI's nullable existing for diff bucketing —
    // the SDK's RecordSet doesn't preserve "currently null" entries.
    const diffDelta: MetadataDelta = computeDelta(existing, filtered)
    const diff = buildPayloadDiff(existing, filtered, diffDelta)
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
        chain: chain.name,
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
        chain: chain.name,
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

    await enforceCostPolicy(estimate)

    // privateKey is guaranteed non-null here by the early check above.
    const account = privateKeyToAccount(privateKey as `0x${string}`)
    const walletClient = walletClientForChain(c, chain, account)

    const writer = metadataWriter({ publicClient: client })(walletClient)
    const prepared: PreparedMetadata = estimate.prepared
    const result = await writer.setPreparedMetadata(prepared)

    return {
      broadcast: true,
      name: ensName,
      chain: chain.name,
      schema: schemaInfo,
      txHash: result.txHash,
      explorerUrl: `${chain.explorerTxBase}${result.txHash}`,
      diff,
    }
  },
}
