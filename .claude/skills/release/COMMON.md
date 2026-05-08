# Release — Shared Procedures

Reference document used by `release-sdk` and `release-cli` skills. Not a skill itself.

## Pre-flight

1. Confirm the working tree is clean:
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

## Version bump

Bump the target package version. Must `cd` into the package — `pnpm --dir` does not work with `version`.
After bumping, re-format with biome (`pnpm version` writes multi-line arrays that biome rejects):
```
cd <package-dir> && pnpm version <bump> --no-git-tag-version && cd -
pnpm biome format --write <package-dir>/package.json
```

## Verify package contents

Dry-run pack to confirm no `workspace:*` references leak into the tarball:
```
cd <package-dir> && pnpm pack --dry-run 2>&1 | grep -i workspace; cd -
```
If any `workspace:` entries appear, do NOT publish.

## Publish

Always use `pnpm publish` — never `npm publish`. pnpm automatically rewrites `workspace:*`
dependencies to real version numbers at publish time. Using `npm publish` bypasses this.

Use `--no-git-checks` because the version bump is not yet committed at this point.
Fetch a fresh OTP for each publish (they expire quickly).

```
OTP=$(op item get "$NPM_OTP_ITEM_ID" --otp --vault "$NPM_OTP_VAULT") && cd <package-dir> && NPM_CONFIG_OTP="$OTP" pnpm publish --access public --no-git-checks && cd -
```

## Troubleshooting

- **npm 404 on publish**: Ensure you are logged in (`pnpm whoami`) and the `@ensmetadata` org exists on npmjs.com with your account as a member.
- **Corrupted canary version**: The canary script uses an EXIT trap to restore versions even on failure. If versions are still wrong, manually reset: `cd <package-dir> && pnpm version <correct-version> --no-git-tag-version`
- **prepublishOnly runs build/test/lint again**: This is expected — the packages have `prepublishOnly` scripts that gate publishing. Pre-flight checks in this workflow catch issues early so you don't waste time on a publish that will fail.
- **Biome format after version bump**: `pnpm version` reformats `package.json` arrays to multi-line, which biome rejects. Always run `pnpm biome format --write` on the package.json after bumping.
