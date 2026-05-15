import type { PublicClient } from 'viem'
import { describe, expect, it } from 'vitest'
import { getChainByName } from '../lib/chains.js'
import { publicClientForChain, publicClientForName, resolveRpcUrl } from '../lib/context.js'

const BASE_CHAIN_ID = 8453
const MAINNET_CHAIN_ID = 1

/**
 * Inspect the URLs configured on a viem fallback transport. Returns them in
 * order so tests can assert which one the user-supplied RPC ends up at.
 */
function transportUrls(client: PublicClient): string[] {
  const transports = (
    client.transport as unknown as {
      transports?: Array<{ value?: { url?: string } }>
    }
  ).transports
  return (transports ?? []).map((t) => t.value?.url).filter((u): u is string => Boolean(u))
}

describe('resolveRpcUrl (chain 8453)', () => {
  it('returns the per-chain env when no flag is set', () => {
    const url = resolveRpcUrl(BASE_CHAIN_ID, {}, { RPC_URL_8453: 'https://base.env' })
    expect(url).toBe('https://base.env')
  })

  it('falls back to ETH_RPC_URL when RPC_URL_8453 is unset', () => {
    const url = resolveRpcUrl(BASE_CHAIN_ID, {}, { ETH_RPC_URL: 'https://generic.env' })
    expect(url).toBe('https://generic.env')
  })

  it('returns undefined when nothing is set', () => {
    expect(resolveRpcUrl(BASE_CHAIN_ID, {}, {})).toBeUndefined()
  })

  it('prefers --rpc over per-chain env', () => {
    const url = resolveRpcUrl(
      BASE_CHAIN_ID,
      { rpc: 'https://flag' },
      { RPC_URL_8453: 'https://base.env' },
    )
    expect(url).toBe('https://flag')
  })
})

describe('publicClientForChain', () => {
  const baseChain = getChainByName('base')

  it('returns a PublicClient on chain 8453 for the Base config', () => {
    const client = publicClientForChain({ options: {}, env: {} }, baseChain)
    expect(client.chain?.id).toBe(BASE_CHAIN_ID)
  })

  it('honours RPC_URL_8453', () => {
    const client = publicClientForChain(
      { options: {}, env: { RPC_URL_8453: 'https://base.env' } },
      baseChain,
    )
    expect(transportUrls(client)[0]).toBe('https://base.env')
  })

  it('applies --rpc by default', () => {
    const client = publicClientForChain({ options: { rpc: 'https://flag' }, env: {} }, baseChain)
    expect(transportUrls(client)[0]).toBe('https://flag')
  })
})

describe('publicClientForName', () => {
  const ctx = { options: {}, env: {} }

  it('returns a mainnet client for mainnet names', () => {
    const { client, chain } = publicClientForName(ctx, 'alice.eth')
    expect(client.chain?.id).toBe(MAINNET_CHAIN_ID)
    expect(chain.name).toBe('mainnet')
  })

  it('returns a Base client for *.base.eth (direct L2 reads)', () => {
    const { client, chain } = publicClientForName(ctx, 'alice.base.eth')
    expect(client.chain?.id).toBe(BASE_CHAIN_ID)
    expect(chain.name).toBe('base')
  })

  it('threads --rpc through to the read client', () => {
    const { client } = publicClientForName(
      { options: { rpc: 'https://flag.example' }, env: {} },
      'alice.eth',
    )
    expect(transportUrls(client)[0]).toBe('https://flag.example')
  })
})
