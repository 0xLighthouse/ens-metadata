import { chainForName } from '@ensmetadata/shared/chain-for-name'
import type { ChainConfig } from '@ensmetadata/shared/chains'
/**
 * Shared CLI context: option/env schemas, client factories, name normalization.
 * *
 *   - ENS commands (view/set/attestation verify) auto-select their chain
 *     from the subject name via `lib/chain-for-name.ts` + `lib/chains.ts`.
 *     They use `publicClientForChain` / `publicClientForName` /
 *     `walletClientForChain`. Each command touches a single chain;
 *     `--rpc` always binds to that chain.
 *
 */
import {
  http,
  type Account,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  fallback,
} from 'viem'
import { normalize } from 'viem/ens'
import { z } from 'zod'
import { SUPPORTED_CHAINS, resolveChain } from './registry.js'

// ─── Option schemas ─────────────────────────────────────────────────────────

const RPC_DESCRIPTION =
  'RPC URL override. Falls back to RPC_URL_<chainId>, MAINNET_RPC_URL (mainnet), ETH_RPC_URL.'

/**
 * Cross-cutting options every command may want — RPC override and an
 * optional Universal Resolver address (for ENS-aware operations).
 */
export const globalOptions = z.object({
  rpc: z.string().optional().describe(RPC_DESCRIPTION),
  universalResolver: z.string().optional().describe('Custom Universal Resolver contract address'),
})

/**
 * For ERC-8004 agent commands that operate on a specific chain — extends
 * globalOptions with `--chain`. Not used by ENS commands (those auto-pick
 * the chain from the subject name).
 */
export const chainAwareOptions = globalOptions.extend({
  chain: z
    .enum(SUPPORTED_CHAINS)
    .default('mainnet')
    .describe('Chain name (e.g. mainnet, base, arbitrum, optimism)'),
})

// ─── Env schema ─────────────────────────────────────────────────────────────

/**
 * Pre-declared so they show up in incur's `--help`. The dynamic per-chain
 * fallback (`RPC_URL_<chainId>`) still works for chains not listed here via
 * direct process.env lookup in `resolveRpcUrl`.
 */
export const globalEnv = z.object({
  ETH_RPC_URL: z.string().optional().describe('Generic Ethereum RPC URL (any chain)'),
  MAINNET_RPC_URL: z.string().optional().describe('Mainnet RPC URL (chainId 1)'),
  RPC_URL_1: z.string().optional().describe('Mainnet RPC URL (chainId 1)'),
  RPC_URL_11155111: z.string().optional().describe('Sepolia RPC URL'),
  RPC_URL_8453: z.string().optional().describe('Base RPC URL'),
  RPC_URL_84532: z.string().optional().describe('Base Sepolia RPC URL'),
  RPC_URL_10: z.string().optional().describe('Optimism RPC URL'),
  RPC_URL_42161: z.string().optional().describe('Arbitrum RPC URL'),
})

// ─── RPC resolver ───────────────────────────────────────────────────────────

/**
 * Resolve the RPC URL for a chain, applying flag → env conventions.
 *
 * Precedence:
 *   1. `--rpc <url>` flag
 *   2. `RPC_URL_<chainId>` (per-chain — declared common ones via ctx.env;
 *      others fall through to process.env)
 *   3. `MAINNET_RPC_URL` (chainId 1 only)
 *   4. `ETH_RPC_URL` (any chain)
 *   5. undefined → caller falls back to viem defaults / supplemental list
 */
export function resolveRpcUrl(
  chainId: number,
  options: { rpc?: string | undefined },
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  if (options.rpc) return options.rpc
  const perChainKey = `RPC_URL_${chainId}`
  if (env[perChainKey]) return env[perChainKey]
  if (chainId === 1 && env.MAINNET_RPC_URL) return env.MAINNET_RPC_URL
  if (env.ETH_RPC_URL) return env.ETH_RPC_URL
  return undefined
}

// ─── Context type + transport helpers ───────────────────────────────────────

export type Context = {
  options: { rpc?: string; chain?: string; universalResolver?: string }
  env: Partial<z.infer<typeof globalEnv>>
}

/**
 * Build a fallback transport stack: user-supplied RPC → chain's curated
 * defaults → viem's built-in defaults. Suitable for both PublicClient
 * and WalletClient. All fields are optional — omitted tiers contribute
 * nothing to the fallback chain.
 */
export function buildFallbackTransport(opts: {
  rpcUrl?: string
  curatedDefaults?: readonly string[]
  viemDefaults?: readonly string[]
}) {
  const { rpcUrl, curatedDefaults = [], viemDefaults = [] } = opts
  return fallback([
    ...(rpcUrl ? [http(rpcUrl)] : []),
    ...curatedDefaults.map((url) => http(url)),
    ...viemDefaults.map((url) => http(url)),
  ])
}

// ─── ENS-aware chain dispatch (uses lib/chains.ts) ──────────────────────────

/**
 * Build a viem PublicClient for `chain`. RPC URL resolves via
 * `resolveRpcUrl(chain.id, ...)` so each chain reads its own env override
 * (`RPC_URL_<id>`) and falls back to the chain's curated defaults.
 */
export function publicClientForChain(ctx: Context, chain: ChainConfig): PublicClient {
  const rpc = resolveRpcUrl(chain.id, ctx.options, ctx.env as Record<string, string | undefined>)
  const transport = buildFallbackTransport({
    rpcUrl: rpc,
    curatedDefaults: chain.rpcDefaults,
    viemDefaults: chain.viemChain.rpcUrls.default.http,
  })
  return createPublicClient({ chain: chain.viemChain, transport }) as PublicClient
}

/**
 * Build a PublicClient for the chain that hosts `name`'s resolver. With
 * direct registry reads in the SDK, the same chain serves both reads
 * and writes — no read/write split needed.
 */
export function publicClientForName(
  ctx: Context,
  name: string,
): { client: PublicClient; chain: ChainConfig } {
  const chain = chainForName(name)
  return { client: publicClientForChain(ctx, chain), chain }
}

/**
 * Build a WalletClient on `chain` for `account`. `--rpc` binds to this client.
 */
export function walletClientForChain(
  ctx: Context,
  chain: ChainConfig,
  account: Account,
): WalletClient {
  const rpc = resolveRpcUrl(chain.id, ctx.options, ctx.env as Record<string, string | undefined>)
  const transport = buildFallbackTransport({
    rpcUrl: rpc,
    curatedDefaults: chain.rpcDefaults,
    viemDefaults: chain.viemChain.rpcUrls.default.http,
  })
  return createWalletClient({ account, chain: chain.viemChain, transport })
}

// ─── ERC-8004 chain dispatch (uses lib/registry.ts) ─────────────────────────

/**
 * Build a viem PublicClient from the merged context, preferring the user's
 * RPC, falling through curated supplementals, then viem's built-in defaults.
 *
 * Used by ERC-8004 agent commands that take an explicit `--chain` flag.
 * ENS commands should use `publicClientForName` instead.
 */
export function clientFromContext(
  ctx: Context,
  chainName?: string,
): {
  client: PublicClient
  chain: ReturnType<typeof resolveChain>['chain']
  registryAddress: ReturnType<typeof resolveChain>['registryAddress']
} {
  const { chain, registryAddress } = resolveChain(chainName ?? ctx.options.chain ?? 'mainnet')
  const rpc = resolveRpcUrl(chain.id, ctx.options, ctx.env as Record<string, string | undefined>)
  const transport = buildFallbackTransport({
    rpcUrl: rpc,
    viemDefaults: chain.rpcUrls.default.http,
  })
  const client = createPublicClient({ chain, transport })
  return { client, chain, registryAddress }
}

// ─── Name normalization ─────────────────────────────────────────────────────

/**
 * Validate and normalize an ENS name (ENSIP-15). Throws on empty, malformed,
 * or non-fully-qualified names.
 */
export function validateName(name: string): string {
  if (!name || !name.trim()) {
    throw new Error('Name cannot be empty.')
  }
  let normalized: string
  try {
    normalized = normalize(name)
  } catch {
    throw new Error(`Invalid ENS name: "${name}". Could not normalize name.`)
  }
  if (!normalized.includes('.')) {
    throw new Error(
      `Invalid ENS name: "${normalized}". Expected a fully qualified name (e.g. name.eth).`,
    )
  }
  return normalized
}
