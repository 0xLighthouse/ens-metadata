#!/usr/bin/env bash
set -euo pipefail

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "==> Creating temp project in $TMPDIR..."
cd "$TMPDIR"

cat > package.json << 'EOF'
{
  "name": "canary-smoke-test",
  "type": "module",
  "private": true
}
EOF

echo "==> Installing @ens-node-metadata/sdk@canary..."
pnpm add @ens-node-metadata/sdk@canary viem @ensdomains/ensjs 2>&1

echo "==> Running smoke test..."
cat > smoke.mjs << 'SMOKE'
import { metadataReader, metadataWriter, validateMetadataSchema, computeDelta, hasChanges } from '@ens-node-metadata/sdk'

// Verify all exports exist and are the right type
const checks = [
  ['metadataReader', typeof metadataReader, 'function'],
  ['metadataWriter', typeof metadataWriter, 'function'],
  ['validateMetadataSchema', typeof validateMetadataSchema, 'function'],
  ['computeDelta', typeof computeDelta, 'function'],
  ['hasChanges', typeof hasChanges, 'function'],
]

let failed = false
for (const [name, actual, expected] of checks) {
  if (actual !== expected) {
    console.error(`FAIL: ${name} is ${actual}, expected ${expected}`)
    failed = true
  } else {
    console.log(`  OK: ${name} is ${actual}`)
  }
}

// Test computeDelta works at runtime
const delta = computeDelta({ a: 'old' }, { a: 'new', b: 'added' })
if (delta.changes.a !== 'new' || delta.changes.b !== 'added') {
  console.error('FAIL: computeDelta returned unexpected result')
  failed = true
} else {
  console.log('  OK: computeDelta works correctly')
}

// Test metadataReader returns correct shape
const reader = metadataReader()
if (typeof reader !== 'function') {
  console.error('FAIL: metadataReader() should return a function')
  failed = true
} else {
  console.log('  OK: metadataReader() returns extension function')
}

if (failed) {
  console.error('\nSmoke test FAILED')
  process.exit(1)
} else {
  console.log('\nSmoke test PASSED')
}
SMOKE

node smoke.mjs

echo ""
echo "==> Canary smoke test complete!"
