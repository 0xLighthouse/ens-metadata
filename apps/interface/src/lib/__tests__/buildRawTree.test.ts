import { describe, expect, it } from '@jest/globals'
import { buildRawTree } from '../tree/buildRawTree'
import { TreeNode } from '../tree/types'

const TEST_TIMEOUT_MS = 30000 // 30 seconds

describe('buildRawTree integration', () => {
  let tree: TreeNode | undefined

  beforeAll(async () => {
    tree = await buildRawTree('ensdao.eth')
    console.log(JSON.stringify(tree, null, 2))
  }, TEST_TIMEOUT_MS)

  describe('fetch [ensdao.eth]', () => {
    it('fetches a real domain tree from the ENS subgraph ', async () => {
      expect(tree!.children?.length ?? 0).toBeGreaterThan(0)
    })

    /**
     * paint.ensdao.eth does not have a resolver or owner
     */
    it('omits nodes that do not have a resolver', async () => {
      expect(tree!.children?.some((o) => o.name === 'paint.ensdao.eth')).toBe(false)
    })

    it('marks nodes without an address as undefined', async () => {
      expect(tree!.address).toBeUndefined()
    })
  })
})
