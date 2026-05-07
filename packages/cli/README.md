# @ensmetadata/cli

A command-line tool for managing AI agent identity using ENS and [ERC-8004](https://best-practices.8004scan.io/docs/01-agent-metadata-standard.html) v2.0. Aimed at developers setting up an agent end-to-end: read and write ENS text records, verify on-chain attestations, publish registration files to IPFS, and register agents on the canonical IdentityRegistry.

> **Status:** pre-1.0. The CLI surface and output shapes may change between minor versions.

## Installation

```sh
pnpm add -g @ensmetadata/cli
# or: npm i -g @ensmetadata/cli
# or: pnpm dlx @ensmetadata/cli <command>
```

The installed binary is `ens-metadata`. Requires Node.js 22 or newer.

```sh
ens-metadata --help
ens-metadata <command> --help
```

## Quickstart

These read-only commands work with no credentials:

```sh
# Inspect any ENS name's metadata text records
ens-metadata view myagent.eth

# Look up an agent by token ID on the canonical registry
ens-metadata agent registry query 42 --chain mainnet

# Verify an on-chain social media attestation by specifying ENS name and which social media provider
ens-metadata attestation verify handle myagent.eth com.x
```

For write commands, see [Configuration](#configuration) and [Conventions](#conventions) below.

## Configuration

### RPC URLs

Every chain-touching command resolves an RPC URL using this precedence:

1. `--rpc <url>` flag
2. `RPC_URL_<chainId>` environment variable (for example `RPC_URL_1`, `RPC_URL_11155111`, `RPC_URL_8453`)
3. `MAINNET_RPC_URL` (mainnet only)
4. `ETH_RPC_URL` (any chain)
5. A curated set of public fallback RPCs, then viem's built-in defaults

Public fallbacks are best-effort. For production use, supply your own RPC using one of the above methods.

### Supported chains

When working with ERC-8004 registries, pass `--chain <name>` to select the network. The CLI auto-detects the canonical IdentityRegistry address for that chain (mainnet vs. testnet), so you never need to supply the contract address yourself. If `--chain` is omitted, `mainnet` is used.

Mainnets: `mainnet`, `base`, `arbitrum`, `optimism`, `polygon`, `avalanche`, `bsc`, `linea`, `scroll`, `mantle`, `gnosis`, `celo`, `taiko`, `abstract`.

Testnets: `sepolia`, `base-sepolia`, `arbitrum-sepolia`, `optimism-sepolia`, `polygon-amoy`, `avalanche-fuji`, `bsc-testnet`, `linea-sepolia`, `scroll-sepolia`, `mantle-sepolia`, `celo-alfajores`, `monad-testnet`, `abstract-testnet`.

The authoritative list is defined in [`src/lib/registry.ts`](./src/lib/registry.ts).

### Pinata (IPFS publishing)

The `agent registration-file publish` command uploads to IPFS via Pinata. Provide either:

- `PINATA_JWT` (preferred), or
- `PINATA_API_KEY` and `PINATA_API_SECRET` (legacy key pair)

## Conventions

**Structured JSON output.** Every command writes a JSON object to stdout. Pipe into `jq` for further processing.

**Private keys.** Write commands take `--private-key 0x<hex>`. The key is used in-process for signing and is never logged. Prefer environment-injected keys over shell history (for example `--private-key "$DEPLOYER_KEY"`).

**Dry-run by default.** Commands that send transactions (`set`, `agent registry register`, `agent registry set-uri`, `agent registry set-wallet`, `agent registry unset-wallet`) accept a `--broadcast` flag. Without it, the command returns a transaction preview containing the signer, target contract, encoded calldata, estimated cost, and the signer's balance. This allows you to run the command without `--broadcast` first, confirm the output, then re-run with `--broadcast` to submit.

**Exit codes.** Validation commands set a non-zero exit code on failure so they can gate CI pipelines. Successful runs exit `0`.

## Command reference

### Top-level metadata commands

These operate on ENS text records for any ENS name.

#### `view <name>`

Read resolved metadata for an ENS name and, if the name declares a `schema` text record, fetch that schema and validate the on-chain properties against it.

```sh
ens-metadata view myagent.eth
ens-metadata view myagent.eth --ipfs-gateway https://my-gateway.example
```

When the name's `schema` record is set, the CLI fetches the schema document (preferring the bundled cache before falling back to the IPFS gateway), validates the recorded properties against it, and reports the result in `matchedSchema`.

Valid against the declared schema:

```json
{
  "name": "myagent.eth",
  "resolver": "0x231b...",
  "address": "0xAbC0...",
  "class": "Agent",
  "schema": "ipfs://bafy...",
  "matchedSchema": {
    "title": "Agent",
    "version": "1.0.0",
    "uri": "ipfs://bafy...",
    "valid": true
  },
  "properties": {
    "name": "My Agent",
    "description": "Helps with on-chain research.",
    "image": "https://example.com/avatar.png"
  }
}
```

Invalid against the declared schema (the URI was fetched but the properties don't conform):

```json
{
  "matchedSchema": {
    "title": "Agent",
    "version": "1.0.0",
    "uri": "ipfs://bafy...",
    "valid": false,
    "errors": [
      { "key": "image", "message": "Required field \"image\" is missing" }
    ]
  }
}
```

When the schema URI can't be fetched (gateway unreachable, bad CID, malformed JSON), the rest of the metadata is still returned and `matchedSchema` carries a soft-failure shape:

```json
{
  "matchedSchema": {
    "uri": "ipfs://bafy...",
    "valid": false,
    "error": "Failed to fetch schema from IPFS gateway (...): HTTP 504 Gateway Timeout"
  }
}
```

When no `schema` record is declared on the name, `matchedSchema` is `null` and no fetch is performed. `resolver`, `address`, `class`, and `schema` are `null` when their corresponding records are unset.

Options:

- `--ipfs-gateway <origin>` (env: `IPFS_GATEWAY`): override the gateway used to fetch the schema document. Defaults to `https://ipfs.io`. Has no effect when the schema CID is already in the bundled `@ensmetadata/schemas` registry.

#### `set <name> <payload>`

Write text records to an ENS name from a payload file. The CLI computes a delta against the existing on-chain values and submits only the changed and deleted keys in a single multicall transaction. If the payload includes a `schema` URI, or one is already set on the name, the payload is validated against that schema before any write.

Schema resolution cascade:
1. If `payload.schema` is set, fetch and validate against it.
2. Otherwise read the `schema` text record from ENS; if set, fetch and validate.
3. Otherwise skip schema validation.

By default empty-string entries in the payload are dropped so blank template fields don't overwrite existing records. Pass `--include-empty` to send empty strings (this is how you delete records via the payload).

`--private-key` is optional in dry-run; when omitted, the CLI looks up the ENS manager from ENSNode and uses that as the from-address for gas estimation. `--private-key` is required for `--broadcast`.

```sh
ens-metadata set myagent.eth ./payload.json
ens-metadata set myagent.eth ./payload.json --private-key "$KEY" --broadcast
ens-metadata set myagent.eth ./payload.json --private-key "$KEY" --include-empty --broadcast
```

Other options:

- `--ipfs-gateway <origin>` (env: `IPFS_GATEWAY`): override the gateway used to fetch schema documents (defaults to `https://ipfs.io`).

Dry-run output:

```json
{
  "dryRun": true,
  "name": "myagent.eth",
  "schema": {
    "source": "ens",
    "uri": "ipfs://bafy...",
    "validated": true
  },
  "signer": {
    "address": "0xAbC0...",
    "source": "ensManager"
  },
  "records": [
    { "key": "name", "value": "My Agent" },
    { "key": "description", "value": "Helps with on-chain research." }
  ],
  "diff": {
    "added": [{ "key": "name", "value": "My Agent" }],
    "updated": [],
    "deleted": [],
    "unchanged": []
  },
  "estimatedCost": "0.00214 ETH ($7.38)",
  "balance": "0.123456 ETH",
  "hint": "Run with --private-key 0x<KEY> --broadcast to submit on-chain."
}
```

`estimatedCost` and `balance` are best-effort and omitted if gas estimation fails.

The `schema.source` field is one of `payload`, `ens`, or `none`. The `signer.source` field is `privateKey` when `--private-key` is supplied and `ensManager` when it isn't. If the payload contains no changes against current on-chain values, `set` returns `noOp: true` instead of `records` and exits without simulating a transaction.

Broadcast output:

```json
{
  "broadcast": true,
  "name": "myagent.eth",
  "schema": {
    "source": "ens",
    "uri": "ipfs://bafy...",
    "validated": true
  },
  "txHash": "0x9f3c...",
  "explorerUrl": "https://etherscan.io/tx/0x9f3c...",
  "diff": { "added": [], "updated": [], "deleted": [], "unchanged": [] }
}
```

#### `validate <file>`

Validate an ENS metadata payload against the agent schema. Exits non-zero on failure.

```sh
ens-metadata validate ./payload.json
```

```json
{ "valid": true, "recordCount": 7 }
```

```json
{
  "valid": false,
  "errors": [
    { "key": "name", "message": "Required" },
    { "key": "image", "message": "Invalid url" }
  ]
}
```

#### `template <type>`

Print an empty payload skeleton for the given metadata schema type. The output has every property keyed to an empty string (apart from `class`, set to its declared default, and `schema`, set to the IPFS URI of the published schema version). Edit the result and pass it to `set`.

`<type>` accepts either a registry id (e.g. `agent`, `org`) or a schema title (e.g. `Agent`, `Organization`), case-insensitive. By default the latest published version is used; pass `--version <semver>` to pin to a specific one.

```sh
ens-metadata template agent > payload.json
ens-metadata template org --version 1.0.0 > payload.json
```

#### `skill`

Print the bundled `SKILL.md` walkthrough to stdout. Used by AI assistants and for quick reference.

```sh
ens-metadata skill
```

### `agent registration-file` group

Build, validate, and publish ERC-8004 v2.0 registration files. These run off-chain; the resulting IPFS URI is what you register on-chain in the next group.

#### `agent registration-file template`

Print a starter ERC-8004 v2.0 registration file. Edit before publishing.

The `agentRegistry` field is auto-filled with the canonical IdentityRegistry address for the chain you pass via `--chain` (defaulting to `mainnet`), so it stays in sync with what `agent registry register --chain <name>` will actually use. See [Supported chains](#supported-chains) for the full list.

```sh
ens-metadata agent registration-file template > registration.json
ens-metadata agent registration-file template --chain base > registration.json
```

Example output (mainnet):

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "My Agent",
  "description": "A short description of what this agent does and its capabilities.",
  "image": "https://example.com/agent-avatar.png",
  "services": [
    { "name": "MCP", "endpoint": "https://api.example.com/mcp", "version": "2025-11-25", "mcpTools": [], "capabilities": [] },
    { "name": "A2A", "endpoint": "https://example.com/.well-known/agent-card.json", "version": "0.3.0" },
    { "name": "agentWallet", "endpoint": "eip155:1:0x0000000000000000000000000000000000000000" }
  ],
  "registrations": [
    { "agentId": 0, "agentRegistry": "eip155:1:0x..." }
  ],
  "supportedTrust": ["reputation"],
  "active": false,
  "x402Support": false,
  "updatedAt": 1730000000
}
```

The `agentWallet` endpoint also uses the same chain id; replace the zero address with the wallet you want to associate. `agentId: 0` is a placeholder; the real value is assigned when you call `agent registry register`.

#### `agent registration-file validate <file>`

Validate a registration file against the ERC-8004 v2.0 schema. Exits non-zero on failure.

```sh
ens-metadata agent registration-file validate ./registration.json
```

```json
{ "valid": true }
```

```json
{
  "valid": false,
  "errors": [
    { "path": "services.0.endpoint", "message": "Invalid url" }
  ]
}
```

#### `agent registration-file publish <file>`

Validate, then upload the file to IPFS via Pinata. Requires `PINATA_JWT` or `PINATA_API_KEY` plus `PINATA_API_SECRET` in the environment. The returned `uri` is the value you pass to `agent registry register`.

```sh
ens-metadata agent registration-file publish ./registration.json
```

```json
{
  "cid": "bafkreigh2akiscaildcq6vzgxw4n2jszk2nyer3pukpekutw4lwomoiwie",
  "uri": "ipfs://bafkreigh2akiscaildcq6vzgxw4n2jszk2nyer3pukpekutw4lwomoiwie"
}
```

### `agent registry` group

Interact with the canonical ERC-8004 IdentityRegistry contracts. The chain is selected with `--chain`; see [Supported chains](#supported-chains). All write commands follow the dry-run pattern documented in [Conventions](#conventions).

#### `agent registry register <agent-uri>`

Register a new agent identity on the IdentityRegistry. Mints a new token whose URI points at your published registration file.

```sh
ens-metadata agent registry register ipfs://bafk... \
  --chain mainnet --private-key "$KEY" --broadcast
```

Dry-run output:

The `registry` and `to` fields below are auto-detected from `--chain`.

```json
{
  "dryRun": true,
  "chain": "mainnet",
  "registry": "0x...",
  "function": "register",
  "signer": "0xAbC0...",
  "to": "0x...",
  "data": "0x...",
  "value": "0",
  "estimatedCost": "0.00184 ETH ($6.34)",
  "balance": "0.123456 ETH",
  "agentUri": "ipfs://bafk...",
  "hint": "Run with --broadcast to submit on-chain."
}
```

Broadcast output:

```json
{
  "broadcast": true,
  "chain": "mainnet",
  "registry": "0x...",
  "function": "register",
  "txHash": "0x9f3c...",
  "explorerUrl": "https://etherscan.io/tx/0x9f3c...",
  "agentUri": "ipfs://bafk..."
}
```

#### `agent registry query <agent-id>`

Read-only lookup of an agent token by ID. Returns the owner address and current agent URI.

```sh
ens-metadata agent registry query 42 --chain mainnet
```

```json
{
  "chain": "mainnet",
  "registry": "0x...",
  "tokenId": "42",
  "owner": "0xAbC0...",
  "agentUri": "ipfs://bafk..."
}
```

#### `agent registry set-uri <agent-id> <new-uri>`

Update an existing agent's URI. Run after re-publishing a registration file with new content.

```sh
ens-metadata agent registry set-uri 42 ipfs://bafkNew... \
  --chain mainnet --private-key "$KEY" --broadcast
```

Output shape matches `register`, with `function: "setAgentURI"` and additional `agentId` and `newUri` fields.

#### `agent registry set-wallet <agent-id> <wallet-address>`

Link a verified wallet to an agent via EIP-712 signature. Two modes:

```sh
# Self-sign: signer key controls the wallet being linked
ens-metadata agent registry set-wallet 42 0xWallet... \
  --chain mainnet --private-key "$KEY" --broadcast

# Pre-signed: wallet is controlled by a different key; submitter passes signature
ens-metadata agent registry set-wallet 42 0xWallet... \
  --chain mainnet --private-key "$SUBMITTER_KEY" \
  --deadline 1730000000 --signature 0x... --broadcast
```

When `--signature` is omitted, the CLI auto-signs with the provided key and sets the deadline to 240 seconds after the latest block's timestamp. When `--signature` is provided, the CLI verifies it against the wallet address before submission.

The dry-run output includes the encoded EIP-712 domain and message (only when auto-signing) so you can produce the signature out-of-band when self-signing isn't possible:

```json
{
  "dryRun": true,
  "chain": "mainnet",
  "function": "setAgentWallet",
  "agentId": "42",
  "wallet": "0xWallet...",
  "deadline": "1730000240",
  "signer": "0xAbC0...",
  "signature": "auto-signed",
  "estimatedCost": "0.00197 ETH ($6.79)",
  "balance": "0.123456 ETH",
  "eip712": {
    "domain": {
      "name": "ERC8004IdentityRegistry",
      "version": "1",
      "chainId": 1,
      "verifyingContract": "0x..."
    },
    "primaryType": "AgentWalletSet",
    "message": {
      "agentId": "42",
      "newWallet": "<wallet-address>",
      "owner": "0xAbC0...",
      "deadline": "<unix-timestamp>"
    }
  },
  "hint": "Run with --broadcast to submit. To use a different signer, pass --signature <0x...> --deadline <timestamp>."
}
```

The `eip712` block is omitted when `--signature` is supplied (the verified signature is shown as `signature: "provided (verified)"` instead).

#### `agent registry unset-wallet <agent-id>`

Clear the verified wallet link from an agent.

```sh
ens-metadata agent registry unset-wallet 42 \
  --chain mainnet --private-key "$KEY" --broadcast
```

Output shape matches the other registry write commands, with `function: "unsetAgentWallet"`.

### `attestation verify` group

Verify EIP-712 attestation envelopes that have been written into ENS text records by an attester. Read-only; no signing key needed.

#### `attestation verify handle <name> <platform>`

Verify a social-handle attestation written to `social-proofs[<platform>][<attester-ens>]`. The attester defaults to `atst.lighthousegov.eth`.

```sh
ens-metadata attestation verify handle myagent.eth com.x
ens-metadata attestation verify handle myagent.eth com.x \
  --attester other-attester.eth --max-age 86400
```

Successful output:

```json
{
  "valid": true,
  "handle": "@myagent",
  "issuedAt": 1730000000,
  "attester": "atst.lighthousegov.eth",
  "attesterAddress": "0xAbC0..."
}
```

Failure output: `valid: false` with a `reason` field. Possible reasons fall into two groups.

Pre-claim failures (the attestation couldn't be located or decoded):

```json
{ "valid": false, "reason": "missing" }
```

```json
{ "valid": false, "reason": "attester-not-resolved", "attester": "atst.lighthousegov.eth" }
```

Other pre-claim reasons: `owner-not-resolved`, `decode-error`.

Claim-level failures (the envelope was decoded but rejected):

```json
{
  "valid": false,
  "reason": "signature-mismatch",
  "handle": "@myagent",
  "issuedAt": 1730000000,
  "attester": "atst.lighthousegov.eth",
  "attesterAddress": "0xAbC0..."
}
```

Other claim-level reasons include `expired`, `name-mismatch`, and `too-old` (when `--max-age` is set). The exact list lives in [`@ensmetadata/sdk`](https://www.npmjs.com/package/@ensmetadata/sdk).

#### `attestation verify uid <name> <platform> <uid>`

Verify a uid attestation written to `uid[<platform>][<attester-ens>]` against a caller-supplied raw uid. Same defaults and output shape as `verify handle`, with `uid` in the response instead of `handle`.

```sh
ens-metadata attestation verify uid myagent.eth com.x 1234567890
```

## Workflows

A minimal end-to-end agent registration looks like this:

```sh
# 1. Generate a starter registration file and edit it
ens-metadata agent registration-file template > registration.json
$EDITOR registration.json

# 2. Validate before paying for IPFS
ens-metadata agent registration-file validate registration.json

# 3. Publish to IPFS (requires PINATA_JWT)
ens-metadata agent registration-file publish registration.json
# → { "cid": "...", "uri": "ipfs://..." }

# 4. Dry-run the on-chain registration to preview cost
ens-metadata agent registry register ipfs://<cid> \
  --chain mainnet --private-key "$KEY"

# 5. Submit for real
ens-metadata agent registry register ipfs://<cid> \
  --chain mainnet --private-key "$KEY" --broadcast
# → { "txHash": "0x...", ... }

# 6. (Optional) Link a verified wallet to the new agent token
ens-metadata agent registry set-wallet <agent-id> 0xWallet... \
  --chain mainnet --private-key "$KEY" --broadcast

# 7. Verify on-chain attestations on the agent's ENS name
ens-metadata attestation verify handle myagent.eth com.x
```

For the full walkthrough (suggested artifact directory layout, dry-run/broadcast guardrails, attester onboarding), see [SKILL.md](./SKILL.md). Print it locally with `ens-metadata skill`.

## Troubleshooting

`Missing Pinata credentials.` Set `PINATA_JWT` (preferred) or both `PINATA_API_KEY` and `PINATA_API_SECRET` in the environment before running `agent registration-file publish`.

`No resolver found for <name>` or `No resolver set for <name>`. The ENS name has no resolver configured, so there is nowhere to write text records or read class/schema. Set a resolver via the ENS app or another tool, then re-run.

RPC timeouts or `429`/`Too Many Requests`. The public fallback RPCs are best-effort and rate-limited. Supply your own with `--rpc <url>`, or via `RPC_URL_<chainId>` (for example `RPC_URL_1` for mainnet, `RPC_URL_8453` for Base), `MAINNET_RPC_URL`, or `ETH_RPC_URL`.

`Signature does not recover to wallet <address>` from `set-wallet`. The `--signature` you supplied was not produced by the wallet you're trying to link, or the `--deadline` doesn't match the deadline that was signed over. Re-sign against the EIP-712 domain shown in the dry-run output, including the same `agentId`, `newWallet`, `owner`, and `deadline`.

`ENSNode has no record of <name>.` `set` was invoked without `--private-key` and the indexer doesn't know about the name yet (recently registered names take time to propagate). Pass `--private-key` to skip the manager lookup.

Validation failure on `set` with `Invalid payload (validated against schema from ens: ipfs://...)`. The `schema` text record on the name points to a schema that the payload doesn't conform to. Either edit the payload to match, or override with `payload.schema` to validate against a different schema.

## Related packages

- [`@ensmetadata/sdk`](https://www.npmjs.com/package/@ensmetadata/sdk): programmatic read/write SDK underlying this CLI
- `@ensmetadata/schemas`: JSON schemas for ENS metadata classes (workspace package)
