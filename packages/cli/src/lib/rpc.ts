/**
 * Resolve the RPC URL for a chain, applying flag → env conventions.
 *
 * Precedence:
 *   1. `--rpc <url>` flag
 *   2. `RPC_URL_<chainId>` (per-chain, e.g. RPC_URL_1, RPC_URL_8453)
 *   3. `MAINNET_RPC_URL` (chainId 1 only)
 *   4. `ETH_RPC_URL` (Foundry-style, applies to any chain)
 *   5. undefined → viem falls back to its built-in default
 */
export function resolveRpcUrl(
  chainId: number,
  options: { rpc?: string | undefined },
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (options.rpc) return options.rpc
  const perChainKey = `RPC_URL_${chainId}`
  if (env[perChainKey]) return env[perChainKey]
  if (chainId === 1 && env.MAINNET_RPC_URL) return env.MAINNET_RPC_URL
  if (env.ETH_RPC_URL) return env.ETH_RPC_URL
  return undefined
}

export const RPC_OPTION_DESCRIPTION =
  'RPC URL override. Falls back to RPC_URL_<chainId>, MAINNET_RPC_URL (mainnet), ETH_RPC_URL.'
