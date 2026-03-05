# @ens-node-metadata/cli

CLI for registering AI agents on ENS using [ERC-8004](https://best-practices.8004scan.io/docs/01-agent-metadata-standard.html) (v2.0).

## Agent prompt

Paste this into your AI assistant after [reading the code](https://github.com/0xLighthouse/ens-node-metadata/tree/develop/packages/cli).

```bash
To manage your ERC-8004 metadata with ENS, use the following command:

pnpm dlx @ens-node-metadata/cli --help
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

- [`@ens-node-metadata/schemas`](#TODO) — JSON schemas for all ENS node types
- [`@ens-node-metadata/sdk`](https://www.npmjs.com/package/@ens-node-metadata/sdk) — ENS metadata read SDK
