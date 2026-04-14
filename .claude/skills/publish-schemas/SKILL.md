---
name: publish-schemas
description: Publish any @ensmetadata/schemas that have a newer version in source than in the published registry.
disable-model-invocation: true
---

# Publish Outstanding Schemas

Publish each schema in `packages/schemas/src/schemas/` whose source version is ahead of the latest entry in `packages/schemas/published/_registry.json`. Schemas already at the latest registered version are skipped.

## How publishing works (context for the model)

- Source versions live in `_SCHEMA_VERSION` constants inside each `packages/schemas/src/schemas/<id>.ts`.
- Published versions live in `packages/schemas/published/_registry.json` under `schemas.<id>.latest`.
- The publish script is `pnpm --filter @ensmetadata/schemas publish:schema -- --id <id>` and will:
  - publish the current source version when `--bump` is omitted
  - refuse to republish an existing version (hard error)
  - pin to IPFS via Pinata if `PINATA_JWT` (or key/secret) is set, otherwise via local `ipfs add`
  - EIP-712-sign the run using `SCHEMA_PUBLISHER_PRIVATE_KEY` unless `--allow-unsigned` is passed
- Globals live separately at `packages/schemas/src/globals/ensip-5.ts` and publish via `publish:globals`. This skill does NOT touch globals — mention if source drift is detected but do not publish.

## Steps

1. **Confirm clean working tree.** Run `git status`. If there are uncommitted changes under `packages/schemas/`, stop and ask the user to commit or stash first — publishing writes to `packages/schemas/published/` and we need a clean diff.

2. **Check credentials are present.** Confirm at least one of `PINATA_JWT` or (`PINATA_API_KEY` + `PINATA_API_SECRET`) is set, and that `SCHEMA_PUBLISHER_PRIVATE_KEY` is set. If missing, stop and tell the user which env vars they need to export — do NOT fall back to `--allow-unsigned` unless the user explicitly asks.

3. **Build the outstanding list.** For each file in `packages/schemas/src/schemas/*.ts`:
   - Read its `_SCHEMA_VERSION` constant (source version).
   - Look up `schemas.<id>.latest` in `packages/schemas/published/_registry.json` (published version).
   - If source > published (semver compare), the schema is outstanding. If source == published, skip. If source < published, stop and flag it — that's a regression and the user needs to resolve it.

4. **Show the plan.** Print a compact table: `<id>  <published> -> <source>` for each outstanding schema, and a line for any skipped. Ask the user to confirm before publishing anything.

5. **Publish each outstanding schema sequentially.** For each:
   ```
   pnpm --filter @ensmetadata/schemas publish:schema -- --id <id>
   ```
   Do not pass `--bump` — the source file is already at the target version. Do not pass `--dry-run` unless the user asks. If any publish fails, stop immediately and surface the error — do not continue with the rest, since partial failures leave the registry in a half-updated state.

6. **Verify.** After all publishes succeed, re-read `_registry.json` and confirm each published schema's new `latest` matches the source version and has a non-empty `cid`. Show the user the new CIDs.

7. **Report.** End-of-turn summary: list what was published with their new CIDs, and remind the user to commit the resulting changes under `packages/schemas/published/`.

## Guardrails

- Never invoke `publish:schema` with `--bump` in this skill — bumping is a deliberate act that belongs in the version-bump workflow, not a catch-up publish.
- Never invoke `publish:schema` with `--dry-run` unless the user asks for a dry run.
- Never touch `publish:globals` from this skill.
- If nothing is outstanding, stop after step 3 and tell the user everything is up to date.
