import type { TreeMutation } from '@/stores/tree-edits'
import { describe, expect, it } from 'vitest'
import { mergePendingChanges } from '../tree/mergePreviewTree'
import type { TreeNode } from '../tree/types'

const makeNode = (name: string, overrides?: Partial<TreeNode>): TreeNode => ({
  id: name,
  name,
  owner: '0x1111111111111111111111111111111111111111' as `0x${string}`,
  subdomainCount: 0,
  resolverId: 'resolver-1',
  resolverAddress: '0xaabbccdd' as `0x${string}`,
  isWrapped: false,
  ...overrides,
})

const makeMutation = (name: string, overrides?: Partial<TreeMutation>): Map<string, TreeMutation> =>
  new Map([[name, { createNode: false, texts: {}, changes: {}, deleted: [], ...overrides }]])

describe('mergePendingChanges', () => {
  it('merges changes into texts without touching structural properties', () => {
    const node = makeNode('agent.jkm.eth', { texts: { class: 'Agent' } })
    const mutations = makeMutation('agent.jkm.eth', {
      changes: { name: 'My Agent', description: 'Updated' },
    })

    const result = mergePendingChanges(node, mutations)

    expect(result.name).toBe('agent.jkm.eth')
    expect(result.texts).toMatchObject({ class: 'Agent', name: 'My Agent', description: 'Updated' })
  })

  it('removes deleted keys from texts', () => {
    const node = makeNode('agent.jkm.eth', { texts: { class: 'Agent', description: 'Old' } })
    const mutations = makeMutation('agent.jkm.eth', { deleted: ['description'] })

    const result = mergePendingChanges(node, mutations)

    expect(result.texts?.class).toBe('Agent')
    expect(result.texts?.description).toBeUndefined()
  })

  it('places creation changes in texts, not top-level', () => {
    const parent = makeNode('jkm.eth')
    const mutations = new Map<string, TreeMutation>([
      [
        'agent.jkm.eth',
        {
          createNode: true,
          parentName: 'jkm.eth',
          texts: {},
          changes: { name: 'Display', class: 'Agent' },
          deleted: [],
        },
      ],
    ])

    const child = mergePendingChanges(parent, mutations).children![0]

    expect(child.name).toBe('agent.jkm.eth')
    expect(child.texts).toMatchObject({ name: 'Display', class: 'Agent' })
  })

  it('applies non-string structural changes at top level, not in texts', () => {
    const node = makeNode('treasury.jkm.eth', { texts: { class: 'Treasury' } })
    const mutations = makeMutation('treasury.jkm.eth', {
      // biome-ignore lint/suspicious/noExplicitAny: testing inspectionData merge
      changes: { description: 'Updated', inspectionData: { detectedType: 'safe' } } as any,
    })

    const result = mergePendingChanges(node, mutations)

    expect(result.texts).toMatchObject({ class: 'Treasury', description: 'Updated' })
    expect(result.texts?.inspectionData).toBeUndefined()
    expect(result.inspectionData).toMatchObject({ detectedType: 'safe' })
  })

  it('does not inherit parent texts into created children', () => {
    const parent = makeNode('jkm.eth', {
      texts: { class: 'Org', description: 'Parent desc', avatar: 'parent.png' },
    })
    const mutations = new Map<string, TreeMutation>([
      [
        'agent.jkm.eth',
        {
          createNode: true,
          parentName: 'jkm.eth',
          texts: {},
          changes: { class: 'Agent' },
          deleted: [],
        },
      ],
    ])

    const child = mergePendingChanges(parent, mutations).children![0]

    expect(child.texts).toEqual({ class: 'Agent' })
    expect(child.texts?.description).toBeUndefined()
    expect(child.texts?.avatar).toBeUndefined()
  })

  it('merges recursively into nested children', () => {
    const tree = makeNode('jkm.eth', {
      children: [makeNode('agent.jkm.eth', { texts: { class: 'Agent' } })],
    })
    const mutations = makeMutation('agent.jkm.eth', { changes: { description: 'Updated' } })

    const child = mergePendingChanges(tree, mutations).children![0]

    expect(child.name).toBe('agent.jkm.eth')
    expect(child.texts).toMatchObject({ class: 'Agent', description: 'Updated' })
  })
})
