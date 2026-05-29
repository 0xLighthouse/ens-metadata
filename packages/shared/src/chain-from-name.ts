/**
 * Pick the chain that hosts an ENS name's resolver.
 *
 * With direct registry+resolver reads in the SDK, the same chain hosts
 * both reads and writes for a given name — no separate "read chain" /
 * "write chain" split is needed.
 *
 *   - `*.base.eth` → Base
 *   - everything else → mainnet
 *
 * Adding a new chain is one entry in `NAME_RULES` plus one entry in
 * `chains.ts`.
 */
import { normalize } from 'viem/ens'
import { type ChainConfig, MAINNET_CHAIN, getChainByName } from './chains'

interface NameRule {
  /** Longest-match wins. The `.` is included. */
  suffix: string
  /** Name of the chain to use for this suffix. */
  chain: ChainConfig['name']
  /** The 2LD reserved by this rule (e.g. `base.eth` itself isn't a Basename). */
  reservedSecondLevel: string
}

const NAME_RULES: readonly NameRule[] = [
  { suffix: '.base.eth', chain: 'base', reservedSecondLevel: 'base.eth' },
]

function matchRule(name: string): NameRule | null {
  const normalized = normalize(name)
  for (const rule of NAME_RULES) {
    if (normalized === rule.reservedSecondLevel) continue
    if (normalized.endsWith(rule.suffix)) return rule
  }
  return null
}

/**
 * Returns the chain that hosts the resolver for `name`. The SDK reader/
 * writer call this chain's `ensRegistry` (when set) to do direct
 * `registry.resolver(node)` → `resolver.text(node, key)` reads/writes,
 * bypassing the need for a Universal Resolver on the chain.
 */
export function chainFromName(name: string): ChainConfig {
  const rule = matchRule(name)
  if (rule) return getChainByName(rule.chain)
  return MAINNET_CHAIN
}
