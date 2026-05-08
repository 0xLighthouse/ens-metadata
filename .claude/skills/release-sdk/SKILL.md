---
name: release-sdk
description: Release @ensmetadata/sdk to npm with full UAT flow.
disable-model-invocation: true
argument-hint: "[patch|minor|major]"
---

# Release SDK

Publish a new version of `@ensmetadata/sdk` to npm.

Target bump: **$ARGUMENTS** (default: patch)

## Current version

- SDK: !`jq -r .version packages/sdk/package.json`

## Change detection

Check if there are meaningful changes since the last release:
```
git log --oneline $(git log --all --oneline --grep="Release sdk@" -1 --format=%H)..HEAD -- packages/sdk
```
If there are no changes, stop and tell the user there is nothing to release.

## Pre-flight

Read `.claude/skills/release/COMMON.md` and execute the **Pre-flight** procedure.

## Canary publish (UAT)

1. Publish a canary version to npm:
   ```
   OTP=$(op item get "$NPM_OTP_ITEM_ID" --otp --vault "$NPM_OTP_VAULT") && NPM_CONFIG_OTP="$OTP" ./scripts/publish-canary.sh sdk
   ```

2. Run the canary smoke test:
   ```
   ./scripts/test-canary.sh sdk
   ```

If the canary test fails, stop. Debug, fix, and restart from Pre-flight.

## Version bump

Execute the **Version bump** procedure from `COMMON.md` for `packages/sdk` with bump `$ARGUMENTS` (default: patch):
```
cd packages/sdk && pnpm version $ARGUMENTS --no-git-tag-version && cd -
pnpm biome format --write packages/sdk/package.json
```

## Verify package contents

Execute the **Verify package contents** procedure from `COMMON.md` for `packages/sdk`:
```
cd packages/sdk && pnpm pack --dry-run 2>&1 | grep -i workspace; cd -
```

## Publish to @latest

Execute the **Publish** procedure from `COMMON.md` for `packages/sdk`:
```
OTP=$(op item get "$NPM_OTP_ITEM_ID" --otp --vault "$NPM_OTP_VAULT") && cd packages/sdk && NPM_CONFIG_OTP="$OTP" pnpm publish --access public --no-git-checks && cd -
```

## Commit

```
git add packages/sdk/package.json pnpm-lock.yaml
git commit -m "chore: Release sdk@<version>"
```

Do NOT create git tags — version tracking is handled by npm only.

## Verification checklist

- [ ] All tests pass
- [ ] Canary smoke test passes
- [ ] No `workspace:*` in pack dry-run
- [ ] SDK published to npm
- [ ] Version bump committed

## Troubleshooting

See `.claude/skills/release/COMMON.md` for common issues.
