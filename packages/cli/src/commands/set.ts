import { readFileSync } from 'node:fs'
import type { Schema } from '@ensmetadata/schemas/types'
import {
  type ChangePreview,
  type SetMetadataOptions,
  fetchSchema,
  flatten,
  metadataEstimator,
  metadataReader,
  metadataWriter,
} from '@ensmetadata/sdk'
import { chainForName } from '@ensmetadata/shared/chain-for-name'
import type { ChainConfig } from '@ensmetadata/shared/chains'
import { type Address, type PublicClient, isAddress, namehash } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { z } from 'zod'
import { bundledSchemaResolver } from '../lib/bundled-schemas.js'
import {
  globalEnv,
  globalOptions,
  publicClientForChain,
  validateName,
  walletClientForChain,
} from '../lib/context.js'
import { formatCost, formatEstimate } from '../lib/estimate-cost.js'
import { assertNestedPayload } from '../lib/shape.js'

/**
 * `set` and `update` share an option schema. They differ only in semantics
 * (PUT vs PATCH), wired through the `mode` arg passed to `runSetOrUpdate`.
 */
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
    .default(true)
    .describe(
      'Keep payload entries whose value is an empty string (used to delete records). Set --include-empty=false to drop empty entries before submitting.',
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
 * `set` is PUT semantics — the payload is the complete snapshot. Keys present
 * on-chain but missing from the payload are deleted.
 * `update` is PATCH semantics — only the keys in the payload are touched.
 */
type SetMode = 'set' | 'update'

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
 * Bucket the desired payload using the SDK's `ChangePreview`. `existing` is
 * the state RecordSet pre-publish (no `null`s — keys absent from `existing`
 * are simply unset). `changes` is broadcast-ready (`""` = delete).
 *
 *   - `changes[key]` present, key not in `existing` → added
 *   - `changes[key]` present, key in `existing`      → updated / deleted (by value)
 *   - key in `desired` not in `changes`              → unchanged (skipped if empty)
 */
export function buildPayloadDiff(
  desired: Record<string, string>,
  changePreview: Pick<ChangePreview, 'existing' | 'changes'>,
): PayloadDiff {
  const diff: PayloadDiff = { added: [], updated: [], deleted: [], unchanged: [] }
  const existing = changePreview.existing ?? {}
  const changes = changePreview.changes

  for (const [key, value] of Object.entries(desired)) {
    if (Object.prototype.hasOwnProperty.call(changes, key)) {
      const next = changes[key]
      const orig = existing[key]
      if (next === '') {
        diff.deleted.push({ key, from: orig ?? '' })
      } else if (orig === undefined || orig === '') {
        diff.added.push({ key, value: next })
      } else {
        diff.updated.push({ key, from: orig, to: next })
      }
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
export async function resolveEnsManager(
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

async function runSetOrUpdate(
  ctx: {
    args: { name: string; payload: string }
    options: z.infer<typeof setOptions>
    env: z.infer<typeof setEnv>
  },
  mode: SetMode,
) {
  const ensName = validateName(ctx.args.name)
  const { privateKey, broadcast, includeEmpty } = ctx.options
  const ipfsGateway = ctx.options.ipfsGateway ?? ctx.env.IPFS_GATEWAY

  if (broadcast && !privateKey) {
    throw new Error('--private-key is required when --broadcast is set.')
  }

  const raw: unknown = JSON.parse(readFileSync(ctx.args.payload, 'utf8'))
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Payload must be a JSON object.')
  }
  const rawRecord = raw as Record<string, unknown>

  /**
   * One chain hosts both the reads and writes for `ensName`. The SDK
   * does direct registry+resolver lookups when `registry` is passed,
   * so there's no UR dependency on the chain.
   */
  const chain = chainForName(ensName)
  const client = publicClientForChain(ctx, chain)
  const registryOpt = chain.ensRegistry ? { registry: chain.ensRegistry } : {}

  /**
   * Resolve the schema before flattening, since the shape validator needs
   * it to know which top-level keys may be arrays. The payload's own
   * `schema` URI wins (the user is publishing against it); otherwise fall
   * back to the on-chain `schema` text record. When neither is available
   * we proceed with `null` — the shape validator will reject array values
   * (since we can't know which keys are arrays) but plain string payloads
   * still go through.
   */
  const payloadSchemaUri =
    typeof rawRecord.schema === 'string' && rawRecord.schema.length > 0 ? rawRecord.schema : null
  let resolvedSchema: Schema | null = null
  if (payloadSchemaUri) {
    resolvedSchema = await fetchSchema(payloadSchemaUri, {
      resolver: bundledSchemaResolver,
      ...(ipfsGateway ? { ipfsGateway } : {}),
    })
  } else {
    const reader = metadataReader({
      schemaResolver: bundledSchemaResolver,
      ...(ipfsGateway ? { ipfsGateway } : {}),
    })(client)
    const onChain = await reader.getSchema({ name: ensName, ...registryOpt })
    resolvedSchema = onChain.schema
  }

  const hydrated = assertNestedPayload(rawRecord, resolvedSchema)
  const flatPayload = flatten(hydrated)
  const filtered = filterPayloadEntries(flatPayload, { includeEmpty })

  /**
   * `set` = PUT (ignoreMissing: false → keys absent from payload get
   * deleted). `update` = PATCH (ignoreMissing: true → absent keys left
   * alone).
   */
  const baseOpts: SetMetadataOptions = {
    name: ensName,
    desired: filtered,
    ignoreMissing: mode === 'update',
    schemaResolver: bundledSchemaResolver,
    ...(resolvedSchema ? { schema: resolvedSchema } : {}),
    ...(ipfsGateway ? { ipfsGateway } : {}),
    ...registryOpt,
  }

  if (broadcast) {
    // privateKey is guaranteed non-null here by the early check above.
    const account = privateKeyToAccount(privateKey as `0x${string}`)
    const walletClient = walletClientForChain(ctx, chain, account)
    const writer = metadataWriter({
      publicClient: client,
      schemaResolver: bundledSchemaResolver,
      ...(ipfsGateway ? { ipfsGateway } : {}),
    })(walletClient)
    const result = await writer.setMetadata(baseOpts)
    return {
      mode,
      broadcast: true,
      name: ensName,
      chain: chain.name,
      txHash: result.txHash,
      explorerUrl: `${chain.explorerTxBase}${result.txHash}`,
      txPayload: result.texts,
    }
  }

  /**
   * Dry-run path: resolve a from-address for gas estimation. With
   * `--private-key` we derive it; otherwise we look up the on-chain
   * manager (ensjs for mainnet, the L2 registry for Basenames).
   */
  const signerAddress: Address = privateKey
    ? privateKeyToAccount(privateKey as `0x${string}`).address
    : await resolveEnsManager(ensName, client, chain, client)
  const signerSource: 'privateKey' | 'ensManager' = privateKey ? 'privateKey' : 'ensManager'

  const estimator = metadataEstimator({
    publicClient: client,
    schemaResolver: bundledSchemaResolver,
    ...(ipfsGateway ? { ipfsGateway } : {}),
  })
  const estimate = await estimator.estimateSetMetadata({
    ...baseOpts,
    account: signerAddress,
  })

  const { existing, changes, validation } = estimate.prepared.changePreview
  const existingState: Record<string, string> = existing ?? {}

  /**
   * Recover the schema URI used for validation. When the payload
   * supplied one we know it directly; otherwise it's whatever was set
   * on-chain (surfaced via the SDK's `existing` state).
   */
  const schemaUri = payloadSchemaUri ?? existingState.schema ?? null
  const schemaInfo = {
    source: payloadSchemaUri
      ? ('payload' as const)
      : schemaUri
        ? ('ens' as const)
        : ('none' as const),
    uri: schemaUri,
    validated: validation !== null,
  }

  if (validation && !validation.success) {
    throw new Error(
      `Invalid payload (validated against schema from ${schemaInfo.source}${schemaUri ? `: ${schemaUri}` : ''}):\n${validation.errors
        .map((e) => `[${e.key}] ${e.message}`)
        .join('\n')}`,
    )
  }

  const diff = buildPayloadDiff(filtered, { existing: existingState, changes })
  const texts = Object.entries(changes).map(([key, value]) => ({ key, value }))

  if (texts.length === 0) {
    const hint =
      Object.keys(filtered).length === 0
        ? 'The payload contained no entries.'
        : 'All values in the payload already match the existing ENS records.'
    return {
      mode,
      dryRun: true,
      name: ensName,
      chain: chain.name,
      schema: schemaInfo,
      noOp: true,
      diff,
      hint,
    }
  }

  let formatted: Awaited<ReturnType<typeof formatEstimate>> | null = null
  try {
    formatted = await formatEstimate(estimate)
  } catch {
    // estimate is best-effort
  }
  return {
    mode,
    dryRun: true,
    name: ensName,
    chain: chain.name,
    schema: schemaInfo,
    signer: { address: signerAddress, source: signerSource },
    txPayload: texts,
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

const sharedArgs = z.object({
  name: z.string().describe('ENS name (e.g. myagent.eth)'),
  payload: z.string().describe('Path to payload.json'),
})

export const setCommand = {
  description:
    'Set ENS metadata text records from a payload file (PUT — payload is a complete snapshot; keys absent from the payload are deleted).',
  args: sharedArgs,
  options: setOptions,
  env: setEnv,
  async run(ctx: {
    args: { name: string; payload: string }
    options: z.infer<typeof setOptions>
    env: z.infer<typeof setEnv>
  }) {
    return runSetOrUpdate(ctx, 'set')
  },
}

export const updateCommand = {
  description:
    'Update ENS metadata text records from a partial payload file (PATCH — only keys present in the payload are touched; empty-string values delete the record; for an array field, pass `[""]` to clear it — `[]` leaves the existing array alone).',
  args: sharedArgs,
  options: setOptions,
  env: setEnv,
  async run(ctx: {
    args: { name: string; payload: string }
    options: z.infer<typeof setOptions>
    env: z.infer<typeof setEnv>
  }) {
    return runSetOrUpdate(ctx, 'update')
  },
}
