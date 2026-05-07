import type { EstimateResult } from '@ensmetadata/sdk'
import { type EstimateGasParameters, type PublicClient, formatEther } from 'viem'

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'

/** Cached ETH/USD price with a 60-second TTL. */
let priceCache: { usd: number; ts: number } | null = null
const CACHE_TTL_MS = 60_000

export async function getEthUsdPrice(): Promise<number> {
  if (priceCache && Date.now() - priceCache.ts < CACHE_TTL_MS) {
    return priceCache.usd
  }

  const res = await fetch(COINGECKO_URL)
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status}`)

  const data = (await res.json()) as { ethereum: { usd: number } }
  const usd = data.ethereum.usd
  priceCache = { usd, ts: Date.now() }
  return usd
}

// ─── Legacy CostEstimate API (used by ERC-8004 commands) ────────────────────

export type CostEstimate = {
  gas: bigint
  maxFeePerGas: bigint
  costWei: bigint
  costEth: string
  costUsd: string
  ethUsdPrice: number
}

/**
 * Estimate the cost of an arbitrary transaction. Used by ERC-8004 callers
 * that build their own calldata. The new `set` command path consumes an
 * SDK `EstimateResult` directly via `formatEstimate`.
 */
export async function estimateCost(
  client: PublicClient,
  tx: EstimateGasParameters,
): Promise<CostEstimate> {
  const [gas, fees, ethUsdPrice] = await Promise.all([
    client.estimateGas(tx),
    client.estimateFeesPerGas(),
    getEthUsdPrice(),
  ])

  const maxFeePerGas = fees.maxFeePerGas ?? 0n
  const costWei = gas * maxFeePerGas
  const costEthNum = Number(formatEther(costWei))

  return {
    gas,
    maxFeePerGas,
    costWei,
    costEth: formatEther(costWei),
    costUsd: (costEthNum * ethUsdPrice).toFixed(2),
    ethUsdPrice,
  }
}

const MAX_COST_USD = 2

/** Pre-flight guard for a CostEstimate (legacy ERC-8004 path). */
export async function validateCost(
  client: PublicClient,
  tx: EstimateGasParameters & { account: `0x${string}` },
): Promise<CostEstimate> {
  const [est, balance] = await Promise.all([
    estimateCost(client, tx),
    client.getBalance({ address: tx.account }),
  ])

  const costUsd = Number.parseFloat(est.costUsd)

  if (costUsd > MAX_COST_USD) {
    throw new Error(
      `Estimated gas cost ${formatCost(est)} exceeds the $${MAX_COST_USD} safety limit. Aborting.`,
    )
  }

  if (balance < est.costWei) {
    const balEth = Number.parseFloat(formatEther(balance)).toFixed(6)
    throw new Error(
      `Insufficient balance: ${balEth} ETH available but transaction costs ~${formatCost(est)}. Aborting.`,
    )
  }

  return est
}

// ─── SDK EstimateResult adapters (used by the `set` command) ────────────────

export interface FormattedEstimate {
  costEth: string
  costUsd: string
  ethUsdPrice: number
  balance: string
}

/**
 * Format an SDK `EstimateResult` for human display. Pulls the live ETH/USD
 * price (cached). Returns zero values when the estimate is a no-op.
 */
export async function formatEstimate(est: EstimateResult): Promise<FormattedEstimate> {
  const balance = `${Number.parseFloat(formatEther(est.balance)).toFixed(6)} ETH`
  if (est.costWei === 0n) {
    return { costEth: '0', costUsd: '0.00', ethUsdPrice: 0, balance }
  }

  const ethUsdPrice = await getEthUsdPrice()
  const costEth = formatEther(est.costWei)
  const costEthNum = Number(costEth)

  return {
    costEth,
    costUsd: (costEthNum * ethUsdPrice).toFixed(2),
    ethUsdPrice,
    balance,
  }
}

/** One-liner for display: "$0.42 (0.00025 ETH)". Works for both legacy
 * CostEstimate and SDK-derived FormattedEstimate shapes. */
export function formatCost(input: { costEth: string; costUsd: string }): string {
  if (input.costEth === '0') return '$0.00 (0 ETH)'
  const eth = Number.parseFloat(input.costEth).toPrecision(4)
  return `$${input.costUsd} (${eth} ETH)`
}

/**
 * Pre-flight guard for an SDK `EstimateResult`. Hard-errors if estimated
 * cost exceeds $2 USD or the signer's balance cannot cover the transaction.
 */
export async function enforceCostPolicy(est: EstimateResult): Promise<FormattedEstimate> {
  const formatted = await formatEstimate(est)
  const costUsd = Number.parseFloat(formatted.costUsd)

  if (costUsd > MAX_COST_USD) {
    throw new Error(
      `Estimated gas cost ${formatCost(formatted)} exceeds the $${MAX_COST_USD} safety limit. Aborting.`,
    )
  }

  if (est.balance < est.costWei) {
    const balEth = Number.parseFloat(formatEther(est.balance)).toFixed(6)
    throw new Error(
      `Insufficient balance: ${balEth} ETH available but transaction costs ~${formatCost(formatted)}. Aborting.`,
    )
  }

  return formatted
}
