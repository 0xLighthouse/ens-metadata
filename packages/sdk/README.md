# @ensmetadata/sdk

Read, validate, and write structured metadata on individual ENS nodes. Built on [viem](https://viem.sh) and [@ensdomains/ensjs](https://github.com/ensdomains/ensjs).

## What this is

ENS names already support arbitrary text records on their resolver. This SDK layers a schema system on top of those records, so a name can declare what _kind_ of node it is (`class`), point to a JSON schema describing its expected fields (`schema`), and expose its values as typed `properties`.

Schemas themselves live on IPFS and are published from the sibling [`@ensmetadata/schemas`](../schemas) package. Background on the standard is in [ENSIP draft #64](https://github.com/ensdomains/ensips/pull/64).

## Install

```bash
pnpm add @ensmetadata/sdk viem @ensdomains/ensjs
```

## Quick Start: Common Use Cases

Three scenarios cover most usage. Each builds on a `reader` and `writer` created from your viem clients:

```ts
import { metadataReader, metadataWriter } from '@ensmetadata/sdk'

const reader = metadataReader()(publicClient)
const writer = metadataWriter({ publicClient })(walletClient)
```

`metadataReader()` returns a function, so the pattern `metadataReader()(publicClient)` calls that returned function with `publicClient` to produce a reader instance bound to that client. The first call accepts SDK config (none here), the second binds the viem client. Every reader/writer/estimator factory follows the same shape. They can also be plugged into viem's `.extend()` if you prefer one client object:

```ts
const client = publicClient.extend(metadataReader())
await client.getMetadata({ name: 'mynode.eth' })
```

### Reading existing records

Resolve the schema first so the read is scoped to the records the schema names. Validation then confirms the live values conform to the schema's rules (required fields present, value patterns match, etc).

```ts
import { metadataReader, resolveSchemaForName, validateMetadataSchema } from '@ensmetadata/sdk'

// 1. Resolve the schema the name currently declares.
const resolved = await resolveSchemaForName({ client: publicClient, name: 'someone.eth' })
if (!resolved.schema) throw new Error('No schema declared on this name')

// 2. Read only the records named in the schema.
const reader = metadataReader()(publicClient)
const metadata = await reader.getMetadata({ name: 'someone.eth', schema: resolved.schema })

// 3. Validate the live values against the schema rules.
const result = validateMetadataSchema(metadata.properties, resolved.schema)
```

### Publish new records to a name you own

You decide which schema applies. Import a known schema, build the records from it (filling in your own values for the rest), validate, and publish the full set.

```ts
import { validateMetadataSchema } from '@ensmetadata/sdk'
import { SCHEMA_MAP } from '@ensmetadata/schemas'
import latest from '@ensmetadata/schemas/latest'

const agentSchema = SCHEMA_MAP.Agent

// 1. Stage the records. `class` and the `schema` URI come from the bundled
//    Agent schema; the rest are your own values.
const records = {
  class: agentSchema.title, // 'Agent'
  schema: `ipfs://${latest.agent.cid}`, // IPFS URI of the published Agent schema
  alias: 'My Agent',
  description: 'A helpful AI agent',
  avatar: 'ipfs://QmAvatar...',
}

// 2. Validate against the schema you're publishing under.
const result = validateMetadataSchema(records, agentSchema)
if (!result.success) {
  console.error(result.errors)
  return
}

// 3. Write all records in one transaction. `setMetadata` doesn't compute a
//    delta, so it's the right tool for a fresh node where you want to
//    publish everything at once.
await writer.setMetadata({
  name: 'mynode.eth',
  records,
})
```

The `schema` value in `records` is the IPFS URI consumers will fetch; `agentSchema` is the local Schema object you're validating against. These should match: the URI you write should resolve to the same schema you validated with.

### Editing existing records

Resolve the schema the name currently declares so your update validates against the contract its consumers already expect, retrieve the records that schema knows about, stage your change, validate, and publish only what changed.

```ts
import { resolveSchemaForName, validateMetadataSchema } from '@ensmetadata/sdk'

// 1. Resolve the schema the name currently declares. The cascade reads the
//    `schema` text record off ENS and fetches the Schema from IPFS.
const resolved = await resolveSchemaForName({
  client: publicClient,
  name: 'mynode.eth',
})
if (!resolved.schema) throw new Error('No schema declared on this name')

// 2. Retrieve only the records named in the schema. Passing `schema` here
//    narrows the read to the keys the schema knows about.
const metadata = await reader.getMetadata({
  name: 'mynode.eth',
  schema: resolved.schema,
})

// 3. Stage a change on top of the current properties.
const desired = {
  ...metadata.properties,
  description: 'Updated description',
}

// 4. Validate the staged metadata against the live schema before writing.
const result = validateMetadataSchema(desired, resolved.schema)
if (!result.success) {
  console.error(result.errors)
  return
}

// 5. Publish the delta. Passing `existing` skips the duplicate read; only the
//    records that actually changed end up in the transaction.
await writer.setMetadataWithDelta({
  name: 'mynode.eth',
  desired,
  existing: metadata.properties,
})
```

If `resolved.source === 'none'` you choose what to do (abort, fall back to a default, or write unvalidated).

## Primitives

The sections below are the detailed reference for each building block the SDK exposes. The use cases above compose these primitives; reach for them directly when you need finer-grained control.

### Reading

`metadataReader()(client)` exposes two methods:

```ts
const metadata = await reader.getMetadata({ name: 'mynode.eth' })
// { name, resolver, address, class, schema, properties }

const schemaFields = await reader.getSchema({ name: 'mynode.eth' })
// { schema, class, version, cid }
```

`getMetadata` chooses which records to read based on the options you pass.

Calling it with neither `schema` nor `keys` reads a default set of common keys (`schema`, `class`, `description`, `avatar`, `url`, etc). Use this when you don't yet know what the name is supposed to look like and just want a quick view of the most common records.

```ts
await reader.getMetadata({ name: 'mynode.eth' })
```

Passing `schema` reads only the keys named in `schema.properties`. This is the right choice once you've resolved the schema the name uses: it ignores records the schema doesn't care about and keeps later validation clean.

```ts
await reader.getMetadata({ name: 'mynode.eth', schema: resolved.schema })
```

Passing `keys` reads exactly the keys you specify, ignoring the defaults and any schema.

```ts
await reader.getMetadata({
  name: 'mynode.eth',
  keys: ['description', 'avatar', 'url'],
})
```

### Writing

`metadataWriter({ publicClient })(walletClient)` exposes three write methods, in order of decreasing convenience.

**`setMetadataWithDelta`** is the recommended default. It reads the current state, optionally validates, computes the delta, and writes only what changed.

```ts
await writer.setMetadataWithDelta({
  name: 'mynode.eth',
  desired: { description: 'New' },
  schema: SCHEMA_MAP.Agent, // optional validation
})
```

**`setMetadata`** writes a known set of records without reading the current state. Use this when you already have the full desired state.

```ts
await writer.setMetadata({
  name: 'mynode.eth',
  records: { description: 'An agent node', url: 'https://example.com' },
  schema: SCHEMA_MAP.Agent, // optional, throws MetadataWriteError on failure
})
```

**`applyDelta`** writes a precomputed delta. Use this when you've already resolved the resolver address and computed changes yourself.

```ts
await writer.applyDelta({
  name: 'mynode.eth',
  delta: { changes: { description: 'Updated' }, deleted: ['old-key'] },
  resolverAddress: '0x...',
})
```

### Writing to Basenames

`*.base.eth` names live on Base L2 (chain 8453). The SDK detects them automatically: pass an extra `basePublicClient` so the writer can read the L2 resolver from the Base registry, and connect the wallet to Base before signing.

```ts
import { createPublicClient, http } from 'viem'
import { base, mainnet } from 'viem/chains'
import { metadataWriter } from '@ensmetadata/sdk'

const publicClient = createPublicClient({ chain: mainnet, transport: http() })
const basePublicClient = createPublicClient({ chain: base, transport: http() })

// walletClient must be connected to Base (chain 8453) before calling.
const writer = metadataWriter({ publicClient, basePublicClient })(walletClient)

await writer.setMetadata({
  name: 'alice.base.eth',
  records: { description: 'On Base' },
})
```

Detection is by suffix: any name ending in `.base.eth` (other than `base.eth` itself) is routed through the L2 path. Mainnet names are unchanged.

If the wallet is on the wrong chain the SDK throws `MetadataWriteError` with `code === 'wrong-chain'`. Drive `wallet_switchEthereumChain` from your UI before retrying.

### Validation

`validateMetadataSchema` checks a record map against a schema. Schemas can come from `@ensmetadata/schemas`, from `fetchSchemaByUri`, or from your own registry.

```ts
import { validateMetadataSchema } from '@ensmetadata/sdk'
import { SCHEMA_MAP } from '@ensmetadata/schemas'

const result = validateMetadataSchema(
  { description: 'My agent', url: 'https://example.com' },
  SCHEMA_MAP.Agent,
)

if (result.success) {
  result.data // Record<string, string>
} else {
  result.errors.forEach((e) => console.log(`[${e.key}] ${e.message}`))
}
```

### Delta utilities

For computing or inspecting changes outside of `setMetadataWithDelta`:

```ts
import { computeDelta, hasChanges } from '@ensmetadata/sdk'

const delta = computeDelta(
  { description: 'Old', avatar: 'https://old.png' },
  { description: 'New', avatar: '' },
)
// { changes: { description: 'New' }, deleted: ['avatar'] }

hasChanges(original, desired) // boolean
```

### Preparing and estimating

To inspect or estimate gas before broadcasting, use `metadataEstimator` (no wallet client required) or the matching methods on `metadataWriter`.

```ts
import { metadataEstimator } from '@ensmetadata/sdk'

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
```

### Advanced / lower-level

Drop down to these when you need custom batching, a non-default IPFS gateway, a bundled schema registry, or to distinguish "no record set" from a transport error.

```ts
import {
  readTextRecordsStrict,
  getResolverAddressStrict,
  fetchSchemaByUri,
} from '@ensmetadata/sdk'

const records = await readTextRecordsStrict({
  client: publicClient,
  name: 'mynode.eth',
  keys: ['description', 'avatar', 'schema'],
})

const resolver = await getResolverAddressStrict({
  client: publicClient,
  name: 'mynode.eth',
})

const schema = await fetchSchemaByUri('ipfs://Qm...', {
  ipfsGateway: 'https://ipfs.io',
  localResolver: async (cid) => bundledLookup(cid),
})
```

The `*Strict` variants throw on RPC errors; their non-strict siblings swallow them and return empty/null, which is appropriate when "no record set" and "transport blip" are equivalent for your use case.

## API reference

### `metadataReader()`

| Method | Description |
|---|---|
| `getSchema({ name })` | Fetch `schema`, `class`, `version`, and `cid` text records |
| `getMetadata({ name, schema?, keys? })` | Fetch resolver, address, and text records |

### `metadataWriter({ publicClient })(walletClient)`

| Method | Description |
|---|---|
| `setMetadataWithDelta({ name, desired, existing?, schema? })` | Read existing, validate, compute delta, write |
| `setMetadata({ name, records, deleted?, schema? })` | Write text records, optionally validate first |
| `applyDelta({ name, delta, resolverAddress })` | Apply a `{ changes, deleted }` delta |
| `prepareSetMetadata({ name, desired, ... })` | Read, validate, delta, encode calldata (no broadcast) |
| `estimateSetMetadata({ name, desired, account, ... })` | `prepareSetMetadata` plus gas, fee, and balance |

### `metadataEstimator({ publicClient })`

Same `prepareSetMetadata` / `estimateSetMetadata` methods without requiring a wallet client.

### Standalone functions

| Function | Description |
|---|---|
| `readTextRecords(opts)` / `readTextRecordsStrict(opts)` | Batch read text records (lenient or strict) |
| `getResolverAddress(opts)` / `getResolverAddressStrict(opts)` | Look up the resolver for a name |
| `fetchSchemaByUri(uri, opts)` | Resolve `ipfs://<cid>` to `Schema` (optional `localResolver` fast-path) |
| `parseSchemaUri(uri)` | Parse `ipfs://<cid>` to `{ cid }` |
| `resolveSchemaForName(opts)` | Cascade payload URI → ENS text → none |
| `validateMetadataSchema(data, schema)` | Validate data against a schema |
| `computeDelta(original, desired)` | Compute `{ changes, deleted }` between two states |
| `hasChanges(original, desired)` | Boolean check for differences |
| `extractSchemaFields(texts)` | Pick `schema` / `class` / `version` / `cid` from a text-record map |
