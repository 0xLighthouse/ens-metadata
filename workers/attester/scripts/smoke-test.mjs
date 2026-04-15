// Smoke test for the attester worker. Drives all four endpoints with a
// real SIWE signature and a dev-passthrough Twitter binding, then verifies
// that the returned signed claim verifies cleanly with the SDK.
//
// Usage:
//   node workers/attester/scripts/smoke-test.mjs
//
// Pre-requisite: the worker must be running locally on port 8787
// (`pnpm attester` from the repo root).

import { createSiweMessage } from 'viem/siwe'
import { privateKeyToAccount } from 'viem/accounts'
import { decodeClaim, verifyClaim } from '@ensmetadata/sdk'
import { fromHex } from 'viem'

const ATTESTER = 'http://localhost:8787'
// Same test key the SDK tests use — burner, never used outside tests.
const WALLET_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
// The default ATTESTER_PRIVATE_KEY in .dev.vars.example is 0x00...01.
const EXPECTED_ATTESTER_ADDR = privateKeyToAccount(
  '0x0000000000000000000000000000000000000000000000000000000000000001',
).address

const wallet = privateKeyToAccount(WALLET_PK)

function check(label, ok, detail = '') {
  const mark = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`${mark} ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) process.exit(1)
}

async function main() {
  // 1. Create session
  const sessionRes = await fetch(`${ATTESTER}/api/session`, { method: 'POST' })
  check('POST /api/session', sessionRes.ok, `status ${sessionRes.status}`)
  const session = await sessionRes.json()
  console.log('  sessionId:', session.sessionId)
  console.log('  nonce:    ', session.nonce)

  // 2. Build + sign SIWE message
  const message = createSiweMessage({
    address: wallet.address,
    chainId: 1,
    domain: 'localhost:3001',
    nonce: session.nonce,
    uri: 'http://localhost:3001',
    version: '1',
    statement: 'Smoke test',
    issuedAt: new Date(),
  })
  const signature = await wallet.signMessage({ message })

  // 3. Bind wallet
  const bindWalletRes = await fetch(`${ATTESTER}/api/session/wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: session.sessionId, message, signature }),
  })
  const bindWalletBody = await bindWalletRes.json().catch(() => ({}))
  check(
    'POST /api/session/wallet',
    bindWalletRes.ok,
    bindWalletRes.ok ? `wallet=${bindWalletBody.wallet}` : JSON.stringify(bindWalletBody),
  )

  // 4. Bind platform (dev passthrough)
  const bindPlatformRes = await fetch(`${ATTESTER}/api/session/platform/com.x`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: session.sessionId,
      payload: { uid: '295218901', handle: 'vitalik' },
    }),
  })
  const bindPlatformBody = await bindPlatformRes.json().catch(() => ({}))
  check(
    'POST /api/session/platform/com.x',
    bindPlatformRes.ok,
    bindPlatformRes.ok
      ? `uid=${bindPlatformBody.uid}, handle=${bindPlatformBody.handle}`
      : JSON.stringify(bindPlatformBody),
  )

  // 5. Attest
  const expSeconds = Math.floor(Date.now() / 1000) + 3600
  const attestRes = await fetch(`${ATTESTER}/api/attest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: session.sessionId,
      name: 'alice.eth',
      chainId: 1,
      expSeconds,
      prf: 'bafkreigh2akiscaildc6gjl5lxj3y5grqocqgjjylz57hxh2mzicvabcde',
    }),
  })
  const attestBody = await attestRes.json().catch(() => ({}))
  check('POST /api/attest', attestRes.ok, attestRes.ok ? '' : JSON.stringify(attestBody))

  const claim = attestBody.claim
  console.log('  claim:', JSON.stringify(claim, null, 2).split('\n').slice(0, 12).join('\n  '))

  // 6. Verify the returned signed claim with the SDK
  const verifyResult = await verifyClaim(claim, {
    trustedAttesters: [EXPECTED_ATTESTER_ADDR],
    expectedOwner: wallet.address,
  })
  check(
    'SDK verifyClaim against returned claim',
    verifyResult.valid,
    verifyResult.valid ? 'all checks pass' : JSON.stringify(verifyResult),
  )

  console.log('\n\x1b[32mAll endpoints work.\x1b[0m')
}

main().catch((err) => {
  console.error('\x1b[31m✗ FAIL:\x1b[0m', err.message)
  process.exit(1)
})
