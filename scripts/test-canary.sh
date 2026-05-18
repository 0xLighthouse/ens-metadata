#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-all}" # sdk, cli, or all (default)

if [[ "$TARGET" != "sdk" && "$TARGET" != "cli" && "$TARGET" != "all" ]]; then
  echo "Usage: $0 [sdk|cli|all]"
  exit 1
fi

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

FAILED=false

# --- SDK smoke test ---
if [[ "$TARGET" == "sdk" || "$TARGET" == "all" ]]; then
  echo "==> Installing @ensmetadata/sdk@canary..."
  pnpm add @ensmetadata/sdk@canary viem @ensdomains/ensjs 2>&1

  echo "==> Running SDK smoke test..."
  cat > smoke-sdk.mjs << 'SMOKE'
import {
  computeDelta,
  hasChanges,
  metadataEstimator,
  metadataReader,
  metadataWriter,
  validateMetadata,
  validate,
  fetchSchema,
  fetchSchemaFromHttps,
  fetchSchemaFromIpfs,
  fetchSchemaFromLocal,
  getSchemaKeys,
  DEFAULT_IPFS_GATEWAY,
  encodeHandlePayload,
  encodeUidPayload,
  encodeEnvelope,
  decodeEnvelope,
  signHandleClaim,
  signUidClaim,
  verifyHandleClaim,
  verifyUidClaim,
  handleAttestationRecordKey,
  uidAttestationRecordKey,
  CLAIM_VERSION,
  ENVELOPE_TAG,
  DEFAULT_ATTESTER_ENS,
  BASE_DEFAULT_ATTESTER_ENS,
  defaultAttesterEnsForName,
} from '@ensmetadata/sdk'

const checks = [
  ['metadataReader', typeof metadataReader, 'function'],
  ['metadataWriter', typeof metadataWriter, 'function'],
  ['metadataEstimator', typeof metadataEstimator, 'function'],
  ['validateMetadata', typeof validateMetadata, 'function'],
  ['validate', typeof validate, 'function'],
  ['fetchSchema', typeof fetchSchema, 'function'],
  ['fetchSchemaFromHttps', typeof fetchSchemaFromHttps, 'function'],
  ['fetchSchemaFromIpfs', typeof fetchSchemaFromIpfs, 'function'],
  ['fetchSchemaFromLocal', typeof fetchSchemaFromLocal, 'function'],
  ['getSchemaKeys', typeof getSchemaKeys, 'function'],
  ['DEFAULT_IPFS_GATEWAY', typeof DEFAULT_IPFS_GATEWAY, 'string'],
  ['encodeHandlePayload', typeof encodeHandlePayload, 'function'],
  ['encodeUidPayload', typeof encodeUidPayload, 'function'],
  ['encodeEnvelope', typeof encodeEnvelope, 'function'],
  ['decodeEnvelope', typeof decodeEnvelope, 'function'],
  ['signHandleClaim', typeof signHandleClaim, 'function'],
  ['signUidClaim', typeof signUidClaim, 'function'],
  ['verifyHandleClaim', typeof verifyHandleClaim, 'function'],
  ['verifyUidClaim', typeof verifyUidClaim, 'function'],
  ['handleAttestationRecordKey', typeof handleAttestationRecordKey, 'function'],
  ['uidAttestationRecordKey', typeof uidAttestationRecordKey, 'function'],
  ['CLAIM_VERSION', typeof CLAIM_VERSION, 'number'],
  ['ENVELOPE_TAG', typeof ENVELOPE_TAG, 'number'],
  ['DEFAULT_ATTESTER_ENS', typeof DEFAULT_ATTESTER_ENS, 'string'],
  ['BASE_DEFAULT_ATTESTER_ENS', typeof BASE_DEFAULT_ATTESTER_ENS, 'string'],
  ['defaultAttesterEnsForName', typeof defaultAttesterEnsForName, 'function'],
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

const delta = computeDelta({ a: 'old' }, { a: 'new', b: 'added' })
if (delta.changes.a !== 'new' || delta.changes.b !== 'added') {
  console.error('FAIL: computeDelta returned unexpected result')
  failed = true
} else {
  console.log('  OK: computeDelta works correctly')
}

if (!hasChanges({ a: 'old' }, { a: 'new' })) {
  console.error('FAIL: hasChanges should detect a change')
  failed = true
} else {
  console.log('  OK: hasChanges detects changes')
}

const reader = metadataReader()
if (typeof reader !== 'function') {
  console.error('FAIL: metadataReader() should return a function')
  failed = true
} else {
  console.log('  OK: metadataReader() returns extension function')
}

if (defaultAttesterEnsForName('alice.base.eth') !== BASE_DEFAULT_ATTESTER_ENS) {
  console.error('FAIL: defaultAttesterEnsForName(*.base.eth) should return BASE_DEFAULT_ATTESTER_ENS')
  failed = true
} else {
  console.log('  OK: defaultAttesterEnsForName routes basenames correctly')
}

if (defaultAttesterEnsForName('alice.eth') !== DEFAULT_ATTESTER_ENS) {
  console.error('FAIL: defaultAttesterEnsForName(*.eth) should return DEFAULT_ATTESTER_ENS')
  failed = true
} else {
  console.log('  OK: defaultAttesterEnsForName routes mainnet correctly')
}

if (failed) {
  console.error('\nSDK smoke test FAILED')
  process.exit(1)
} else {
  console.log('\nSDK smoke test PASSED')
}
SMOKE

  if ! node smoke-sdk.mjs; then
    FAILED=true
  fi
fi

# --- CLI smoke test ---
if [[ "$TARGET" == "cli" || "$TARGET" == "all" ]]; then
  echo "==> Installing @ensmetadata/cli@canary..."
  pnpm add @ensmetadata/cli@canary 2>&1

  echo "==> Running CLI smoke test..."
  if npx ens-metadata --help > /dev/null 2>&1; then
    echo "  OK: ens-metadata --help exits successfully"
  else
    echo "FAIL: ens-metadata --help failed"
    FAILED=true
  fi

  if npx ens-metadata --version > /dev/null 2>&1; then
    echo "  OK: ens-metadata --version exits successfully"
  else
    echo "FAIL: ens-metadata --version failed"
    FAILED=true
  fi

  echo ""
  if [[ "$FAILED" == "false" ]]; then
    echo "CLI smoke test PASSED"
  else
    echo "CLI smoke test FAILED"
  fi
fi

echo ""
if [[ "$FAILED" == "true" ]]; then
  echo "==> Canary smoke test FAILED"
  exit 1
else
  echo "==> Canary smoke test complete!"
fi
