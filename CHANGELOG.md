# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Identity attestation system: new `apps/identity` flow for linking X and Telegram accounts to ENS names, backed by a Cloudflare Worker attester (`apps/attester`) with Turnkey production signing. The wizard supports multi-schema profile building, URL pre-fill, multiple attestations per request, and Cloudflare KV-backed intents.
- Native support for `*.base.eth` (Basenames): the SDK and CLI route reads, writes, and attestation verification through Base L2 via direct resolver calls, with a Base public-client factory and curated public Base RPC fallbacks.
- CLI: `verify-attestation` and `template` commands, a `--rpc` flag with env URL fallbacks, dry-run without a private key, and a `set` command that accepts schemas from multiple sources and handles empty values.
- SDK 0.3.0: text-record and resolver read primitives, schema fetch and resolution helpers, `prepare`/`estimate`/`setMetadataWithDelta` writer, and identity attestation primitives plus verifier. Refreshed README.
- atst.me static landing page hosting the attestation spec.
- `social-proofs` schema field and reverse-DNS namespacing (`com.x`, `org.telegram`) for attestation text records.

### Changed

- **BREAKING:** Renamed the attestation API from "proofs" across the SDK, and renamed `apps/proofs` to `apps/identity`. Reverse-DNS record keys replace the old naming.
- **BREAKING:** Attestation envelope finalized as v1 tagged CBOR (tag `atst`) with binary encoding, compact keys, and split handle/uid envelopes per platform binding. Platform UIDs are blinded before signing.
- Identity wizard: complete redesign with a new intent builder, signature at step 2, support for multiple attestations in a single request, and consolidated CSS.
- CLI rebuilt: migrated from Pastel/Ink to `incur`, refactored to a context pattern, matches schemas by CID instead of class name, and avoids rewriting unchanged ENS records.
- Docs renamed to "ENS Metadata"; landing page, schemas overview, and attestations guide rewritten. ENS-name keying and key rotation are now documented.
- Attester: Turnkey remote signer in production, attestation records keyed by attester ENS name (configurable via `ATTESTER_ENS`), separate handle and uid envelopes per platform.
- viem unified to 2.47.6 across all apps to match the SDK.
- [81f641e] [803d364] Renamed the GitHub repository from `ens-node-metadata` to `ens-metadata`. All schema `$id` URLs, READMEs, the interface footer, and CLI docs now point at the new location.
- [803d364] Republished every schema as v3.0.1 with the updated `$id` URL. New IPFS CIDs are recorded in `_registry.json`; v3.0.0 remains pinned at its original CIDs.

### Removed

- `apps/contracts` placeholder and the ENSNode subgraph dependency (replaced by direct on-chain reads).
- Dead code, orphaned files, and unused dependencies across the monorepo.

### Fixed

- Security hardening across the CLI: shell injection, error leakage, and input sanitization (#67).
- SDK now distinguishes unconfigured Basenames from RPC errors on read.
- CLI `verify-attestation` requires a platform argument and redacts RPC URLs to hostname; `withTimeout` clears its setTimeout when the wrapped promise wins.
- Wizard preserves user input when clicking back, and existing ENS text records are detected and not rewritten on `set`.

## [0.1.0] - 2026-04-14

### Added

- [deb871e] [44bed45] `inherit` flag on schema attributes so child nodes can pull values from their parent — applied across contract, group, and other schemas where inheritance is the expected behavior.
- [805459a] How-to guide for setting up ENS metadata for AI agents, including the relationship to ERC-8004.
- [6462279] How-to guide for delegate statements.
- [7b5c10a] How-to guide for DAOs and organizations.
- [8823689] Contract schema now exposes `url`, `com.github`, `com.twitter`, and `org.telegram` for project links and social handles.
- [28244ce] Schema v3.0.0 published to IPFS for every node type (agent, application, contract, delegate, grant, group, org, person, treasury, wallet).

### Changed

- [092509d] [44bed45] **BREAKING:** Renamed the `name` field to `alias` across every schema so it no longer collides with the ENS node name itself. Existing records using `name` will need to be migrated.
- [8823689] Contract schema overhauled: license examples now use SPDX identifiers, `audits` accepts arrays via pattern properties, and `compiled-metadata` has been removed.
- [cef3be9] Group schema's lead title is now inherited from the parent node by default.
- [a8e5c4e] [6683eba] Renamed the `use-cases` docs section to `how-to-guides` and rewrote the ENSIP-XX overview for clarity.

[Unreleased]: https://github.com/0xLighthouse/ens-metadata/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/0xLighthouse/ens-metadata/compare/ccf5ee8...v0.1.0

[28244ce]: https://github.com/0xLighthouse/ens-metadata/commit/28244ce
[cef3be9]: https://github.com/0xLighthouse/ens-metadata/commit/cef3be9
[44bed45]: https://github.com/0xLighthouse/ens-metadata/commit/44bed45
[deb871e]: https://github.com/0xLighthouse/ens-metadata/commit/deb871e
[8823689]: https://github.com/0xLighthouse/ens-metadata/commit/8823689
[092509d]: https://github.com/0xLighthouse/ens-metadata/commit/092509d
[6683eba]: https://github.com/0xLighthouse/ens-metadata/commit/6683eba
[a8e5c4e]: https://github.com/0xLighthouse/ens-metadata/commit/a8e5c4e
[7b5c10a]: https://github.com/0xLighthouse/ens-metadata/commit/7b5c10a
[805459a]: https://github.com/0xLighthouse/ens-metadata/commit/805459a
[6462279]: https://github.com/0xLighthouse/ens-metadata/commit/6462279
[81f641e]: https://github.com/0xLighthouse/ens-metadata/commit/81f641e
[803d364]: https://github.com/0xLighthouse/ens-metadata/commit/803d364
