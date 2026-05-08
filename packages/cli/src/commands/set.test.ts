import { computeDelta } from '@ensmetadata/sdk'
import type { PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getOwnerMock = vi.fn()
const getBaseRegistryOwnerMock = vi.fn()

/**
 * Mock ensjs's `getOwner` (used for mainnet manager lookup). The dynamic
 * import in `set.ts` resolves to this mocked module.
 */
vi.mock('@ensdomains/ensjs/public', () => ({
  getOwner: (client: unknown, opts: { name: string }) => getOwnerMock(client, opts),
}))

vi.mock('@ensmetadata/sdk', async () => {
  const actual = await vi.importActual<typeof import('@ensmetadata/sdk')>('@ensmetadata/sdk')
  return {
    ...actual,
    getBaseRegistryOwner: (client: unknown, name: string) => getBaseRegistryOwnerMock(client, name),
  }
})

import { buildPayloadDiff, filterPayloadEntries, readEnsManager, setCommand } from './set.js'

const STUB_CLIENT = {} as unknown as PublicClient

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
    getBaseRegistryOwnerMock.mockReset()
  })

  it('resolves mainnet names via ensjs getOwner', async () => {
    getOwnerMock.mockResolvedValue({ owner: '0x1111111111111111111111111111111111111111' })
    const owner = await readEnsManager('myagent.eth', STUB_CLIENT)
    expect(owner).toBe('0x1111111111111111111111111111111111111111')
    expect(getOwnerMock).toHaveBeenCalledWith(STUB_CLIENT, { name: 'myagent.eth' })
    expect(getBaseRegistryOwnerMock).not.toHaveBeenCalled()
  })

  it('resolves Basenames via the SDK getBaseRegistryOwner', async () => {
    getBaseRegistryOwnerMock.mockResolvedValue('0x2222222222222222222222222222222222222222')
    const owner = await readEnsManager('alice.base.eth', STUB_CLIENT, STUB_CLIENT)
    expect(owner).toBe('0x2222222222222222222222222222222222222222')
    expect(getBaseRegistryOwnerMock).toHaveBeenCalledWith(STUB_CLIENT, 'alice.base.eth')
    expect(getOwnerMock).not.toHaveBeenCalled()
  })

  it('hard-fails when the Base registry returns null (zero owner)', async () => {
    getBaseRegistryOwnerMock.mockResolvedValue(null)
    await expect(readEnsManager('alice.base.eth', STUB_CLIENT, STUB_CLIENT)).rejects.toThrow(
      /Could not determine the manager of alice\.base\.eth on Base/,
    )
  })

  it('hard-fails when no Base public client is supplied for a Basename', async () => {
    await expect(readEnsManager('alice.base.eth', STUB_CLIENT)).rejects.toThrow(
      /requires a Base public client/,
    )
  })

  it('hard-fails when ensjs returns no owner for a mainnet name', async () => {
    getOwnerMock.mockResolvedValue({ owner: undefined })
    await expect(readEnsManager('myagent.eth', STUB_CLIENT)).rejects.toThrow(
      /Could not determine the manager of myagent\.eth on mainnet/,
    )
  })

  it('hard-fails when ensjs returns a non-address owner', async () => {
    getOwnerMock.mockResolvedValue({ owner: 'not-an-address' })
    await expect(readEnsManager('myagent.eth', STUB_CLIENT)).rejects.toThrow(
      /Could not determine the manager of myagent\.eth on mainnet/,
    )
  })
})

describe('setCommand.run — broadcast guard', () => {
  it('throws when --broadcast is set without --private-key', async () => {
    await expect(
      setCommand.run({
        args: { name: 'myagent.eth', payload: '/tmp/never-read.json' },
        options: { broadcast: true, includeEmpty: false },
        env: {},
      }),
    ).rejects.toThrow(/--private-key is required when --broadcast is set/)
  })
})

describe('buildPayloadDiff', () => {
  it('separates added vs updated vs unchanged using the delta', () => {
    const existing = {
      description: 'old description',
      avatar: null,
      class: 'Agent',
    }
    const desired = {
      description: 'new description',
      avatar: 'ipfs://new-avatar',
      class: 'Agent',
    }
    const delta = computeDelta(existing, desired)
    const diff = buildPayloadDiff(existing, desired, delta)
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
    const delta = computeDelta(existing, desired)
    const diff = buildPayloadDiff(existing, desired, delta)
    expect(diff.deleted).toEqual([{ key: 'description', from: 'will be cleared' }])
    expect(diff.unchanged).toEqual([{ key: 'class', value: 'Agent' }])
    expect(diff.added).toEqual([])
    expect(diff.updated).toEqual([])
  })

  it('treats existing-empty + desired-empty as a no-op (not added, not deleted)', () => {
    const existing = { description: null }
    const desired = { description: '' }
    const delta = computeDelta(existing, desired)
    const diff = buildPayloadDiff(existing, desired, delta)
    expect(diff.added).toEqual([])
    expect(diff.deleted).toEqual([])
    expect(diff.updated).toEqual([])
    // Empty desired with no original is intentionally suppressed from
    // 'unchanged' so it isn't shown to the user as a phantom record.
    expect(diff.unchanged).toEqual([])
  })

  it('returns an empty diff when desired is empty', () => {
    expect(buildPayloadDiff({ class: 'Agent' }, {}, { changes: {}, deleted: [] })).toEqual({
      added: [],
      updated: [],
      deleted: [],
      unchanged: [],
    })
  })
})
