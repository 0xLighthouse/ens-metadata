---
name: release
description: Walk through the full UAT and release flow for publishing @ensmetadata/sdk and @ensmetadata/cli to npm.
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

0. Check if there are meaningful changes since the last release. Compare the current HEAD against the last release commit for each package:
   ```
   git log --oneline $(git log --all --oneline --grep="Release sdk@" -1 --format=%H)..HEAD -- packages/sdk/src
   git log --oneline $(git log --all --oneline --grep="Release cli@" -1 --format=%H)..HEAD -- packages/cli/src
   ```
   If a package has no source changes, skip it entirely — do not bump or publish. If neither package has changes, stop and tell the user there is nothing to release.

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

5. Publish canary versions to npm (the script handles version bumping, publishing, and restoring versions automatically):
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

Always use `pnpm publish` — never `npm publish`. pnpm automatically rewrites `workspace:*`
dependencies to real version numbers at publish time. Using `npm publish` bypasses this.

9. Publish SDK first (CLI depends on it):
   ```
   pnpm --dir packages/sdk publish --access public
   ```

10. Publish CLI:
    ```
    pnpm --dir packages/cli publish --access public
    ```

## Commit

11. Commit the version bump:
    ```
    git add packages/sdk/package.json packages/cli/package.json pnpm-lock.yaml
    git commit -m "chore: Release sdk@<version> cli@<version>"
    ```

Do NOT create git tags — version tracking is handled by npm only.

## Verification checklist

- [ ] All tests pass
- [ ] Canary smoke test passes
- [ ] No `workspace:*` in pack dry-run
- [ ] SDK published to npm
- [ ] CLI published to npm
- [ ] Version bump committed

## Troubleshooting

- **npm 404 on publish**: Ensure you are logged in (`pnpm whoami`) and the `@ensmetadata` org exists on npmjs.com with your account as a member.
- **Corrupted canary version**: The canary script uses an EXIT trap to restore versions even on failure. If versions are still wrong, manually reset: `cd packages/sdk && pnpm version <correct-version> --no-git-tag-version`
- **prepublishOnly runs build/test/lint again**: This is expected — the packages have `prepublishOnly` scripts that gate publishing. Pre-flight checks in this workflow catch issues early so you don't waste time on a publish that will fail.
