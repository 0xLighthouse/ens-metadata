#!/bin/bash
# SessionStart hook — prepares the workspace for Claude Code on the web.
# Installs pnpm dependencies and builds the SDK so tests and linters work.
set -euo pipefail

# Only needed in remote (web) containers, where deps are not pre-installed.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# SessionStart stdout is injected into the session context; redirect it to
# stderr so pnpm's output lands in the setup logs instead of the transcript.
exec 1>&2

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "[session-start] Installing workspace dependencies..."
pnpm install

# The SDK package exports point at dist/, so the CLI and apps — and their
# vitest suites — can only resolve @ensmetadata/sdk after it is built.
echo "[session-start] Building @ensmetadata/sdk..."
pnpm exec turbo run build --filter=@ensmetadata/sdk

echo "[session-start] Workspace ready."
