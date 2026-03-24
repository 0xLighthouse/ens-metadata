#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP=$(date +%s)

# Save original versions
SDK_VERSION=$(jq -r .version "$ROOT/packages/sdk/package.json")
CLI_VERSION=$(jq -r .version "$ROOT/packages/cli/package.json")

SDK_CANARY="${SDK_VERSION}-canary.${TIMESTAMP}"
CLI_CANARY="${CLI_VERSION}-canary.${TIMESTAMP}"

# Always restore versions on exit (success or failure)
restore_versions() {
  cd "$ROOT/packages/sdk"
  pnpm version "$SDK_VERSION" --no-git-tag-version --allow-same-version 2>/dev/null || true
  pnpm biome format --write package.json 2>/dev/null || true
  cd "$ROOT/packages/cli"
  pnpm version "$CLI_VERSION" --no-git-tag-version --allow-same-version 2>/dev/null || true
  pnpm biome format --write package.json 2>/dev/null || true
  cd "$ROOT"
}
trap restore_versions EXIT

echo "==> Publishing canary versions..."
echo "    SDK: $SDK_CANARY"
echo "    CLI: $CLI_CANARY"

# Bump to canary versions and publish
# Re-format package.json after version bump (pnpm version writes multi-line arrays that biome rejects)
cd "$ROOT/packages/sdk"
pnpm version "$SDK_CANARY" --no-git-tag-version --allow-same-version
pnpm biome format --write package.json 2>/dev/null || true
pnpm publish --tag canary --access public --no-git-checks

cd "$ROOT/packages/cli"
pnpm version "$CLI_CANARY" --no-git-tag-version --allow-same-version
pnpm biome format --write package.json 2>/dev/null || true
pnpm publish --tag canary --access public --no-git-checks

echo ""
echo "==> Canary published!"
echo "    pnpm add @ens-node-metadata/sdk@canary"
echo "    pnpm add @ens-node-metadata/cli@canary"
echo ""
echo "    Run './scripts/test-canary.sh' to smoke test the published packages."
