import { resolveNodeValue } from '@/lib/tree/resolveNodeValue'
import { describe, expect, it } from 'vitest'

describe('resolveNodeValue', () => {
  it('reads from texts, ignores top-level structural properties', () => {
    const node = {
      name: 'agent.jkm.eth',
      id: '0xhash',
      texts: { name: 'My Agent', class: 'Agent' },
    }

    expect(resolveNodeValue(node, 'name')).toBe('My Agent')
    expect(resolveNodeValue(node, 'class')).toBe('Agent')
  })

  it('does not leak structural properties when texts key is absent', () => {
    const node = { name: 'agent.jkm.eth', id: '0xhash', address: '0xdead', texts: {} }

    expect(resolveNodeValue(node, 'name')).toBeUndefined()
    expect(resolveNodeValue(node, 'id')).toBeUndefined()
    expect(resolveNodeValue(node, 'address')).toBeUndefined()
  })
})
