import type { Schema } from '@ensmetadata/schemas/types'
import type { ChainConfig } from '@ensmetadata/shared/chains'
import type { PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getOwnerMock = vi.fn()
const readContractMock = vi.fn()
const readFileSyncMock = vi.fn<(path: string, enc: string) => string>()
const fetchSchemaMock = vi.fn()
const publicClientForChainMock = vi.fn()

vi.mock('node:fs', () => ({
  readFileSync: (path: string, enc: string) => readFileSyncMock(path, enc),
}))

vi.mock('@ensmetadata/sdk', async () => {
  const actual = await vi.importActual<typeof import('@ensmetadata/sdk')>('@ensmetadata/sdk')
  return {
    ...actual,
    fetchSchema: (...args: unknown[]) => fetchSchemaMock(...args),
  }
})

vi.mock('../lib/context.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/context.js')>('../lib/context.js')
  return {
    ...actual,
    publicClientForChain: (...args: unknown[]) => {
      publicClientForChainMock(...args)
      return {} as unknown as PublicClient
    },
  }
})

vi.mock('../lib/bundled-schemas.js', () => ({
  bundledSchemaResolver: vi.fn(async () => null),
}))

/**
 * Mock ensjs's `getOwner` (used for mainnet manager lookup). The dynamic
 * import in `set.ts` resolves to this mocked module.
 */
vi.mock('@ensdomains/ensjs/public', () => ({
  getOwner: (client: unknown, opts: { name: string }) => getOwnerMock(client, opts),
}))

import {
  buildPayloadDiff,
  filterPayloadEntries,
  resolveEnsManager,
  setCommand,
  updateCommand,
} from '../commands/set.js'

const STUB_CLIENT = {} as unknown as PublicClient

const MAINNET_CHAIN: ChainConfig = {
  id: 1,
  name: 'mainnet',
  // biome-ignore lint/suspicious/noExplicitAny: stub
  viemChain: {} as any,
  rpcDefaults: [],
  explorerTxBase: 'https://etherscan.io/tx/',
}

const BASE_CHAIN: ChainConfig = {
  id: 8453,
  name: 'base',
  // biome-ignore lint/suspicious/noExplicitAny: stub
  viemChain: {} as any,
  rpcDefaults: [],
  explorerTxBase: 'https://basescan.org/tx/',
  ensRegistry: '0xb94704422c2a1e396835a571837aa5ae53285a95',
}

const baseClientWithReadContract = (result: unknown): PublicClient =>
  ({
    readContract: (...args: unknown[]) => readContractMock(...args).then(() => result),
  }) as unknown as PublicClient

describe('filterPayloadEntries', () => {
  it('drops empty-string values by default', () => {
    const out = filterPayloadEntries(
      { class: 'Agent', schema: 'ipfs://x', alias: '', description: 'hello' },
      { includeEmpty: false },
    )
    expect(out).toEqual({ class: 'Agent', schema: 'ipfs://x', description: 'hello' })
  })

  it('keeps empty-string values when includeEmpty is true', () => {
    const out = filterPayloadEntries({ class: 'Agent', alias: '' }, { includeEmpty: true })
    expect(out).toEqual({ class: 'Agent', alias: '' })
  })

  it('skips non-string values', () => {
    const out = filterPayloadEntries(
      { class: 'Agent', count: 42 as unknown as string, flag: true as unknown as string },
      { includeEmpty: false },
    )
    expect(out).toEqual({ class: 'Agent' })
  })
})

describe('readEnsManager (on-chain)', () => {
  beforeEach(() => {
    getOwnerMock.mockReset()
    readContractMock.mockReset()
  })

  it('resolves mainnet names via ensjs getOwner', async () => {
    getOwnerMock.mockResolvedValue({ owner: '0x1111111111111111111111111111111111111111' })
    const manager = await resolveEnsManager('myagent.eth', STUB_CLIENT, MAINNET_CHAIN, STUB_CLIENT)
    expect(manager).toBe('0x1111111111111111111111111111111111111111')
    expect(getOwnerMock).toHaveBeenCalledWith(STUB_CLIENT, { name: 'myagent.eth' })
    expect(readContractMock).not.toHaveBeenCalled()
  })

  it('resolves Basenames via the Base registry contract', async () => {
    readContractMock.mockResolvedValue(undefined)
    const writeClient = baseClientWithReadContract('0x2222222222222222222222222222222222222222')
    const manager = await resolveEnsManager('alice.base.eth', STUB_CLIENT, BASE_CHAIN, writeClient)
    expect(manager).toBe('0x2222222222222222222222222222222222222222')
    expect(readContractMock).toHaveBeenCalledTimes(1)
    expect(readContractMock.mock.calls[0][0]).toMatchObject({
      address: BASE_CHAIN.ensRegistry,
      functionName: 'owner',
    })
    expect(getOwnerMock).not.toHaveBeenCalled()
  })

  it('hard-fails when the Base registry returns the zero address', async () => {
    readContractMock.mockResolvedValue(undefined)
    const writeClient = baseClientWithReadContract('0x0000000000000000000000000000000000000000')
    await expect(
      resolveEnsManager('alice.base.eth', STUB_CLIENT, BASE_CHAIN, writeClient),
    ).rejects.toThrow(/Could not determine the manager of alice\.base\.eth on base/)
  })

  it('hard-fails when ensjs returns no owner for a mainnet name', async () => {
    getOwnerMock.mockResolvedValue({ owner: undefined })
    await expect(
      resolveEnsManager('myagent.eth', STUB_CLIENT, MAINNET_CHAIN, STUB_CLIENT),
    ).rejects.toThrow(/Could not determine the manager of myagent\.eth on mainnet/)
  })

  it('hard-fails when ensjs returns a non-address owner', async () => {
    getOwnerMock.mockResolvedValue({ owner: 'not-an-address' })
    await expect(
      resolveEnsManager('myagent.eth', STUB_CLIENT, MAINNET_CHAIN, STUB_CLIENT),
    ).rejects.toThrow(/Could not determine the manager of myagent\.eth on mainnet/)
  })
})

describe('setCommand.run — broadcast guard', () => {
  it('throws when --broadcast is set without --private-key', async () => {
    await expect(
      setCommand.run({
        args: { name: 'myagent.eth', payload: '/tmp/never-read.json' },
        options: { broadcast: true, includeEmpty: true },
        env: {},
      }),
    ).rejects.toThrow(/--private-key is required when --broadcast is set/)
  })
})

describe('updateCommand.run — broadcast guard', () => {
  it('throws when --broadcast is set without --private-key', async () => {
    await expect(
      updateCommand.run({
        args: { name: 'myagent.eth', payload: '/tmp/never-read.json' },
        options: { broadcast: true, includeEmpty: true },
        env: {},
      }),
    ).rejects.toThrow(/--private-key is required when --broadcast is set/)
  })
})

const SHAPE_SCHEMA: Schema = {
  $id: 'sample',
  source: 'test',
  title: 'Sample',
  version: '1.0.0',
  description: 'sample',
  type: 'object',
  properties: {
    class: { type: 'string', default: 'Sample', description: 'class id' },
    schema: { type: 'string', description: 'schema URI' },
    description: { type: 'string', description: 'description' },
  },
  patternProperties: {
    '^audits(\\[[^\\]]+\\])?$': {
      type: 'string',
      parameterType: 'array',
      description: 'audit URIs',
    },
  },
}

describe('setCommand.run — payload shape validation', () => {
  beforeEach(() => {
    readFileSyncMock.mockReset()
    fetchSchemaMock.mockReset()
    fetchSchemaMock.mockResolvedValue(SHAPE_SCHEMA)
    publicClientForChainMock.mockReset()
  })

  it('rejects flat array-form payload keys with a "use nested array" error', async () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        schema: 'ipfs://QmSchema',
        class: 'Sample',
        'audits[0]': 'ipfs://a0',
      }),
    )
    await expect(
      setCommand.run({
        args: { name: 'myagent.eth', payload: '/tmp/payload.json' },
        options: { includeEmpty: true },
        env: {},
      }),
    ).rejects.toThrow(/flat array form is not accepted/)
  })

  it('rejects nested objects in the payload', async () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        schema: 'ipfs://QmSchema',
        class: { nested: true },
      }),
    )
    await expect(
      setCommand.run({
        args: { name: 'myagent.eth', payload: '/tmp/payload.json' },
        options: { includeEmpty: true },
        env: {},
      }),
    ).rejects.toThrow(/\[class\] must be a string or string\[\]/)
  })
})

describe('buildPayloadDiff', () => {
  it('separates added vs updated vs unchanged using the change preview', () => {
    const existing = { description: 'old description', class: 'Agent' }
    const desired = {
      description: 'new description',
      avatar: 'ipfs://new-avatar',
      class: 'Agent',
    }
    const changes = {
      description: 'new description',
      avatar: 'ipfs://new-avatar',
    }
    const diff = buildPayloadDiff(desired, { existing, changes })
    expect(diff.added).toEqual([{ key: 'avatar', value: 'ipfs://new-avatar' }])
    expect(diff.updated).toEqual([
      { key: 'description', from: 'old description', to: 'new description' },
    ])
    expect(diff.deleted).toEqual([])
    expect(diff.unchanged).toEqual([{ key: 'class', value: 'Agent' }])
  })

  it('reports deleted keys when desired sends an empty string for an existing value', () => {
    const existing = { description: 'will be cleared', class: 'Agent' }
    const desired = { description: '', class: 'Agent' }
    const changes = { description: '' }
    const diff = buildPayloadDiff(desired, { existing, changes })
    expect(diff.deleted).toEqual([{ key: 'description', from: 'will be cleared' }])
    expect(diff.unchanged).toEqual([{ key: 'class', value: 'Agent' }])
    expect(diff.added).toEqual([])
    expect(diff.updated).toEqual([])
  })

  it('treats existing-empty + desired-empty as a no-op (not added, not deleted)', () => {
    const existing = {}
    const desired = { description: '' }
    const changes = {}
    const diff = buildPayloadDiff(desired, { existing, changes })
    expect(diff.added).toEqual([])
    expect(diff.deleted).toEqual([])
    expect(diff.updated).toEqual([])
    // Empty desired with no original is intentionally suppressed from
    // 'unchanged' so it isn't shown to the user as a phantom record.
    expect(diff.unchanged).toEqual([])
  })

  it('returns an empty diff when desired is empty', () => {
    expect(buildPayloadDiff({}, { existing: { class: 'Agent' }, changes: {} })).toEqual({
      added: [],
      updated: [],
      deleted: [],
      unchanged: [],
    })
  })
})
