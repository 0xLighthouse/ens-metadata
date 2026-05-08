---
name: release-cli
description: Release @ensmetadata/cli to npm with full UAT flow.
disable-model-invocation: true
argument-hint: "[patch|minor|major]"
---

# Release CLI

Publish a new version of `@ensmetadata/cli` to npm.

Target bump: **$ARGUMENTS** (default: patch)

## Current version

- CLI: !`jq -r .version packages/cli/package.json`

## Change detection

Check if there are meaningful changes since the last release:
```
git log --oneline $(git log --all --oneline --grep="Release cli@" -1 --format=%H)..HEAD -- packages/cli
```
If there are no changes, stop and tell the user there is nothing to release.

## SDK dependency check

CLI depends on `@ensmetadata/sdk`. Verify that the local SDK version matches what's published on npm:
```
SDK_LOCAL=$(jq -r .version packages/sdk/package.json)
SDK_NPM=$(pnpm view @ensmetadata/sdk version)
```
If `SDK_LOCAL != SDK_NPM`, warn the user: "SDK has a local version ($SDK_LOCAL) that differs from npm ($SDK_NPM). If CLI depends on unreleased SDK changes, release SDK first with `/release-sdk`." Ask whether to continue or stop.

## Pre-flight

Read `.claude/skills/release/COMMON.md` and execute the **Pre-flight** procedure.

## Canary publish (UAT)

1. Publish a canary version to npm:
   ```
   OTP=$(op item get "$NPM_OTP_ITEM_ID" --otp --vault "$NPM_OTP_VAULT") && NPM_CONFIG_OTP="$OTP" ./scripts/publish-canary.sh cli
   ```

2. Run the canary smoke test:
   ```
   ./scripts/test-canary.sh cli
   ```

If the canary test fails, stop. Debug, fix, and restart from Pre-flight.

## Version bump

Execute the **Version bump** procedure from `COMMON.md` for `packages/cli` with bump `$ARGUMENTS` (default: patch):
```
cd packages/cli && pnpm version $ARGUMENTS --no-git-tag-version && cd -
pnpm biome format --write packages/cli/package.json
```

## Verify package contents

Execute the **Verify package contents** procedure from `COMMON.md` for `packages/cli`:
```
cd packages/cli && pnpm pack --dry-run 2>&1 | grep -i workspace; cd -
```

## Publish to @latest

Execute the **Publish** procedure from `COMMON.md` for `packages/cli`:
```
OTP=$(op item get "$NPM_OTP_ITEM_ID" --otp --vault "$NPM_OTP_VAULT") && cd packages/cli && NPM_CONFIG_OTP="$OTP" pnpm publish --access public --no-git-checks && cd -
```

## Commit

```
git add packages/cli/package.json pnpm-lock.yaml
git commit -m "chore: Release cli@<version>"
```

## Tag and GitHub release

1. Capture the release commit SHA: `git rev-parse HEAD`.

2. Determine the previous bound for the scoped log:
   - If a `cli-v*` tag exists, use the latest one.
   - Otherwise use the prior `chore: Release cli@` commit (same query as Change detection).

3. Gather the scoped commit log:
   ```
   git log <prev-bound>..HEAD -- packages/cli
   ```

4. Synthesize release notes by applying the rules from `.claude/skills/changelog/SKILL.md` — categorize into **Added** / **Changed** / **Fixed** (omit empty), summarize in user voice, merge related commits, drop chore/format-only noise. Do not paste commit hashes.

5. Tag the release commit and push:
   ```
   git tag cli-v<version> <SHA>
   git push origin cli-v<version>
   ```

6. Create the GitHub release (notes via heredoc to preserve formatting):
   ```
   gh release create cli-v<version> --title "@ensmetadata/cli@<version>" --notes "$(cat <<'EOF'
   <synthesized notes>
   EOF
   )"
   ```

## Verification checklist

- [ ] All tests pass
- [ ] Canary smoke test passes
- [ ] No `workspace:*` in pack dry-run
- [ ] CLI published to npm
- [ ] Version bump committed
- [ ] `cli-v<version>` tag pushed
- [ ] GitHub release created

## Troubleshooting

See `.claude/skills/release/COMMON.md` for common issues.
