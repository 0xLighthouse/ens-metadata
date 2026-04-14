# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
