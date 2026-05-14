# @ensmetadata/sdk

Read, validate, and write structured metadata on individual ENS nodes. Built on [viem](https://viem.sh) and [@ensdomains/ensjs](https://github.com/ensdomains/ensjs).

## What this is

ENS names already support arbitrary text records on their resolver. This SDK layers a schema system on top of those records, so a name can declare what _kind_ of node it is (`class`), point to a JSON schema describing its expected fields (`schema`), and expose its values as typed `properties`.

Schemas themselves live on IPFS and are published from the sibling [`@ensmetadata/schemas`](../schemas) package. Background on the standard is in [ENSIP draft #64](https://github.com/ensdomains/ensips/pull/64).

## Install

```bash
pnpm add @ensmetadata/sdk viem @ensdomains/ensjs
```

## Quick Start

Each example below uses a `reader` and `writer` built from your viem clients:

```ts
import { metadataReader, metadataWriter } from '@ensmetadata/sdk'

const reader = metadataReader()(publicClient)
const writer = metadataWriter({ publicClient })(walletClient)
```

`metadataReader()` returns a function, so `metadataReader()(publicClient)` calls that returned function with `publicClient` to produce a reader bound to that client. The first call accepts SDK config (none here), the second binds the viem client. Every factory follows this shape and can also be plugged into viem's `.extend()` if you prefer one client object:

```ts
const client = publicClient.extend(metadataReader())
await client.getMetadata({ name: 'mynode.eth' })
```

### Read records

Pass a name. In one call, the reader resolves the schema declared on the name, fetches it, and reads every key the schema names:

```ts
const metadata = await reader.getMetadata({ name: 'someone.eth' })
// {
//   name: 'someone.eth',
//   properties: { description: '...', avatar: '...', class: 'Agent', schema: 'ipfs://bafy...' },
//   schema: { ... }   // the resolved Schema object
// }
```

`metadata.properties` carries the on-chain values for every key the schema declares (plus `class` and `schema` themselves when set), and `metadata.schema` is the resolved Schema object the reader fetched along the way.

Because the Schema rides back on the same response, validation is a local follow-up that needs no extra network calls:

```ts
import { validateMetadata } from '@ensmetadata/sdk'

const result = validateMetadata(metadata.properties, metadata.schema)
if (!result.success) console.error(result.errors)
```

### Write records

Pass a name and the records you want to set. In one call, the writer resolves the resolver, fetches the schema currently declared on the name, reads the existing state, computes the diff against your `desired`, validates the projected post-change state, and broadcasts only the changes:

```ts
await writer.setMetadata({
  name: 'mynode.eth',
  desired: { description: 'Hello world', avatar: 'ipfs://...' },
})
```

This works as long as the name already declares a schema. For first-time publish to a fresh name, you will need to provide an already-published schema:

```ts
import { SCHEMA_MAP } from '@ensmetadata/schemas'
import latest from '@ensmetadata/schemas/latest'

const agentSchema = SCHEMA_MAP.Agent

await writer.setMetadata({
  name: 'mynode.eth',
  schema: agentSchema,
  desired: {
    class: agentSchema.title,              // 'Agent'
    schema: `ipfs://${latest.agent.cid}`,  // URI consumers will resolve
    alias: 'My Agent',
    description: 'A helpful AI agent',
  },
})
```

The `schema` option is the local Schema object the SDK validates against; the `schema` value inside `desired` is the IPFS URI written on-chain so consumers can discover it later. These should match: the URI you publish should resolve to the same schema you validated against.

### Edit records

Read, mutate, write. `setMetadata` figures out what actually changed and broadcasts only those keys:

```ts
const metadata = await reader.getMetadata({ name: 'mynode.eth' })
const desired = { ...metadata.properties, description: 'Updated description' }
await writer.setMetadata({ name: 'mynode.eth', desired })
```

The optimized version of this flow, which reuses the schema and existing state already in hand from `getMetadata` to skip redundant RPCs, is in [Reusing data across calls](#reusing-data-across-calls).

## How `setMetadata` works

Every call to `setMetadata` walks six steps:

1. Resolve the resolver address (universal resolver lookup) if not supplied.
2. Look up the schema URI from the `schema` text record and fetch the Schema from IPFS if not supplied.
3. Read the current on-chain records named in the schema if not supplied.
4. Diff `desired` against the existing records to compute the minimal change set.
5. Project the post-change state and validate it against the schema.
6. Broadcast only the changed records.

Steps 1–3 each hit the network and can be skipped by passing the corresponding value into `setMetadata`. Steps 4–6 are always performed locally.

## Reusing data across calls

`setMetadata`, `prepareSetMetadata`, and `estimateSetMetadata` all accept optional `resolver`, `schema`, and `existing`. When omitted the SDK reads them from the blockchain. When supplied, they're used as-is and the corresponding read is skipped:

| Option | When omitted | When supplied |
|---|---|---|
| `resolver` | Resolved via the ENS universal resolver | Used as-is, no RPC call |
| `schema` | Read from the `schema` text record, then fetched from IPFS | Used as-is, no read or fetch |
| `existing` | Read via `getMetadata` using `schema` | Used as-is, no read |

`getMetadata` returns exactly what `setMetadata` needs to skip steps 2 and 3:

```ts
const metadata = await reader.getMetadata({ name: 'mynode.eth' })
const desired = { ...metadata.properties, description: 'Updated description' }
await writer.setMetadata({
  name: 'mynode.eth',
  desired,
  schema: metadata.schema!,       // skip schema text-record read + IPFS fetch
  existing: metadata.properties,  // skip current-state read
})
```

## Primitives

The sections below are the detailed reference for each building block the SDK exposes. The Quick Start examples above compose these primitives; reach for them directly when you need finer-grained control.

### Reading

`metadataReader()(client)` exposes two methods:

```ts
const { name, properties, schema } = await reader.getSchema({ name: 'mynode.eth' })
// properties: { schema?, class? }  — raw text records (only present when set)
// schema:     Schema | null        — the Schema object fetched from the `schema` URI

const { name, properties, schema } = await reader.getMetadata({ name: 'mynode.eth' })
// properties: RecordSet            — keys declared by the resolved schema (only present when set)
// schema:     Schema | null
```

`getSchema` reads the `schema` and `class` text records, then (when `schema` is set) fetches the referenced Schema object. If `class` is unset but the resolved Schema declares a `properties.class.default`, that default fills in.

`getMetadata` chooses which records to read based on the options you pass.

Calling it with neither `schema` nor `keys` runs `getSchema` internally to discover the name's Schema, then reads the keys that Schema declares. The `schema` and `class` text records and the resolved Schema object picked up along the way are reused in the result, so you get the full picture in one call when you don't yet know the schema up front.

```ts
await reader.getMetadata({ name: 'mynode.eth' })
```

Passing `schema` reads only the keys named in `schema.properties`. This is the right choice once you've resolved the schema (e.g. from a previous `getSchema` call): the read skips the schema discovery step and ignores any records the schema doesn't care about.

```ts
const { schema } = await reader.getSchema({ name: 'mynode.eth' })
if (schema) await reader.getMetadata({ name: 'mynode.eth', schema })
```

Passing `keys` reads exactly the keys you specify, ignoring any schema-driven defaults.

```ts
await reader.getMetadata({
  name: 'mynode.eth',
  keys: ['description', 'avatar', 'url'],
})
```

### Writing

`metadataWriter({ publicClient })(walletClient)` exposes four write methods that share the same prepare pipeline.

**`setMetadata`** is the recommended default. It resolves the resolver, fetches the schema, reads the current state, computes the diff against `desired`, and broadcasts only the changes.

```ts
await writer.setMetadata({
  name: 'mynode.eth',
  desired: { description: 'New' },
})
```

**`prepareSetMetadata`** runs the same prepare pipeline without broadcasting. It returns a `PreparedMetadata` bundle (`{ name, resolver, schema, changePreview }`) you can inspect, validate, or hand off.

```ts
const prepared = await writer.prepareSetMetadata({
  name: 'mynode.eth',
  desired: { description: 'New' },
})
console.log(prepared.changePreview.changes)    // only the keys that will be written
console.log(prepared.changePreview.validation) // result of validating the projected state
```

**`setPreparedMetadata`** broadcasts a `PreparedMetadata` you already built. Pair it with `prepareSetMetadata` when you want a confirmation step between prepare and sign.

```ts
await writer.setPreparedMetadata(prepared)
```

**`estimateSetMetadata`** prepares and returns gas, fee, and balance, without broadcasting.

```ts
const estimate = await writer.estimateSetMetadata({
  name: 'mynode.eth',
  desired: { description: 'New' },
  account: '0x...',
})
// { prepared, gas, maxFeePerGas, costWei, balance }
```

All three option-taking methods (`setMetadata`, `prepareSetMetadata`, `estimateSetMetadata`) accept the same `resolver` / `schema` / `existing` injection options. See [Reusing data across calls](#reusing-data-across-calls).

### Validation

`validateMetadata` checks a record map against a schema. Schemas can come from `@ensmetadata/schemas`, from `fetchSchemaByUri`, or from your own registry.

```ts
import { validateMetadata } from '@ensmetadata/sdk'
import { SCHEMA_MAP } from '@ensmetadata/schemas'

const result = validateMetadata(
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

For computing or inspecting changes outside of the write methods:

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

To inspect or estimate gas before broadcasting, use `metadataEstimator` (no wallet client required) or the matching methods on `metadataWriter`. Both accept `SetMetadataOptions`, so the same `resolver` / `schema` / `existing` injection rules apply. See [Reusing data across calls](#reusing-data-across-calls).

```ts
import { metadataEstimator } from '@ensmetadata/sdk'

const estimator = metadataEstimator({ publicClient })

const prepared = await estimator.prepareSetMetadata({
  name: 'mynode.eth',
  desired: { description: 'New', avatar: 'ipfs://a' },
})
// { name, resolver, schema, changePreview: { name, resolver, existing, changes, validation } }

const estimate = await estimator.estimateSetMetadata({
  name: 'mynode.eth',
  desired: { description: 'New' },
  account: '0x...',
})
// { prepared, gas, maxFeePerGas, costWei, balance }
```

### Advanced / lower-level

Drop down to these when you need to bypass the reader (swap the IPFS gateway, or plug in a bundled schema registry).

```ts
import { fetchSchema, fetchSchemaFromIpfs, DEFAULT_IPFS_GATEWAY } from '@ensmetadata/sdk'

// Auto-dispatches on the URI scheme (ipfs:// or https://). Pass a `resolver`
// to short-circuit known CIDs with a bundled registry.
const schema = await fetchSchema('ipfs://Qm...', {
  gateway: DEFAULT_IPFS_GATEWAY,
  resolver: async (uri) => bundledLookup(uri),
})
```

## API reference

### `metadataReader()(client)`

| Method | Description |
|---|---|
| `getSchema({ name })` | Read the `schema` and `class` text records and fetch the referenced Schema. Returns `{ name, properties, schema }` |
| `getMetadata({ name, schema?, keys? })` | Read text records. With `schema` reads its declared keys; with `keys` reads exactly those; with neither auto-discovers the Schema first. Returns `{ name, properties, schema }` |

### `metadataWriter({ publicClient })(walletClient)`

| Method | Description |
|---|---|
| `setMetadata({ name, desired, resolver?, schema?, existing?, ignoreMissing? })` | Prepare and broadcast in one call |
| `prepareSetMetadata({ name, desired, ... })` | Read, diff, and validate. Returns `PreparedMetadata`, no broadcast |
| `setPreparedMetadata(prepared)` | Broadcast a `PreparedMetadata` produced by `prepareSetMetadata` |
| `estimateSetMetadata({ name, desired, account, ... })` | `prepareSetMetadata` plus gas, fee, and balance |

Any of `resolver`, `schema`, and `existing` can be injected on the option-taking methods to skip the matching on-chain lookup. See [Reusing data across calls](#reusing-data-across-calls).

### `metadataEstimator({ publicClient })`

Same `prepareSetMetadata` / `estimateSetMetadata` methods without requiring a wallet client.

### Standalone functions

| Function | Description |
|---|---|
| `fetchSchema(uri, opts)` | Resolve `ipfs://<cid>` or `https://...` to `Schema` (optional `resolver` fast-path) |
| `fetchSchemaFromIpfs(uri, opts)` / `fetchSchemaFromHttps(uri, opts)` | Protocol-specific fetchers |
| `fetchSchemaFromLocal(uri, resolver)` | Resolve a URI via a caller-provided resolver only |
| `getSchemaKeys(schema)` | Return the property keys declared by a Schema, in order |
| `validateMetadata(data, schema)` | Validate data against a schema |
| `validate(schema, data)` | Boolean wrapper around `validateMetadata` |
| `computeDelta(original, desired)` | Compute `{ changes, deleted }` between two states |
| `hasChanges(original, desired)` | Boolean check for differences |
