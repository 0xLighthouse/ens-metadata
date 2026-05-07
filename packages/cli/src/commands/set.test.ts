import { computeDelta } from '@ensmetadata/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPayloadDiff, filterPayloadEntries, readEnsManager, setCommand } from './set.js'

const queryDomainStrictMock = vi.fn()
vi.mock('../lib/subgraph.js', () => ({
  queryDomainStrict: (name: string) => queryDomainStrictMock(name),
  queryDomain: (name: string) => queryDomainStrictMock(name),
}))

describe('filterPayloadEntries', () => {
  it('drops empty-string values by default', () => {
    const out = filterPayloadEntries(
      { class: 'Agent', schema: 'ipfs://x', alias: '', description: 'hello' },
      { includeEmpty: false },
    )
    expect(out).toEqual({ class: 'Agent', schema: 'ipfs://x', description: 'hello' })
  })

  it('keeps empty-string values when includeEmpty is true', () => {
    const out = filterPayloadEntries(
      { class: 'Agent', alias: '' },
      { includeEmpty: true },
    )
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

describe('readEnsManager (via ENSNode)', () => {
  const ZERO = '0x0000000000000000000000000000000000000000'

  beforeEach(() => {
    queryDomainStrictMock.mockReset()
  })

  it('returns ownerId for unwrapped names', async () => {
    queryDomainStrictMock.mockResolvedValue({
      ownerId: '0x1111111111111111111111111111111111111111',
      wrappedOwnerId: ZERO,
    })
    const owner = await readEnsManager('myagent.eth')
    expect(owner).toBe('0x1111111111111111111111111111111111111111')
  })

  it('prefers wrappedOwnerId when set (wrapped names)', async () => {
    queryDomainStrictMock.mockResolvedValue({
      ownerId: '0x000000000000000000000000d4416b13d2b3a9abae7acd5d6c2bbdbe25686401', // NameWrapper-ish
      wrappedOwnerId: '0x2222222222222222222222222222222222222222',
    })
    const owner = await readEnsManager('myagent.eth')
    expect(owner).toBe('0x2222222222222222222222222222222222222222')
  })

  it('hard-fails when ENSNode is unreachable', async () => {
    queryDomainStrictMock.mockRejectedValue(new Error('ENSNode request failed: ECONNREFUSED'))
    await expect(readEnsManager('myagent.eth')).rejects.toThrow(/ENSNode request failed/)
  })

  it('hard-fails when ENSNode has no record of the name', async () => {
    queryDomainStrictMock.mockResolvedValue(null)
    await expect(readEnsManager('doesnotexist.eth')).rejects.toThrow(
      /ENSNode has no record of/,
    )
  })

  it('hard-fails when both owner fields are zero/missing', async () => {
    queryDomainStrictMock.mockResolvedValue({ ownerId: ZERO, wrappedOwnerId: ZERO })
    await expect(readEnsManager('myagent.eth')).rejects.toThrow(
      /Could not determine the manager/,
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
