import type { Schema } from '@ensmetadata/schemas/types'
import type { PublicClient, WalletClient } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { setRecordsMock } = vi.hoisted(() => {
  const mock = vi.fn() as ReturnType<typeof vi.fn> & {
    makeFunctionData: ReturnType<typeof vi.fn>
  }
  mock.makeFunctionData = vi.fn((_wallet: unknown, args: { resolverAddress: `0x${string}` }) => ({
    to: args.resolverAddress,
    data: '0xfakedata' as `0x${string}`,
  }))
  return { setRecordsMock: mock }
})

vi.mock('@ensdomains/ensjs/wallet', () => ({
  setRecords: setRecordsMock,
}))

import {
  MetadataValidationFailedError,
  applyDelta,
  computeDelta,
  metadataEstimator,
  metadataWriter,
} from '../write'

const RESOLVER = '0xRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR' as `0x${string}`
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`
const ACCOUNT = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`
const TX_HASH =
  '0xfeedbeeffeedbeeffeedbeeffeedbeeffeedbeeffeedbeeffeedbeeffeedbeef' as `0x${string}`

const baseSchema: Schema = {
  $id: 'test',
  source: 'test',
  title: 'Test',
  version: '1.0',
  description: 'test schema',
  type: 'object',
  required: ['class'],
  properties: {
    class: { type: 'string', description: 'class' },
    description: { type: 'string', description: 'desc' },
    avatar: { type: 'string', description: 'avatar' },
  },
}

function makePublicClient(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    getEnsResolver: vi.fn(async () => RESOLVER),
    getEnsText: vi.fn(async () => null),
    estimateGas: vi.fn(async () => 50_000n),
    estimateFeesPerGas: vi.fn(async () => ({ maxFeePerGas: 2_000_000_000n })),
    getBalance: vi.fn(async () => 1_000_000_000_000_000_000n),
    ...overrides,
  } as unknown as PublicClient
}

function makeWallet(): WalletClient {
  return {
    account: { address: ACCOUNT },
  } as unknown as WalletClient
}

beforeEach(() => {
  setRecordsMock.mockReset()
  setRecordsMock.mockResolvedValue(TX_HASH)
  setRecordsMock.makeFunctionData.mockClear()
})

// --------------------------------------------------------------------------
// Pure helpers
// --------------------------------------------------------------------------

describe('computeDelta', () => {
  it('returns an empty changeset when desired matches existing', () => {
    expect(computeDelta({ class: 'A' }, { class: 'A' })).toEqual({})
  })

  it('records a new key as a set', () => {
    expect(computeDelta({ avatar: 'ipfs://x' }, {})).toEqual({ avatar: 'ipfs://x' })
  })

  it('records a changed value as a set', () => {
    expect(computeDelta({ class: 'B' }, { class: 'A' })).toEqual({ class: 'B' })
  })

  it('only marks "" as a deletion when the key is currently set', () => {
    expect(computeDelta({ description: '' }, { description: 'old' })).toEqual({
      description: '',
    })
    // Key already absent on-chain — `""` is a no-op, not a deletion.
    expect(computeDelta({ description: '' }, {})).toEqual({})
  })

  it('ignoreMissing=false (default) marks existing-but-unmentioned keys for deletion', () => {
    expect(computeDelta({ class: 'A' }, { class: 'A', avatar: 'ipfs://x' })).toEqual({
      avatar: '',
    })
  })

  it('ignoreMissing=true leaves existing-but-unmentioned keys alone', () => {
    expect(
      computeDelta({ class: 'A' }, { class: 'A', avatar: 'ipfs://x' }, { ignoreMissing: true }),
    ).toEqual({})
  })

  // Array-aware PATCH semantics (option A: desired is authoritative for any
  // array baseKey it touches).
  describe('ignoreMissing + array schema (tail clears)', () => {
    const arrSchema: Schema = {
      $id: 'arr',
      source: 'test',
      title: 'Arr',
      version: '1.0',
      description: 'arr',
      type: 'object',
      properties: { class: { type: 'string', description: 'c' } },
      patternProperties: {
        '^audits(\\[[^\\]]+\\])?$': {
          type: 'string',
          description: 'a',
          parameterType: 'array',
        },
        '^members(\\[[^\\]]+\\])?$': {
          type: 'string',
          description: 'm',
          parameterType: 'array',
        },
      },
    }

    it('emits deletes for existing tail past the desired array length', () => {
      const changes = computeDelta(
        { 'audits[0]': 'new0', 'audits[1]': 'new1' },
        {
          class: 'C',
          'audits[0]': 'old0',
          'audits[1]': 'old1',
          'audits[2]': 'old2',
          'audits[3]': 'old3',
        },
        { ignoreMissing: true, schema: arrSchema },
      )
      expect(changes).toEqual({
        'audits[0]': 'new0',
        'audits[1]': 'new1',
        'audits[2]': '',
        'audits[3]': '',
      })
    })

    it('only touches the array baseKeys the caller actually modified', () => {
      const changes = computeDelta(
        { 'audits[0]': 'new0' },
        {
          'audits[0]': 'old0',
          'audits[1]': 'old1',
          'members[0]': 'm0',
          'members[1]': 'm1',
        },
        { ignoreMissing: true, schema: arrSchema },
      )
      // audits tail cleared; members[*] left alone (members baseKey untouched).
      expect(changes).toEqual({ 'audits[0]': 'new0', 'audits[1]': '' })
    })

    it('does not touch unrelated scalar keys absent from desired', () => {
      const changes = computeDelta(
        { 'audits[0]': 'new0' },
        { class: 'C', avatar: 'ipfs://x', 'audits[0]': 'old0' },
        { ignoreMissing: true, schema: arrSchema },
      )
      expect(changes).toEqual({ 'audits[0]': 'new0' })
    })

    it('shrinks an array to empty by passing no entries → no tail clears (baseKey untouched)', () => {
      // Calling with no audits entries at all means "I am not touching audits"
      // under PATCH semantics — the existing array is preserved.
      const changes = computeDelta(
        { class: 'C' },
        { class: 'C', 'audits[0]': 'old0', 'audits[1]': 'old1' },
        { ignoreMissing: true, schema: arrSchema },
      )
      expect(changes).toEqual({})
    })

    it('reduces an array to a single entry, clearing all higher tail', () => {
      const changes = computeDelta(
        { 'audits[0]': 'only' },
        { 'audits[0]': 'old0', 'audits[1]': 'old1', 'audits[2]': 'old2' },
        { ignoreMissing: true, schema: arrSchema },
      )
      expect(changes).toEqual({ 'audits[0]': 'only', 'audits[1]': '', 'audits[2]': '' })
    })

    it('PUT mode (ignoreMissing=false) still deletes every unmentioned key (array or not)', () => {
      const changes = computeDelta(
        { 'audits[0]': 'new0' },
        { class: 'C', avatar: 'ipfs://x', 'audits[0]': 'old0', 'audits[1]': 'old1' },
        { ignoreMissing: false, schema: arrSchema },
      )
      // PUT semantics: every existing key not in desired is deleted, schema or no schema.
      expect(changes).toEqual({
        'audits[0]': 'new0',
        class: '',
        avatar: '',
        'audits[1]': '',
      })
    })

    it('ignoreMissing=true without a schema falls back to vanilla PATCH (no array smarts)', () => {
      const changes = computeDelta(
        { 'audits[0]': 'new0' },
        { 'audits[0]': 'old0', 'audits[1]': 'old1' },
        { ignoreMissing: true },
      )
      expect(changes).toEqual({ 'audits[0]': 'new0' })
    })

    it('empty-array sentinel: audits[0]="" clears the entire array under PATCH', () => {
      // This is the documented `flatten({ audits: [""] })` workaround for
      // expressing "clear this array" in a flat RecordSet — the sentinel
      // marks the baseKey as touched so the tail clear runs.
      const changes = computeDelta(
        { 'audits[0]': '' },
        { 'audits[0]': 'a0', 'audits[1]': 'a1', 'audits[2]': 'a2' },
        { ignoreMissing: true, schema: arrSchema },
      )
      expect(changes).toEqual({
        'audits[0]': '',
        'audits[1]': '',
        'audits[2]': '',
      })
    })

    it('empty-array sentinel against an already-empty on-chain array is a no-op', () => {
      const changes = computeDelta(
        { 'audits[0]': '' },
        {},
        { ignoreMissing: true, schema: arrSchema },
      )
      expect(changes).toEqual({})
    })
  })
})

describe('applyDelta', () => {
  it('overwrites with non-empty values', () => {
    expect(applyDelta({ class: 'A' }, { class: 'B', avatar: 'x' })).toEqual({
      class: 'B',
      avatar: 'x',
    })
  })

  it('removes keys whose change value is ""', () => {
    expect(applyDelta({ class: 'A', avatar: 'x' }, { avatar: '' })).toEqual({ class: 'A' })
  })

  it('does not mutate the existing record set', () => {
    const existing = { class: 'A' }
    const result = applyDelta(existing, { avatar: 'x' })
    expect(result).not.toBe(existing)
    expect(existing).toEqual({ class: 'A' })
  })

  it('is a no-op for an empty changeset', () => {
    expect(applyDelta({ class: 'A' }, {})).toEqual({ class: 'A' })
  })
})

// --------------------------------------------------------------------------
// prepareSetMetadata
// --------------------------------------------------------------------------

describe('prepareSetMetadata', () => {
  it('throws when the resolved resolver is the zero address', async () => {
    const client = makePublicClient({
      getEnsResolver: vi.fn(async () => ZERO_ADDRESS),
    })
    const estimator = metadataEstimator({ publicClient: client })
    await expect(
      estimator.prepareSetMetadata({
        name: 'alice.eth',
        schema: baseSchema,
        existing: {},
        desired: { class: 'A' },
      }),
    ).rejects.toThrow(/No resolver found/)
  })

  it('throws when no schema is supplied and none can be resolved on-chain', async () => {
    const client = makePublicClient({
      // `schema` and `class` text records both unset.
      getEnsText: vi.fn(async () => null),
    })
    const estimator = metadataEstimator({ publicClient: client })
    await expect(
      estimator.prepareSetMetadata({
        name: 'alice.eth',
        existing: {},
        desired: { class: 'A' },
      }),
    ).rejects.toThrow(/No schema found/)
  })

  it('skips getEnsResolver when opts.resolver is supplied', async () => {
    const client = makePublicClient()
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: {},
      desired: { class: 'A' },
    })
    expect(client.getEnsResolver).not.toHaveBeenCalled()
    expect(prepared.resolver).toBe(RESOLVER)
  })

  it('skips the existing-records read when opts.existing is supplied', async () => {
    const client = makePublicClient()
    const estimator = metadataEstimator({ publicClient: client })
    await estimator.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: { class: 'A' },
      desired: { class: 'A', avatar: 'ipfs://x' },
    })
    expect(client.getEnsText).not.toHaveBeenCalled()
  })

  it('reads existing via the supplied schema (one getEnsText per declared key, plus `schema`)', async () => {
    const reads: string[] = []
    const client = makePublicClient({
      getEnsText: vi.fn(async ({ key }: { key: string }) => {
        reads.push(key)
        return key === 'class' ? 'A' : null
      }),
    })
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      desired: { class: 'A', avatar: 'ipfs://x' },
    })
    expect([...reads].sort()).toEqual(['avatar', 'class', 'description', 'schema'])
    expect(prepared.changePreview.existing).toEqual({ class: 'A' })
    // class is unchanged, only avatar is a set.
    expect(prepared.changePreview.changes).toEqual({ avatar: 'ipfs://x' })
  })

  it('produces changes that match computeDelta(desired, existing) with ignoreMissing=false', async () => {
    const client = makePublicClient()
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: { class: 'A', avatar: 'ipfs://old' },
      desired: { class: 'A' },
    })
    expect(prepared.changePreview.changes).toEqual({ avatar: '' })
  })

  it('ignoreMissing=true preserves on-chain keys absent from desired', async () => {
    const client = makePublicClient()
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: { class: 'A', avatar: 'ipfs://old' },
      desired: { class: 'A' },
      ignoreMissing: true,
    })
    expect(prepared.changePreview.changes).toEqual({})
  })

  it('ignoreMissing=true with an array schema clears existing tail entries for touched baseKeys', async () => {
    const arrSchema: Schema = {
      $id: 'arr',
      source: 'test',
      title: 'Arr',
      version: '1.0',
      description: 'arr',
      type: 'object',
      required: ['class'],
      properties: { class: { type: 'string', description: 'c' } },
      patternProperties: {
        '^audits(\\[[^\\]]+\\])?$': {
          type: 'string',
          description: 'a',
          parameterType: 'array',
        },
      },
    }
    const client = makePublicClient()
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: arrSchema,
      existing: {
        class: 'C',
        'audits[0]': 'old0',
        'audits[1]': 'old1',
        'audits[2]': 'old2',
      },
      desired: { 'audits[0]': 'new0' },
      ignoreMissing: true,
    })
    expect(prepared.changePreview.changes).toEqual({
      'audits[0]': 'new0',
      'audits[1]': '',
      'audits[2]': '',
    })
    expect(prepared.changePreview.validation?.success).toBe(true)
  })

  it('returns validation.success=false without throwing when projected state is invalid', async () => {
    const client = makePublicClient()
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: {},
      // No `class` set anywhere → projected state violates `required: ['class']`.
      desired: { description: 'no class set' },
    })
    expect(prepared.changePreview.validation?.success).toBe(false)
  })

  it('validates the projected (post-applyDelta) state, not desired alone', async () => {
    const client = makePublicClient()
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      // `class` is already on-chain; `desired` only adds `avatar`.
      // Desired alone would fail (missing `class`), but the projection is fine.
      existing: { class: 'A' },
      desired: { avatar: 'ipfs://x' },
      ignoreMissing: true,
    })
    expect(prepared.changePreview.validation?.success).toBe(true)
  })

  it('normalizes the supplied name', async () => {
    const client = makePublicClient()
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'Alice.ETH',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: {},
      desired: { class: 'A' },
    })
    expect(prepared.name).toBe('alice.eth')
    expect(prepared.changePreview.name).toBe('alice.eth')
  })

  // ─── Registry-direct cascade (no Universal Resolver) ─────────────────────

  it('resolves the resolver via registry.resolver(node) when opts.registry is supplied', async () => {
    const REGISTRY = '0xb94704422c2a1e396835a571837aa5ae53285a95' as `0x${string}`
    const L2_RESOLVER = '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD' as `0x${string}`
    const readContract = vi.fn(async (args: { functionName: string }) => {
      if (args.functionName === 'resolver') return L2_RESOLVER
      if (args.functionName === 'text') return ''
      throw new Error(`unexpected: ${args.functionName}`)
    })
    const client = makePublicClient({ readContract })
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'alice.base.eth',
      registry: REGISTRY,
      schema: baseSchema,
      existing: {},
      desired: { class: 'A' },
    })
    expect(prepared.resolver).toBe(L2_RESOLVER)
    expect(client.getEnsResolver).not.toHaveBeenCalled()
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: REGISTRY, functionName: 'resolver' }),
    )
  })

  it('throws when registry.resolver(node) returns the zero address', async () => {
    const REGISTRY = '0xb94704422c2a1e396835a571837aa5ae53285a95' as `0x${string}`
    const readContract = vi.fn(async () => ZERO_ADDRESS)
    const client = makePublicClient({ readContract })
    const estimator = metadataEstimator({ publicClient: client })
    await expect(
      estimator.prepareSetMetadata({
        name: 'unregistered.base.eth',
        registry: REGISTRY,
        schema: baseSchema,
        existing: {},
        desired: { class: 'A' },
      }),
    ).rejects.toThrow(/No resolver found/)
  })

  it('opts.resolver wins over opts.registry (registry lookup is skipped)', async () => {
    const REGISTRY = '0xb94704422c2a1e396835a571837aa5ae53285a95' as `0x${string}`
    const readContract = vi.fn(async () => ZERO_ADDRESS)
    const client = makePublicClient({ readContract })
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'alice.base.eth',
      resolver: RESOLVER,
      registry: REGISTRY,
      schema: baseSchema,
      existing: {},
      desired: { class: 'A' },
    })
    expect(prepared.resolver).toBe(RESOLVER)
    expect(readContract).not.toHaveBeenCalled()
    expect(client.getEnsResolver).not.toHaveBeenCalled()
  })

  it('threads registry through to the existing-records read', async () => {
    const REGISTRY = '0xb94704422c2a1e396835a571837aa5ae53285a95' as `0x${string}`
    const L2_RESOLVER = '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD' as `0x${string}`
    const readContract = vi.fn(async (args: { functionName: string; args: readonly unknown[] }) => {
      if (args.functionName === 'resolver') return L2_RESOLVER
      if (args.functionName === 'text') {
        const key = args.args[1] as string
        return key === 'class' ? 'Existing' : ''
      }
      throw new Error(`unexpected: ${args.functionName}`)
    })
    const client = makePublicClient({ readContract })
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'alice.base.eth',
      registry: REGISTRY,
      schema: baseSchema,
      desired: { class: 'New' },
      // No `existing` supplied → the SDK reads it on chain. Must use the
      // direct path, not getEnsText.
    })
    expect(client.getEnsText).not.toHaveBeenCalled()
    expect(prepared.changePreview.existing).toEqual({ class: 'Existing' })
    expect(prepared.changePreview.changes).toEqual({ class: 'New' })
  })
})

// --------------------------------------------------------------------------
// estimateSetMetadata
// --------------------------------------------------------------------------

describe('estimateSetMetadata', () => {
  it('short-circuits to zero gas/fee/cost when the changeset is empty', async () => {
    const client = makePublicClient()
    const estimator = metadataEstimator({ publicClient: client })
    const est = await estimator.estimateSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: { class: 'A' },
      desired: { class: 'A' },
      account: ACCOUNT,
    })
    expect(est.gas).toBe(0n)
    expect(est.maxFeePerGas).toBe(0n)
    expect(est.costWei).toBe(0n)
    expect(est.balance).toBe(1_000_000_000_000_000_000n)
    expect(client.estimateGas).not.toHaveBeenCalled()
    expect(client.estimateFeesPerGas).not.toHaveBeenCalled()
    expect(client.getBalance).toHaveBeenCalledOnce()
    expect(setRecordsMock.makeFunctionData).not.toHaveBeenCalled()
  })

  it('returns gas / maxFeePerGas / costWei / balance derived from the public client', async () => {
    const client = makePublicClient({
      estimateGas: vi.fn(async () => 100_000n),
      estimateFeesPerGas: vi.fn(async () => ({ maxFeePerGas: 3_000_000_000n })),
      getBalance: vi.fn(async () => 5n * 10n ** 18n),
    })
    const estimator = metadataEstimator({ publicClient: client })
    const est = await estimator.estimateSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: {},
      desired: { class: 'A' },
      account: ACCOUNT,
    })
    expect(est.gas).toBe(100_000n)
    expect(est.maxFeePerGas).toBe(3_000_000_000n)
    expect(est.costWei).toBe(100_000n * 3_000_000_000n)
    expect(est.balance).toBe(5n * 10n ** 18n)
  })

  it('treats a missing maxFeePerGas (e.g. legacy chains) as 0n', async () => {
    const client = makePublicClient({
      estimateFeesPerGas: vi.fn(async () => ({})),
    })
    const estimator = metadataEstimator({ publicClient: client })
    const est = await estimator.estimateSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: {},
      desired: { class: 'A' },
      account: ACCOUNT,
    })
    expect(est.maxFeePerGas).toBe(0n)
    expect(est.costWei).toBe(0n)
  })

  it('encodes calldata via setRecords.makeFunctionData against the resolved resolver', async () => {
    const client = makePublicClient()
    const estimator = metadataEstimator({ publicClient: client })
    await estimator.estimateSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: {},
      desired: { class: 'A', avatar: 'ipfs://x' },
      account: ACCOUNT,
    })
    expect(setRecordsMock.makeFunctionData).toHaveBeenCalledOnce()
    const [, args] = setRecordsMock.makeFunctionData.mock.calls[0] as [
      unknown,
      {
        name: string
        resolverAddress: `0x${string}`
        texts: { key: string; value: string }[]
        coins: unknown[]
      },
    ]
    expect(args.name).toBe('alice.eth')
    expect(args.resolverAddress).toBe(RESOLVER)
    expect(args.coins).toEqual([])
    expect(args.texts).toEqual(
      expect.arrayContaining([
        { key: 'class', value: 'A' },
        { key: 'avatar', value: 'ipfs://x' },
      ]),
    )
  })

  it('forwards `account` to estimateGas and getBalance', async () => {
    const estimateGas = vi.fn(async (_args: { account: string; to: string }) => 80_000n)
    const getBalance = vi.fn(async (_args: { address: string }) => 1n)
    const client = makePublicClient({ estimateGas, getBalance })
    const estimator = metadataEstimator({ publicClient: client })
    await estimator.estimateSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: {},
      desired: { class: 'A' },
      account: ACCOUNT,
    })
    expect(estimateGas.mock.calls[0][0].account).toBe(ACCOUNT)
    expect(estimateGas.mock.calls[0][0].to).toBe(RESOLVER)
    expect(getBalance.mock.calls[0][0].address).toBe(ACCOUNT)
  })

  it('attaches the full PreparedMetadata under `prepared`', async () => {
    const client = makePublicClient()
    const estimator = metadataEstimator({ publicClient: client })
    const est = await estimator.estimateSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: {},
      desired: { class: 'A' },
      account: ACCOUNT,
    })
    expect(est.prepared.name).toBe('alice.eth')
    expect(est.prepared.resolver).toBe(RESOLVER)
    expect(est.prepared.schema).toBe(baseSchema)
    expect(est.prepared.changePreview.changes).toEqual({ class: 'A' })
  })
})

// --------------------------------------------------------------------------
// setPreparedMetadata
// --------------------------------------------------------------------------

describe('setPreparedMetadata', () => {
  it('throws when the prepared changeset is empty (no records to write)', async () => {
    const client = makePublicClient()
    const wallet = makeWallet()
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: { class: 'A' },
      desired: { class: 'A' },
    })
    const writer = metadataWriter({ publicClient: client })(wallet)
    await expect(writer.setPreparedMetadata(prepared)).rejects.toThrow(/No records to write/)
    expect(setRecordsMock).not.toHaveBeenCalled()
  })

  it('throws MetadataValidationFailedError when the prepared bundle has validation errors', async () => {
    // Manually construct a prepared bundle with a failing validation; we
    // bypass prepareSetMetadata so setPreparedMetadata's check is exercised
    // in isolation.
    const client = makePublicClient()
    const wallet = makeWallet()
    const writer = metadataWriter({ publicClient: client })(wallet)
    const prepared = {
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      changePreview: {
        name: 'alice.eth',
        resolver: RESOLVER,
        existing: {},
        changes: { description: 'something' },
        validation: {
          success: false as const,
          errors: [{ key: 'class', message: 'Required field "class" is missing' }],
        },
      },
    }
    await expect(writer.setPreparedMetadata(prepared)).rejects.toBeInstanceOf(
      MetadataValidationFailedError,
    )
    expect(setRecordsMock).not.toHaveBeenCalled()
  })

  it('calls setRecords with the normalized name, texts, resolverAddress, account, and coins=[]', async () => {
    const client = makePublicClient()
    const wallet = makeWallet()
    const estimator = metadataEstimator({ publicClient: client })
    const prepared = await estimator.prepareSetMetadata({
      name: 'Alice.ETH',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: {},
      desired: { class: 'A', avatar: 'ipfs://x' },
    })
    const writer = metadataWriter({ publicClient: client })(wallet)
    const result = await writer.setPreparedMetadata(prepared)

    expect(setRecordsMock).toHaveBeenCalledOnce()
    const [walletArg, args] = setRecordsMock.mock.calls[0] as [
      unknown,
      {
        name: string
        texts: { key: string; value: string }[]
        coins: unknown[]
        resolverAddress: `0x${string}`
        account: { address: `0x${string}` }
      },
    ]
    expect(walletArg).toBe(wallet)
    expect(args.name).toBe('alice.eth')
    expect(args.resolverAddress).toBe(RESOLVER)
    expect(args.coins).toEqual([])
    expect(args.account).toEqual({ address: ACCOUNT })
    expect(args.texts).toEqual(
      expect.arrayContaining([
        { key: 'class', value: 'A' },
        { key: 'avatar', value: 'ipfs://x' },
      ]),
    )

    expect(result.txHash).toBe(TX_HASH)
    expect(result.texts).toEqual(args.texts)
  })
})

// --------------------------------------------------------------------------
// setMetadata (prepare + broadcast in one call)
// --------------------------------------------------------------------------

describe('setMetadata', () => {
  it('wires prepareSetMetadata → setPreparedMetadata in a single call', async () => {
    const client = makePublicClient()
    const wallet = makeWallet()
    const writer = metadataWriter({ publicClient: client })(wallet)
    const result = await writer.setMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      schema: baseSchema,
      existing: {},
      desired: { class: 'A' },
    })
    expect(setRecordsMock).toHaveBeenCalledOnce()
    expect(result.txHash).toBe(TX_HASH)
  })

  it('throws MetadataValidationFailedError end-to-end when the projected state is invalid', async () => {
    // Required `class` missing in both existing and desired → projection
    // invalid → setMetadata must refuse to broadcast.
    const client = makePublicClient()
    const wallet = makeWallet()
    const writer = metadataWriter({ publicClient: client })(wallet)
    await expect(
      writer.setMetadata({
        name: 'alice.eth',
        resolver: RESOLVER,
        schema: baseSchema,
        existing: {},
        desired: { description: 'no class anywhere' },
      }),
    ).rejects.toBeInstanceOf(MetadataValidationFailedError)
    expect(setRecordsMock).not.toHaveBeenCalled()
  })

  it('throws MetadataValidationFailedError when array contiguity is violated', async () => {
    const arrSchema: Schema = {
      $id: 'arr',
      source: 'test',
      title: 'Arr',
      version: '1.0',
      description: 'arr',
      type: 'object',
      required: ['class'],
      properties: { class: { type: 'string', description: 'c' } },
      patternProperties: {
        '^audits(\\[[^\\]]+\\])?$': {
          type: 'string',
          description: 'a',
          parameterType: 'array',
        },
      },
    }
    const client = makePublicClient()
    const wallet = makeWallet()
    const writer = metadataWriter({ publicClient: client })(wallet)
    // Sparse array: index 0 set, index 2 set, index 1 missing.
    await expect(
      writer.setMetadata({
        name: 'alice.eth',
        resolver: RESOLVER,
        schema: arrSchema,
        existing: { class: 'C' },
        desired: { class: 'C', 'audits[0]': 'a0', 'audits[2]': 'a2' },
        ignoreMissing: true,
      }),
    ).rejects.toBeInstanceOf(MetadataValidationFailedError)
    expect(setRecordsMock).not.toHaveBeenCalled()
  })

  it('propagates the prepare-stage "No resolver found" error without calling setRecords', async () => {
    const client = makePublicClient({
      getEnsResolver: vi.fn(async () => ZERO_ADDRESS),
    })
    const wallet = makeWallet()
    const writer = metadataWriter({ publicClient: client })(wallet)
    await expect(
      writer.setMetadata({
        name: 'alice.eth',
        schema: baseSchema,
        existing: {},
        desired: { class: 'A' },
      }),
    ).rejects.toThrow(/No resolver found/)
    expect(setRecordsMock).not.toHaveBeenCalled()
  })
})

// --------------------------------------------------------------------------
// Factory shapes
// --------------------------------------------------------------------------

describe('factory shapes', () => {
  it('metadataWriter exposes prepareSetMetadata, setPreparedMetadata, estimateSetMetadata, setMetadata', () => {
    const client = makePublicClient()
    const wallet = makeWallet()
    const writer = metadataWriter({ publicClient: client })(wallet)
    expect(typeof writer.prepareSetMetadata).toBe('function')
    expect(typeof writer.setPreparedMetadata).toBe('function')
    expect(typeof writer.estimateSetMetadata).toBe('function')
    expect(typeof writer.setMetadata).toBe('function')
  })

  it('metadataEstimator exposes prepareSetMetadata and estimateSetMetadata only', () => {
    const client = makePublicClient()
    const estimator = metadataEstimator({ publicClient: client })
    expect(typeof estimator.prepareSetMetadata).toBe('function')
    expect(typeof estimator.estimateSetMetadata).toBe('function')
    expect('setMetadata' in estimator).toBe(false)
    expect('setPreparedMetadata' in estimator).toBe(false)
  })
})

// --------------------------------------------------------------------------
// ipfsGateway plumbing through prepareSetMetadata → getSchema → fetchSchema
// --------------------------------------------------------------------------

describe('prepareSetMetadata → fetchSchema ipfsGateway forwarding', () => {
  const fetchSpy = vi.fn()
  const realFetch = globalThis.fetch

  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  function makeIpfsBackedClient(): PublicClient {
    // getEnsText returns the schema URI for `schema`, a class for `class`,
    // and null for any other read. That lets prepareSetMetadata's nested
    // getSchema → fetchSchema resolve the (mocked) schema over IPFS, and the
    // subsequent getMetadata read returns empty for the rest.
    const getEnsText = vi.fn(async ({ key }: { key: string }) => {
      if (key === 'schema') return 'ipfs://QmWriteCid'
      if (key === 'class') return 'Agent'
      return null
    })
    return makePublicClient({ getEnsText })
  }

  beforeEach(() => {
    fetchSpy.mockReset()
    fetchSpy.mockResolvedValue(jsonResponse(baseSchema))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('forwards per-call ipfsGateway from SetMetadataOptions into fetchSchema', async () => {
    const client = makeIpfsBackedClient()
    const writer = metadataWriter({ publicClient: client })(makeWallet())
    await writer.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      desired: { class: 'Agent' },
      ipfsGateway: 'https://gw.test/ipfs',
    })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://gw.test/ipfs/QmWriteCid')
  })

  it('falls back to the factory-level ipfsGateway when no per-call value is set', async () => {
    const client = makeIpfsBackedClient()
    const writer = metadataWriter({
      publicClient: client,
      ipfsGateway: 'https://factory.test/ipfs',
    })(makeWallet())
    await writer.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      desired: { class: 'Agent' },
    })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://factory.test/ipfs/QmWriteCid')
  })

  it('per-call ipfsGateway overrides the factory-level default', async () => {
    const client = makeIpfsBackedClient()
    const writer = metadataWriter({
      publicClient: client,
      ipfsGateway: 'https://factory.test/ipfs',
    })(makeWallet())
    await writer.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      desired: { class: 'Agent' },
      ipfsGateway: 'https://percall.test/ipfs',
    })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://percall.test/ipfs/QmWriteCid')
  })

  it('metadataEstimator threads its factory-level ipfsGateway too', async () => {
    const client = makeIpfsBackedClient()
    const estimator = metadataEstimator({
      publicClient: client,
      ipfsGateway: 'https://factory.test/ipfs',
    })
    await estimator.prepareSetMetadata({
      name: 'alice.eth',
      resolver: RESOLVER,
      desired: { class: 'Agent' },
    })
    expect(fetchSpy.mock.calls[0][0]).toBe('https://factory.test/ipfs/QmWriteCid')
  })
})
