import type { PublicClient } from 'viem'
import { describe, expect, it } from 'vitest'
import { baseClientForName, basePublicClientFromContext, resolveRpcUrl } from './context.js'

const BASE_CHAIN_ID = 8453

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

describe('basePublicClientFromContext', () => {
  it('returns a PublicClient on chain 8453', () => {
    const client = basePublicClientFromContext({ options: {}, env: {} })
    expect(client.chain?.id).toBe(BASE_CHAIN_ID)
  })

  it('honours RPC_URL_8453', () => {
    const client = basePublicClientFromContext({
      options: {},
      env: { RPC_URL_8453: 'https://base.env' },
    })
    expect(transportUrls(client)[0]).toBe('https://base.env')
  })

  it('falls through to ETH_RPC_URL when RPC_URL_8453 is unset', () => {
    const client = basePublicClientFromContext({
      options: {},
      env: { ETH_RPC_URL: 'https://generic.env' },
    })
    expect(transportUrls(client)[0]).toBe('https://generic.env')
  })

  it('applies --rpc when useFlagOverride: true', () => {
    const client = basePublicClientFromContext(
      { options: { rpc: 'https://flag.example' }, env: {} },
      { useFlagOverride: true },
    )
    expect(transportUrls(client)[0]).toBe('https://flag.example')
  })

  it('ignores --rpc by default (the flag belongs to the subject chain)', () => {
    const client = basePublicClientFromContext({
      options: { rpc: 'https://flag.example' },
      env: { RPC_URL_8453: 'https://base.env' },
    })
    const urls = transportUrls(client)
    expect(urls).not.toContain('https://flag.example')
    expect(urls[0]).toBe('https://base.env')
  })
})

describe('baseClientForName', () => {
  const ctx = { options: {}, env: {} }

  it('returns a Base client for *.base.eth', () => {
    const client = baseClientForName(ctx, 'alice.base.eth')
    expect(client).toBeDefined()
    expect(client?.chain?.id).toBe(BASE_CHAIN_ID)
  })

  it('returns undefined for mainnet names', () => {
    expect(baseClientForName(ctx, 'alice.eth')).toBeUndefined()
  })

  it('returns undefined for the base.eth 2LD itself', () => {
    expect(baseClientForName(ctx, 'base.eth')).toBeUndefined()
  })

  it('threads --rpc through when the subject is a Basename', () => {
    const client = baseClientForName(
      { options: { rpc: 'https://flag.example' }, env: {} },
      'alice.base.eth',
    )
    expect(client).toBeDefined()
    if (!client) throw new Error('expected a client')
    expect(transportUrls(client)[0]).toBe('https://flag.example')
  })
})
