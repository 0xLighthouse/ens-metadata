# @ensmetadata/cli

CLI for registering AI agents on ENS using [ERC-8004](https://best-practices.8004scan.io/docs/01-agent-metadata-standard.html) (v2.0).

## Agent prompt

Paste this into your AI assistant after [reading the code](https://github.com/0xLighthouse/ens-node-metadata/tree/develop/packages/cli).

```bash
Learn how to manage ENS metadata using the following command:

pnpm add -g @ensmetadata/cli && ens-metadata --help
```

## Registration Flow

See [SKILL.md](./SKILL.md) for the full step-by-step guide.

## Upcoming

### Reputation Registry

- [ ] `ens-metadata registry reputation give` — leave feedback for an agent
- [ ] `ens-metadata registry reputation revoke` — revoke your feedback
- [ ] `ens-metadata registry reputation read` — read a specific feedback entry
- [ ] `ens-metadata registry reputation summary` — aggregated score (count + value)

### Validation Registry (under active discussion)

- [ ] `ens-metadata registry validation request` — request validation for an agent
- [ ] `ens-metadata registry validation respond` — validator submits response
- [ ] `ens-metadata registry validation status` — check validation status

## Related Packages

- [`@ensmetadata/schemas`](#TODO) — JSON schemas for all ENS node types
- [`@ensmetadata/sdk`](https://www.npmjs.com/package/@ensmetadata/sdk) — ENS metadata read SDK
