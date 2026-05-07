# @ensmetadata/sdk

Read, validate, and write structured metadata on individual ENS nodes. Built on [viem](https://viem.sh) and [@ensdomains/ensjs](https://github.com/ensdomains/ensjs).

## Install

```bash
pnpm add @ensmetadata/sdk viem @ensdomains/ensjs
```

## Read

```ts
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { addEnsContracts } from '@ensdomains/ensjs'
import { metadataReader } from '@ensmetadata/sdk'

const publicClient = createPublicClient({
  chain: addEnsContracts(mainnet),
  transport: http(),
})

// Standalone
const reader = metadataReader()(publicClient)
const metadata = await reader.getMetadata({ name: 'mynode.eth' })
const schema = await reader.getSchema({ name: 'mynode.eth' })

// Or via viem's .extend() pattern
const client = publicClient.extend(metadataReader())
const metadata = await client.getMetadata({ name: 'mynode.eth' })
```

`getMetadata` returns:

```ts
{
  name: 'mynode.eth',
  resolver: '0x...',
  address: '0x...',
  class: 'Agent',
  schema: 'ipfs://Qm...',
  properties: { description: '...', url: '...', ... }
}
```

Fetch specific keys only:

```ts
await reader.getMetadata({
  name: 'mynode.eth',
  keys: ['description', 'avatar', 'url'],
})
```

## Validate

```ts
import { validateMetadataSchema } from '@ensmetadata/sdk'
import { SCHEMA_MAP } from '@ensmetadata/schemas'

const result = validateMetadataSchema(
  { description: 'My agent', url: 'https://example.com' },
  SCHEMA_MAP.Agent,
)

if (result.success) {
  console.log(result.data) // Record<string, string>
} else {
  result.errors.forEach((e) => console.log(`[${e.key}] ${e.message}`))
}
```

## Delta

Compute what changed between the current on-chain state and a desired state.

```ts
import { computeDelta, hasChanges } from '@ensmetadata/sdk'

const original = { description: 'Old desc', avatar: 'https://old.png' }
const desired = { description: 'New desc', avatar: '' }

const delta = computeDelta(original, desired)
// { changes: { description: 'New desc' }, deleted: ['avatar'] }

hasChanges(original, desired) // true
```

## Write

```ts
import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'
import { addEnsContracts } from '@ensdomains/ensjs'
import { metadataWriter } from '@ensmetadata/sdk'

const walletClient = createWalletClient({
  chain: addEnsContracts(mainnet),
  transport: custom(window.ethereum),
  account: '0x...',
})

// Standalone
const writer = metadataWriter({ publicClient })(walletClient)

// Or via viem's .extend() pattern
const client = walletClient.extend(metadataWriter({ publicClient }))

// Write full records
const result = await writer.setMetadata({
  name: 'mynode.eth',
  records: { description: 'An agent node', url: 'https://example.com' },
})
// { txHash: '0x...', texts: [...], coins: [...] }

// Apply a delta (when you already have the resolver address)
await writer.applyDelta({
  name: 'mynode.eth',
  delta: { changes: { description: 'Updated' }, deleted: ['old-key'] },
  resolverAddress: '0x...',
})
```

### Validate before writing

Pass a `schema` to `setMetadata` to validate before the transaction is sent. Throws `MetadataWriteError` if validation fails.

```ts
import { SCHEMA_MAP } from '@ensmetadata/schemas'

await writer.setMetadata({
  name: 'mynode.eth',
  records: { description: 'My agent' },
  schema: SCHEMA_MAP.Agent,
})
```

### Lower-level read helpers

`readTextRecords` / `readTextRecordsStrict` / `getResolverAddress` / `getResolverAddressStrict` skip the high-level wrapper. The strict variants throw on RPC errors so callers can distinguish "no record set" from "transport blip".

```ts
import { readTextRecordsStrict, getResolverAddressStrict } from '@ensmetadata/sdk'

const records = await readTextRecordsStrict({
  client: publicClient,
  name: 'mynode.eth',
  keys: ['description', 'avatar', 'schema'],
})

const resolver = await getResolverAddressStrict({ client: publicClient, name: 'mynode.eth' })
```

## Schema fetch

```ts
import { fetchSchemaByUri, resolveSchemaForName } from '@ensmetadata/sdk'

// Resolve any ipfs://<cid> URI to a Schema. The optional localResolver is a
// fast-path you can use to short-circuit the gateway (e.g. point at a bundled
// registry).
const schema = await fetchSchemaByUri('ipfs://Qm...', {
  ipfsGateway: 'https://ipfs.io',
  localResolver: async (cid) => bundledLookup(cid),
})

// Cascade: payload URI → ENS `schema` text → none.
const resolved = await resolveSchemaForName({
  client: publicClient,
  name: 'mynode.eth',
  payloadSchemaUri: payload.schema ?? null,
})
```

## Prepare / estimate

When you need to inspect or estimate before broadcasting:

```ts
import { metadataEstimator, metadataWriter } from '@ensmetadata/sdk'

const estimator = metadataEstimator({ publicClient })

const prepared = await estimator.prepareSetMetadata({
  name: 'mynode.eth',
  desired: { description: 'New', avatar: 'ipfs://a' },
})
// { resolverAddress, existing, delta, calldata, to, validation }

const estimate = await estimator.estimateSetMetadata({
  name: 'mynode.eth',
  desired: { description: 'New' },
  account: '0x...',
})
// { prepared, gas, maxFeePerGas, costWei, balance }

// Read+delta+write in one call:
const writer = metadataWriter({ publicClient })(walletClient)
await writer.setMetadataWithDelta({
  name: 'mynode.eth',
  desired: { description: 'New' },
  schema: SCHEMA_MAP.Agent,
})
```

## API

### Read — `metadataReader()`

| Method | Description |
|---|---|
| `getSchema({ name })` | Fetch schema, class, version, and CID text records |
| `getMetadata({ name, schema?, keys? })` | Fetch resolver, address, and text records |

### Write — `metadataWriter({ publicClient })(walletClient)`

| Method | Description |
|---|---|
| `setMetadata({ name, records, deleted?, schema? })` | Write text records, optionally validate first |
| `applyDelta({ name, delta, resolverAddress })` | Apply a `{ changes, deleted }` delta |
| `setMetadataWithDelta({ name, desired, existing?, schema? })` | Read existing, validate, compute delta, write |
| `prepareSetMetadata({ name, desired, ... })` | Read + validate + delta + encode calldata (no broadcast) |
| `estimateSetMetadata({ name, desired, account, ... })` | `prepareSetMetadata` + gas/fee/balance |

### Estimate-only — `metadataEstimator({ publicClient })`

Same `prepareSetMetadata` / `estimateSetMetadata` methods without requiring a wallet client.

### Standalone functions

| Function | Description |
|---|---|
| `readTextRecords(opts)` / `readTextRecordsStrict(opts)` | Batch read text records (lenient or strict) |
| `getResolverAddress(opts)` / `getResolverAddressStrict(opts)` | Look up the resolver for a name |
| `fetchSchemaByUri(uri, opts)` | Resolve `ipfs://<cid>` → `Schema` (optional `localResolver` fast-path) |
| `parseSchemaUri(uri)` | Parse `ipfs://<cid>` to `{ cid }` |
| `resolveSchemaForName(opts)` | Cascade payload URI → ENS text → none |
| `validateMetadataSchema(data, schema)` | Validate data against a schema |
| `computeDelta(original, desired)` | Compute `{ changes, deleted }` between two states |
| `hasChanges(original, desired)` | Boolean check for differences |
| `extractSchemaFields(texts)` | Pick `schema` / `class` / `version` / `cid` from a text-record map |
