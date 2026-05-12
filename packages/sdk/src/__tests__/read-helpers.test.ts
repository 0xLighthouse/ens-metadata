import type { PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { getResolverAddress, getResolverAddressStrict } from '../write'

function makeClient(overrides: {
  getEnsResolver?: (args: { name: string }) => Promise<unknown>
}) {
  return {
    getEnsResolver: overrides.getEnsResolver,
  } as unknown as PublicClient
}

describe('getResolverAddress (lenient)', () => {
  it('returns the address when present', async () => {
    const client = makeClient({
      getEnsResolver: async () => '0x1111111111111111111111111111111111111111',
    })
    const out = await getResolverAddress({ client, name: 'myagent.eth' })
    expect(out).toBe('0x1111111111111111111111111111111111111111')
  })

  it('returns null when the lookup fails', async () => {
    const client = makeClient({
      getEnsResolver: async () => {
        throw new Error('RPC error')
      },
    })
    const out = await getResolverAddress({ client, name: 'myagent.eth' })
    expect(out).toBeNull()
  })

  it('returns null when no resolver is set', async () => {
    const client = makeClient({
      getEnsResolver: async () => null,
    })
    const out = await getResolverAddress({ client, name: 'myagent.eth' })
    expect(out).toBeNull()
  })

  it('handles object-shaped resolver result', async () => {
    const client = makeClient({
      getEnsResolver: async () => ({ address: '0x2222222222222222222222222222222222222222' }),
    })
    const out = await getResolverAddress({ client, name: 'myagent.eth' })
    expect(out).toBe('0x2222222222222222222222222222222222222222')
  })
})

describe('getResolverAddressStrict', () => {
  it('returns the address when present', async () => {
    const client = makeClient({
      getEnsResolver: async () => '0x1111111111111111111111111111111111111111',
    })
    const out = await getResolverAddressStrict({ client, name: 'myagent.eth' })
    expect(out).toBe('0x1111111111111111111111111111111111111111')
  })

  it('throws when no resolver is set', async () => {
    const client = makeClient({
      getEnsResolver: async () => null,
    })
    await expect(getResolverAddressStrict({ client, name: 'myagent.eth' })).rejects.toThrow(
      /No resolver found/,
    )
  })

  it('propagates the underlying RPC error', async () => {
    const client = makeClient({
      getEnsResolver: async () => {
        throw new Error('boom')
      },
    })
    await expect(getResolverAddressStrict({ client, name: 'myagent.eth' })).rejects.toThrow(/boom/)
  })
})

// Sanity: vi import is required to keep vitest config happy when no mocks fire.
void vi
