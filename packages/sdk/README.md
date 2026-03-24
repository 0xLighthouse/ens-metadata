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

## API

### Read — `metadataReader()`

| Method | Description |
|---|---|
| `getSchema({ name })` | Fetch schema, class, version, and CID text records |
| `getMetadata({ name, schema?, keys? })` | Fetch resolver, address, and text records |

### Write — `metadataWriter({ publicClient })`

| Method | Description |
|---|---|
| `setMetadata({ name, records, deleted?, schema? })` | Write text records, optionally validate first |
| `applyDelta({ name, delta, resolverAddress })` | Apply a `{ changes, deleted }` delta |

### Standalone functions

| Function | Description |
|---|---|
| `validateMetadataSchema(data, schema)` | Validate data against a schema |
| `computeDelta(original, desired)` | Compute `{ changes, deleted }` between two states |
| `hasChanges(original, desired)` | Boolean check for differences |
