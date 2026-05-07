import { SCHEMA_MAP } from '@ensmetadata/schemas'
import registryRaw from '@ensmetadata/schemas/registry' with { type: 'json' }
import type { Schema } from '@ensmetadata/schemas/types'
import { computeDelta } from '@ensmetadata/sdk'
import type { PublicClient } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildPayloadDiff,
  filterPayloadEntries,
  readEnsManager,
  resolveSchemaForPayload,
  setCommand,
} from './set.js'

const queryDomainStrictMock = vi.fn()
vi.mock('../lib/subgraph.js', () => ({
  queryDomainStrict: (name: string) => queryDomainStrictMock(name),
  queryDomain: (name: string) => queryDomainStrictMock(name),
}))

const AGENT_SCHEMA = SCHEMA_MAP.Agent
const registry = registryRaw as {
  schemas: Record<string, { latest: string; published: Record<string, { cid: string }> }>
}
const AGENT_LATEST_CID = registry.schemas.agent.published[registry.schemas.agent.latest].cid

/**
 * Build a fake ensjs-extended PublicClient. The runtime cast in
 * `readEnsSchemaUri` is `(client as any).getEnsText(...)`, so we only need to
 * stub that method here.
 */
function makeClient(getEnsText: (args: { name: string; key: string }) => Promise<unknown>) {
  return { getEnsText } as unknown as PublicClient
}

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

describe('resolveSchemaForPayload', () => {
  const ensName = 'myagent.eth'
  const fetchSpy = vi.fn()
  const realFetch = globalThis.fetch

  beforeEach(() => {
    fetchSpy.mockReset()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('resolves a payload schema URI from the local registry without network', async () => {
    const client = makeClient(async () => null)
    const result = await resolveSchemaForPayload({
      payload: { schema: `ipfs://${AGENT_LATEST_CID}` },
      ensName,
      publicClient: client,
    })
    expect(result.source).toBe('payload')
    expect(result.uri).toBe(`ipfs://${AGENT_LATEST_CID}`)
    expect(result.schema?.title).toBe('Agent')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to fetch for an unknown payload CID', async () => {
    const customSchema: Schema = {
      $id: 'custom',
      source: 'test',
      title: 'Custom',
      version: '1.0.0',
      description: 'a custom schema fetched from ipfs',
      type: 'object',
      properties: {
        class: { type: 'string', default: 'Custom', description: 'class id' },
        schema: { type: 'string', description: 'schema uri' },
      },
      required: ['class', 'schema'],
    }
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(customSchema), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const client = makeClient(async () => null)
    const result = await resolveSchemaForPayload({
      payload: { schema: 'ipfs://QmThisCidIsNotInTheLocalRegistry000000000000000' },
      ensName,
      publicClient: client,
      ipfsGateway: 'https://example-gateway.test',
    })
    expect(result.source).toBe('payload')
    expect(result.schema?.title).toBe('Custom')
    expect(fetchSpy).toHaveBeenCalledOnce()
    const calledUrl = fetchSpy.mock.calls[0][0] as string
    expect(calledUrl).toBe(
      'https://example-gateway.test/ipfs/QmThisCidIsNotInTheLocalRegistry000000000000000',
    )
  })

  it('hard-fails when the payload schema URI cannot be fetched', async () => {
    fetchSpy.mockResolvedValue(new Response('not found', { status: 404 }))
    const client = makeClient(async () => null)
    await expect(
      resolveSchemaForPayload({
        payload: { schema: 'ipfs://QmMissingSchema00000000000000000000000000000000' },
        ensName,
        publicClient: client,
      }),
    ).rejects.toThrow(/HTTP 404/)
  })

  it('hard-fails when ENS read throws (RPC error)', async () => {
    const client = makeClient(async () => {
      throw new Error('RPC 500 Internal Server Error')
    })
    await expect(
      resolveSchemaForPayload({ payload: {}, ensName, publicClient: client }),
    ).rejects.toThrow(/Failed to read 'schema' text record from ENS/)
  })

  it('proceeds without validation when ENS returns no schema record', async () => {
    const client = makeClient(async () => null)
    const result = await resolveSchemaForPayload({
      payload: {},
      ensName,
      publicClient: client,
    })
    expect(result.source).toBe('none')
    expect(result.schema).toBeNull()
    expect(result.uri).toBeNull()
  })

  it('treats empty-string ENS schema record as no record', async () => {
    const client = makeClient(async () => '')
    const result = await resolveSchemaForPayload({
      payload: {},
      ensName,
      publicClient: client,
    })
    expect(result.source).toBe('none')
  })

  it('hard-fails when ENS returns a URI that cannot be fetched', async () => {
    fetchSpy.mockRejectedValue(new Error('network unreachable'))
    const client = makeClient(async () => 'ipfs://QmDeadEnsReference00000000000000000000000000000')
    await expect(
      resolveSchemaForPayload({ payload: {}, ensName, publicClient: client }),
    ).rejects.toThrow(/Failed to fetch schema from IPFS gateway/)
  })

  it('uses ENS-supplied schema when payload omits one', async () => {
    const client = makeClient(async () => `ipfs://${AGENT_LATEST_CID}`)
    const result = await resolveSchemaForPayload({
      payload: {},
      ensName,
      publicClient: client,
    })
    expect(result.source).toBe('ens')
    expect(result.uri).toBe(`ipfs://${AGENT_LATEST_CID}`)
    expect(result.schema?.title).toBe('Agent')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('uses pre-fetched ensSchemaUri without making an RPC call', async () => {
    const getEnsText = vi.fn(async () => null)
    const client = makeClient(getEnsText)
    const result = await resolveSchemaForPayload({
      payload: {},
      ensName,
      publicClient: client,
      ensSchemaUri: `ipfs://${AGENT_LATEST_CID}`,
    })
    expect(result.source).toBe('ens')
    expect(result.uri).toBe(`ipfs://${AGENT_LATEST_CID}`)
    expect(result.schema?.title).toBe('Agent')
    // Critical: the RPC was bypassed because the caller pre-fetched the value.
    expect(getEnsText).not.toHaveBeenCalled()
  })

  it('treats pre-fetched empty ensSchemaUri as no record (no RPC, no validation)', async () => {
    const getEnsText = vi.fn(async () => 'should-not-be-called')
    const client = makeClient(getEnsText)
    const result = await resolveSchemaForPayload({
      payload: {},
      ensName,
      publicClient: client,
      ensSchemaUri: null,
    })
    expect(result.source).toBe('none')
    expect(result.schema).toBeNull()
    expect(getEnsText).not.toHaveBeenCalled()
  })

  it('rejects non-ipfs schema URIs', async () => {
    const client = makeClient(async () => null)
    await expect(
      resolveSchemaForPayload({
        payload: { schema: 'https://example.com/schema.json' },
        ensName,
        publicClient: client,
      }),
    ).rejects.toThrow(/Only ipfs:\/\/<cid> URIs are supported/)
  })

  it('rejects fetched JSON that does not look like a Schema', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ not: 'a schema' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = makeClient(async () => null)
    await expect(
      resolveSchemaForPayload({
        payload: { schema: 'ipfs://QmAnotherUnknownCid000000000000000000000000000000' },
        ensName,
        publicClient: client,
      }),
    ).rejects.toThrow(/does not look like a valid Schema/)
  })

  it('agent schema rejects unknown keys via the SDK validator (sanity check)', () => {
    // Sanity: confirm the validator rejects unknown keys, since set.ts relies
    // on this for catching typos against the resolved schema.
    const { validateMetadataSchema } = require('@ensmetadata/sdk') as typeof import('@ensmetadata/sdk')
    const result = validateMetadataSchema(
      { class: 'Agent', schema: 'ipfs://x', notARealKey: 'oops' },
      AGENT_SCHEMA,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.key === 'notARealKey')).toBe(true)
    }
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
