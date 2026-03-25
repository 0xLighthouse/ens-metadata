import { describe, expect, it } from 'vitest'
import { buildMutationQueue } from '../tree/buildMutationQueue'
import { diffMutationChanges } from '../tree/diffMutationChanges'
import type { TreeNode } from '../tree/types'

const makeNode = (name: string, texts?: Record<string, string>): TreeNode => ({
  id: name,
  name,
  owner: '0x1111111111111111111111111111111111111111' as `0x${string}`,
  subdomainCount: 0,
  resolverId: 'r',
  resolverAddress: '0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41' as `0x${string}`,
  isWrapped: false,
  texts,
})

describe('diffMutationChanges', () => {
  it('classifies new records as added, existing as modified', () => {
    const node = makeNode('agent.eth', { class: 'Agent', description: 'Old' })
    const { added, modified } = diffMutationChanges(node, {
      name: 'My Agent',
      description: 'New',
    })

    expect(added).toMatchObject([['name', 'My Agent']])
    expect(modified).toMatchObject([['description', 'New']])
  })

  it('never uses structural node.name as the original for "name" changes', () => {
    const node = makeNode('macwhyte.eth')
    const { added, modified } = diffMutationChanges(node, { name: 'Display Name' })

    expect(added).toMatchObject([['name', 'Display Name']])
    expect(modified).toHaveLength(0)
  })

  it('skips unchanged, empty, and internal keys', () => {
    const node = makeNode('x.eth', { class: 'Agent' })
    const result = diffMutationChanges(node, {
      class: 'Agent',
      description: '',
      inspectionData: 'ignored',
      avatar: null,
    })

    expect(result.added).toHaveLength(0)
    expect(result.modified).toHaveLength(0)
  })
})

describe('buildMutationQueue', () => {
  const findNode = (name: string) =>
    name === 'agent.eth'
      ? makeNode('agent.eth', { class: 'Agent' })
      : name === 'treasury.eth'
        ? makeNode('treasury.eth', { class: 'Treasury' })
        : null

  it('separates creations from edits', () => {
    const mutations = new Map([
      [
        'agent.eth',
        { createNode: false, changes: { description: 'Updated' }, deleted: [] as string[] },
      ],
      [
        'new.eth',
        {
          createNode: true,
          parentName: 'root.eth',
          changes: { class: 'Person' },
          deleted: [] as string[],
        },
      ],
    ])

    const { creations, edits } = buildMutationQueue(['agent.eth', 'new.eth'], mutations, findNode)

    expect(creations).toEqual(['new.eth'])
    expect(edits).toHaveLength(1)
    expect(edits[0].ensName).toBe('agent.eth')
  })

  it('excludes non-string values like inspectionData from delta', () => {
    const mutations = new Map([
      [
        'agent.eth',
        {
          createNode: false,
          changes: { class: 'Agent', inspectionData: { detectedType: 'safe' } } as Record<
            string,
            // biome-ignore lint/suspicious/noExplicitAny: testing mixed value types
            any
          >,
          deleted: [] as string[],
        },
      ],
    ])

    const { edits } = buildMutationQueue(['agent.eth'], mutations, findNode)

    expect(edits[0].delta.changes).toEqual({ class: 'Agent' })
  })

  it('builds delta with null/undefined values stripped', () => {
    const mutations = new Map([
      [
        'agent.eth',
        {
          createNode: false,
          changes: { name: 'Agent', schema: null, empty: undefined } as Record<
            string,
            string | null
          >,
          deleted: ['old-key'],
        },
      ],
    ])

    const { edits } = buildMutationQueue(['agent.eth'], mutations, findNode)

    expect(edits[0].delta.changes).toEqual({ name: 'Agent' })
    expect(edits[0].delta.deleted).toEqual(['old-key'])
  })

  it('skips nodes without a resolver', () => {
    const mutations = new Map([
      ['unknown.eth', { createNode: false, changes: { class: 'Agent' }, deleted: [] as string[] }],
    ])

    const { edits } = buildMutationQueue(['unknown.eth'], mutations, findNode)

    expect(edits).toHaveLength(0)
  })

  it('includes resolver address for on-chain writes', () => {
    const mutations = new Map([
      ['agent.eth', { createNode: false, changes: { name: 'Test' }, deleted: [] as string[] }],
    ])

    const { edits } = buildMutationQueue(['agent.eth'], mutations, findNode)

    expect(edits[0].resolverAddress).toBe('0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41')
  })
})
