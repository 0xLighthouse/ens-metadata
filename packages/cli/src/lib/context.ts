/**
 * Shared CLI context: option/env schemas, client factory, name normalization.
 *
 * Patterns adapted from gskril/ens-cli — same shape (globalOptions, globalEnv,
 * clientFromContext, validateName) so commands sourced from there drop in
 * with minimal adaptation.
 */
import { http, type PublicClient, createPublicClient, fallback } from 'viem'
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
 * For commands that operate on a specific chain (registry/*) — extends
 * globalOptions with `--chain`. Replaces the older `--chain-name` flag.
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
 *   2. `RPC_URL_<chainId>` (per-chain — declared common ones via c.env;
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

// ─── Public RPC fallbacks ───────────────────────────────────────────────────

/**
 * Curated supplemental RPCs per chain. Used after the user's `--rpc`/env
 * value (if any) and before viem's built-in chain defaults. Covers the
 * common case where viem's default (e.g. Cloudflare for mainnet) is too
 * rate-limited for batched universal-resolver reads.
 */
const SUPPLEMENTAL_RPCS: Record<number, string[]> = {
  1: ['https://ethereum-rpc.publicnode.com', 'https://1rpc.io/eth'],
  11155111: ['https://1rpc.io/sepolia', 'https://ethereum-sepolia-rpc.publicnode.com'],
}

// ─── Context type + client factory ──────────────────────────────────────────

export type Context = {
  options: { rpc?: string; chain?: string; universalResolver?: string }
  env: Partial<z.infer<typeof globalEnv>>
}

/**
 * Build a fallback transport stack: user-supplied RPC → supplemental
 * curated URLs → chain's viem defaults. Suitable for both PublicClient
 * and WalletClient.
 */
export function buildFallbackTransport(
  chainId: number,
  rpcUrl?: string,
  defaultRpcs?: readonly string[],
) {
  const supplemental = SUPPLEMENTAL_RPCS[chainId] ?? []
  return fallback([
    ...(rpcUrl ? [http(rpcUrl)] : []),
    ...supplemental.map((url) => http(url)),
    ...(defaultRpcs ?? []).map((url) => http(url)),
  ])
}

/**
 * Build a viem PublicClient from the merged context, preferring the user's
 * RPC, falling through curated supplementals, then viem's built-in defaults.
 */
export function clientFromContext(
  c: Context,
  chainName?: string,
): {
  client: PublicClient
  chain: ReturnType<typeof resolveChain>['chain']
  registryAddress: ReturnType<typeof resolveChain>['registryAddress']
} {
  const { chain, registryAddress } = resolveChain(chainName ?? c.options.chain ?? 'mainnet')
  const rpc = resolveRpcUrl(chain.id, c.options, c.env as Record<string, string | undefined>)
  const transport = buildFallbackTransport(chain.id, rpc, chain.rpcUrls.default.http)
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
