# @ens-node-metadata/sdk

Read, validate, and write structured metadata on individual ENS nodes. Built on [viem](https://viem.sh) and [@ensdomains/ensjs](https://github.com/ensdomains/ensjs).

## Install

```bash
pnpm add @ens-node-metadata/sdk viem @ensdomains/ensjs
```

## Read

Extend any viem public client with `ensMetadataActions()` to read node metadata.

```ts
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { addEnsContracts } from '@ensdomains/ensjs'
import { ensMetadataActions } from '@ens-node-metadata/sdk'

const client = createPublicClient({
  chain: addEnsContracts(mainnet),
  transport: http(),
}).extend(ensMetadataActions())

// Get schema info (class, version, CID)
const schema = await client.getSchema({ name: 'mynode.eth' })
// { schema: 'ipfs://Qm...', class: 'Agent', version: '1.0', cid: 'Qm...' }

// Get all metadata (resolver, address, text records)
const metadata = await client.getMetadata({ name: 'mynode.eth' })
// { name, resolver, address, class, schema, properties: { description: '...', ... } }

// Fetch only specific keys
const partial = await client.getMetadata({
  name: 'mynode.eth',
  keys: ['description', 'avatar', 'url'],
})
```

## Validate

Validate metadata against a JSON Schema before writing.

```ts
import { validateMetadataSchema } from '@ens-node-metadata/sdk'
import { SCHEMA_MAP } from '@ens-node-metadata/schemas'

const result = validateMetadataSchema(
  { description: 'My agent', url: 'https://example.com' },
  SCHEMA_MAP.Agent,
)

if (result.success) {
  console.log(result.data) // typed Record<string, string>
} else {
  result.errors.forEach((e) => console.log(`[${e.key}] ${e.message}`))
}
```

## Delta

Compute what changed between the current on-chain state and a desired state.

```ts
import { computeDelta, hasChanges } from '@ens-node-metadata/sdk'

const original = { description: 'Old desc', avatar: 'https://old.png' }
const desired = { description: 'New desc', avatar: '' }

const delta = computeDelta(original, desired)
// { changes: { description: 'New desc' }, deleted: ['avatar'] }

hasChanges(original, desired) // true
```

## Write

Extend a viem wallet client with `ensMetadataWalletActions()` to write metadata.

```ts
import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'
import { addEnsContracts } from '@ensdomains/ensjs'
import { ensMetadataWalletActions } from '@ens-node-metadata/sdk'

const walletClient = createWalletClient({
  chain: addEnsContracts(mainnet),
  transport: custom(window.ethereum),
  account: '0x...',
})

const writer = ensMetadataWalletActions({ publicClient })(walletClient)

// Write full records
const result = await writer.setMetadata({
  name: 'mynode.eth',
  records: { description: 'An agent node', url: 'https://example.com' },
})
// { txHash: '0x...', texts: [...], coins: [...] }

// Or apply a delta (when you already have the resolver address)
const result = await writer.applyDelta({
  name: 'mynode.eth',
  delta: { changes: { description: 'Updated' }, deleted: ['old-key'] },
  resolverAddress: '0x...',
})
```

### Validate before writing

Pass a `schema` to `setMetadata` to validate before the transaction is sent. Throws `MetadataWriteError` if validation fails.

```ts
import { SCHEMA_MAP } from '@ens-node-metadata/schemas'

await writer.setMetadata({
  name: 'mynode.eth',
  records: { description: 'My agent' },
  schema: SCHEMA_MAP.Agent, // validates before writing
})
```

## API

### Read (via `ensMetadataActions()`)

| Method | Description |
|---|---|
| `getSchema({ name })` | Fetch schema, class, version, and CID text records |
| `getMetadata({ name, schema?, keys? })` | Fetch resolver, address, and text records |

### Write (via `ensMetadataWalletActions({ publicClient })`)

| Method | Description |
|---|---|
| `setMetadata({ name, records, deleted?, schema? })` | Write text records, optionally validate first |
| `applyDelta({ name, delta, resolverAddress })` | Apply a `{ changes, deleted }` delta |

### Standalone

| Function | Description |
|---|---|
| `validateMetadataSchema(data, schema)` | Validate data against a schema |
| `computeDelta(original, desired)` | Compute `{ changes, deleted }` between two states |
| `hasChanges(original, desired)` | Boolean check for differences |
