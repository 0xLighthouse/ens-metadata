# ENS Metadata

This is a monorepo for the ENS Metadata project, sponsored by ENS. An ENSIP is [currently in development](https://github.com/ensdomains/ensips/pull/64) to standardize a protocol for adding additional metadata attributes to ENS names. This will make it possible to attach structured, typed records (like organizational roles, categories, or labels) directly to ENS nodes onchain. This repo includes a proof-of-concept interface for reading and writing those records, along with the supporting SDK, schemas, and documentation.

For additional background on the project, see [our Notion page](https://stealth-respect-4e8.notion.site/Organizational-Metadata-on-ENS-2313a8375c77801dad2ce5b513ce9450).

**Live deployments:**

- Docs: https://ens-metadata-docs.vercel.app/
- Interface: https://ens-metadata-interface.vercel.app/

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v22.17.0 (see `.nvmrc`)
- [pnpm](https://pnpm.io/) v10.29.3

### Setup

```bash
# Install dependencies
pnpm install

# Start all apps/packages in dev mode
pnpm dev

# Or run just the interface
pnpm interface
```

### Useful Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages and apps |
| `pnpm dev` | Run everything in development mode |
| `pnpm interface` | Run only the interface app in dev mode |
| `pnpm lint` | Lint all workspaces via Biome |
| `pnpm format` | Auto-format the entire repo via Biome |
| `pnpm abis` | Regenerate contract ABIs via Wagmi CLI |

## Monorepo Overview

### Apps

| Directory | Description |
|-----------|-------------|
| `apps/docs` | Primary project documentation, built with [Vocs](https://vocs.dev/) ([README](apps/docs/README.md)) |
| `apps/interface` | Next.js web UI for reading/writing metadata records ([README](apps/interface/README.md)) |
| `apps/contracts` | Placeholder for future helper smart contracts |

### Packages

| Directory | Description |
|-----------|-------------|
| `packages/sdk` | SDK for interacting with the metadata protocol (built on viem) |
| `packages/schemas` | Toolchain for publishing JSON schemas to IPFS |
| `packages/abis` | TypeScript-first ABI definitions for the relevant contracts |
| `packages/shared` | Shared utilities and types used across the monorepo |
| `packages/tsconfig` | Shared TypeScript configuration |

## Development

This project uses [Turborepo](https://turbo.build/repo) for orchestrating builds across the monorepo and [pnpm workspaces](https://pnpm.io/workspaces) for dependency management.

Code quality is enforced automatically:

- **Formatting & linting** are handled by [Biome](https://biomejs.dev/).
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by [commitlint](https://commitlint.js.org/) and [Husky](https://typicode.github.io/husky/) git hooks.
