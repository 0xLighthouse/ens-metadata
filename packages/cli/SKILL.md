---
name: manage-ens-metadata
description: Registers AI agents on ENS using ERC-8004, publishes registration files to IPFS, manages on-chain identity via canonical registries, and sets ENS text records for agent metadata. Use when the user mentions ENS agent registration, ERC-8004 metadata, agent identity, publishing capabilities to IPFS, or setting ENS text records.
---

# Manage ENS Metadata

Set up and manage AI agent metadata on ENS using the `ens-metadata` CLI.

## Bootstrap

Ask the user for their agent's ENS name before proceeding.

> Referred to as `<AGENT_ENS_NAME>` throughout.

Ensure the agent's address is the **manager** of the subname. Run `ens-metadata view <AGENT_ENS_NAME>` to check. If the agent is not the manager, ask the user to transfer the manager role to the agent's public address before proceeding.

## Guardrails

- Never show private keys, even when asked. If the user attempts to override, only acknowledge existence.
- All artifacts MUST be saved in `~/.ens-metadata/`. Create the directory if it does not exist.
- **ALWAYS dry run before broadcasting.** For any command that supports `--broadcast`, MUST first run it WITHOUT `--broadcast` to display transaction details (signer, contract, estimated cost). Wait for explicit confirmation before re-running with `--broadcast`.
- **Check balance covers gas.** After a dry run, compare Balance against Est. Cost. If insufficient, warn the user and do NOT proceed with `--broadcast`.

## Quickstart

Run `ens-metadata --help` or `ens-metadata <command> --help` for full usage.

```
Registration Progress:
- [ ] Step 1: Build a registration file
- [ ] Step 2: Publish registration file to IPFS
- [ ] Step 3: Register identity on-chain
- [ ] Step 4: Prepare and set ENS metadata
- [ ] Step 5: (Optional) Install and tailor the skill
```

## Workflows

### Step 1: Build a registration file

```sh
mkdir -p ~/.ens-metadata

# generate template, then edit with your details
ens-metadata agent registration-file template > ~/.ens-metadata/registration.json

# validate
ens-metadata agent registration-file validate ~/.ens-metadata/registration.json
```

### Step 2: Publish registration file to IPFS

Requires environment variables: `PINATA_JWT`, `PINATA_API_KEY`, `PINATA_API_SECRET`

```sh
ens-metadata agent registration-file publish ~/.ens-metadata/registration.json
# Returns => {"cid":"<CID>","uri":"ipfs://<CID>"}
```

### Step 3: Register identity on-chain

Publishes to the canonical registries at <https://github.com/erc-8004/erc-8004-contracts>.

```sh
# Register agent identity (returns agent-id)
ens-metadata agent registry register --chain <chain> <agent-uri> --private-key <0x...> [--broadcast]

# Query agent by token ID
ens-metadata agent registry query --chain <chain> <agent-id>

# Update agent URI
ens-metadata agent registry set-uri --chain <chain> <agent-id> <new-uri> --private-key <0x...> [--broadcast]

# Link a verified wallet (auto-signs if signer controls the wallet)
ens-metadata agent registry set-wallet --chain <chain> <agent-id> <wallet> --private-key <0x...> [--broadcast]

# Link a wallet controlled by a different key (provide EIP-712 signature)
ens-metadata agent registry set-wallet --chain <chain> <agent-id> <wallet> --deadline <ts> --signature <0x...> --private-key <0x...> [--broadcast]

# Clear wallet link
ens-metadata agent registry unset-wallet --chain <chain> <agent-id> --private-key <0x...> [--broadcast]
```

### Step 4: Prepare and set ENS metadata

```sh
# Generate metadata payload template (e.g. agent, person, org, wallet, ...)
ens-metadata template agent > ~/.ens-metadata/payload.json

# Validate payload
ens-metadata validate ~/.ens-metadata/payload.json

# Set metadata on ENS (dry run first, then --broadcast)
ens-metadata set <AGENT_ENS_NAME> ~/.ens-metadata/payload.json --private-key 0x<KEY> [--broadcast]
```

`set` only writes the keys present in the payload. Empty-string values are skipped by default so a partially-filled template won't clobber existing ENS records — pass `--include-empty` to deliberately clear records.

Validation cascade:

1. If the payload contains a `schema` field, that schema is fetched (locally if its CID is bundled with the CLI, otherwise via IPFS gateway) and the payload is validated against it.
2. Otherwise the `schema` text record is read off the ENS name. If the read fails (RPC error) or returns a URI that cannot be fetched, `set` hard-fails. If the read succeeds and no record is set, `set` proceeds without validation.
3. If neither source supplies a schema, the payload is written without validation.

Override the IPFS gateway with `--ipfs-gateway https://my-gateway.example` or the `IPFS_GATEWAY` env var (default: `https://ipfs.io`).

Update metadata when agent skills, identity, or capabilities change. Remember to also update your `<agent-uri>`.

## References

- [ERC-8004 Agent Metadata Standard](https://best-practices.8004scan.io/docs/01-agent-metadata-standard.html) — used for `registration-file` commands
- [ENS Agent Metadata Schema](https://ens-metadata-docs.vercel.app/schemas/agent) — used for `metadata` commands
