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

For apps that want a single object that dispatches across chains (e.g. mainnet + Base for Basenames), use the multichain wrapper instead — see the [Multichain](#multichain-mainnet--base) section below.

### Reading existing records

Resolve the schema first so the read is scoped to the records the schema names. Validation then confirms the live values conform to the schema's rules (required fields present, value patterns match, etc).

```ts
import { metadataReader, validateMetadataSchema } from '@ensmetadata/sdk'

const reader = metadataReader()(publicClient)

// 1. Resolve the schema the name currently declares. `getSchema` reads the
//    `schema` and `class` text records and fetches the referenced Schema.
const { schema } = await reader.getSchema({ name: 'someone.eth' })
if (!schema) throw new Error('No schema declared on this name')

// 2. Read only the records named in the schema.
const metadata = await reader.getMetadata({ name: 'someone.eth', schema })

// 3. Validate the live values against the schema rules.
const result = validateMetadataSchema(metadata.properties, schema)
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

// 3. Publish. `setMetadata` resolves the resolver, fetches the current
//    state, diffs against `desired`, and broadcasts only the changes. On a
//    fresh node the existing state is empty, so everything in `desired`
//    gets written. Pass `schema` so the SDK skips reading the (still-unset)
//    `schema` text record off chain.
await writer.setMetadata({
  name: 'mynode.eth',
  desired: records,
  schema: agentSchema,
})
```

The `schema` value in `records` is the IPFS URI consumers will fetch; `agentSchema` is the local Schema object you're validating against. These should match: the URI you write should resolve to the same schema you validated with.

### Editing existing records

Resolve the schema the name currently declares so your update validates against the contract its consumers already expect, retrieve the records that schema knows about, copy and edit, validate, and publish only what changed.

```ts
import { metadataReader, validateMetadataSchema } from '@ensmetadata/sdk'

const reader = metadataReader()(publicClient)

// 1. Resolve the schema the name currently declares. `getSchema` reads the
//    `schema` text record off ENS and fetches the Schema from IPFS.
const { schema } = await reader.getSchema({ name: 'mynode.eth' })
if (!schema) throw new Error('No schema declared on this name')

// 2. Retrieve only the records named in the schema. Passing `schema` here
//    narrows the read to the keys the schema knows about.
const metadata = await reader.getMetadata({
  name: 'mynode.eth',
  schema,
})

// 3. Build the desired state by copying and editing.
const desired = { ...metadata.properties, description: 'Updated description' }

// 4. Publish the changes. Re-use the `schema` and `existing` we already
//    read so the writer doesn't fetch them again.
await writer.setMetadata({
  name: 'mynode.eth',
  desired,
  schema,
  existing: metadata.properties,
})
```

`setMetadata` does the following steps, which can be done individually using the primitives below if you want more control:

1. If a resolver is not provided, look it up via the universal resolver.
2. If a schema is not provided, look up the schema currently attached to the ENS name.
3. If the current on-chain records are not provided, retrieve the current records.
4. Compare the updated metadata provided to the existing on-chain records to calculate what we need to update.
5. Preview what the on-chain records will look like after the changes are made, and validate the previewed state against the schema.
6. Broadcast just the changes required to modify on-chain state.

## Primitives

The sections below are the detailed reference for each building block the SDK exposes. The use cases above compose these primitives; reach for them directly when you need finer-grained control.

### Reading

`metadataReader()(client)` exposes two methods that target different read scopes.

```ts
const { records, schema } = await reader.getSchema({ name: 'mynode.eth' })
// records: { schema: string | null, class: string | null }
// schema:  Schema | null   — the Schema object fetched from the `schema` URI

const metadata = await reader.getMetadata({ name: 'mynode.eth' })
// { name, class, schema, properties }   — properties keyed by the read keys
```

`getSchema` reads the `schema` and `class` text records, then (when `schema` is set) fetches the referenced Schema object. The raw text values are returned under `records`; the parsed Schema is returned under `schema`. If `class` is unset but the resolved Schema declares a `properties.class.default`, that default fills in.

`getMetadata` chooses which records to read based on the options you pass.

Calling it with neither `schema` nor `keys` runs `getSchema` internally to discover the name's Schema, then reads the keys that Schema declares. The `schema` and `class` text records picked up along the way are reused in the result, so you get the full picture in one call when you don't yet know the schema up front.

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
console.log(prepared.changePreview.changes)   // only the keys that will be written
console.log(prepared.changePreview.validation) // result of validating the projected state
```

**`setPreparedMetadata`** broadcasts a `PreparedMetadata` you already built. Pair it with `prepareSetMetadata` when you want a confirmation step between prepare and sign.

```ts
await writer.setPreparedMetadata(prepared)
```

**`estimateSetMetadata`** prepares and returns gas, fee, and balance — no broadcast.

```ts
const estimate = await writer.estimateSetMetadata({
  name: 'mynode.eth',
  desired: { description: 'New' },
  account: '0x...',
})
// { prepared, gas, maxFeePerGas, costWei, balance }
```

#### Injecting values to skip redundant lookups

All three of the methods that take `SetMetadataOptions` (`setMetadata`, `prepareSetMetadata`, `estimateSetMetadata`) accept optional `resolver`, `schema`, and `existing`. When omitted the SDK reads them; when supplied they're used as-is and the corresponding read is skipped.

| Option | When omitted | When supplied |
|---|---|---|
| `resolver` | Resolved via the ENS universal resolver | Used as-is, no RPC call |
| `schema` | Read from the `schema` text record, then fetched from IPFS | Used as-is, no read or fetch |
| `existing` | Read via `getMetadata` using `schema` | Used as-is, no read |

```ts
// Re-use values you already have to skip up to three RPC roundtrips.
await writer.setMetadata({
  name: 'mynode.eth',
  desired: { description: 'New' },
  resolver: '0x...',     // skip the resolver lookup
  schema,                // skip the schema text-record read + IPFS fetch
  existing: snapshot,    // skip the current-state read
})
```

This matters most when you've already called `getSchema` or `getMetadata` in the same flow: the values are already in hand, so passing them avoids hitting the same RPCs twice.

### Multichain (mainnet + Base)

Most apps that handle both `*.eth` and `*.base.eth` names should use the multichain wrappers. They take a typed map of viem clients and dispatch each call to the right chain based on the input name.

```ts
import { createPublicClient, http } from 'viem'
import { base, mainnet } from 'viem/chains'
import {
  multichainAttestationVerifier,
  multichainMetadataReader,
  multichainMetadataWriter,
} from '@ensmetadata/sdk'

const publicClients = {
  mainnet: createPublicClient({ chain: mainnet, transport: http() }),
  base: createPublicClient({ chain: base, transport: http() }),
}

// Reads — alice.eth lands on mainnet; alice.base.eth lands on Base.
const reader = multichainMetadataReader(publicClients)
await reader.getMetadata({ name: 'alice.base.eth' })

// Writes — pass per-chain wallet clients alongside the public clients. The
// wrapper enforces that the Base wallet is on chain 8453 before signing.
const writer = multichainMetadataWriter({
  publicClients,
  walletClients: { mainnet: mainnetWallet, base: baseWallet },
})
await writer.setMetadata({ name: 'alice.base.eth', desired: { description: 'On Base' } })

// Attestation verification — subject reads dispatch to the right chain;
// the attester ENS is always resolved on mainnet.
const verifier = multichainAttestationVerifier({ publicClients })
await verifier.verifyHandleAttestation({ name: 'alice.base.eth', platform: 'com.x' })
```

When a name routes to a chain whose client isn't in the map, the wrapper throws `MissingChainClientError`. When a write routes to Base but the wallet isn't on chain 8453, the wrapper throws an `Error` whose message includes `must be connected to Base`; drive `wallet_switchEthereumChain` from your UI before retrying.

The 2LD `base.eth` itself is treated as a mainnet name (it's owned on L1 by Coinbase). Custom attester ENS names ending in `.base.eth` are not yet supported — the default attester is a mainnet ENS.

#### Single-chain alternative

If you'd rather pair a single core factory with the right client yourself, that works too:

```ts
import { metadataReader } from '@ensmetadata/sdk'

const reader = metadataReader()(basePublicClient)
await reader.getMetadata({ name: 'alice.base.eth' })
```

This is the lower-level escape hatch. The core factories assume the client matches the name; you take on the chain-routing responsibility.

#### Adding a new chain

Each supported chain lives under `src/chains/<chain>.ts` with its own constants, ABIs, errors, and name-detection helper (`isBasename` for Base). To add Arbitrum, OP, or another chain:

1. Create `src/chains/<chain>.ts` with the chain's helpers.
2. Add the chain to the `SupportedChain` union in `src/routing.ts` and a new branch in `chainForName`.
3. Extend `multichainMetadataReader` / `multichainMetadataWriter` with a dispatch case for the new chain.

No core factory changes are required — the core stays single-chain. The integration is purely additive at the wrapper level.

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

To inspect or estimate gas before broadcasting, use `metadataEstimator` (no wallet client required) or the matching methods on `metadataWriter`. Both accept `SetMetadataOptions`, so the same `resolver` / `schema` / `existing` injection rules apply — see [Injecting values to skip redundant lookups](#injecting-values-to-skip-redundant-lookups).

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

### `metadataReader()` (core, single-chain)

| Method | Description |
|---|---|
| `getSchema({ name })` | Read the `schema` and `class` text records and fetch the referenced Schema. Returns `{ records, schema }` |
| `getMetadata({ name, schema?, keys? })` | Read text records. With `schema` reads its declared keys; with `keys` reads exactly those; with neither auto-discovers the Schema first |

### `metadataWriter({ publicClient })(walletClient)` (core, single-chain)

| Method | Description |
|---|---|
| `setMetadata({ name, desired, resolver?, schema?, existing?, ignoreMissing? })` | Prepare and broadcast in one call |
| `prepareSetMetadata({ name, desired, ... })` | Read, diff, and validate. Returns `PreparedMetadata`, no broadcast |
| `setPreparedMetadata(prepared)` | Broadcast a `PreparedMetadata` produced by `prepareSetMetadata` |
| `estimateSetMetadata({ name, desired, account, ... })` | `prepareSetMetadata` plus gas, fee, and balance |

Any of `resolver`, `schema`, and `existing` can be injected on the option-taking methods to skip the matching on-chain lookup — see [Injecting values to skip redundant lookups](#injecting-values-to-skip-redundant-lookups).

### `metadataEstimator({ publicClient })` (core, single-chain)

Same `prepareSetMetadata` / `estimateSetMetadata` methods without requiring a wallet client.

### `multichainMetadataReader({ mainnet, base? })`

Same surface as `metadataReader()(client)`, but dispatches each call to the right chain via `chainForName(opts.name)`.

### `multichainMetadataWriter({ publicClients, walletClients })`

Same surface as `metadataWriter({ publicClient })(walletClient)`. Enforces that the wallet for the dispatched chain is connected to that chain (currently checked for Base — wrong chain throws an `Error` whose message includes `must be connected to Base`).

### `multichainMetadataEstimator({ publicClients })`

Multichain prepare/estimate. No wallet client required.

### `multichainAttestationVerifier({ publicClients, maxAge? })`

Multichain-only attestation verifier. Subject reads dispatch via `chainForName`; attester ENS resolution always uses `publicClients.mainnet`. There is no single-chain form — verification is inherently cross-chain.

### Routing primitives

| Symbol | Description |
|---|---|
| `chainForName(name)` | Returns `'base'` for strict subdomains of `base.eth`, `'mainnet'` otherwise |
| `MissingChainClientError` | Thrown by the multichain wrappers when a name routes to a chain whose client isn't in the map |
| `SupportedChain` | Union of chain identifiers the wrapper layer dispatches over |
| `ChainClients` / `ChainWalletClients` | Typed maps shaping the wrapper config |

### Standalone functions

| Function | Description |
|---|---|
| `fetchSchema(uri, opts)` | Resolve `ipfs://<cid>` or `https://...` to `Schema` (optional `resolver` fast-path) |
| `fetchSchemaFromIpfs(uri, opts)` / `fetchSchemaFromHttps(uri, opts)` | Protocol-specific fetchers |
| `fetchSchemaFromLocal(uri, resolver)` | Resolve a URI via a caller-provided resolver only |
| `getSchemaKeys(schema)` | Return the property keys declared by a Schema, in order |
| `validateMetadataSchema(data, schema)` | Validate data against a schema |
| `validate(schema, data)` | Boolean wrapper around `validateMetadataSchema` |
| `computeDelta(original, desired)` | Compute `{ changes, deleted }` between two states |
| `hasChanges(original, desired)` | Boolean check for differences |
