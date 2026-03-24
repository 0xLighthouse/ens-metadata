---
name: release
description: Walk through the full UAT and release flow for publishing @ens-node-metadata/sdk and @ens-node-metadata/cli to npm.
disable-model-invocation: true
argument-hint: "[patch|minor|major]"
---

# Release Workflow

Publish a new version of the SDK and CLI packages to npm.

Target bump: **$ARGUMENTS** (default: patch)

## Current versions

- SDK: !`jq -r .version packages/sdk/package.json`
- CLI: !`jq -r .version packages/cli/package.json`

## Pre-flight

1. Confirm you are on the correct branch with a clean working tree:
   ```
   git status
   ```
   If there are uncommitted changes, stop and ask the user to commit or stash first.

2. Build all packages:
   ```
   pnpm build
   ```

3. Run all tests:
   ```
   pnpm turbo test
   ```

4. Run lint:
   ```
   pnpm lint
   ```

If any step fails, stop and fix before continuing.

## Canary publish (UAT)

5. Publish canary versions to npm:
   ```
   ./scripts/publish-canary.sh
   ```

6. Run canary smoke test to verify the published packages work as a consumer:
   ```
   ./scripts/test-canary.sh
   ```

If the canary test fails, stop. Debug, fix, and restart from step 1.

## Version bump

7. Bump versions (use $ARGUMENTS or default to patch):
   ```
   pnpm --dir packages/sdk version $ARGUMENTS --no-git-tag-version
   pnpm --dir packages/cli version $ARGUMENTS --no-git-tag-version
   ```

## Verify package contents

8. Dry-run pack to confirm no `workspace:*` references leak into the tarball:
   ```
   pnpm --dir packages/sdk pack --dry-run
   pnpm --dir packages/cli pack --dry-run
   ```
   Inspect the output — if any `workspace:` entries appear, do NOT publish.

## Publish to @latest

9. Publish SDK first (CLI depends on it):
   ```
   pnpm --dir packages/sdk publish --access public
   ```

10. Publish CLI:
    ```
    pnpm --dir packages/cli publish --access public
    ```

## Tag and push

11. Commit the version bump:
    ```
    git add packages/sdk/package.json packages/cli/package.json
    git commit -m "chore: Release sdk@<version> cli@<version>"
    ```

12. Tag the release:
    ```
    git tag sdk@<version>
    git tag cli@<version>
    git push origin --tags
    ```

## Verification checklist

- [ ] All tests pass
- [ ] Canary smoke test passes
- [ ] No `workspace:*` in pack dry-run
- [ ] SDK published to npm
- [ ] CLI published to npm
- [ ] Version bump committed
- [ ] Tags pushed
