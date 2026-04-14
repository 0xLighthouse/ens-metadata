# @ensmetadata/schemas

A package for managing and publishing ENSIP schema definitions to IPFS.

Explore existing schemas <https://ens-metadata-docs.vercel.app/schemas/agent>

## Overview

Schemas are organized into two categories:

- **Community schemas** — managed in `src/schemas`
- **ENSIP-denoted schemas** — managed in `src/globals`

Each published schema is versioned, checksummed, and signed with an EIP-712 payload before being pinned to IPFS.

## Usage

```bash
# Publish a schema by ID
pnpm publish:schema --id org

# Publish and bump the version
pnpm publish:schema --id org --bump (patch|minor|major)

# Publish all common ENSIPs as a global collection
pnpm publish:globals
```

## Environment Variables

The following environment variables are required when publishing:

```sh
SCHEMA_PUBLISHER_PRIVATE_KEY=
PINATA_API_KEY=
PINATA_API_SECRET=
PINATA_JWT=
```

## Output Structure

Published artifacts are written to `packages/schemas/published/`:

```sh
published/
  _latest.json              # Map of schemaId → latest { version, cid, checksum, timestamp, signer, signature, eip712 }
  _registry.json            # Full registry across all published versions
  {schemaId}/
    versions/{version}/
      schema.json           # Exported schema
      checksum.sha256
      cid.txt
      meta.json             # Signer, signature, and EIP-712 payload
    runs/ipfs/
      run-<unix>.json       # Append-only signed publish log
      run-latest.json
    index.json              # Per-schema version list with latest pointer
```

## Behavior

- Publishing is **idempotent by version** — if `{schemaId}@{version}` has already been published, the command will refuse to overwrite it.
- All schemas are **EIP-712 signed**. Inspect any `run-*.json` file to verify a publish.

## Contributing

To suggest a new schema or changes to an existing one, open a pull request against the `develop` branch of the [repository](https://github.com/0xLighthouse/ens-metadata).

### Adding a new schema

1. Create a new file in `src/schemas/` (e.g. `src/schemas/myschema.ts`).
2. Export a constant that satisfies the `Schema` interface from `src/types.ts`:

```ts
import type { Schema } from "../types";
import { GITHUB_URL } from "../config/constants";

export const MY_SCHEMA: Schema = {
  $id: `${GITHUB_URL}/schemas/myschema/1.0.0`,
  source: 'https://link-to-relevant-standard-or-eip',
  title: 'MySchema',
  version: '1.0.0',
  description: 'A short description of what this schema represents.',
  type: 'object',
  properties: {
    class: {
      type: 'string',
      default: 'MySchema',
      description: 'High-level identifier of this node type',
    },
    // ...
  },
  required: ['class'],
  recommended: [],
};
```

3. Register the schema in `src/index.ts` by importing it and adding it to the `SCHEMAS` array.

### Modifying an existing schema

Edit the relevant file in `src/schemas/` (or `src/globals/` for ENSIP-denoted schemas). Use the following as a guide for choosing a version bump:

| Change type | Bump |
|---|---|
| Rename, remove, or change type of a field | `major` |
| New optional field | `minor` |
| Description or metadata only | `patch` |

Update the `version` field and the version segment of `$id` to match.

### Conventions

- File names should be lowercase, matching the schema's intended `title` (e.g. `delegate.ts` for `title: 'Delegate'`).
- Exported constant names follow the pattern `TITLE_SCHEMA` (e.g. `DELEGATE_SCHEMA`).
- New schemas should start at version `1.0.0`.
- Use `required` for fields that must be present (unusual), and `recommended` for fields that our UI will suggest the user should fill out.

### What to include in your PR

- A brief explanation of the use case the schema serves.
- A link to any relevant standard, EIP, or ENSIP referenced in the `source` field.
- For modifications, a clear description of what changed and why.

### What not to include

For community schemas that will live in this repo, do not run the publish scripts or commit anything under `published/`. Publishing is handled by maintainers after a PR is reviewed and merged.
