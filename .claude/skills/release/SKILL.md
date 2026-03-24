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

## npm OTP

Publishing requires a one-time password. Fetch it from 1Password before each publish command:
```
OTP=$(op item get "$NPM_OTP_ITEM_ID" --otp --vault "$NPM_OTP_VAULT")
```
Pass it as `NPM_CONFIG_OTP="$OTP"` env var on publish commands.

## Canary publish (UAT)

5. Publish canary versions to npm (the script handles version bumping, publishing, and restoring versions automatically):
   ```
   OTP=$(op item get "$NPM_OTP_ITEM_ID" --otp --vault "$NPM_OTP_VAULT") && NPM_CONFIG_OTP="$OTP" ./scripts/publish-canary.sh
   ```

6. Run canary smoke test to verify the published packages work as a consumer:
   ```
   ./scripts/test-canary.sh
   ```

If the canary test fails, stop. Debug, fix, and restart from step 1.

## Version bump

7. Bump versions (use $ARGUMENTS or default to patch). Must `cd` into each package — `pnpm --dir` does not work with `version`.
   After bumping, re-format with biome (pnpm version writes multi-line arrays that biome rejects):
   ```
   cd packages/sdk && pnpm version $ARGUMENTS --no-git-tag-version && cd ../..
   cd packages/cli && pnpm version $ARGUMENTS --no-git-tag-version && cd ../..
   pnpm biome format --write packages/sdk/package.json packages/cli/package.json
   ```

## Verify package contents

8. Dry-run pack to confirm no `workspace:*` references leak into the tarball:
   ```
   cd packages/sdk && pnpm pack --dry-run 2>&1 | grep -i workspace; cd ../..
   cd packages/cli && pnpm pack --dry-run 2>&1 | grep -i workspace; cd ../..
   ```
   If any `workspace:` entries appear, do NOT publish.

## Publish to @latest

Always use `pnpm publish` — never `npm publish`. pnpm automatically rewrites `workspace:*`
dependencies to real version numbers at publish time. Using `npm publish` bypasses this.

Use `--no-git-checks` because the version bump is not yet committed at this point.
Fetch a fresh OTP for each publish (they expire quickly).

9. Publish SDK first (CLI depends on it):
   ```
   OTP=$(op item get "$NPM_OTP_ITEM_ID" --otp --vault "$NPM_OTP_VAULT") && cd packages/sdk && NPM_CONFIG_OTP="$OTP" pnpm publish --access public --no-git-checks && cd ../..
   ```

10. Publish CLI:
    ```
    OTP=$(op item get "$NPM_OTP_ITEM_ID" --otp --vault "$NPM_OTP_VAULT") && cd packages/cli && NPM_CONFIG_OTP="$OTP" pnpm publish --access public --no-git-checks && cd ../..
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
- **Biome format after version bump**: `pnpm version` reformats `package.json` arrays to multi-line, which biome rejects. Always run `pnpm biome format --write` on the package.json after bumping.
