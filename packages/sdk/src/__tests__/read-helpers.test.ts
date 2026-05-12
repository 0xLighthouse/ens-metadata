import type { PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import {
  getResolverAddress,
  getResolverAddressStrict,
  readTextRecords,
  readTextRecordsStrict,
} from '../read'

function makeClient(overrides: {
  getEnsText?: (args: { name: string; key: string }) => Promise<unknown>
  getEnsResolver?: (args: { name: string }) => Promise<unknown>
}) {
  return {
    getEnsText: overrides.getEnsText,
    getEnsResolver: overrides.getEnsResolver,
  } as unknown as PublicClient
}

describe('readTextRecords (lenient)', () => {
  it('returns values for set keys and null for unset', async () => {
    const client = makeClient({
      getEnsText: async ({ key }) => {
        if (key === 'description') return 'hello'
        if (key === 'avatar') return ''
        return null
      },
    })
    const out = await readTextRecords({
      client,
      name: 'myagent.eth',
      keys: ['description', 'avatar', 'url'],
    })
    expect(out).toEqual({ description: 'hello', avatar: null, url: null })
  })

  it('swallows per-key errors and returns null', async () => {
    const client = makeClient({
      getEnsText: async ({ key }) => {
        if (key === 'description') return 'hello'
        throw new Error('RPC failure')
      },
    })
    const out = await readTextRecords({
      client,
      name: 'myagent.eth',
      keys: ['description', 'avatar'],
    })
    expect(out).toEqual({ description: 'hello', avatar: null })
  })
})

describe('readTextRecordsStrict', () => {
  it('reads each key in parallel and returns a map', async () => {
    const seen: string[] = []
    const client = makeClient({
      getEnsText: async ({ key }) => {
        seen.push(key)
        if (key === 'description') return 'hello'
        if (key === 'avatar') return 'ipfs://avatar'
        return null
      },
    })
    const out = await readTextRecordsStrict({
      client,
      name: 'myagent.eth',
      keys: ['description', 'avatar', 'url'],
    })
    expect(out).toEqual({ description: 'hello', avatar: 'ipfs://avatar', url: null })
    expect(seen.sort()).toEqual(['avatar', 'description', 'url'])
  })

  it('normalises empty strings to null', async () => {
    const client = makeClient({
      getEnsText: async ({ key }) => (key === 'description' ? '' : null),
    })
    const out = await readTextRecordsStrict({
      client,
      name: 'myagent.eth',
      keys: ['description'],
    })
    expect(out).toEqual({ description: null })
  })

  it('propagates the first RPC error rather than silently dropping it', async () => {
    const client = makeClient({
      getEnsText: async () => {
        throw new Error('RPC 500 boom')
      },
    })
    await expect(
      readTextRecordsStrict({
        client,
        name: 'myagent.eth',
        keys: ['description'],
      }),
    ).rejects.toThrow(/RPC 500 boom/)
  })
})

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
