#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP=$(date +%s)

echo "==> Building all packages..."
pnpm build

echo "==> Running tests..."
pnpm turbo test

echo "==> Running lint..."
pnpm lint

# Save original versions
SDK_VERSION=$(jq -r .version "$ROOT/packages/sdk/package.json")
CLI_VERSION=$(jq -r .version "$ROOT/packages/cli/package.json")

SDK_CANARY="${SDK_VERSION}-canary.${TIMESTAMP}"
CLI_CANARY="${CLI_VERSION}-canary.${TIMESTAMP}"

echo "==> Publishing canary versions..."
echo "    SDK: $SDK_CANARY"
echo "    CLI: $CLI_CANARY"

# Bump to canary versions
cd "$ROOT/packages/sdk"
npm version "$SDK_CANARY" --no-git-tag-version --allow-same-version
pnpm publish --tag canary --access public --no-git-checks

cd "$ROOT/packages/cli"
npm version "$CLI_CANARY" --no-git-tag-version --allow-same-version
pnpm publish --tag canary --access public --no-git-checks

# Restore original versions
cd "$ROOT/packages/sdk"
npm version "$SDK_VERSION" --no-git-tag-version --allow-same-version

cd "$ROOT/packages/cli"
npm version "$CLI_VERSION" --no-git-tag-version --allow-same-version

echo ""
echo "==> Canary published!"
echo "    pnpm add @ens-node-metadata/sdk@canary"
echo "    pnpm add @ens-node-metadata/cli@canary"
echo ""
echo "    Run 'pnpm test:canary' to smoke test the published packages."
