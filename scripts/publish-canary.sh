#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP=$(date +%s)
TARGET="${1:-all}" # sdk, cli, or all (default)

if [[ "$TARGET" != "sdk" && "$TARGET" != "cli" && "$TARGET" != "all" ]]; then
  echo "Usage: $0 [sdk|cli|all]"
  exit 1
fi

SDK_VERSION=$(jq -r .version "$ROOT/packages/sdk/package.json")
CLI_VERSION=$(jq -r .version "$ROOT/packages/cli/package.json")

SDK_CANARY="${SDK_VERSION}-canary.${TIMESTAMP}"
CLI_CANARY="${CLI_VERSION}-canary.${TIMESTAMP}"

restore_versions() {
  if [[ "$TARGET" == "sdk" || "$TARGET" == "all" ]]; then
    cd "$ROOT/packages/sdk"
    pnpm version "$SDK_VERSION" --no-git-tag-version --allow-same-version 2>/dev/null || true
    pnpm biome format --write package.json 2>/dev/null || true
  fi
  if [[ "$TARGET" == "cli" || "$TARGET" == "all" ]]; then
    cd "$ROOT/packages/cli"
    pnpm version "$CLI_VERSION" --no-git-tag-version --allow-same-version 2>/dev/null || true
    pnpm biome format --write package.json 2>/dev/null || true
  fi
  cd "$ROOT"
}
trap restore_versions EXIT

echo "==> Publishing canary versions..."

if [[ "$TARGET" == "sdk" || "$TARGET" == "all" ]]; then
  echo "    SDK: $SDK_CANARY"
  cd "$ROOT/packages/sdk"
  pnpm version "$SDK_CANARY" --no-git-tag-version --allow-same-version
  pnpm biome format --write package.json 2>/dev/null || true
  pnpm publish --tag canary --access public --no-git-checks
fi

if [[ "$TARGET" == "cli" || "$TARGET" == "all" ]]; then
  echo "    CLI: $CLI_CANARY"
  cd "$ROOT/packages/cli"
  pnpm version "$CLI_CANARY" --no-git-tag-version --allow-same-version
  pnpm biome format --write package.json 2>/dev/null || true
  pnpm publish --tag canary --access public --no-git-checks
fi

echo ""
echo "==> Canary published!"
if [[ "$TARGET" == "sdk" || "$TARGET" == "all" ]]; then
  echo "    pnpm add @ensmetadata/sdk@canary"
fi
if [[ "$TARGET" == "cli" || "$TARGET" == "all" ]]; then
  echo "    pnpm add @ensmetadata/cli@canary"
fi
echo ""
echo "    Run './scripts/test-canary.sh $TARGET' to smoke test the published packages."
